// BluetoothSerial.h — Bluetooth clásico (SPP) del ESP32, compatible con la librería del core.
// En el simulador no hay radio: el "teléfono" es la pestaña Bluetooth de "Mensajes del robot".
// Allí se conecta al robot, se ve lo que envía y se le escriben mensajes o se usan los botones.
#pragma once

#include "Arduino.h"
#include "Stream.h"
#include <functional>

// Lo mínimo de esp_spp_api.h para register_callback (los valores son los de ESP-IDF).
typedef enum {
  ESP_SPP_INIT_EVT = 0,
  ESP_SPP_UNINIT_EVT = 1,
  ESP_SPP_DISCOVERY_COMP_EVT = 8,
  ESP_SPP_OPEN_EVT = 26,
  ESP_SPP_CLOSE_EVT = 27,
  ESP_SPP_START_EVT = 28,
  ESP_SPP_CL_INIT_EVT = 29,
  ESP_SPP_DATA_IND_EVT = 30,
  ESP_SPP_CONG_EVT = 31,
  ESP_SPP_WRITE_EVT = 33,
  ESP_SPP_SRV_OPEN_EVT = 34,
  ESP_SPP_SRV_STOP_EVT = 35,
} esp_spp_cb_event_t;

typedef enum { ESP_SPP_SUCCESS = 0, ESP_SPP_FAILURE = 1 } esp_spp_status_t;
typedef uint8_t esp_bd_addr_t[6];
typedef int esp_err_t;
#ifndef ESP_OK
#define ESP_OK 0
#define ESP_FAIL -1
#endif

typedef union {
  struct { esp_spp_status_t status; } init;
  struct { esp_spp_status_t status; uint32_t handle; int fd; esp_bd_addr_t rem_bda; } open;
  struct { esp_spp_status_t status; uint32_t handle; uint32_t new_listen_handle; int fd; esp_bd_addr_t rem_bda; } srv_open;
  struct { esp_spp_status_t status; uint32_t port_status; uint32_t handle; bool async; } close;
  struct { esp_spp_status_t status; uint32_t handle; uint8_t sec_id; } start;
  struct { esp_spp_status_t status; uint32_t handle; uint16_t len; uint8_t* data; } data_ind;
} esp_spp_cb_param_t;

typedef void (*esp_spp_cb_t)(esp_spp_cb_event_t event, esp_spp_cb_param_t* param);
typedef std::function<void(const uint8_t* buffer, size_t size)> BluetoothSerialDataCb;
typedef std::function<void(uint32_t num_val)> ConfirmRequestCb;
typedef std::function<void(boolean success)> AuthCompleteCb;

#define ESP_SPP_ROLE_MASTER 0
#define ESP_SPP_ROLE_SLAVE 1
#define ESP_SPP_SEC_NONE 0
#define ESP_SPP_SEC_AUTHENTICATE 0x12

class BluetoothSerial : public Stream {
public:
  BluetoothSerial() {}
  ~BluetoothSerial() { end(); }

  // 3.x agrega disableBLE y los tamaños de las colas; en la 2.0.14 solo existen los dos primeros.
  bool begin(String localName = String(), bool isMaster = false, bool disableBLE = false,
             int rxQueueSize = 512 * 2, int txQueueSize = 512, const char* eirData = nullptr, uint8_t eirLen = 0);
  bool begin(unsigned long baud) { (void)baud; return begin(); }
  void end();

  int available() override;
  int peek() override;
  int read() override;
  bool hasClient();
  size_t write(uint8_t c) override;
  size_t write(const uint8_t* buffer, size_t size) override;
  using Print::write;
  void flush() override {}

  void onData(BluetoothSerialDataCb cb) { alRecibir = cb; }
  esp_err_t register_callback(esp_spp_cb_t callback) { alEvento = callback; return ESP_OK; }

  // Emparejamiento: en el simulador el teléfono se conecta sin PIN.
  void onConfirmRequest(ConfirmRequestCb cb) { (void)cb; }
  void onKeyRequest(std::function<void()> cb) { (void)cb; }
  void respondPasskey(uint32_t passkey) { (void)passkey; }
  void onAuthComplete(AuthCompleteCb cb) { (void)cb; }
  void confirmReply(boolean confirm) { (void)confirm; }
  void enableSSP() {}
  void enableSSP(bool inputCapability, bool outputCapability) { (void)inputCapability; (void)outputCapability; }
  void disableSSP() {}
  bool setPin(const char* pin, uint8_t pinLen = 0) { (void)pin; (void)pinLen; return true; }
  bool setPin(const char* pin, bool) { (void)pin; return true; }
  bool unpairDevice(uint8_t remoteAddress[]) { (void)remoteAddress; return true; }

  // Como maestro (conectarse a otro aparato): el simulador no tiene otros aparatos Bluetooth.
  bool connect(String remoteName);
  bool connect(uint8_t remoteAddress[], int channel = 0, int secMask = 0, int role = 0);
  bool connect();
  bool connected(int timeout = 0);
  bool isClosed() { return !hasClient(); }
  bool disconnect();
  bool isReady(bool checkMaster = false, int timeout = 0);
  void memrelease() {}
  void setTimeout(int timeoutMS) { Stream::setTimeout(static_cast<unsigned long>(timeoutMS)); }
  String getBtAddressString() { return String("24:6F:28:D1:4A:B2"); }
  bool getBtAddress(uint8_t* mac);

  operator bool() const { return iniciado; }

  /** Avisa los cambios de conexión y entrega los datos de onData. Lo llaman todos los métodos y cada loop(). */
  void atenderEventos();

private:
  friend void dynAtenderBluetooth();
  bool iniciado = false;
  bool conectadoAntes = false;
  esp_spp_cb_t alEvento = nullptr;
  BluetoothSerialDataCb alRecibir;
  BluetoothSerial* siguiente = nullptr;
};
