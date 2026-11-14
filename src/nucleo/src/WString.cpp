// String de Arduino: buffer dinámico con malloc/realloc, números formateados como el core del ESP32.
#include "Arduino.h"
#include <stdio.h>
#include <ctype.h>

namespace {

/** Texto de un entero sin signo en la base pedida (base 10 con printf, como el core). */
void enteroSinSigno(unsigned long valor, unsigned char base, char* destino) {
  if (base == 10) snprintf(destino, 34, "%lu", valor);
  else ultoa(valor, destino, base);
}

void enteroConSigno(long valor, unsigned char base, char* destino) {
  if (base == 10) snprintf(destino, 34, "%ld", valor);
  else ltoa(valor, destino, base);
}

}  // namespace

String::String(const char* texto) { copiar(texto ? texto : "", texto ? strlen(texto) : 0); }
String::String(const String& otra) { copiar(otra.c_str(), otra.largo); }
String::String(String&& otra) : datos(otra.datos), largo(otra.largo), capacidad(otra.capacidad) {
  otra.datos = nullptr;
  otra.largo = otra.capacidad = 0;
}
String::String(const __FlashStringHelper* texto) : String(reinterpret_cast<const char*>(texto)) {}
String::String(char c) { copiar(&c, 1); }
String::String(unsigned char valor, unsigned char base) : String(static_cast<unsigned long>(valor), base) {}
String::String(int valor, unsigned char base) : String(static_cast<long>(valor), base) {}
String::String(unsigned int valor, unsigned char base) : String(static_cast<unsigned long>(valor), base) {}
String::String(long valor, unsigned char base) {
  char texto[34];
  enteroConSigno(valor, base, texto);
  copiar(texto, strlen(texto));
}
String::String(unsigned long valor, unsigned char base) {
  char texto[34];
  enteroSinSigno(valor, base, texto);
  copiar(texto, strlen(texto));
}
String::String(float valor, unsigned char decimales) : String(static_cast<double>(valor), decimales) {}
String::String(double valor, unsigned char decimales) {
  char texto[340 + 3];
  dtostrf(valor, decimales + 2, decimales > 100 ? 100 : decimales, texto);
  copiar(texto, strlen(texto));
}
String::~String() { free(datos); }

String& String::operator=(const String& otra) {
  if (this != &otra) copiar(otra.c_str(), otra.largo);
  return *this;
}
String& String::operator=(String&& otra) {
  if (this != &otra) {
    free(datos);
    datos = otra.datos;
    largo = otra.largo;
    capacidad = otra.capacidad;
    otra.datos = nullptr;
    otra.largo = otra.capacidad = 0;
  }
  return *this;
}
String& String::operator=(const char* texto) {
  copiar(texto ? texto : "", texto ? strlen(texto) : 0);
  return *this;
}

void String::invalidar() {
  free(datos);
  datos = nullptr;
  largo = capacidad = 0;
}

bool String::reservar(unsigned int tamano) {
  if (datos && capacidad >= tamano) return true;
  // Crece al doble para que concatenar en un ciclo no copie la cadena en cada carácter.
  unsigned int nueva = capacidad * 2 > tamano ? capacidad * 2 : tamano;
  char* ampliado = static_cast<char*>(realloc(datos, nueva + 1));
  // Sin memoria la cadena queda como estaba, como en el core del ESP32: concat devuelve false.
  if (!ampliado) return false;
  if (!datos) ampliado[0] = 0;
  datos = ampliado;
  capacidad = nueva;
  return true;
}

void String::copiar(const char* texto, unsigned int cuanto) {
  if (!reservar(cuanto)) {
    invalidar();
    return;
  }
  memmove(datos, texto, cuanto);
  datos[cuanto] = 0;
  largo = cuanto;
}

bool String::agregar(const char* texto, unsigned int cuanto) {
  if (cuanto == 0) return datos != nullptr || reservar(0);
  if (texto >= datos && datos && texto < datos + largo) {
    // Concatenarse a sí misma: copiar antes de que realloc mueva el buffer.
    String copia(*this);
    return agregar(copia.c_str() + (texto - datos), cuanto);
  }
  if (!reservar(largo + cuanto)) return false;
  memcpy(datos + largo, texto, cuanto);
  largo += cuanto;
  datos[largo] = 0;
  return true;
}

bool String::concat(const String& otra) { return agregar(otra.c_str(), otra.largo); }
bool String::concat(const char* texto) { return texto ? agregar(texto, strlen(texto)) : false; }
bool String::concat(const __FlashStringHelper* texto) { return concat(reinterpret_cast<const char*>(texto)); }
bool String::concat(char c) { return agregar(&c, 1); }
bool String::concat(unsigned char valor) { return concat(String(valor)); }
bool String::concat(int valor) { return concat(String(valor)); }
bool String::concat(unsigned int valor) { return concat(String(valor)); }
bool String::concat(long valor) { return concat(String(valor)); }
bool String::concat(unsigned long valor) { return concat(String(valor)); }
bool String::concat(float valor) { return concat(String(valor)); }
bool String::concat(double valor) { return concat(String(valor)); }

char& String::operator[](unsigned int i) {
  static char sobrante = 0;
  if (i >= largo) {
    sobrante = 0;
    return sobrante;
  }
  return datos[i];
}

int String::indexOf(char c, unsigned int desde) const {
  if (desde >= largo) return -1;
  const char* encontrado = strchr(datos + desde, c);
  return encontrado ? static_cast<int>(encontrado - datos) : -1;
}

int String::indexOf(const String& buscada, unsigned int desde) const {
  if (desde > largo) return -1;
  const char* encontrado = strstr(c_str() + desde, buscada.c_str());
  return encontrado ? static_cast<int>(encontrado - c_str()) : -1;
}

String String::substring(unsigned int desde, unsigned int hasta) const {
  if (desde > hasta) {
    unsigned int t = desde;
    desde = hasta;
    hasta = t;
  }
  if (desde >= largo) return String();
  if (hasta > largo) hasta = largo;
  String salida;
  salida.copiar(datos + desde, hasta - desde);
  return salida;
}

long String::toInt() const { return datos ? atol(datos) : 0; }
float String::toFloat() const { return datos ? static_cast<float>(atof(datos)) : 0; }

bool String::equals(const String& otra) const { return largo == otra.largo && strcmp(c_str(), otra.c_str()) == 0; }
bool String::equals(const char* texto) const { return strcmp(c_str(), texto ? texto : "") == 0; }

String operator+(const String& a, const String& b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, const char* b) { String s(a); s.concat(b); return s; }
String operator+(const char* a, const String& b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, char b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, int b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, unsigned int b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, long b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, unsigned long b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, float b) { String s(a); s.concat(b); return s; }
String operator+(const String& a, double b) { String s(a); s.concat(b); return s; }

double String::toDouble() const { return datos ? atof(datos) : 0; }

void String::trim() {
  if (!datos || largo == 0) return;
  unsigned int inicio = 0, fin = largo;
  while (inicio < fin && isspace(static_cast<unsigned char>(datos[inicio]))) inicio++;
  while (fin > inicio && isspace(static_cast<unsigned char>(datos[fin - 1]))) fin--;
  largo = fin - inicio;
  if (inicio > 0) memmove(datos, datos + inicio, largo);
  datos[largo] = 0;
}

void String::toLowerCase() {
  for (unsigned int i = 0; i < largo; i++) datos[i] = static_cast<char>(tolower(static_cast<unsigned char>(datos[i])));
}

void String::toUpperCase() {
  for (unsigned int i = 0; i < largo; i++) datos[i] = static_cast<char>(toupper(static_cast<unsigned char>(datos[i])));
}

void String::replace(char buscado, char nuevo) {
  for (unsigned int i = 0; i < largo; i++) if (datos[i] == buscado) datos[i] = nuevo;
}

void String::replace(const String& buscada, const String& nueva) {
  if (largo == 0 || buscada.largo == 0) return;
  String resultado;
  unsigned int i = 0;
  for (int en; (en = indexOf(buscada, i)) >= 0; i = static_cast<unsigned int>(en) + buscada.largo) {
    resultado += substring(i, static_cast<unsigned int>(en));
    resultado += nueva;
  }
  resultado += substring(i);
  *this = resultado;
}

void String::remove(unsigned int desde) { remove(desde, largo); }

void String::remove(unsigned int desde, unsigned int cuantos) {
  if (desde >= largo) return;
  if (cuantos > largo - desde) cuantos = largo - desde;
  memmove(datos + desde, datos + desde + cuantos, largo - desde - cuantos);
  largo -= cuantos;
  datos[largo] = 0;
}

int String::lastIndexOf(char c) const {
  for (int i = static_cast<int>(largo) - 1; i >= 0; i--) if (datos[i] == c) return i;
  return -1;
}

int String::lastIndexOf(const String& buscada) const {
  if (buscada.largo == 0 || buscada.largo > largo) return -1;
  for (int i = static_cast<int>(largo - buscada.largo); i >= 0; i--)
    if (strncmp(datos + i, buscada.c_str(), buscada.largo) == 0) return i;
  return -1;
}

bool String::startsWith(const String& prefijo) const { return startsWith(prefijo, 0); }

bool String::startsWith(const String& prefijo, unsigned int desde) const {
  if (desde > largo || prefijo.largo > largo - desde) return false;
  return strncmp(c_str() + desde, prefijo.c_str(), prefijo.largo) == 0;
}

bool String::endsWith(const String& sufijo) const {
  if (sufijo.largo > largo) return false;
  return strcmp(c_str() + largo - sufijo.largo, sufijo.c_str()) == 0;
}

bool String::equalsIgnoreCase(const String& otra) const {
  if (largo != otra.largo) return false;
  for (unsigned int i = 0; i < largo; i++)
    if (tolower(static_cast<unsigned char>(datos[i])) != tolower(static_cast<unsigned char>(otra.datos[i]))) return false;
  return true;
}

int String::compareTo(const String& otra) const { return strcmp(c_str(), otra.c_str()); }

void String::toCharArray(char* destino, unsigned int tamano, unsigned int desde) const {
  if (!destino || tamano == 0) return;
  if (desde >= largo) { destino[0] = 0; return; }
  unsigned int n = largo - desde;
  if (n > tamano - 1) n = tamano - 1;
  memcpy(destino, datos + desde, n);
  destino[n] = 0;
}
