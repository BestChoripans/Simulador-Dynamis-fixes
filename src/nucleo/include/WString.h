// WString.h — String de Arduino (subconjunto del core del ESP32), escrito desde cero.
#pragma once

#include <stddef.h>
#include <stdint.h>

class __FlashStringHelper;

class String {
public:
  String(const char* texto = "");
  String(const String& otra);
  String(String&& otra);
  String(const __FlashStringHelper* texto);
  explicit String(char c);
  explicit String(unsigned char valor, unsigned char base = 10);
  explicit String(int valor, unsigned char base = 10);
  explicit String(unsigned int valor, unsigned char base = 10);
  explicit String(long valor, unsigned char base = 10);
  explicit String(unsigned long valor, unsigned char base = 10);
  explicit String(float valor, unsigned char decimales = 2);
  explicit String(double valor, unsigned char decimales = 2);
  ~String();

  String& operator=(const String& otra);
  String& operator=(String&& otra);
  String& operator=(const char* texto);

  bool concat(const String& otra);
  bool concat(const char* texto);
  bool concat(const __FlashStringHelper* texto);
  bool concat(char c);
  bool concat(unsigned char valor);
  bool concat(int valor);
  bool concat(unsigned int valor);
  bool concat(long valor);
  bool concat(unsigned long valor);
  bool concat(float valor);
  bool concat(double valor);

  template <typename T> String& operator+=(T valor) { concat(valor); return *this; }
  String& operator+=(const String& otra) { concat(otra); return *this; }

  unsigned int length() const { return largo; }
  const char* c_str() const { return datos ? datos : ""; }
  char charAt(unsigned int i) const { return i < largo ? datos[i] : 0; }
  char operator[](unsigned int i) const { return charAt(i); }
  char& operator[](unsigned int i);

  int indexOf(char c, unsigned int desde = 0) const;
  int indexOf(const String& buscada, unsigned int desde = 0) const;
  String substring(unsigned int desde) const { return substring(desde, largo); }
  String substring(unsigned int desde, unsigned int hasta) const;

  long toInt() const;
  float toFloat() const;
  double toDouble() const;

  // Edición en el lugar, como en el core del ESP32.
  void trim();
  void toLowerCase();
  void toUpperCase();
  void replace(char buscado, char nuevo);
  void replace(const String& buscada, const String& nueva);
  void remove(unsigned int desde);
  void remove(unsigned int desde, unsigned int cuantos);
  void setCharAt(unsigned int i, char c) { if (i < largo) datos[i] = c; }
  bool reserve(unsigned int tamano) { return reservar(tamano); }
  bool isEmpty() const { return largo == 0; }

  int lastIndexOf(char c) const;
  int lastIndexOf(const String& buscada) const;
  bool startsWith(const String& prefijo) const;
  bool startsWith(const String& prefijo, unsigned int desde) const;
  bool endsWith(const String& sufijo) const;
  bool equalsIgnoreCase(const String& otra) const;
  int compareTo(const String& otra) const;
  bool operator<(const String& otra) const { return compareTo(otra) < 0; }
  bool operator>(const String& otra) const { return compareTo(otra) > 0; }
  bool operator<=(const String& otra) const { return compareTo(otra) <= 0; }
  bool operator>=(const String& otra) const { return compareTo(otra) >= 0; }
  void toCharArray(char* destino, unsigned int tamano, unsigned int desde = 0) const;
  void getBytes(unsigned char* destino, unsigned int tamano, unsigned int desde = 0) const {
    toCharArray(reinterpret_cast<char*>(destino), tamano, desde);
  }
  explicit operator bool() const { return datos != nullptr; }

  bool equals(const String& otra) const;
  bool equals(const char* texto) const;
  bool operator==(const String& otra) const { return equals(otra); }
  bool operator==(const char* texto) const { return equals(texto); }
  bool operator!=(const String& otra) const { return !equals(otra); }
  bool operator!=(const char* texto) const { return !equals(texto); }

private:
  char* datos = nullptr;
  unsigned int largo = 0;
  unsigned int capacidad = 0;

  bool reservar(unsigned int tamano);
  bool agregar(const char* texto, unsigned int cuanto);
  void copiar(const char* texto, unsigned int cuanto);
  /** Como en Arduino: si falta memoria, la cadena queda vacía. */
  void invalidar();
};

String operator+(const String& a, const String& b);
String operator+(const String& a, const char* b);
String operator+(const char* a, const String& b);
String operator+(const String& a, char b);
String operator+(const String& a, int b);
String operator+(const String& a, unsigned int b);
String operator+(const String& a, long b);
String operator+(const String& a, unsigned long b);
String operator+(const String& a, float b);
String operator+(const String& a, double b);
