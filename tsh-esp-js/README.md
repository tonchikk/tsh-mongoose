# Mongoose OS JS Client for ESP32 Dynamic configuration under TSH

## Overview
This tool targeted to recieve commands from controlling TSH daemon via MQTT and publish requested updates back.

## Hardware
- Supported ESP32 (yellow pin, black pin, external antenna) - comment versions in mos.yml to use latest Mongoose OS
- ESP8266 support is hardcoded now to use Mongoose-OS version 2.19.1 due bug https://github.com/cesanta/mongoose-os/issues/593 

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
Only MQTT publishing from C code, no value returns to JS for today. There are a problems with callback and char * in its parameters...
No check for CRC - but trust me it is requred on 1m+ lengths.
Theoretically supporting multiply lines.

## Board features support
#### ESP32 Hardware Pulse Counter
Here is basic support of ESP32 PCNT. 

This created for water and electricity measurments, pay utility bills for example. The functionality covering increase-only conter.

The API and code samples taken from [esp-idf v4.2.4 esp32 api reference](https://docs.espressif.com/projects/esp-idf/en/v4.2.4/esp32/api-reference/peripherals/pcnt.html), MOS 2.20 currently building with ESP-IDF 4.2-r8 / FreeRTOS 8.2.0.

Some C code created to run the counters, supporting callbacks on zero-reset. Pulse-Per-Minute statistics is bit broken.
JS backend supportting persitent counters initialized at boot plus MQTT API.
Despite visible simplicity of task codebase is huge (30kb RAM eaten), half of it is JS with intension to have on-boot-restorable counters.

## How to install this app
Use  [mos tool](https://mongoose-os.com/software.html) to build and flash.

## bit of stats
- ESP32 - "free_ram":162220,"total_ram":252452
- ESP8266EX - "free_ram":28304,"total_ram":52424

