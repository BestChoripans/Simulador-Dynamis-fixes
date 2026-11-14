#include "BluetoothSerial.h"

// Los BluetoothSerial encendidos, para avisarles los cambios de conexión antes de cada loop().
static BluetoothSerial* encendidos = nullptr;
static const uint8_t DIRECCION_TELEFONO[6] = {0x5C, 0xF3, 0x70, 0x12, 0x34, 0x56};
static const uint8_t DIRECCION_ROBOT[6] = {0x24, 0x6F, 0x28, 0xD1, 0x4A, 0xB2};

/** Lo llama dyn_loop() (principal.cpp) antes de cada loop(). */
void dynAtenderBluetooth() {
  for (BluetoothSerial* bt = encendidos; bt; ) {
    // atenderEventos puede apagarlo (end() desde un callback): se toma el siguiente antes.
    BluetoothSerial* luego = bt->siguiente;
    bt->atenderEventos();
    bt = luego;
  }
}

bool BluetoothSerial::begin(String localName, bool isMaster, bool, int, int, const char*, uint8_t) {
  if (isMaster) dynAvisar("En el simulador el robot no puede buscar otros aparatos Bluetooth: usa begin(\"Nombre\") y conéctate desde la pestaña Bluetooth.");
  const char* nombre = localName.length() > 0 ? localName.c_str() : "ESP32";
  dyn_bt_begin(nombre, strlen(nombre));
  if (!iniciado) {
    iniciado = true;
    siguiente = encendidos;
    encendidos = this;
  }
  conectadoAntes = false;
  if (alEvento) {
    esp_spp_cb_param_t p = {};
    alEvento(ESP_SPP_INIT_EVT, &p);
    alEvento(ESP_SPP_START_EVT, &p);
  }
  return true;
}

void BluetoothSerial::end() {
  if (!iniciado) return;
  iniciado = false;
  for (BluetoothSerial** p = &encendidos; *p; p = &(*p)->siguiente) {
    if (*p == this) { *p = siguiente; break; }
  }
  siguiente = nullptr;
  dyn_bt_end();
  if (conectadoAntes && alEvento) {
    esp_spp_cb_param_t p = {};
    alEvento(ESP_SPP_CLOSE_EVT, &p);
  }
  conectadoAntes = false;
}

void BluetoothSerial::atenderEventos() {
  if (!iniciado) return;
  bool ahora = (dyn_bt_estado() & 2) != 0;
  if (ahora != conectadoAntes) {
    conectadoAntes = ahora;
    if (alEvento) {
      esp_spp_cb_param_t p = {};
      if (ahora) {
        p.srv_open.handle = 0x81;
        memcpy(p.srv_open.rem_bda, DIRECCION_TELEFONO, 6);
        alEvento(ESP_SPP_SRV_OPEN_EVT, &p);
      } else {
        p.close.handle = 0x81;
        alEvento(ESP_SPP_CLOSE_EVT, &p);
      }
    }
  }
  // Con onData los datos no quedan en la cola: se entregan al callback.
  if (alRecibir && dyn_bt_available() > 0) {
    uint8_t datos[256];
    size_t n = 0;
    int c;
    while (n < sizeof(datos) && (c = dyn_bt_read()) >= 0) datos[n++] = static_cast<uint8_t>(c);
    if (n > 0) alRecibir(datos, n);
  }
}

int BluetoothSerial::available() {
  atenderEventos();
  return iniciado && !alRecibir ? dyn_bt_available() : 0;
}

int BluetoothSerial::peek() {
  atenderEventos();
  return iniciado && !alRecibir ? dyn_bt_peek() : -1;
}

int BluetoothSerial::read() {
  atenderEventos();
  return iniciado && !alRecibir ? dyn_bt_read() : -1;
}

bool BluetoothSerial::hasClient() {
  atenderEventos();
  return iniciado && conectadoAntes;
}

size_t BluetoothSerial::write(uint8_t c) { return write(&c, 1); }

size_t BluetoothSerial::write(const uint8_t* buffer, size_t size) {
  if (!iniciado) {
    dynAvisar("Usaste SerialBT.print sin SerialBT.begin(\"Nombre\"): el Bluetooth está apagado.");
    return 0;
  }
  atenderEventos();
  return size > 0 ? dyn_bt_write(buffer, size) : 0;
}

bool BluetoothSerial::connect(String remoteName) {
  (void)remoteName;
  return connect();
}

bool BluetoothSerial::connect(uint8_t remoteAddress[], int, int, int) {
  (void)remoteAddress;
  return connect();
}

bool BluetoothSerial::connect() {
  dynAvisar("En el simulador el robot no puede conectarse a otro aparato: el teléfono se conecta al robot desde la pestaña Bluetooth.");
  return false;
}

bool BluetoothSerial::connected(int timeout) {
  unsigned long inicio = millis();
  while (!hasClient()) {
    if (timeout <= 0 || millis() - inicio >= static_cast<unsigned long>(timeout)) return false;
    delay(1);
  }
  return true;
}

bool BluetoothSerial::disconnect() {
  if (!hasClient()) return false;
  dynAvisar("El robot cortó la conexión Bluetooth (disconnect): el teléfono simulado se desconectó.");
  // Se apaga y se vuelve a encender con el mismo nombre: así el teléfono queda desconectado.
  dyn_bt_end();
  dyn_bt_begin(nullptr, 0);
  atenderEventos();
  return true;
}

bool BluetoothSerial::isReady(bool checkMaster, int timeout) {
  (void)timeout;
  return iniciado && !checkMaster;
}

bool BluetoothSerial::getBtAddress(uint8_t* mac) {
  if (!mac) return false;
  memcpy(mac, DIRECCION_ROBOT, 6);
  return true;
}
