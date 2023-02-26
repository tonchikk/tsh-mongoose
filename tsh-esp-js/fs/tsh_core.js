// MQTT_dev will be used as MQTT topics prefixes below
let MQTT_dev = '/devices/' + Cfg.get('device.id');


let TSH = {
    Debug: 0,
    // lastConfig and lastWiFi_GOT_IP usefull for configuration engine
    // It is designed to "update configuration" on every reconnect to WiFi
    // This reconfiguration extreemly usefull on poor WiFi
    lastConfig: "never",
    lastWiFi_GOT_IP: -1,
    // FYI
    device: "unknown",
    tsh_version: "none",
    topic_handler: function(conn, topic, msg, ud) {
      print('TSH JS [topic_handler]:', topic, '=', msg);
      ud(JSON.parse(msg));
    },
    subscribe: function(path,handler){
      MQTT.sub(MQTT_dev + path, TSH.topic_handler, handler);
    }
};


/**
 * Common publisher for MQTT
 * @param {*} component - second part of MQTT path to publish
 * @param {*} data - message to publish
 */
 let MQTT_publish = function (component, data) {
  let msg = JSON.stringify (data);
  let topic = MQTT_dev + component;
  let ok = MQTT.pub(topic, msg, 1);
  if (TSH.Debug !== 0 || ok === 0) 
      print('Published:', ok ? 'yes' : 'no', 'topic:', topic, 'message:', msg); 
};


RPC.call(RPC.LOCAL, 'Sys.GetInfo', null, function(resp, ud) {
  TSH.device = resp.arch;
  TSH.version = resp.fw_version; 
},null);

/**
 * 
 * @returns Hash with uptime/runtime staistics
 */

let GetStats = function () {
  return {
    total_ram: Sys.total_ram(),
    free_ram: Sys.free_ram(),
    uptime: Sys.uptime(),
    configured: TSH.lastConfig,
    net_uptime: Sys.uptime() - TSH.lastWiFi_GOT_IP,
    device_arch: TSH.device,
    tsh_version: TSH.version
  };
};

// Publish basic info to keep alive with master
let tmStatus = null;
let runStatusReporter = function (i) {
  if (tmStatus !== null) {
    Timer.del(tmStatus);
  }
  tmStatus = Timer.set(i, true, function() {
    MQTT_publish(
      "/status",
      GetStats()
    );
  }, null);
};

runStatusReporter(1000);

// Set last time of config to confirm stable connection with master
MQTT.sub(MQTT_dev + '/status/config', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  if (o.interval === undefined)
    o.interval = 5;
  runStatusReporter(o.interval * 1000);
  TSH.lastConfig = o.date;
}, null);


// Handle deep sleep
let otaMode = false;
let secToSleep = 0;
MQTT.sub(MQTT_dev + '/deepSleep', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  secToSleep = o.timeout;
  if (secToSleep > 0) {
    Timer.set(1000, false, function (){
      print ("Going deep sleep for: ", secToSleep, "on ", device);
      if(TSH.device === "esp32")
        ESP32.deepSleep(secToSleep * 1000 * 1000);
      if(TSH.device === "esp8266")
        ESP8266.deepSleep(secToSleep * 1000 * 1000);
    }, null);
  };
}, null);


// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
  let evs = '???';
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
    TSH.lastConfig = "never";
    runStatusReporter(1000);
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
    TSH.lastWiFi_GOT_IP = Sys.uptime();
  }
  print('== Net event:', ev, evs);
}, null);