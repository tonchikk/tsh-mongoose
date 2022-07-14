# tsh-mongoose
Mongoose OS based for Tonchiks Smart Home

Primarily based on Cesanta Software Limited examples und adopted to support custom MQTT messaging

### Commands
```
# it's my personal :-)
# C:/Users/login/Documents/mos/tsh-esp-js
mos flash ../artifacts/tsh-esp-js-esp32-0.4.zip
mos put fs/init.js

mos call WiFi.Scan
mos config-set mqtt.enable=true mqtt.server=<ip>:1883
mos wifi ssid pass
```
