/*

   This is TSH Worker tested on ESP32 based devboards

   Copyright 2017-2022 Anton Kaukin

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

// TSH
load('tsh_core.js');
// TSH Libraries
load('api_ds18x20.js');

// MQTT_dev will be used as MQTT topics prefixes below
let MQTT_dev = '/devices/' + Cfg.get('device.id');
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


/*******************
 * Here comes sensors' and custom devices part
 */

// DHT global
let dhts = {} ;
/**
 * Initilalizing poller of DHT sensor
 * @param {*} pin - GPIO pin number with connected DHT sensor
 * @param {*} interval - interval in msec to poll
 * @returns nothing
 */
let DHT_init = function(pin, interval) {
  print("Initializing DHT2302 @ ", pin);
  
  if (dhts[pin] !== undefined) {
      print("already done @",pin,"reboot to reset");
      return;
  }
  
  dhts[pin] = DHT.create(pin, DHT.AM2302);

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

MQTT.sub(MQTT_dev + '/dht/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  DHT_init(o.pin,o.interval);
}, null);


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

MQTT.sub(MQTT_dev + '/ADC/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  ADC_init(o.pin,o.interval);
}, null);

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
  GPIO_notify(pin); // Run once to update (maybe missed) state
};

let GPIO_setOutput = function (pin, state) {
  GPIO.set_mode(pin, GPIO.MODE_OUTPUT);
  GPIO.write(pin, state);
};

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


// MH Z19 support

let mhz19s = {} ;

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
  let mhid = JSON.stringify(rxto) + "/" + JSON.stringify(txto);
  print("Initializing MH-Z19B [", mhid , "] at UART", uartNo, ", RX of sensor connected to ", rxto, " and TX connected to ", txto, " poll interval ", interval, "msec"  );
  if (mhz19s[mhid] !== undefined) {
    print("already done @",mhid,"reboot to reset");
    return;
  };

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
  UART.write(uartNo,"\xFF\x01\x79\x00\x00\x00\x00\x00\x86"); // Disable auto calibration = ABC off 
  // ABC is "lowest seen in a day is 400"

  mhz19s[mhid] = Timer.set(interval, Timer.REPEAT, function(uartNo) {
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



// TSH OneWire DS18x20 / Temperatures


ds18x20.set_mqtt_base(MQTT_dev + "/ow/temp");

let ds18x20s = {};

let ds18x20_init = function(pin,interval) {
  print("Initializing ds18x20 at pin", pin, " poll interval ", interval, "sec"  );
  if (ds18x20s[pin] !== undefined ) {
    print("ds18x20 reinit @ GPIO ", pin);
    Timer.del(ds18x20s[pin]);
  };

  ds18x20s[pin] = Timer.set(interval * 1000, true, function(p) {
    print('TSH JS: DS18x29 executing ds18x20.run_line_once @ GPIO ', p.pin);
    ds18x20.run_line_once(p.pin);
  }, {pin: pin});
};

MQTT.sub(MQTT_dev + '/ds18x20/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  ds18x20_init(o.pin,o.interval);
}, null);

// ds18x20_init(4,6);

/* Not working, to do :-)
function ds18x20_callback(devid, temp, userdata) {
  print('JS DS18x29 got: ', devid, " = ", temp);
}
ds18x20.set_callback(ds18x20_callback, null);
*/
