// HardwareSerial.h — el puerto Serial del ESP32 (UART0), conectado a "Mensajes del robot". Lo que
// se escribe en la caja de texto de esa pestaña le llega al programa por Serial.read().
#pragma once

#include "Stream.h"

#define SERIAL_8N1 0x800001c

class HardwareSerial : public Stream {
public:
  void begin(unsigned long baudios, uint32_t config = SERIAL_8N1, int8_t rxPin = -1, int8_t txPin = -1,
             bool invertir = false, unsigned long timeout = 20000UL, uint8_t umbralFifo = 112);
  void end() {}
  int available() override;
  int read() override;
  int peek() override;
  void flush() override {}
  size_t write(uint8_t c) override;
  size_t write(const uint8_t* buffer, size_t size) override;
  // Como en el core: write(0) y write(65) envían un byte en vez de ser ambiguos.
  size_t write(unsigned long n) { return write(static_cast<uint8_t>(n)); }
  size_t write(long n) { return write(static_cast<uint8_t>(n)); }
  size_t write(unsigned int n) { return write(static_cast<uint8_t>(n)); }
  size_t write(int n) { return write(static_cast<uint8_t>(n)); }
  using Print::write;
  operator bool() const { return true; }
};

extern HardwareSerial Serial;
