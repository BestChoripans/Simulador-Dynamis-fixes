// Stream.h — base de Serial y SerialBT: lo de Print más leer lo que llega (readString, parseInt…).
// Esperar datos consume tiempo virtual (delay de 1 ms por vuelta), así el robot sigue avanzando.
#pragma once

#include "Print.h"
#include "WString.h"

class Stream : public Print {
public:
  virtual int available() = 0;
  virtual int read() = 0;
  virtual int peek() = 0;
  virtual void flush() {}

  void setTimeout(unsigned long ms) { tiempoMaximo = ms; }
  unsigned long getTimeout() const { return tiempoMaximo; }

  bool find(const char* buscado);
  bool find(char buscado) { char t[2] = {buscado, 0}; return find(t); }
  bool findUntil(const char* buscado, const char* hasta);

  long parseInt();
  float parseFloat();

  size_t readBytes(char* destino, size_t largo);
  size_t readBytes(uint8_t* destino, size_t largo) { return readBytes(reinterpret_cast<char*>(destino), largo); }
  size_t readBytesUntil(char fin, char* destino, size_t largo);
  size_t readBytesUntil(char fin, uint8_t* destino, size_t largo) { return readBytesUntil(fin, reinterpret_cast<char*>(destino), largo); }

  String readString();
  String readStringUntil(char fin);

protected:
  unsigned long tiempoMaximo = 1000;
  /** Un byte, esperando hasta tiempoMaximo; -1 si no llegó nada. */
  int leerConEspera();
  int espiarConEspera();
};
