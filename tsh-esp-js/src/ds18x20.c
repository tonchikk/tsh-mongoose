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
    mgos_mqtt_pub(topic, (void *) &temp->temp , sizeof(temp->temp), 1, 0);
    free(topic); free(value);
    return true;
};


// Read all temperatures
void ds18x20_read_all(int pin) {
    uint8_t rom[8], data[9];
    int16_t raw;
    int us;
    struct mgos_onewire *ow;
    struct ds18x20_result *temp, *list = NULL;
    char *devid;
    int res;

    int t, h;

    devid = new_string(DEVID_STRLEN);

    printf("TSH: [ds18x20_read_all] will do on GPIO %i\n", pin);

    // Step 1: Determine config
    /*
    if ( res == 9 )       { cfg=0x1F;  us=93750;  } // 9-bit resolution (93.75ms delay)
    else if ( res == 10 ) { cfg=0x3F;  us=187500; } // 10-bit resolution (187.5ms delay)
    else if ( res == 11 ) { cfg=0x5F;  us=375000; } // 11-bit resolution (375ms delay)
    else                  { cfg=0x7F;  us=750000; } // 12-bit resolution (750ms delay)
    */
    // Step 2: Find all the sensors
    ow = mgos_onewire_create(pin);                  // Create one-wire
    mgos_onewire_search_clean(ow);                  // Reset search
    printf("TSH: [ds18x20_read_all] search started\n");
    while ( mgos_onewire_next(ow, rom, 1) ) {       // Loop over all devices
        to_mac(rom, devid);
        printf("TSH: [ds18x20_read_all] detected %s\n", devid);
        // Work with known devices
        switch (rom[0]) {
            // http://owfs.sourceforge.net/family.html
            case 0x28:
                res = 12;
                us = 750000;
                break;
            case 0x10:
                res = 9;
                us=93750;
            break;
            default:
                // unsupported
                continue; 
        }
        temp = new(struct ds18x20_result);          // Create a new results struct
        if ( temp == NULL ) {                       // Make sure it worked
            printf("Memory allocation failure!");   // If not, print a useful message
            exit(1);                                // And blow up
        }
        temp->res = res;
        temp->us = us;
        temp->ow = ow;
        memcpy(temp->rom, rom, 8);                  // Copy the ROM code into the result
        temp->mac = new_string(DEVID_STRLEN);       // Allocate a string for the MAC address
        to_mac(rom, temp->mac);                     // Convert the rom to a MAC address string
        temp->next = list;                          // link to previous sensor
        list = temp;                                // set list point to new result
        
        mgos_onewire_reset(ow);
        mgos_onewire_select(ow, temp->rom);
        // Configuring
        
        //mgos_onewire_write(ow, 0xCC);                 // Skip Rom
        //mgos_onewire_write(ow, 0x4E);                   // Write to scratchpad
        //mgos_onewire_write(ow, 0x00);                   // Th or User Byte 1
        //mgos_onewire_write(ow, 0x00);                   // Tl or User Byte 2
        //mgos_onewire_write(ow, temp->cfg);              // Configuration register
        //mgos_onewire_write(ow, 0x48);                   // Copy scratchpad
        
        printf("TSH: [ds18x20_read_all] %s @ GPIO %i good to go with %i bit resolution and %ius converstion time\n", devid, pin, res, us);
  
        // requesting conversion
        mgos_onewire_write(ow, 0x44);                   // Start conversion
    }

    printf("TSH: [ds18x20_read_all] sleep for conversion\n");
    mgos_usleep(1000000);                                // Wait for conversion

    printf("TSH: [ds18x20_read_all] collecting results\n");
    // Step 5: Read the temperatures
    temp = list;                                    // Temporary results holder
    while ( temp != NULL ) {                        // Loop over all devices
        mgos_onewire_reset(ow);                     // Reset
        mgos_onewire_select(ow, temp->rom);         // Select the device
        mgos_onewire_write(ow, 0xBE);               // Issue read command
        mgos_onewire_read_bytes(ow, data, 9);       // Read the 9 data bytes
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
                if      (temp->res == 9 ) raw = raw & ~7;       // 9-bit raw adjustment
                else if (temp->res == 10) raw = raw & ~3;       // 10-bit raw adjustment
                else if (temp->res == 11) raw = raw & ~1;       // 11-bit raw adjustment
                temp->temp = (float) raw / 16;            // Convert to celsius and store the temp
            break;
        }
        
        printf("TSH: [ds18x20_read_all] %s collected %f C (%02X %02X with %02X %02X)\n", temp->mac, temp->temp, data[1], data[0], data[6], data[7]);

        if (ds18x20_mqtt_base != NULL)
            ds18x20_mqtt_publish(temp);
        
        if (ds18x20_callback != NULL)
            ds18x20_callback(temp->mac, temp->temp, ds18x20_callback_userdata);

        temp = temp->next;                          // Switch to the next sensor in the list
    }

    // Step 7: Cleanup
    while ( list != NULL ) {                        // Loop over all device results
        temp = list->next;                          // Store a ref to the next device
        free(list->mac);                            // Free up the MAC address string
        free(list);                                 // Free up the struct
        list = temp;                                // Cleanup next device
    }
    mgos_onewire_close(ow);                         // Close one wire
    free(devid);
}

bool mgos_mongoose_os_ds18x20_init(void) {
    return true;
}
