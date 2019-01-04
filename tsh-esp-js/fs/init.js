/*

   This is TSH Worker tested on ESP8266 based devboards

   Copyright 2017-2018 Anton Kaukin

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

// FYI
let device = "unknown";
RPC.call(RPC.LOCAL, 'Sys.GetInfo', null, function(resp, ud) {
  device = resp.arch;
  if ( device === "esp32" )
	load('api_esp32.js');
  if ( device === "esp8266" ) 
	load('api_esp8266.js');

},null);

// Common
let MQTT_publish = function (component, data) {
    let msg = JSON.stringify (data);
    let topic = MQTT_dev + component;
    let ok = MQTT.pub(topic, msg, 1);
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
  if (lastConfig === "never") {
    runStatusReporter(5000);
  }
  lastConfig = o.date;
}, null);


// DHT global

let DHTt = -128;
let DHTh = -128;
let DHTpin = -1;
let dht = null;


let DHT_init = function(pin, interval) {
  print("Initializing DHT2302 @ ", pin);
  
  if (dht !== null && DHTpin !== -1) {
      print("already done @",DHTpin,"reboot to set new one");
      return;
  }
  
  DHTpin = pin;
  dht = DHT.create(DHTpin, DHT.AM2302);
  //dht.begin();

  Timer.set(interval, true , function() {

    let h = dht.getHumidity();
    let t = dht.getTemp();

    if (!isNaN(t) )
      DHTt = t;
    if (!isNaN(h) )
      DHTh = h;
  
    MQTT_publish(
      "/dht",
      {
        "temp": DHTt,
        "hum": DHTh,
        "pin": DHTpin
      }
    );
  }, null);
  print("Initializing DHT2302 @ ", DHTpin, " - done");
};


// ADC Part

let ADCpin = -1;

let ADC_init = function(pin, interval) {
  print("Initializing ADC @ ", pin);

  ADCpin = pin;
  
  ADC.enable(ADCpin);

  Timer.set(interval, true , function() {
    MQTT_publish(
      "/ADC",
      {
        "RAWvalue":  ADC.read(ADCpin),
        "pin": ADCpin
      }
    );
  }, null);
  
  print("Initializing ADC @ ", ADCpin, " - done");
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




