# tsh-mongoose
Mongoose OS based for Tonchiks Smart Home

Primarily based on Cesanta Software Limited examples und adopted to support custom MQTT messaging

### Commands
```
# C:/Users/login/Documents/mos/tsh-esp-js
mos flash ../artifacts/tsh-esp-js-esp32-0.4.zip
mos put fs/init.js

mos call WiFi.Scan
mos config-set mqtt.enable=true mqtt.server=10.0.0.1:1883
mos wifi ssid pass
```
