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

// TSH
bool ds18x20_set_callback(ds18x20_callback_t cb, void *userdata);
bool ds18x20_set_mqtt_base (char *base);
bool ds18x20_mqtt_publish (ds18x20_result_t *rom);

struct ds18x20_result *ds18x20_find_all(int pin);
int ds18x20_request_all(struct ds18x20_result *list);
void ds18x20_read_all(struct ds18x20_result *list);
void ds18x20_publish_all(struct ds18x20_result *list);
void ds18x20_finish_list(struct ds18x20_result *list);
void ds18x20_process_all(struct ds18x20_result *list);

#ifdef __cplusplus
}
#endif