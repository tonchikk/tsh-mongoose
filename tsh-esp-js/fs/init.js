/*

   This is TSH Worker tested on ESP8266 based devboards

   Copyright 2017-2019 Anton Kaukin

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

*/

// Load Mongoose OS API
load('api_timer.js');
load('api_mqtt.js');
load('api_config.js');
load('api_gpio.js');
load("api_pwm.js");
load('api_sys.js');
load('api_net.js');
load('api_events.js');
load('api_adc.js');
load('api_dht.js');
load('api_rpc.js');
load('api_uart.js');

// Set basic variables
// MQTT_dev will be used as MQTT topics prefixes below
let MQTT_dev = '/devices/' + Cfg.get('device.id');
// lastConfig and lastWiFi_GOT_IP usefull for configuration engine
// It is designed to "update configuration" on every reconnect to WiFi
// This reconfiguration extreemly usefull on poor WiFi
let lastConfig = "never";
let lastWiFi_GOT_IP = -1;

let tshDebug = 0;
    load('api_esp32.js');
    load('api_esp32_touchpad.js');
 
//    load('api_esp8266.js');

// FYI
let device = "unknown";
RPC.call(RPC.LOCAL, 'Sys.GetInfo', null, function(resp, ud) {
  device = resp.arch;
 /* if ( device === "esp32" )
  {
 }
  if ( device === "esp8266" ) 
*/
},null);

// Common
let MQTT_publish = function (component, data) {
    let msg = JSON.stringify (data);
    let topic = MQTT_dev + component;
    let ok = MQTT.pub(topic, msg, 1);
    if (tshDebug !== 0 || ok === 0) 
        print('Published:', ok ? 'yes' : 'no', 'topic:', topic, 'message:', msg); 
};

let GetStats = function () {
  return {
    total_ram: Sys.total_ram(),
    free_ram: Sys.free_ram(),
    uptime: Sys.uptime(),
    configured: lastConfig,
    net_uptime: Sys.uptime() - lastWiFi_GOT_IP,
    device_arch: device 
  };
};

// Publish basic info
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

// FYI
MQTT.sub(MQTT_dev + '/status/config', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  if (o.interval === undefined)
    o.interval = 5;
  runStatusReporter(o.interval * 1000);
  lastConfig = o.date;
}, null);


// DHT global

let dhts = {} ;

let DHT_init = function(pin, interval) {
  print("Initializing DHT2302 @ ", pin);
  
  if (dhts[pin] !== undefined) {
      print("already done @",pin,"reboot to reset");
      return;
  }
  
  dhts[pin] = DHT.create(pin, DHT.AM2302);
  dhts[pin].begin();

  Timer.set(interval, true , function(p) {

    let h = dhts[p.DHTpin].getHumidity();
    let t = dhts[p.DHTpin].getTemp();
    let DHTt = -128;
    let DHTh = -128;

    if (!isNaN(t) )
      DHTt = t;
    if (!isNaN(h) )
      DHTh = h;
  
    MQTT_publish(
      "/dht",
      {
        "temp": DHTt,
        "hum": DHTh,
        "pin": p.DHTpin
      }
    );
  }, {DHTpin: pin});

  print("Initializing DHT2302 @ ", pin, " - done");
};


// ADC Part

let ADC_init = function(pin, interval) {
  print("Initializing ADC @ ", pin);

  if ( ADC.enable(pin) === 0)
	print("Enabling ADC @ ", pin, " failed");

  Timer.set(interval, true , function(p) {
    MQTT_publish(
      "/ADC",
      {
        "RAWvalue":  ADC.read(p.ADCpin),
        "pin": p.ADCpin
      }
    );
  }, {ADCpin: pin});
  
  print("Initializing ADC @ ", pin, " - done");
};

// GPIO Related

let GPIO_notify = function (pin){
  MQTT_publish(
    "/GPIO",
    {
      "pin": pin,
      "value": GPIO.read(pin)
    }
  );
};

let GPIO_runInput = function (pin) {
  GPIO.set_mode(pin, GPIO.MODE_INPUT);
  GPIO.set_pull(pin, GPIO.PULL_DOWN);
  GPIO.set_int_handler(pin, GPIO.INT_EDGE_ANY, GPIO_notify, null);
  GPIO.enable_int(pin);
  print("Configured for input handling: ", pin);
};

let GPIO_setOutput = function (pin, state) {
  GPIO.set_mode(pin, GPIO.MODE_OUTPUT);
  GPIO.write(pin, state);
};

// GPIO pin description
let pinLED = 2;
let pinMove = 4;
let pinPWM = 2;
// LED

GPIO_setOutput(pinLED,1); //off

// Basic subscriptions
MQTT.sub(MQTT_dev + '/GPIO/setPWM', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  PWM.set(o.pin,o.freq,o.duty);
}, null);


MQTT.sub(MQTT_dev + '/GPIO/runInput', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  GPIO_runInput(o.pin);
}, null);

MQTT.sub(MQTT_dev + '/GPIO/setOutput', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  GPIO_setOutput(o.pin, o.state);
}, null);

MQTT.sub(MQTT_dev + '/dht/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  DHT_init(o.pin,o.interval);
}, null);

let otaMode = false;
let secToSleep = 0;
MQTT.sub(MQTT_dev + '/deepSleep', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  secToSleep = o.timeout;
  if (secToSleep > 0) {
    Timer.set(1000, false, function (){
      print ("Going deep sleep for: ", secToSleep, "on ", device);
      if(device === "esp32")
        ESP32.deepSleep(secToSleep * 1000 * 1000);
      if(device === "esp8266")
        ESP8266.deepSleep(secToSleep * 1000 * 1000);
    }, null);
  };
}, null);


MQTT.sub(MQTT_dev + '/ADC/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  ADC_init(o.pin,o.interval);
}, null);


// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
  let evs = '???';
  if (ev === Net.STATUS_DISCONNECTED) {
    evs = 'DISCONNECTED';
    lastConfig = "never";
    runStatusReporter(1000);
  } else if (ev === Net.STATUS_CONNECTING) {
    evs = 'CONNECTING';
  } else if (ev === Net.STATUS_CONNECTED) {
    evs = 'CONNECTED';
  } else if (ev === Net.STATUS_GOT_IP) {
    evs = 'GOT_IP';
    lastWiFi_GOT_IP = Sys.uptime();
  }
  print('== Net event:', ev, evs);
}, null);


function MHZ19_process_in(data, uartNo) {
  let a = [];
  let i = 0;
  let crc = 0;
  for (i=0; i < data.length; i++) { a.push(data.at(i)); }
  crc = 256 - (a[1] + a[2] + a[3] + a[4] + a[5] + a[6] + a[7])%256;
  let temp = (a[4]-40); 
  let co = a[2] * 256 + a[3];
  if (crc === a[8]) {
  //  print("temp: ", temp,", co2: " , co);
    MQTT_publish(
      "/MHZ19",
      {
        "port": uartNo,
        "co2": co,
      	"temp": temp
      }
    );
  }
}

function MHZ19_init(uartNo, rxto, txto, interval) {
  print("Initializing MH-Z19B at UART", uartNo, ", RX of sensor connected to ", rxto, " and TX connected to ", txto, " poll interval ", interval, "msec"  );
	UART.setConfig(uartNo, {
		baudRate: 9600,
		esp32: {
			gpio: {
    	  rx: txto,
      	tx: rxto,
    	},
	  },
  });

  UART.setDispatcher(uartNo, function(uartNo) {
    let ra = UART.readAvail(uartNo);
    if (ra > 0) {
      MHZ19_process_in(UART.read(uartNo),uartNo);
    }
  }, null);

  UART.setRxEnabled(uartNo, true); // ready to recieve - go to recieve
  UART.write(uartNo,"\xFF\x01\x79\x00\x00\x00\x00\x00\x86"); // Disable auto calibration

  Timer.set(interval, Timer.REPEAT, function(uartNo) {
    // Send request for data
	  UART.write(uartNo, "\xFF\x01\x86\x00\x00\x00\x00\x00\x79");
  }, uartNo);
}

// Serial3.write("\xFF\x01\x87\x00\x00\x00\x00\x00\x78"); ZERO POINT CALIBRATION
// Serial3.write("\xFF\x01\x79\x00\x00\x00\x00\x00\x86"); ABC logic off
// Serial3.write("\xFF\x01\x79\xA0\x00\x00\x00\x00\xE6"); ABC logic on

MQTT.sub(MQTT_dev + '/MHZ19/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  MHZ19_init(o.uartNo,o.rxto,o.txto,o.interval);
}, null);
/*
let touchInited = false;
let TPads = {};

let touch_clearReleaseTimer = function(ts){
  if (TPads[ts].release.timer !== null) {
    Timer.del(TPads[ts].release.timer);
    TPads[ts].release.timer = null;
  }
};

let touch_release = function(ts) {
  print('Touchpad',ts,'released');
  TPads[ts].state = false;
  touch_clearReleaseTimer(ts);
};

let touch_press = function(ts) {
  print('Touchpad',ts,'pressed');
  TPads[ts].state = true;
  TPads[ts].release.timer = Timer.set(TPads[ts].release.timeout, 0, touch_release, ts);
};

let touch_handler = function(st, cfg) {
  for (let ts = 0; ts <= 9; ts++) {
    let f = (1 << ts) & st;
    if ( (f > 0) && TPads[ts].inited) {
      let val = TouchPad.readFiltered(ts);
      print('Touch #', ts, 'Value:', val);
      if (TPads[ts].state) 
         touch_clearReleaseTimer(ts);
      touch_press(ts);      
    }
  }
  TouchPad.clearStatus();
};

let touch_gInit = function() {
  if (touchInited) return false;
  print ('Touchpad global init');
  TouchPad.init();
  TouchPad.filterStart(10);
  TouchPad.setMeasTime(0x1000, 0xffff);
  TouchPad.setVoltage(TouchPad.HVOLT_2V4, TouchPad.LVOLT_0V8, TouchPad.HVOLT_ATTEN_1V5);
  TouchPad.isrRegister(touch_handler,null);
  TouchPad.intrEnable();
  return (touchInited = true);
};

let touch_configPin = function (ts) {
  TPads[ts].noTouchVal = TouchPad.readFiltered(ts);
  TPads[ts].touchThresh = TPads[ts].noTouchVal *  TPads[ts].sens;
  TouchPad.setThresh(ts, TPads[ts].touchThresh);
  print('Touch Sensor', ts, 'noTouchVal', TPads[ts].noTouchVal, 'touchThresh', TPads[ts].touchThresh);
  TPads[ts].inited = true;      
};

let touch_startPin = function(ts) {
  touch_gInit();
  print('Touch Sensor', ts,'init');
  TouchPad.config(ts, 0);
  TPads[ts] = {
    'sens': 0.8,
    'release' : { 'timeout': 200, "t": null},
    'state': false,
    'inited': false,
  };
  Timer.set(1000, 0, touch_configPin, ts); 
};

//touch_startPin(0);
*/



