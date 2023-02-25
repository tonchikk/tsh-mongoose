#pragma once    

#ifdef __cplusplus
extern "C" {
#endif

typedef struct esp32hwpcnt {
    // int unit;
    int count, hlims;
    int16_t hlim;
    double value;
    int gpio;
    int64_t tc, tv;
    int ppm;
    double vph;
    //struct esp32hwpcnt *next;
} esp32hwpcnt_t;

typedef struct pcnt_evt {
    int unit;  // the PCNT unit that originated an interrupt
    uint32_t status; // information on the event type that caused the interrupt
} pcnt_evt_t;

#define esp32hwpcnt_RTOS_TASK_NAME "esp32hwpcnt main"
#define esp32hwpcnt_RTOS_TASK_STACK 8192


// Meta
int esp32hwpcnt_get_max_units(void);

// Per Unit
bool esp32hwpcnt_init_unit(int unit, int gpio, int filter, int lim );
bool esp32hwpcnt_reset_unit(int unit);
//   At runtime
int esp32hwpcnt_get_pulses(int unit);
int esp32hwpcnt_get_majors(int unit);
int esp32hwpcnt_get_minors(int unit);
double esp32hwpcnt_get_value(int unit);
int esp32hwpcnt_get_ppm(int unit);
double esp32hwpcnt_get_vph(int unit);

// Globals
bool esp32hwpcnt_start(void);
void esp32hwpcnt_main_task(void * pvParameters);

typedef void (*esp32hwpcnt_unit_callback_t)(int unit,void *userdata);
bool esp32hwpcnt_set_global_cb(esp32hwpcnt_unit_callback_t callback, void *user_data);


#ifdef __cplusplus
}
#endif