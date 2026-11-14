#include "Arduino.h"

HardwareSerial Serial;

void HardwareSerial::begin(unsigned long baudios, uint32_t, int8_t, int8_t, bool, unsigned long, uint8_t) {
  dyn_serial_begin(static_cast<uint32_t>(baudios));
}

// Lo que se escribe en "Mensajes del robot" llega por aquí. Cada llamada consume un poco de tiempo
// virtual, así esperar datos en un while no congela la página.
int HardwareSerial::available() { return dyn_serial_available(); }
int HardwareSerial::read() { return dyn_serial_read(); }
int HardwareSerial::peek() { return dyn_serial_peek(); }

size_t HardwareSerial::write(uint8_t c) {
  dyn_serial_write(&c, 1);
  return 1;
}

size_t HardwareSerial::write(const uint8_t* buffer, size_t size) {
  if (size > 0) dyn_serial_write(buffer, size);
  return size;
}
