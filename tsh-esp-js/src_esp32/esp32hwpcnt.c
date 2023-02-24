#include <stdlib.h>
#include "mgos.h"
#include "esp32hwpcnt.h"
#include "mgos_system.h"
#include <string.h>

#include "tsh_common.h"

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "driver/pcnt.h"



esp32hwpcnt_t *esp32hwpcnt_units[PCNT_UNIT_MAX]; // ugly eating memory 

xQueueHandle esp32hwpcnt_evt_queue;   // A queue to handle pulse counter events
pcnt_isr_handle_t esp32hwpcnt_isr_handle = NULL; //user's ISR service handle
bool esp32hwpcnt_running = true;
bool esp32hwpcnt_main_started = false;
TaskHandle_t esp32hwpcnt_main_task_h = NULL;

esp32hwpcnt_unit_callback_t esp32hwpcnt_unit_callback = NULL;
void *esp32hwpcnt_unit_callback_userdata = NULL;

int esp32hwpcnt_get_max_units(void) {
    return (int ) PCNT_UNIT_MAX;
}


static void IRAM_ATTR esp32hwpcnt_intr_handler(void *arg)
{
    uint32_t intr_status = PCNT.int_st.val;
    int i;
    pcnt_evt_t evt;
    portBASE_TYPE HPTaskAwoken = pdFALSE;

    for (i = 0; i < PCNT_UNIT_MAX; i++) {
        if (intr_status & (BIT(i))) {
            evt.unit = i;
            /* Save the PCNT event type that caused an interrupt
               to pass it to the main program */
            evt.status = PCNT.status_unit[i].val;
            PCNT.int_clr.val = BIT(i);
            if (esp32hwpcnt_main_started)
                xQueueSendFromISR(esp32hwpcnt_evt_queue, &evt, &HPTaskAwoken);
            if (HPTaskAwoken == pdTRUE) {
                portYIELD_FROM_ISR();
            }
        }
    }
}



bool esp32hwpcnt_init_unit(int unit, int gpio, int filter, int lim )
{
    printf("TSH: [%s] Unit %i @ GPIO %i with h_limit %i, filter %i\n",__func__, unit, gpio, lim, filter);
    if (unit > PCNT_UNIT_MAX) {
        printf("TSH: [%s] unit value of %i exeeds max unit mumber of %i\n",__func__, unit, PCNT_UNIT_MAX);
        return false;
    }
    if (esp32hwpcnt_units[unit] != NULL) {
        printf("TSH: [%s] Something wrong: unit %i already initialized, reboot to reset\n",__func__, unit);
        return false;
        // free(esp32hwpcnt_units[unit]);
    }
    esp32hwpcnt_units[unit] = new(struct esp32hwpcnt);
    esp32hwpcnt_units[unit]->hlim = lim;
    /* Prepare configuration for the PCNT unit */
    pcnt_config_t pcnt_config = {
        // Set PCNT input signal and control GPIOs
        .pulse_gpio_num = gpio,
        .channel = PCNT_CHANNEL_0,
        .unit = unit,
        // What to do on the positive / negative edge of pulse input?
        .pos_mode = PCNT_COUNT_INC,   // Count up on the positive edge
        .neg_mode = PCNT_COUNT_DIS,   // Keep the counter value on the negative edge
        // Set the maximum and minimum limit values to watch
        .counter_h_lim = lim,
        .counter_l_lim = -lim,
    };
    /* Initialize PCNT unit */
    pcnt_unit_config(&pcnt_config);

    /* Configure and enable the input filter */
    pcnt_set_filter_value(unit, filter);
    pcnt_filter_enable(unit);

    /* Set threshold 0 and 1 values and enable events to watch */
    /*
    pcnt_set_event_value(unit, PCNT_EVT_THRES_1, PCNT_THRESH1_VAL);
    pcnt_event_enable(unit, PCNT_EVT_THRES_1);
    pcnt_set_event_value(unit, PCNT_EVT_THRES_0, PCNT_THRESH0_VAL);
    pcnt_event_enable(unit, PCNT_EVT_THRES_0);
    */
    /* Enable events on zero, maximum and minimum limit values */
    pcnt_event_enable(unit, PCNT_EVT_ZERO);
    pcnt_event_enable(unit, PCNT_EVT_H_LIM);
    pcnt_event_enable(unit, PCNT_EVT_L_LIM);

    /* Initialize PCNT's counter */
    pcnt_counter_pause(unit);
    esp32hwpcnt_reset_unit(unit);

    /* Register ISR handler and enable interrupts for PCNT unit */
    pcnt_isr_register(esp32hwpcnt_intr_handler, NULL, 0, &esp32hwpcnt_isr_handle);
    pcnt_intr_enable(unit);

    /* Everything is set up, now go to counting */
    pcnt_counter_resume(unit);
    printf("TSH: [%s] Unit %i initialized\n",__func__, unit);
    return true;
}

bool esp32hwpcnt_reset_unit(int unit){
    if (unit > PCNT_UNIT_MAX || esp32hwpcnt_units[unit] == NULL) return false;
    pcnt_counter_clear(unit);
    esp32hwpcnt_units[unit]->count = 0;
    esp32hwpcnt_units[unit]->hlims = 0;
    return true;
}


int esp32hwpcnt_get_pulses(int unit){
    if (unit > PCNT_UNIT_MAX || esp32hwpcnt_units[unit] == NULL) return 0;
    esp32hwpcnt_units[unit]->count = esp32hwpcnt_units[unit]->hlim * esp32hwpcnt_units[unit]->hlims + esp32hwpcnt_get_minors(unit);
    return esp32hwpcnt_units[unit]->count;
}

int esp32hwpcnt_get_majors(int unit){
    if (unit > PCNT_UNIT_MAX || esp32hwpcnt_units[unit] == NULL) return 0;
    return esp32hwpcnt_units[unit]->hlims;
}

int esp32hwpcnt_get_minors(int unit){
    if (unit > PCNT_UNIT_MAX || esp32hwpcnt_units[unit] == NULL) return 0;
    int16_t count = 0;
    pcnt_get_counter_value(unit, &count);
    return count;
}

double esp32hwpcnt_get_value(int unit) {
    if (unit > PCNT_UNIT_MAX || esp32hwpcnt_units[unit] == NULL) return 0;
    return esp32hwpcnt_units[unit]->hlims + (double) esp32hwpcnt_get_minors(unit) / esp32hwpcnt_units[unit]->hlim;
}

static void mgos_esp32hwpcnt_unit_callback(void *arg) {
    int unit = (intptr_t) arg;
    if (esp32hwpcnt_unit_callback != NULL)
        esp32hwpcnt_unit_callback(unit,esp32hwpcnt_unit_callback_userdata);
}

void esp32hwpcnt_main_task(void * pvParameters) {
    printf("TSH: [%s] Starting\n",__func__);
    esp32hwpcnt_evt_queue = xQueueCreate(PCNT_UNIT_MAX * 3, sizeof(pcnt_evt_t));

    portBASE_TYPE res;

    while (esp32hwpcnt_running) {
        esp32hwpcnt_main_started = true;
        pcnt_evt_t evt;
        res = xQueueReceive(esp32hwpcnt_evt_queue, &evt, 1000 / portTICK_PERIOD_MS);
        if (res == pdTRUE) {
            printf("Event @PCNT unit[%d]: ev=", evt.unit);
            if (evt.status & PCNT_STATUS_THRES1_M) {
                printf(" THRES1");
            }
            if (evt.status & PCNT_STATUS_THRES0_M) {
                printf(" THRES0");
            }
            if (evt.status & PCNT_STATUS_L_LIM_M) {
                printf(" L_LIM");
            }
            if (evt.status & PCNT_STATUS_H_LIM_M) {
                printf(" H_LIM");
            }
            if (evt.status & PCNT_STATUS_ZERO_M) {
                printf(" ZERO");
                esp32hwpcnt_units[evt.unit]->hlims++;
            }
            printf(", Cnt=%i Major=%i\n", esp32hwpcnt_get_pulses(evt.unit),esp32hwpcnt_get_majors(evt.unit));
            if (esp32hwpcnt_unit_callback != NULL)
                mgos_invoke_cb(mgos_esp32hwpcnt_unit_callback, (void *) (intptr_t) evt.unit, false);
            //    esp32hwpcnt_unit_callback(evt.unit,esp32hwpcnt_unit_callback_userdata);
        } else {
            printf("TSH: [%s] Cycle...\n",__func__);
            // pcnt_get_counter_value(PCNT_TEST_UNIT, &count);
            // printf("Current counter value :%d\n", count);
        }
    }
    printf("TSH: [%s] Stopping\n",__func__);
    esp32hwpcnt_main_started = false;
}


bool esp32hwpcnt_start(void) {

    if (esp32hwpcnt_main_started) {
        printf("TSH: [%s] Loop is already in progress, skipping\n",__func__);
        return true;
    }
    if (!esp32hwpcnt_running) {
        printf("TSH: [%s] esp32hwpcnt_running = false, exiting\n",__func__);
        return false;
    }

    BaseType_t xReturned = xTaskCreate(
        esp32hwpcnt_main_task,          /* Function that implements the task. */
        esp32hwpcnt_RTOS_TASK_NAME,     /* Text name for the task. */
        esp32hwpcnt_RTOS_TASK_STACK,    /* Stack size in words, not bytes. */
        NULL,                           /* Parameter passed into the task. */
        tskIDLE_PRIORITY,               /* Priority at which the task is created. */
        &esp32hwpcnt_main_task_h );     /* Used to pass out the created task's handle. */
    bool rv = (xReturned == pdPASS);
    printf("TSH: [%s] xTaskCreate returned with %s\n",__func__,rv?"SUCCESS":"FAILURE");
    return rv;
}

bool esp32hwpcnt_set_global_cb(esp32hwpcnt_unit_callback_t callback, void *user_data) {
    esp32hwpcnt_unit_callback = callback;
    esp32hwpcnt_unit_callback_userdata = user_data;
    return true;
}


bool mgos_mongoose_os_esp32hwpcnt_init(void) {
    printf("TSH: [%s]\n",__func__);   
    return true;
}