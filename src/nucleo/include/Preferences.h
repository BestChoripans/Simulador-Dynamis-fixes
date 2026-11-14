// Preferences.h — la memoria persistente del ESP32 (NVS), compatible con la librería del core.
// En el simulador los valores viven mientras corre la prueba: al presionar "Probar mi robot" de
// nuevo, el robot parte con la memoria vacía (como recién programado).
#pragma once

#include "Arduino.h"

typedef enum {
  PT_I8, PT_U8, PT_I16, PT_U16, PT_I32, PT_U32, PT_I64, PT_U64, PT_STR, PT_BLOB, PT_INVALID
} PreferenceType;

class Preferences {
public:
  Preferences() {}
  ~Preferences() { end(); }

  bool begin(const char* name, bool readOnly = false, const char* partition_label = nullptr);
  void end();

  bool clear();
  bool remove(const char* key);

  size_t putChar(const char* key, int8_t value) { return poner(key, PT_I8, &value, sizeof value); }
  size_t putUChar(const char* key, uint8_t value) { return poner(key, PT_U8, &value, sizeof value); }
  size_t putShort(const char* key, int16_t value) { return poner(key, PT_I16, &value, sizeof value); }
  size_t putUShort(const char* key, uint16_t value) { return poner(key, PT_U16, &value, sizeof value); }
  size_t putInt(const char* key, int32_t value) { return poner(key, PT_I32, &value, sizeof value); }
  size_t putUInt(const char* key, uint32_t value) { return poner(key, PT_U32, &value, sizeof value); }
  size_t putLong(const char* key, int32_t value) { return poner(key, PT_I32, &value, sizeof value); }
  size_t putULong(const char* key, uint32_t value) { return poner(key, PT_U32, &value, sizeof value); }
  size_t putLong64(const char* key, int64_t value) { return poner(key, PT_I64, &value, sizeof value); }
  size_t putULong64(const char* key, uint64_t value) { return poner(key, PT_U64, &value, sizeof value); }
  size_t putFloat(const char* key, float value) { return poner(key, PT_BLOB, &value, sizeof value); }
  size_t putDouble(const char* key, double value) { return poner(key, PT_BLOB, &value, sizeof value); }
  size_t putBool(const char* key, bool value) { uint8_t v = value ? 1 : 0; return poner(key, PT_U8, &v, 1); }
  size_t putString(const char* key, const char* value);
  size_t putString(const char* key, String value) { return putString(key, value.c_str()); }
  size_t putBytes(const char* key, const void* value, size_t len) { return poner(key, PT_BLOB, value, len); }

  bool isKey(const char* key);
  PreferenceType getType(const char* key);

  int8_t getChar(const char* key, int8_t defaultValue = 0) { return leer(key, defaultValue); }
  uint8_t getUChar(const char* key, uint8_t defaultValue = 0) { return leer(key, defaultValue); }
  int16_t getShort(const char* key, int16_t defaultValue = 0) { return leer(key, defaultValue); }
  uint16_t getUShort(const char* key, uint16_t defaultValue = 0) { return leer(key, defaultValue); }
  int32_t getInt(const char* key, int32_t defaultValue = 0) { return leer(key, defaultValue); }
  uint32_t getUInt(const char* key, uint32_t defaultValue = 0) { return leer(key, defaultValue); }
  int32_t getLong(const char* key, int32_t defaultValue = 0) { return leer(key, defaultValue); }
  uint32_t getULong(const char* key, uint32_t defaultValue = 0) { return leer(key, defaultValue); }
  int64_t getLong64(const char* key, int64_t defaultValue = 0) { return leer(key, defaultValue); }
  uint64_t getULong64(const char* key, uint64_t defaultValue = 0) { return leer(key, defaultValue); }
  float getFloat(const char* key, float defaultValue = NAN) { return leer(key, defaultValue); }
  double getDouble(const char* key, double defaultValue = NAN) { return leer(key, defaultValue); }
  bool getBool(const char* key, bool defaultValue = false) { return leer<uint8_t>(key, defaultValue ? 1 : 0) != 0; }
  size_t getString(const char* key, char* value, size_t maxLen);
  String getString(const char* key, String defaultValue = String());
  size_t getBytesLength(const char* key);
  size_t getBytes(const char* key, void* buf, size_t maxLen);
  size_t freeEntries() { return 500; }

private:
  char espacio[16] = {0};
  bool abierto = false;
  bool soloLectura = false;

  size_t poner(const char* key, PreferenceType tipo, const void* datos, size_t largo);
  /** Los bytes guardados con esa clave y su largo, o nullptr. */
  const uint8_t* buscar(const char* key, size_t* largo, PreferenceType* tipo = nullptr);

  template <typename T> T leer(const char* key, T defecto) {
    size_t largo = 0;
    const uint8_t* datos = buscar(key, &largo);
    if (!datos || largo != sizeof(T)) return defecto;
    T valor;
    memcpy(&valor, datos, sizeof(T));
    return valor;
  }
};
