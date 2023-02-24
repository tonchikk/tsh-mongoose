
/*
lim to be between [−32768, +32767] - short
count to be between [−2 147 483 648, +2 147 483 647] - int
*/

load('api_file.js');

let esp32hwpcnt = {
    GPIO: {},
    Units: {},
    filter: 100,
    persistence: {
        filename: "esp32hwpcnt_persistence.json",
        GPIOs: {},
        persist: function (gpio) {
            if (esp32hwpcnt.GPIO[gpio] !== undefined && esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]] !== undefined ) {
                esp32hwpcnt.persistence.update(gpio);
            };
        },
        update: function(gpio){
            esp32hwpcnt.persistence.GPIOs[gpio] = esp32hwpcnt.getAll(gpio);
            esp32hwpcnt.persistence.GPIOs[gpio].lim = esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].lim;
        },
        restore: function(gpio){
            if (
                esp32hwpcnt.GPIO[gpio] !== undefined && 
                esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]] !== undefined && 
                esp32hwpcnt.persistence.GPIOs[gpio] !== undefined 
            ) {
                print("TSH JS: [esp32hwpcnt.persistence.restore] GPIO",gpio);
                esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].saved = {
                    count: esp32hwpcnt.persistence.GPIOs[gpio].count,
                    majors: esp32hwpcnt.persistence.GPIOs[gpio].majors,
                    minors: esp32hwpcnt.persistence.GPIOs[gpio].minors,
                    value: esp32hwpcnt.persistence.GPIOs[gpio].value
                };
            } else {
                print("TSH JS: [esp32hwpcnt.persistence.restore] could not be done for GPIO",gpio);
            };
        },
        drop: function(gpio) {
            if (esp32hwpcnt.persistence.GPIOs[gpio] !== undefined) {
                esp32hwpcnt.persistence.GPIOs[gpio] = undefined;
                print("TSH JS: [esp32hwpcnt.persistence.drop] GPIO",gpio);
            };
        },
        load: function() {
            print("TSH JS: [esp32hwpcnt.persistence.load] Started");
            esp32hwpcnt.persistence.GPIOs = JSON.parse(File.read(esp32hwpcnt.persistence.filename));
            for (let g in esp32hwpcnt.persistence.GPIOs) {
                print("TSH JS: [esp32hwpcnt.persistence.load] GPIO",g);
            };
        },
        save: function() {
            for (let g in esp32hwpcnt.persistence.GPIOs) {
                esp32hwpcnt.persistence.persist(g)
            };
            File.write(JSON.stringify(esp32hwpcnt.persistence.GPIOs),esp32hwpcnt.persistence.filename,'w');
            print("TSH JS: [esp32hwpcnt.persistence.save]",JSON.stringify(esp32hwpcnt.persistence.GPIOs));
        },
        interval: 60, //sec,
        tm: null,
        init: function(){
            print("TSH JS: [esp32hwpcnt.persistence.init] Started");
            esp32hwpcnt.persistence.load();

            print("TSH JS: [esp32hwpcnt.persistence.init] Sheduling saving to file every",esp32hwpcnt.persistence.interval,"seconds");
            if (esp32hwpcnt.persistence.tm === null ) {
                esp32hwpcnt.persistence.tm = Timer.set(esp32hwpcnt.persistence.interval * 1000, true, function() {
                    esp32hwpcnt.persistence.save();
              }, null);
            };
            print("TSH JS: [esp32hwpcnt.persistence.init] Done");
        },
        startAll: function(){
            print("TSH JS: [esp32hwpcnt.persistence.startAll]");
            for (let g in esp32hwpcnt.persistence.GPIOs) {
                print("TSH JS: [esp32hwpcnt.persistence.startAll] Initialising saved counter @ GPIO",g);
                esp32hwpcnt.init(JSON.parse(g), esp32hwpcnt.persistence.GPIOs[g].lim, true);
            };
        }
    },
    init: function(gpio, lim, persist){
        if ( esp32hwpcnt.GPIO[gpio] !== undefined ) {
            print("TSH JS: [esp32hwpcnt.init] Already initialized for GPIO",gpio, "Reboot to reset");
            return -1;
        };
        let unit = 0;
        while ( 
            (unit<esp32hwpcnt.get_max_units()) && 
            (esp32hwpcnt.Units[unit] !== undefined)
        ) {
            unit++;
        };
        if (! (unit<esp32hwpcnt.get_max_units())) {
            print("TSH JS: [esp32hwpcnt.init] All units busy, Reboot to reset");
            return -2;
        };
        print("TSH JS: [esp32hwpcnt.init] GPIO",gpio,"will be initialized @ unit",unit);
        esp32hwpcnt.init_unit(unit,gpio,esp32hwpcnt.filter,lim);
        if (persist) {
            esp32hwpcnt.persistence.persist(gpio);
        }
    },
    init_unit: function (unit, gpio, filter, lim) {
        let esp32hwpcnt_init_unit = ffi('bool esp32hwpcnt_init_unit(int , int , int , int)');
        if (esp32hwpcnt.Units[unit] !== undefined && esp32hwpcnt.GPIO[gpio] !== undefined) {
            print("TSH JS: [esp32hwpcnt.init_unit] Already initialized @ Unit ", unit, " for GPIO ",esp32hwpcnt.Units[unit].gpio, " Reboot to reset");
            return false;
        };
        esp32hwpcnt.Units[unit] = { 
            gpio: gpio,
            lim: lim,
            saved: {
                count: 0,
                majors: 0,
                minors: 0,
                value: 0,
            }
        };
        esp32hwpcnt.GPIO[gpio] = unit;
        esp32hwpcnt.persistence.restore(gpio);
        esp32hwpcnt_init_unit(unit, gpio, filter, lim);
    },
    started: false,
    start: function() { 
        let esp32hwpcnt_start = ffi('bool esp32hwpcnt_start(void)');
        if (!esp32hwpcnt.started) {
            esp32hwpcnt.started = esp32hwpcnt_start(); 
        }
        else {
            print ('TSH JS: [esp32hwpcnt.start] already started');
        }
        return esp32hwpcnt.started;
    },

    get_max_units: ffi('int esp32hwpcnt_get_max_units(void)'),
    reset_unit: ffi('bool esp32hwpcnt_reset_unit(int)'),

    get_unit_pulses: ffi('int esp32hwpcnt_get_pulses(int)'),
    get_unit_majors: ffi('int esp32hwpcnt_get_majors(int)'),
    get_unit_minors: ffi('int esp32hwpcnt_get_minors(int)'),
    get_unit_value: ffi('double esp32hwpcnt_get_value(int)'),
    
    get: function(gpio) {
        return esp32hwpcnt.get_unit_pulses(esp32hwpcnt.GPIO[gpio]) + esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].saved.count;
    },
    getMajors: function(gpio) {
        return esp32hwpcnt.get_unit_majors(esp32hwpcnt.GPIO[gpio]) + esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].saved.majors;
    },
    getMinors: function(gpio) {
        return esp32hwpcnt.get_unit_minors(esp32hwpcnt.GPIO[gpio]) + esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].saved.minors;
    },
    getValue: function(gpio) {
        return esp32hwpcnt.get_unit_value(esp32hwpcnt.GPIO[gpio]) + esp32hwpcnt.Units[esp32hwpcnt.GPIO[gpio]].saved.value;
    },
    getAll: function(gpio){
        return {
            count: esp32hwpcnt.get(gpio),
            majors: esp32hwpcnt.getMajors(gpio),
            minors: esp32hwpcnt.getMinors(gpio),
            value: esp32hwpcnt.getValue(gpio)
        }
    },

    set_global_callback: ffi('void esp32hwpcnt_set_global_cb(void (*)(int, userdata), userdata)')

};

let esp32hwpcnt_ev_zero_cb = function(unit) {
    print("TSH JS: [esp32hwpcnt_ev_zero_cb] for unit ", unit, " value = ", esp32hwpcnt.get_unit_value(unit));
    let data=esp32hwpcnt.getAll(esp32hwpcnt.Units[unit].gpio);
    data.gpio = esp32hwpcnt.Units[unit].gpio;
    data.persisted = (esp32hwpcnt.persistence.GPIOs[esp32hwpcnt.Units[unit].gpio] !== undefined);
    MQTT_publish("/esp32hwpcnt",data);
};


print("TSH JS: Starting ESP32 HW PCNT ",esp32hwpcnt.start()?"OK":"FAIL", " with max units of ",esp32hwpcnt.get_max_units());
esp32hwpcnt.set_global_callback(esp32hwpcnt_ev_zero_cb,null);
esp32hwpcnt.persistence.init();
esp32hwpcnt.persistence.startAll();
esp32hwpcnt.init(22, 1024, true);
