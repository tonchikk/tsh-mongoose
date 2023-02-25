
let esp32hwpcnt_published = {};
let esp32hwpcnt_publisher_tm = null;

let esp32hwpcnt_publish_gpio = function(gpio) {
    let data=esp32hwpcnt.getAll(gpio);
    data.gpio = gpio;
    data.persisted = (esp32hwpcnt.persistence.GPIOs[gpio] !== undefined);
    MQTT_publish("/esp32hwpcnt",data);
    esp32hwpcnt_published[gpio].lp = Sys.uptime();
};

let esp32hwpcnt_ev_zero_cb = function(unit) {
    print("TSH JS: [esp32hwpcnt_ev_zero_cb] for unit ", unit, " value = ", esp32hwpcnt.get_unit_value(unit));
    esp32hwpcnt_publish_gpio(esp32hwpcnt.Units[unit].gpio);
};


let esp32hwpcnt_publish_all = function(u) {
    print("TSH JS: [esp32hwpcnt_publish_all] @",u);
    for (let g in esp32hwpcnt.GPIO) {
        print("TSH JS: [esp32hwpcnt_publish_all] GPIO",g,"lp",esp32hwpcnt_published[g].lp,'interval',esp32hwpcnt_published[g].interval);
        if(esp32hwpcnt_published[g] !== undefined &&
           esp32hwpcnt_published[g].interval > 0 && 
           u - esp32hwpcnt_published[g].lp > esp32hwpcnt_published[g].interval)
        {
            esp32hwpcnt_publish_gpio(JSON.parse(g));
        };
    };
};

let esp32hwpcnt_init = function(o){
    if (!esp32hwpcnt.started) {
        print("TSH JS: [esp32hwpcnt_init]",(0===null)?"AUTO":"","Starting ESP32 HW PCNT ",esp32hwpcnt.start()?"OK":"FAIL", " with max units of ",esp32hwpcnt.get_max_units());
        esp32hwpcnt.set_global_callback(esp32hwpcnt_ev_zero_cb,null);
        esp32hwpcnt.persistence.init();
        esp32hwpcnt_publisher_tm = Timer.set(1000, true, function() {
            esp32hwpcnt_publish_all(Sys.uptime());
        },null);
    };
    if (!esp32hwpcnt.started) {
        print('TSH JS: [esp32hwpcnt_init] Start failed, try luck next time');
        return;
    };
    if (o !== null){
        let p = false;
        if (typeof(o.persist) === 'object') {
            esp32hwpcnt.persistence.GPIOs[o.gpio] = o.persist;
            p = true;
        } else if(o.persist) {
            p = true;
        };
        esp32hwpcnt.init(o.gpio, o.lim, p);
        esp32hwpcnt_published[o.gpio] = {lp: Sys.uptime(), interval: (o.interval!==undefined)?o.interval:0};
    };
};

MQTT.sub(MQTT_dev + '/esp32hwpcnt/init', function(conn, topic, msg) {
    print('Topic:', topic, 'message:', msg);
    esp32hwpcnt_init(JSON.parse(msg));
  }, null);

// esp32hwpcnt.init(22, 1024, true);
if (esp32hwpcnt.persistence.load() > 0){
    esp32hwpcnt_init(null);
};

let esp32hwpcnt_persistence_drop = function(o){
    esp32hwpcnt.persistence.drop(o.gpio);
};

MQTT.sub(MQTT_dev + '/esp32hwpcnt/persistence/drop', function(conn, topic, msg) {
    print('Topic:', topic, 'message:', msg);
    esp32hwpcnt_persistence_drop(JSON.parse(msg));
  }, null);

let esp32hwpcnt_setValue = function(o){
    esp32hwpcnt.setValue(o.gpio,o.value);
};

MQTT.sub(MQTT_dev + '/esp32hwpcnt/setValue', function(conn, topic, msg) {
    print('Topic:', topic, 'message:', msg);
    esp32hwpcnt_setValue(JSON.parse(msg));
  }, null);

