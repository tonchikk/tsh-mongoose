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
//#include "ds18x20.h"
//#include "esp32hwpcnt.h" //this to be removed after ESP32 tests


enum mgos_app_init_result mgos_app_init(void) {
    // Init OK
    printf("TSH: [mgos_app_init] done with MGOS_APP_INIT_SUCCESS\n");
    // Start main task of ESP32 HW Pulse Counter
 //   printf("Starting ESP32 HW PCNT %s",esp32hwpcnt_start()?"OK":"FAIL");
//    esp32hwpcnt_init_unit(0, 22, 100, 1024 );
    return MGOS_APP_INIT_SUCCESS;
}

