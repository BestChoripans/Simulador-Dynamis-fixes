#include "Arduino.h"

int Stream::leerConEspera() {
  unsigned long inicio = millis();
  do {
    int c = read();
    if (c >= 0) return c;
    delay(1);
  } while (millis() - inicio < tiempoMaximo);
  return -1;
}

int Stream::espiarConEspera() {
  unsigned long inicio = millis();
  do {
    int c = peek();
    if (c >= 0) return c;
    delay(1);
  } while (millis() - inicio < tiempoMaximo);
  return -1;
}

bool Stream::find(const char* buscado) { return findUntil(buscado, nullptr); }

bool Stream::findUntil(const char* buscado, const char* hasta) {
  size_t largo = strlen(buscado), largoHasta = hasta ? strlen(hasta) : 0;
  if (largo == 0) return true;
  size_t i = 0, j = 0;
  for (;;) {
    int c = leerConEspera();
    if (c < 0) return false;
    i = (c == buscado[i]) ? i + 1 : (c == buscado[0] ? 1 : 0);
    if (i == largo) return true;
    if (largoHasta > 0) {
      j = (c == hasta[j]) ? j + 1 : (c == hasta[0] ? 1 : 0);
      if (j == largoHasta) return false;
    }
  }
}

long Stream::parseInt() {
  int c;
  // Salta lo que no es número, como en Arduino (SKIP_ALL).
  while ((c = espiarConEspera()) >= 0 && c != '-' && (c < '0' || c > '9')) read();
  if (c < 0) return 0;
  bool negativo = false;
  long valor = 0;
  for (;;) {
    c = espiarConEspera();
    if (c == '-' && !negativo && valor == 0) negativo = true;
    else if (c >= '0' && c <= '9') valor = valor * 10 + (c - '0');
    else break;
    read();
  }
  return negativo ? -valor : valor;
}

float Stream::parseFloat() {
  int c;
  while ((c = espiarConEspera()) >= 0 && c != '-' && c != '.' && (c < '0' || c > '9')) read();
  if (c < 0) return 0;
  bool negativo = false, decimal = false;
  double valor = 0, escala = 1;
  for (;;) {
    c = espiarConEspera();
    if (c == '-' && !negativo && valor == 0 && !decimal) negativo = true;
    else if (c == '.' && !decimal) decimal = true;
    else if (c >= '0' && c <= '9') {
      valor = valor * 10 + (c - '0');
      if (decimal) escala *= 10;
    } else break;
    read();
  }
  valor /= escala;
  return static_cast<float>(negativo ? -valor : valor);
}

size_t Stream::readBytes(char* destino, size_t largo) {
  size_t n = 0;
  while (n < largo) {
    int c = leerConEspera();
    if (c < 0) break;
    destino[n++] = static_cast<char>(c);
  }
  return n;
}

size_t Stream::readBytesUntil(char fin, char* destino, size_t largo) {
  size_t n = 0;
  while (n < largo) {
    int c = leerConEspera();
    if (c < 0 || c == fin) break;
    destino[n++] = static_cast<char>(c);
  }
  return n;
}

String Stream::readString() {
  String s;
  int c;
  while ((c = leerConEspera()) >= 0) s += static_cast<char>(c);
  return s;
}

String Stream::readStringUntil(char fin) {
  String s;
  int c;
  while ((c = leerConEspera()) >= 0 && c != fin) s += static_cast<char>(c);
  return s;
}
