// sdkconfig.h — las opciones de ESP-IDF con que viene compilado el core del ESP32 (las que revisan
// los ejemplos de BluetoothSerial con #if !defined(CONFIG_BT_ENABLED) …).
#pragma once

#define CONFIG_IDF_TARGET_ESP32 1
#define CONFIG_BT_ENABLED 1
#define CONFIG_BLUEDROID_ENABLED 1
#define CONFIG_BT_CLASSIC_ENABLED 1
#define CONFIG_BT_SPP_ENABLED 1
#define CONFIG_CLASSIC_BT_ENABLED 1
#define SOC_BT_SUPPORTED 1
