#include <stdlib.h>
#include "mgos.h"
#include "esp32hwpcnt.h"
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"
#include "freertos/task.h"
#include "freertos/queue.h"

#include "driver/periph_ctrl.h"
#include "driver/gpio.h"
#include "driver/pcnt.h"
#include "esp_attr.h"
#include "esp_log.h"
#include "soc/gpio_sig_map.h"

bool mgos_mongoose_os_esp32hwpcnt_init(void) {
    return true;
}