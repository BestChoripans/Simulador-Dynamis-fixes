import { describe, expect, it } from 'vitest';
import { correrSketch } from '../ayuda/correr-sketch';
import { crearEntrada, presionarBoton } from '../../src/simulacion/entrada';

describe('Preferences, String y el botón del robot', { timeout: 60_000 }, () => {
  it('Preferences guarda y lee por espacio, con valores por defecto', async () => {
    const { texto, sim } = await correrSketch(String.raw`
#include <Preferences.h>
Preferences memoria;
void setup() {
  Serial.begin(115200);
  memoria.begin("pid", true);
  Serial.printf("%.2f %d\n", memoria.getFloat("Kp", 0.6), memoria.getInt("Tp", 40));
  memoria.end();
  memoria.begin("pid", false);
  memoria.putFloat("Kp", 1.25);
  memoria.putInt("Tp", 55);
  memoria.putString("nombre", "Carlos");
  memoria.end();
  memoria.begin("pid", true);
  Serial.printf("%.2f %d %s %d\n", memoria.getFloat("Kp", 0.6), memoria.getInt("Tp", 40), memoria.getString("nombre").c_str(), memoria.isKey("nada"));
  Serial.println(memoria.putInt("Tp", 1));  // solo lectura: no guarda
  memoria.end();
  memoria.begin("otro");
  Serial.println(memoria.getInt("Tp", -1));
}
void loop() {}`);
    expect(texto).toBe('0.60 40\n1.25 55 Carlos 0\n0\r\n-1\r\n');
    expect(sim.avisos.join()).toContain('solo lectura');
  });

  it('String: trim, mayúsculas, startsWith, replace y otras', async () => {
    const { texto } = await correrSketch(String.raw`
void setup() {
  Serial.begin(115200);
  String s = "  Kp 1.5 \r\n";
  s.trim();
  Serial.printf("[%s]\n", s.c_str());
  s.toUpperCase();
  Serial.printf("%s %d %d %d\n", s.c_str(), s.startsWith("KP"), s.endsWith("5"), s.lastIndexOf('P'));
  s.replace("KP", "Kd");
  s.remove(2, 1);
  Serial.printf("%s %d %.1f\n", s.c_str(), s.equalsIgnoreCase("KD1.5"), s.substring(2).toDouble());
  char buf[4];
  s.toCharArray(buf, sizeof buf);
  Serial.println(buf);
}
void loop() {}`);
    expect(texto).toBe('[Kp 1.5]\nKP 1.5 1 1 1\nKd1.5 1 1.5\nKd1\r\n');
  });

  it('el botón del robot: lee 1 apretado sin pull-up y 0 apretado con INPUT_PULLUP', async () => {
    const entrada = crearEntrada();
    const { texto } = await correrSketch(`
void setup() {
  Serial.begin(115200);
  pinMode(0, INPUT_PULLUP);
  while (digitalRead(12) == 0) delay(10);
  Serial.println("12 apretado");
  while (digitalRead(0) == 1) delay(10);
  Serial.println("0 apretado");
}
void loop() {}`, {
      entrada, duracionUs: 1_000_000,
      alPasoFisica: t => {
        presionarBoton(entrada.botones, 12, t >= 200_000 && t < 300_000);
        presionarBoton(entrada.botones, 0, t >= 500_000 && t < 600_000);
      },
    });
    expect(texto).toBe('12 apretado\r\n0 apretado\r\n');
  });
});
