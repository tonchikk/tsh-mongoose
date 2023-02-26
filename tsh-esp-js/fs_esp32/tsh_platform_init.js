load('tsh_esp32hwpcnt_init.js');

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
};


// Serial3.write("\xFF\x01\x87\x00\x00\x00\x00\x00\x78"); ZERO POINT CALIBRATION
// Serial3.write("\xFF\x01\x79\x00\x00\x00\x00\x00\x86"); ABC logic off
// Serial3.write("\xFF\x01\x79\xA0\x00\x00\x00\x00\xE6"); ABC logic on
/*
MQTT.sub(MQTT_dev + '/MHZ19/init', function(conn, topic, msg) {
  print('Topic:', topic, 'message:', msg);
  let o = JSON.parse(msg);
  MHZ19_init(o.uartNo,o.rxto,o.txto,o.interval);
}, null);
*/

TSH.subscribe('/MHZ19/init', function(o) {MHZ19_init(o.uartNo,o.rxto,o.txto,o.interval);} );

// Zero point calibration routines 

//  mosquitto_pub -p 2883 -u user -P password -t /devices/???/MHZ19/zpc -m '{"uartNo":1}'
// Set value now as 400
function MHZ19_zpc(o){
    UART.write(o.uartNo, "\xFF\x01\x87\x00\x00\x00\x00\x00\x78");
};

TSH.subscribe('/MHZ19/zpc', MHZ19_zpc);

// ABC enabled = "lowest seen in a day will be 400 PPM"
// mosquitto_pub -p 2883 --u user -P password -t /devices/???/MHZ19/abc -m '{"uartNo":1,"abc":true}'
function MHZ19_abc(o){
    // Off by default on start
    print("TSH JS [MHZ19_abc]",o.abc,"for UART",o.uartNo,"");
    if (o.abc) {
        UART.write(o.uartNo,"\xFF\x01\x79\xA0\x00\x00\x00\x00\xE6"); // ABC logic on
    }else{
        UART.write(o.uartNo,"\xFF\x01\x79\x00\x00\x00\x00\x00\x86"); // ABC logic off
    }
}

TSH.subscribe('/MHZ19/abc', MHZ19_abc);
