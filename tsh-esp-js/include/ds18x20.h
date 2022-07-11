#pragma once    

#ifdef __cplusplus
extern "C" {
#endif

#define DEVID_STRLEN 24
#define TEMP_STR_LEN 16

typedef struct ds18x20_result {
    uint8_t rom[8];
    char *mac;
    float temp;
    struct ds18x20_result *next;
    int res, us, cfg;
    struct mgos_onewire *ow;
} ds18x20_result_t;

//typedef ds18x20_result ds18x20_result;

typedef void (*ds18x20_callback_t)(char *mac,float temp,void *userdata);

void ds18x20_read_all(int pin);
bool ds18x20_set_callback(ds18x20_callback_t cb, void *userdata);
bool ds18x20_set_mqtt_base (char *base);
bool ds18x20_mqtt_publish (ds18x20_result_t *rom);


#ifdef __cplusplus
}
#endif