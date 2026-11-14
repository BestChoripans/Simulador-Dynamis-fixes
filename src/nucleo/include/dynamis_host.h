// dynamis_host.h — funciones que el simulador le entrega al programa (imports "dynamis").
// Es el contrato entre el núcleo Arduino simulado y src/simulacion/puente.ts.
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

#define DYN_IMPORTAR(nombre) __attribute__((import_module("dynamis"), import_name(nombre)))

#ifdef __cplusplus
extern "C" {
#endif

DYN_IMPORTAR("millis") uint32_t dyn_millis(void);
DYN_IMPORTAR("micros") uint32_t dyn_micros(void);
DYN_IMPORTAR("delay") void dyn_delay(uint32_t ms);
DYN_IMPORTAR("delay_us") void dyn_delay_us(uint32_t us);
DYN_IMPORTAR("yield") void dyn_yield(void);
DYN_IMPORTAR("pin_mode") void dyn_pin_mode(uint8_t pin, uint8_t modo);
DYN_IMPORTAR("digital_write") void dyn_digital_write(uint8_t pin, uint8_t valor);
DYN_IMPORTAR("digital_read") int dyn_digital_read(uint8_t pin);
DYN_IMPORTAR("analog_read") uint16_t dyn_analog_read(uint8_t pin);
DYN_IMPORTAR("analog_read_resolution") void dyn_analog_read_resolution(uint8_t bits);
DYN_IMPORTAR("analog_write") void dyn_analog_write(uint8_t pin, int valor);
DYN_IMPORTAR("analog_write_resolution") void dyn_analog_write_resolution(uint8_t pin, uint8_t bits);
DYN_IMPORTAR("ledc_attach") int dyn_ledc_attach(uint8_t pin, uint32_t freq, uint8_t bits);
DYN_IMPORTAR("ledc_write") int dyn_ledc_write(uint8_t pin, uint32_t duty);
DYN_IMPORTAR("ledc_detach") int dyn_ledc_detach(uint8_t pin);
DYN_IMPORTAR("serial_begin") void dyn_serial_begin(uint32_t baudios);
DYN_IMPORTAR("serial_write") void dyn_serial_write(const uint8_t* datos, size_t largo);
DYN_IMPORTAR("serial_available") int dyn_serial_available(void);
/** El siguiente byte que llegó por el Serial (escrito en "Mensajes del robot"), o -1. */
DYN_IMPORTAR("serial_read") int dyn_serial_read(void);
DYN_IMPORTAR("serial_peek") int dyn_serial_peek(void);

// Bluetooth clásico (BluetoothSerial): el "teléfono" es la pestaña Bluetooth de "Mensajes del robot".
/** Enciende el Bluetooth con ese nombre visible. */
DYN_IMPORTAR("bt_begin") void dyn_bt_begin(const char* nombre, size_t largo);
DYN_IMPORTAR("bt_end") void dyn_bt_end(void);
/** 1 = encendido, 2 = con un teléfono conectado (se suman). */
DYN_IMPORTAR("bt_estado") int dyn_bt_estado(void);
/** Envía al teléfono; devuelve cuántos bytes salieron (0 si no hay nadie conectado). */
DYN_IMPORTAR("bt_write") size_t dyn_bt_write(const uint8_t* datos, size_t largo);
DYN_IMPORTAR("bt_available") int dyn_bt_available(void);
DYN_IMPORTAR("bt_read") int dyn_bt_read(void);
DYN_IMPORTAR("bt_peek") int dyn_bt_peek(void);

// Sensores: el simulador entrega la magnitud física en el instante actual; las librerías del
// núcleo esperan lo que espera la librería real y convierten unidades.
DYN_IMPORTAR("aviso") void dyn_aviso(const char* texto, size_t largo);
/** mm, acotado a 8190 (sin objetivo). */
DYN_IMPORTAR("vl53_medir") uint16_t dyn_vl53_medir(void);
/** 1 si el VL53L0X contesta ahora en esa dirección (su canal del multiplexor abierto), 0 si no; el
 * simulador avisa qué canal abrir, o si choca con un TCS34725 en 0x29. */
DYN_IMPORTAR("vl53_responde") int dyn_vl53_responde(uint8_t direccion);
/** ax ay az (m/s²), gx gy gz (rad/s), temp (°C), en el marco del sensor. Cuesta COSTOS_US.lecturaMpu. */
DYN_IMPORTAR("mpu_leer") void dyn_mpu_leer(float* datos7);
/** I2C directo, para lo que el simulador tiene a nivel de registros: el multiplexor TCA9548A y los
 * TCS34725. 1 si algún dispositivo respondió (ACK), 0 si no. Cuesta COSTOS_US.i2cByte por byte. */
DYN_IMPORTAR("i2c_escribir") int dyn_i2c_escribir(uint8_t direccion, const uint8_t* datos, size_t largo);
/** Lee `largo` bytes por I2C directo: 1 si algún dispositivo respondió, 0 si no. */
DYN_IMPORTAR("i2c_leer") int dyn_i2c_leer(uint8_t direccion, uint8_t* datos, size_t largo);

static inline void dynAvisar(const char* texto) { dyn_aviso(texto, strlen(texto)); }
/** Un valor marcado con @ajustar: el preprocesador reemplaza el número por esta llamada, y el
 * simulador responde el valor de la prueba (o `valor`, el del código). Ver src/compilador/ajustables.ts. */
DYN_IMPORTAR("ajustable") double __dyn_ajustable(const char* grupo, const char* nombre, double valor);
DYN_IMPORTAR("azar_u32") uint32_t dyn_azar_u32(void);

#ifdef __cplusplus
}
#endif
