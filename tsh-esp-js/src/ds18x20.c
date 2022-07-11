#include <stdlib.h>
#include "mgos.h"
#include "mgos_onewire.h"
#include "ds18x20.h"
#include "mgos_mqtt.h"
#include <string.h>


// Helper for allocating new things
#define new(what) (what *)malloc(sizeof(what))

// Helper for allocating strings
#define new_string(len) (char *)malloc(len * sizeof(char) + 1)

// Converts a uint8_t rom address to a MAC address string
#define to_mac(r, str) sprintf(str, "%02x-%02x%02x%02x%02x%02x%02x", r[0], r[6], r[5], r[4], r[3], r[2], r[1])

ds18x20_callback_t ds18x20_callback = NULL;
void *ds18x20_callback_userdata = NULL;

char *ds18x20_mqtt_base = NULL;

bool ds18x20_set_callback(ds18x20_callback_t cb, void *userdata) { 
    ds18x20_callback = cb;
    ds18x20_callback_userdata = userdata;
    return true;
};

bool ds18x20_set_mqtt_base (char *base) {
    int len = strlen(base);
    if (ds18x20_mqtt_base != NULL)
        free(ds18x20_mqtt_base);
    ds18x20_mqtt_base = new_string(len);
    sprintf(ds18x20_mqtt_base, "%s", base);
    printf("TSH: [ds18x20_set_mqtt_base] set to: %s\n", ds18x20_mqtt_base);
    return true;
};

bool ds18x20_mqtt_publish (ds18x20_result_t *temp) {
    char *topic = new_string(strlen(ds18x20_mqtt_base) + strlen(temp->mac) + 1);
    char *value = new_string(TEMP_STR_LEN);
    sprintf(topic, "%s/%s", ds18x20_mqtt_base, temp->mac);
    sprintf(value, "%f", temp->temp);
    printf("TSH: [ds18x20_mqtt_publish] to do: %s = %s (%i strlen)\n", topic, value, strlen(value));
    mgos_mqtt_pub(topic, value , strlen(value), 1, 0);
    free(topic); free(value);
    return true;
};

struct ds18x20_result *ds18x20_find_all(int pin) {
    // temp - current item
    // list will be returned
    struct ds18x20_result *temp, *list = NULL;
    // ow structure for list, will be the same for all devices and freed not here
    struct mgos_onewire *ow;
    // Per device
    uint8_t rom[8];
    int res, us;
    char *devid = new_string(DEVID_STRLEN);;

    printf("TSH: [ds18x20_find_all] starting search on GPIO %i\n", pin);
    // Find all the sensors
    ow = mgos_onewire_create(pin);                  // Create one-wire
    mgos_onewire_search_clean(ow);                  // Reset search
    while ( mgos_onewire_next(ow, rom, 1) ) {       // Loop over all devices
        to_mac(rom, devid);                         // cached human readable name
        printf("TSH: [ds18x20_find_all] detected %s @ GPIO %i\n", devid, pin);
        switch (rom[0]) {
            // Actualy this part is for some future use compatibility after much of tests
            // But you could sortem memory usage by cutting below arguments and
            // removing memebers of ds18x20_result
            // http://owfs.sourceforge.net/family.html
            case 0x28: // DS18B20
                res = 12; // Default, somebody will whould like to read
                us = 750000;
                break;
            case 0x10: // DS18S20
                res = -1; // Not applicable
                us  = 750000;
            break;
            default:
                // unsupported, skip
                continue; 
        }
        temp = new(struct ds18x20_result);          // Create a new results struct
        if ( temp == NULL ) {                       // Make sure it worked
            printf("TSH: [ds18x20_find_all] new ds18x20_result - memory allocation failure\n");   // If not, print a useful message
            continue; // exit(1) was here, but I'd like to keep IoT live as much as possible
        }
        // spamming memory
        temp->res = res;
        temp->us = us;
        // ow object for later readings
        temp->ow = ow;
        // Storing main data
        memcpy(temp->rom, rom, 8);                  // Copy the ROM code into the result
        temp->mac = new_string(DEVID_STRLEN);       // Allocate a string for the MAC address
        to_mac(rom, temp->mac);                     // Convert the rom to a MAC address string
        temp->next = list;                          // link to previous sensor
        list = temp;                                // set list point to new result
        printf("TSH: [ds18x20_find_all] added %s @ GPIO %i\n", devid, pin);
    }
    // Search done, coming home, cleaning up workspace.
    free(devid);

    // Passing job to next shift
    return list;
};

// Request temperature convertion on sensors in list
int ds18x20_request_all(struct ds18x20_result *list) {
    struct ds18x20_result *temp = NULL;
    int max_delay = 0;
    temp = list;                                      // Temporary results holder
    while ( temp != NULL ) {     
        mgos_onewire_reset(temp->ow);
        mgos_onewire_select(temp->ow, temp->rom);
        printf("TSH: [ds18x20_request_all] Requesting %s\n", temp->mac);
        // requesting conversion
        mgos_onewire_write(temp->ow, 0x44);           // Start conversion 
        if ( temp->us > max_delay)
            max_delay = temp->us;
        temp = temp->next;
    };
    return max_delay;
};


// Read all result in update list items
void ds18x20_read_all(struct ds18x20_result *list) {
    struct ds18x20_result *temp = NULL;
    int t, h;
    int16_t raw;
    uint8_t data[9];


    printf("TSH: [ds18x20_read_all] collecting results\n");
    // Step 5: Read the temperatures
    temp = list;                                    // Temporary results holder
    while ( temp != NULL ) {                        // Loop over all devices
        mgos_onewire_reset(temp->ow);                     // Reset
        mgos_onewire_select(temp->ow, temp->rom);         // Select the device
        mgos_onewire_write(temp->ow, 0xBE);               // Issue read command
        mgos_onewire_read_bytes(temp->ow, data, 9);       // Read the 9 data bytes
        raw = (data[1] << 8) | data[0];             // Get the raw temperature
        switch (temp->rom[0]) {
            case 0x10:
                // https://static.chipdip.ru/lib/073/DOC000073557.pdf
                // https://elixir.bootlin.com/linux/latest/source/drivers/w1/slaves/w1_therm.c
                if (data[1] == 0)
		            t = ((signed int)data[0] >> 1)*1000;
	            else
		            t = 1000*(-1*(signed int)(0x100-data[0]) >> 1);
	                t -= 250;
	                h = 1000*((signed int)data[7] - (signed int)data[6]);
	                h /= (signed int)data[7];
	                t += h;
                    temp->temp = (float) t / 1000;
            break;
            case 0x28:
                // https://static.chipdip.ru/lib/246/DOC004246203.pdf 
/* It is useless for current workflow, kept for future use
                if      (temp->res == 9 ) raw = raw & ~7;       // 9-bit raw adjustment
                else if (temp->res == 10) raw = raw & ~3;       // 10-bit raw adjustment
                else if (temp->res == 11) raw = raw & ~1;       // 11-bit raw adjustment
*/
                temp->temp = (float) raw / 16;                  // Convert to celsius and store the temp
            break;
        }
        
        printf("TSH: [ds18x20_read_all] %s collected %f C (%02X %02X with %02X %02X)\n", temp->mac, temp->temp, data[1], data[0], data[6], data[7]);

        temp = temp->next;                          // Switch to the next sensor in the list
    }
    
};

// Publish read daa from list
// One custom callback (still not working from JS) and one MQTT
// Everything is synchronious
void ds18x20_publish_all(struct ds18x20_result *list) {
    struct ds18x20_result *temp = NULL;
    temp = list;                                    // Temporary results holder
    while ( temp != NULL ) {     
        if (ds18x20_mqtt_base != NULL)
            ds18x20_mqtt_publish(temp);
        
        if (ds18x20_callback != NULL)
            ds18x20_callback(temp->mac, temp->temp, ds18x20_callback_userdata);
        temp = temp->next;
    };
};


// "Finish him" (c) much of cinemas
// Cleaunp memory
void ds18x20_finish_list(struct ds18x20_result *list) {
    struct ds18x20_result *temp = NULL;
    // Step 7: Cleanup
    while ( list != NULL ) {                        // Loop over all device results
        temp = list->next;                          // Store a ref to the next device
        free(list->mac);                            // Free up the MAC address string
        if (list->next == NULL)
            mgos_onewire_close(list->ow); 
        free(list);                                 // Free up the struct
        list = temp;                                // Cleanup next device
    }
}

// Second part after search and request: read, publish and cleanup.
// Theoretically ready for timer
void ds18x20_process_all(struct ds18x20_result *list) {
    ds18x20_read_all(list);
    ds18x20_publish_all(list);
    ds18x20_finish_list(list);
} 

static void ds18x20_process_all_timer(void *arg) {
    ds18x20_process_all((struct ds18x20_result *) arg);
}

// Main part: search, request, schedule second part
bool ds18x20_run_line_once(int pin) {
 
    struct ds18x20_result *list = NULL;
    int sleep_time = 0;

    list = ds18x20_find_all(pin);
    if (list == NULL)
        return false;

    sleep_time = ds18x20_request_all(list)/1000;
    
    printf("TSH: [ds18x20_read_all] mgos_set_timer for ds18x20_process_all in %ims\n", sleep_time);
    mgos_set_timer(sleep_time, 0, ds18x20_process_all_timer, (void *)list);

    //mgos_usleep(sleep_time);                          // Wait for conversion - remove /1000 if you'd like to
                                                        // have sleep instead of executing later by timer - yelding
    //ds18x20_process_all(list);

    return true;
}

bool mgos_mongoose_os_ds18x20_init(void) {
    return true;
}
