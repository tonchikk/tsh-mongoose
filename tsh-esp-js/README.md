# Mongoose OS JS Client for ESP32 Dynamic configuration under TSH

## Overview
This tool targeted to recieve commands from controlling TSH daemon via MQTT and publish requested updates back.

## Hardware
- Supported ESP32 (yellow pin, black pin, external antenna)
- ESP8266 support is dropped

## Regular functionality
- GPIO in/out, pwm
- ADC

## Sensors support
### DHT
Multiply sensors per board (one per GPIO as usual)

### MH-Z19B
Supported only on ESP32 UART.

Based on [датчик MH-Z19B - измеряем CO2](http://forum.amperka.ru/threads/%D0%B4%D0%B0%D1%82%D1%87%D0%B8%D0%BA-mh-z19b-%D0%B8%D0%B7%D0%BC%D0%B5%D1%80%D1%8F%D0%B5%D0%BC-co2.12490/)
Code to be updated with [MH-Z19 @ REvSpace.nl](https://revspace.nl/MHZ19)

### DS18B20 & DS18S20
In heavy testing, theoretically support for multiply lines, only MQTT publishing from C code, no value returns to JS for today.
No check fro CRC - but trust me it is requred on 1m+.

## How to install this app
Use  [mos tool](https://mongoose-os.com/software.html) to build and flash.

## bit of stats
ESP32 + initialized one line of 1w with one DS18b20: "free_ram":124792,"total_ram":252452

