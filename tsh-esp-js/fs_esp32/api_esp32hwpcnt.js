let esp32hwpcnt = {
    GPIO: {},
    Units: {},
    init_unit: function (unit, gpio, filter, lim) {
        let esp32hwpcnt_init_unit = ffi('bool esp32hwpcnt_init_unit(int , int , int , int)');
        if (this.Units[unit] !== undefined) {
            print("Already initialized @ Unit ", unit, " for GPIO ",this.Units[unit].gpio, " Reboot to reset");
            return false;
        };
        this.Units[unit] = { 
            gpio: gpio,
            count: 0,
            majors: 0,
            firstdone: false
        };
        this.GPIO[gpio] = unit;
        esp32hwpcnt_init_unit(unit, gpio, filter, lim);
    },
    started: false,
    start: function() { 
        let esp32hwpcnt_start = ffi('bool esp32hwpcnt_start(void)');
        if (!this.started) {
            this.started = esp32hwpcnt_start(); 
        }
        else {
            print ('TSH JS [esp32hwpcnt] already started');
        }
        return this.started;
    },
    get_unit_pulses: ffi('long esp32hwpcnt_get_pulses(int)'),
    get_unit_majors: ffi('long esp32hwpcnt_get_majors(int)'),
    get: function(gpio) {
        return this.Units[this.GPIO[gpio]].count;
    },
    getMajors: function(gpio) {
        return this.Units[this.GPIO[gpio]].majors;
    },
    get_max_units: ffi('int esp32hwpcnt_get_max_units(void)')
};

let esp32hwpcnt_ev_zero_cb = function(unit) {
    if (esp32hwpcnt.Units[unit].firstdone) {
        esp32hwpcnt.Units[unit].count = esp32hwpcnt.get_unit_pulses(unit);
        esp32hwpcnt.Units[unit].majors = esp32hwpcnt.get_unit_majors(unit);
    } else {
        esp32hwpcnt.Units[unit].count += esp32hwpcnt.get_unit_pulses(unit);
        esp32hwpcnt.Units[unit].majors += esp32hwpcnt.get_unit_majors(unit);
        firstdone = true;
    }
};


print("Starting ESP32 HW PCNT ",esp32hwpcnt.start()?"OK":"FAIL");
esp32hwpcnt.init_unit(0, 22, 100, 1024 );
