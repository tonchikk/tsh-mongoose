#pragma once    

#ifdef __cplusplus
extern "C" {
#endif

typedef struct esp32hwpcnt {
    // int unit;
    long count, hlims;
    int16_t hlim;
    int gpio;
    //struct esp32hwpcnt *next;
} esp32hwpcnt_t;

int esp32hwpcnt_get_max_units(void);
void esp32hwpcnt_init_unit(int unit, int gpio, int filter, int16_t lim );
long esp32hwpcnt_get_pulses(int unit);
long esp32hwpcnt_get_majors(int unit);

#ifdef __cplusplus
}
#endif