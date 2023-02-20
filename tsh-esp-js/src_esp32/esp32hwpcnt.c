#include <stdlib.h>
#include "mgos.h"
#include "esp32hwpcnt.h"
#include <string.h>

#include "tsh_common.h"

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "driver/pcnt.h"

typedef struct {
    int unit;  // the PCNT unit that originated an interrupt
    uint32_t status; // information on the event type that caused the interrupt
} pcnt_evt_t;

esp32hwpcnt_t esp32hwpcnt_units[PCNT_UNIT_MAX]; // ugly eating memory 

xQueueHandle esp32hwpcnt_evt_queue;   // A queue to handle pulse counter events
pcnt_isr_handle_t esp32hwpcnt_isr_handle = NULL; //user's ISR service handle

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
            xQueueSendFromISR(esp32hwpcnt_evt_queue, &evt, &HPTaskAwoken);
            if (HPTaskAwoken == pdTRUE) {
                portYIELD_FROM_ISR();
            }
        }
    }
}



void esp32hwpcnt_init_unit(int unit, int gpio, int filter, int16_t lim )
{
    if (unit > PCNT_UNIT_MAX) {
        printf("TSH [esp32hwpcnt_init_unit] unit value of %i exeeds max unit mumber of %i",unit, PCNT_UNIT_MAX);
        return;
    }
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
    pcnt_counter_clear(unit);

    esp32hwpcnt_units[unit].count = 0;
    esp32hwpcnt_units[unit].hlim = lim;
    esp32hwpcnt_units[unit].hlims = 0;

    /* Register ISR handler and enable interrupts for PCNT unit */
    pcnt_isr_register(esp32hwpcnt_intr_handler, NULL, 0, &esp32hwpcnt_isr_handle);
    pcnt_intr_enable(unit);

    /* Everything is set up, now go to counting */
    pcnt_counter_resume(unit);
}



long esp32hwpcnt_get_pulses(int unit){
    if (unit > PCNT_UNIT_MAX) return 0;
    int16_t count = 0;
    pcnt_get_counter_value(unit, &count);
    esp32hwpcnt_units[unit].count = esp32hwpcnt_units[unit].hlim * esp32hwpcnt_units[unit].hlims + count;
    return esp32hwpcnt_units[unit].count;
}

long esp32hwpcnt_get_majors(int unit){
    if (unit > PCNT_UNIT_MAX) return 0;
    return esp32hwpcnt_units[unit].hlims;
}


bool mgos_mongoose_os_esp32hwpcnt_init(void) {

    //printf("TSH [ESP32 PCNT]");
    printf("TSH [mgos_mongoose_os_esp32hwpcnt_init] executed");
    return true;
}