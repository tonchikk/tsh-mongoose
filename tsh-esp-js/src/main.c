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
#include "esp32hwpcnt.h"


enum mgos_app_init_result mgos_app_init(void) {
    // Init OK
    printf("TSH: [mgos_app_init] done with MGOS_APP_INIT_SUCCESS\n");
    return MGOS_APP_INIT_SUCCESS;
}

