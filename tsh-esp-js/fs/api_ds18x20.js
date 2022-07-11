let ds18x20 = { 
    // set_callback: ffi ('bool ds18x20_set_callback(void(*)(char *,float, userdata), userdata)'),
    read_all:       ffi ('void ds18x20_read_all(int);'),
    set_mqtt_base:  ffi ('bool ds18x20_set_mqtt_base (char *)')
}