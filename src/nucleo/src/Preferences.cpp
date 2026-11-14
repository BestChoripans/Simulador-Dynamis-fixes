#include "Preferences.h"

// Todas las claves guardadas, de todos los espacios (como la partición NVS del ESP32).
struct Entrada {
  char espacio[16];
  char clave[16];
  PreferenceType tipo;
  uint8_t* datos;
  size_t largo;
  Entrada* siguiente;
};
static Entrada* entradas = nullptr;

static bool claveValida(const char* key) { return key && key[0] && strlen(key) <= 15; }

static Entrada* encontrar(const char* espacio, const char* key) {
  for (Entrada* e = entradas; e; e = e->siguiente)
    if (strcmp(e->espacio, espacio) == 0 && strcmp(e->clave, key) == 0) return e;
  return nullptr;
}

bool Preferences::begin(const char* name, bool readOnly, const char*) {
  if (abierto) return false;
  if (!name || !name[0] || strlen(name) > 15) {
    dynAvisar("Preferences.begin: el nombre del espacio debe tener de 1 a 15 caracteres.");
    return false;
  }
  strcpy(espacio, name);
  soloLectura = readOnly;
  abierto = true;
  return true;
}

void Preferences::end() { abierto = false; }

bool Preferences::clear() {
  if (!abierto || soloLectura) return false;
  for (Entrada** p = &entradas; *p; ) {
    if (strcmp((*p)->espacio, espacio) == 0) {
      Entrada* e = *p;
      *p = e->siguiente;
      free(e->datos);
      free(e);
    } else {
      p = &(*p)->siguiente;
    }
  }
  return true;
}

bool Preferences::remove(const char* key) {
  if (!abierto || soloLectura || !claveValida(key)) return false;
  for (Entrada** p = &entradas; *p; p = &(*p)->siguiente) {
    if (strcmp((*p)->espacio, espacio) == 0 && strcmp((*p)->clave, key) == 0) {
      Entrada* e = *p;
      *p = e->siguiente;
      free(e->datos);
      free(e);
      return true;
    }
  }
  return false;
}

size_t Preferences::poner(const char* key, PreferenceType tipo, const void* datos, size_t largo) {
  if (!abierto) {
    dynAvisar("Preferences: falta memoria.begin(\"nombre\") antes de guardar.");
    return 0;
  }
  if (soloLectura) {
    dynAvisar("Preferences: abriste la memoria con begin(nombre, true), que es solo lectura: no se guardó nada.");
    return 0;
  }
  if (!claveValida(key)) {
    dynAvisar("Preferences: la clave debe tener de 1 a 15 caracteres.");
    return 0;
  }
  uint8_t* copia = static_cast<uint8_t*>(malloc(largo > 0 ? largo : 1));
  if (!copia) return 0;
  memcpy(copia, datos, largo);
  Entrada* e = encontrar(espacio, key);
  if (!e) {
    e = static_cast<Entrada*>(calloc(1, sizeof(Entrada)));
    if (!e) { free(copia); return 0; }
    strcpy(e->espacio, espacio);
    strcpy(e->clave, key);
    e->siguiente = entradas;
    entradas = e;
  } else {
    free(e->datos);
  }
  e->tipo = tipo;
  e->datos = copia;
  e->largo = largo;
  return largo;
}

const uint8_t* Preferences::buscar(const char* key, size_t* largo, PreferenceType* tipo) {
  if (!abierto || !claveValida(key)) return nullptr;
  Entrada* e = encontrar(espacio, key);
  if (!e) return nullptr;
  if (largo) *largo = e->largo;
  if (tipo) *tipo = e->tipo;
  return e->datos;
}

size_t Preferences::putString(const char* key, const char* value) {
  if (!value) return 0;
  return poner(key, PT_STR, value, strlen(value) + 1);
}

bool Preferences::isKey(const char* key) { return buscar(key, nullptr) != nullptr; }

PreferenceType Preferences::getType(const char* key) {
  PreferenceType tipo = PT_INVALID;
  return buscar(key, nullptr, &tipo) ? tipo : PT_INVALID;
}

size_t Preferences::getString(const char* key, char* value, size_t maxLen) {
  size_t largo = 0;
  PreferenceType tipo = PT_INVALID;
  const uint8_t* datos = buscar(key, &largo, &tipo);
  if (!datos || tipo != PT_STR || !value || largo > maxLen) return 0;
  memcpy(value, datos, largo);
  return largo;
}

String Preferences::getString(const char* key, String defaultValue) {
  size_t largo = 0;
  PreferenceType tipo = PT_INVALID;
  const uint8_t* datos = buscar(key, &largo, &tipo);
  if (!datos || tipo != PT_STR) return defaultValue;
  return String(reinterpret_cast<const char*>(datos));
}

size_t Preferences::getBytesLength(const char* key) {
  size_t largo = 0;
  return buscar(key, &largo) ? largo : 0;
}

size_t Preferences::getBytes(const char* key, void* buf, size_t maxLen) {
  size_t largo = 0;
  const uint8_t* datos = buscar(key, &largo);
  if (!datos || !buf || largo > maxLen) return 0;
  memcpy(buf, datos, largo);
  return largo;
}
