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
// Platform specific include
load('tsh_platform.js');
// Common routines
load('tsh_core.js');
// TSH Libraries
load('api_ds18x20.js');
// Platform-dependant libraries initializations
load('tsh_platform_init.js');


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

let GPIOi = {};

let GPIO_notify = function (pin){
  let v = GPIO.read(pin);
  if ( GPIOi[pin] !== v ) {
    MQTT_publish(
      "/GPIO",
      {
        "pin": pin,
        "value": v
      }
    );
    GPIOi[pin] = v;
  };
};

let GPIO_runInput = function (pin) {
  GPIO.set_mode(pin, GPIO.MODE_INPUT);
  GPIO.set_pull(pin, GPIO.PULL_DOWN);
  GPIO.set_int_handler(pin, GPIO.INT_EDGE_ANY, GPIO_notify, null);
  GPIO.enable_int(pin);
  print("Configured for input handling: ", pin);
  GPIOi[pin] = -1;
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
