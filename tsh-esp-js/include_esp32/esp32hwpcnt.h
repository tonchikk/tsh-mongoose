#pragma once    

#ifdef __cplusplus
extern "C" {
#endif

typedef struct esp32hwpcnt {
    // int unit;
    int count, hlims;
    int16_t hlim;
    int gpio;
    //struct esp32hwpcnt *next;
} esp32hwpcnt_t;

typedef struct pcnt_evt {
    int unit;  // the PCNT unit that originated an interrupt
    uint32_t status; // information on the event type that caused the interrupt
} pcnt_evt_t;

#define esp32hwpcnt_RTOS_TASK_NAME "esp32hwpcnt main"
#define esp32hwpcnt_RTOS_TASK_STACK 8192


int esp32hwpcnt_get_max_units(void);
bool esp32hwpcnt_init_unit(int unit, int gpio, int filter, int lim );
int esp32hwpcnt_get_pulses(int unit);
int esp32hwpcnt_get_majors(int unit);
bool esp32hwpcnt_start(void);
void esp32hwpcnt_main_task(void * pvParameters);


#ifdef __cplusplus
}
#endif