import { describe, expect, it } from 'vitest';
import { correrSketch } from '../ayuda/correr-sketch';
import { crearEntrada, escribirCanal, fijarConectado, conectado } from '../../src/simulacion/entrada';

const bytes = (texto: string) => new TextEncoder().encode(texto);

describe('BluetoothSerial y la entrada del Serial', { timeout: 60_000 }, () => {
  it('Serial.readStringUntil lee lo que se escribió en "Mensajes del robot"', async () => {
    const entrada = crearEntrada();
    escribirCanal(entrada.serial, bytes('hola robot\n42\n'));
    const { texto, sim } = await correrSketch(`
void setup() {
  Serial.begin(115200);
  String s = Serial.readStringUntil('\\n');
  Serial.printf("[%s]\\n", s.c_str());
  Serial.println(Serial.parseInt() + 1);
}
void loop() {}`, { entrada });
    expect(texto).toBe('[hola robot]\n43\r\n');
    expect(sim.avisos.join()).not.toContain('nadie escribe');
  });

  it('sin teléfono conectado no llega nada y avisa; con teléfono, conversa', async () => {
    const entrada = crearEntrada();
    const codigo = `
#include "BluetoothSerial.h"
#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled!
#endif
BluetoothSerial SerialBT;
void setup() {
  Serial.begin(115200);
  SerialBT.begin("RobotDynamis");
  Serial.println(btStarted() ? "encendido" : "apagado");
}
void loop() {
  if (SerialBT.hasClient()) SerialBT.println("hola telefono");
  while (SerialBT.available()) Serial.write(SerialBT.read());
  delay(20);
}`;
    const sinTelefono = await correrSketch(codigo, { entrada, duracionUs: 50_000 });
    expect(sinTelefono.texto).toBe('encendido\r\n');
    expect(sinTelefono.sim.bluetooth).toEqual({ nombre: 'RobotDynamis', encendido: true, conectado: false });
    expect(sinTelefono.sim.tomarBluetooth()).toBe('');

    // El robot se reinicia sin nadie conectado: el teléfono se conecta después de encenderlo.
    const entrada2 = crearEntrada();
    escribirCanal(entrada2.bluetooth, bytes('F'));
    let conecto = false;
    const conTelefono = await correrSketch(codigo, {
      entrada: entrada2, duracionUs: 100_000,
      alPasoFisica: t => { if (!conecto && t >= 10_000) { conecto = true; fijarConectado(entrada2.bluetooth, true); escribirCanal(entrada2.bluetooth, bytes('L\n')); } },
    });
    expect(conTelefono.sim.bluetooth.conectado).toBe(true);
    expect(conTelefono.sim.tomarBluetooth()).toContain('hola telefono\r\n');
    // La 'F' escrita antes de que el robot encendiera se botó al reiniciar.
    expect(conTelefono.texto).toBe('encendido\r\nL\n');
  });

  it('register_callback avisa cuando el teléfono se conecta y se desconecta', async () => {
    const entrada = crearEntrada();
    const { texto } = await correrSketch(`
#include <BluetoothSerial.h>
BluetoothSerial SerialBT;
void alEvento(esp_spp_cb_event_t evento, esp_spp_cb_param_t *param) {
  if (evento == ESP_SPP_SRV_OPEN_EVT) Serial.println("conectado");
  if (evento == ESP_SPP_CLOSE_EVT) Serial.println("desconectado");
}
void setup() {
  Serial.begin(115200);
  SerialBT.register_callback(alEvento);
  SerialBT.begin("Robot");
}
void loop() { delay(5); }`, {
      entrada, duracionUs: 100_000,
      alPasoFisica: t => {
        if (t === 20_000) fijarConectado(entrada.bluetooth, true);
        if (t === 60_000) fijarConectado(entrada.bluetooth, false);
      },
    });
    expect(texto).toBe('conectado\r\ndesconectado\r\n');
  });

  it('onData entrega los datos y disconnect desconecta al teléfono', async () => {
    const entrada = crearEntrada();
    const { texto, sim } = await correrSketch(`
#include "BluetoothSerial.h"
BluetoothSerial SerialBT;
void setup() {
  Serial.begin(115200);
  SerialBT.onData([](const uint8_t *datos, size_t n) { Serial.printf("llegaron %u\\n", (unsigned)n); });
  SerialBT.begin("Robot");
}
void loop() {
  delay(5);
  if (millis() > 50 && SerialBT.hasClient()) SerialBT.disconnect();
}`, {
      entrada, duracionUs: 100_000,
      alPasoFisica: t => { if (t === 20_000) { fijarConectado(entrada.bluetooth, true); escribirCanal(entrada.bluetooth, bytes('abc')); } },
    });
    expect(texto).toBe('llegaron 3\n');
    expect(conectado(entrada.bluetooth)).toBe(false);
    expect(sim.bluetooth).toMatchObject({ encendido: true, conectado: false });
  });

  it('compila con la placa 2.0.14', async () => {
    const { texto } = await correrSketch(`
#include "BluetoothSerial.h"
BluetoothSerial SerialBT;
void setup() { Serial.begin(115200); Serial.println(SerialBT.begin("Robot") ? "ok" : "no"); }
void loop() {}`, { version: '2.0.14' });
    expect(texto).toBe('ok\r\n');
  });
});

describe('el ejemplo Control por Bluetooth', { timeout: 60_000 }, () => {
  it('avanza con F, se detiene con S y responde por Bluetooth', async () => {
    const { PROYECTOS_DE_EJEMPLO } = await import('../../src/ejemplos');
    const ejemplo = PROYECTOS_DE_EJEMPLO.find(e => e.id === 'control-bluetooth')!;
    const codigo = ejemplo.proyecto.archivos['control-bluetooth.ino'];
    const entrada = crearEntrada();
    let x0 = 0, xF = 0, xS = 0, xFin = 0;
    const { sim, texto } = await correrSketch(codigo.replace('#include "pines.h"', ejemplo.proyecto.archivos['pines.h']), {
      entrada, duracionUs: 2_000_000,
      alPasoFisica: (t, estado) => {
        if (t === 100_000) { x0 = estado.x; fijarConectado(entrada.bluetooth, true); }
        if (t === 200_000) escribirCanal(entrada.bluetooth, bytes('F'));
        if (t === 1_000_000) { xF = estado.x; escribirCanal(entrada.bluetooth, bytes('S\n')); }
        if (t === 1_300_000) xS = estado.x;
        xFin = estado.x;
      },
    });
    expect(texto).toContain('Bluetooth encendido');
    expect(Math.abs(xF - x0)).toBeGreaterThan(20);
    expect(Math.abs(xFin - xS)).toBeLessThan(5);
    expect(sim.tomarBluetooth()).toBe('Adelante\r\nDetenido\r\n');
  });
});
