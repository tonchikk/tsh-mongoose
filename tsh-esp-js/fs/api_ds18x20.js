let ds18x20 = { 
    // set_callback: ffi ('bool ds18x20_set_callback(void(*)(char *,float, userdata), userdata)'),
    run_line_once: ffi ('void ds18x20_run_line_once(int)'),
    set_mqtt_base:  ffi ('bool ds18x20_set_mqtt_base (char *)')
}