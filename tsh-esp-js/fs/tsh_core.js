// Platform specific include
load('tsh_platforms.js');

let TSH = {
    Debug: 0,
    // lastConfig and lastWiFi_GOT_IP usefull for configuration engine
    // It is designed to "update configuration" on every reconnect to WiFi
    // This reconfiguration extreemly usefull on poor WiFi
    lastConfig: "never",
    lastWiFi_GOT_IP: -1,
    // FYI
    device: "unknown",
    tsh_version: "none"
};