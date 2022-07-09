#include <stdio.h>

#include "common/platform.h"
#include "common/cs_file.h"
#include "mgos_app.h"
#include "mgos_gpio.h"
#include "mgos_sys_config.h"
#include "mgos_timers.h"
#include "mgos_hal.h"
#include "mgos_dlsym.h"
#include "mjs.h"
#include "ds18x20.h"

// Temperatures callback
void temperatures_cb(struct ds18x20_result *results) {
    printf("TSH: [1W.c] temperatures_cb\n");
    // Loop over each result
    while ( results != NULL ) {
        // results->rom - uint8_t - Sensor ROM
        // results->mac - char* - MAC address string
        // results->temp - float - Temperature in celsius
        printf("ROM: %s, Temp: %f\n", results->mac, results->temp);
        results = results->next;
    }
}

void run_1w_temp() {
    printf("TSH: [run_1w_temp] executing ds18x20_read_all\n");
    ds18x20_read_all(4, temperatures_cb);
}

enum mgos_app_init_result mgos_app_init(void) {
    printf("TSH: [mgos_app_init] start\n");
    
    printf("TSH: [mgos_app_init] sheduling 7s run_1w_temp\n");
    mgos_set_timer(7000, MGOS_TIMER_REPEAT, run_1w_temp, NULL);
    
    // Init OK
    printf("TSH: [mgos_app_init] done with MGOS_APP_INIT_SUCCESS\n");
    return MGOS_APP_INIT_SUCCESS;
}

