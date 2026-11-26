import { it, expect } from 'vitest';
import { estadoInicial, pasoDinamica } from '../../src/modelos/dinamica.js';
import { crearMundo } from '../../src/mundo/pista';
import { capaSuelo, conCapaSuelo, ordenarCapas } from '../../src/pista/capas';
import { vaciarCelda } from '../../src/pista/edicion';
import { revisarPista } from '../../src/pista/revision';
import { escribirPista, leerPista } from '../../src/pista/serializacion';
import { ROBOT_POR_DEFECTO } from '../../src/robot/config';
import type { Motores } from '../../src/simulacion/motores';
import { pistaDe } from '../ayuda/pistas';

/**
 * Una línea de oeste a este por la fila 1 y un puente de norte a sur por la columna 3: dos rampas
 * y, arriba, una plataforma a `alto` mm; la línea del suelo pasa por debajo.
 */
function puente(angulo = 25) {
  const alto = 300 * Math.tan((angulo * Math.PI) / 180);
  return pistaDe({
    columnas: 6, filas: 3,
    baldosas: [
      ...[0, 1, 2, 4, 5].map(c => ({ c, r: 1, tipo: 'recta' })),
      { c: 3, r: 0, rot: 90, tipo: 'rampa', props: { angulo } },
      { c: 3, r: 1, rot: 90, tipo: 'recta', nivel: alto },
      { c: 3, r: 2, rot: 270, tipo: 'rampa', props: { angulo } },
    ],
    debajo: [{ c: 3, r: 1, tipo: 'recta' }],
  });
}
const ADELANTE: Motores = { izq: { duty: 0.6, modo: 'avance' }, der: { duty: 0.6, modo: 'avance' } };

function correr(mundo: ReturnType<typeof crearMundo>, pose: { x: number; y: number; yaw: number }, segundos: number) {
  let e = estadoInicial(pose, ROBOT_POR_DEFECTO, mundo);
  const estados = [e];
  for (let i = 0; i < segundos * 1000; i++) {
    e = pasoDinamica(e, ADELANTE, 0.001, mundo, ROBOT_POR_DEFECTO, () => 0.5);
    estados.push(e);
  }
  return estados;
}

it('la pista con línea debajo de un puente se guarda y se vuelve a leer igual', () => {
  const p = puente();
  const r = leerPista(escribirPista(p));
  expect(r.ok && r.pista).toEqual(p);
  expect(p.debajo).toHaveLength(1);
});

it('el suelo bajo el puente tiene su línea; el puente, la suya', () => {
  const mundo = crearMundo(puente());
  // En el centro de la celda (3, 1): arriba la línea va de norte a sur, abajo de oeste a este.
  expect(mundo.altura(1050, 360)).toBeCloseTo(139.9, 0);
  expect(mundo.altura(1050, 360, 0)).toBe(0);
  expect(mundo.esLinea(1000, 450)).toBe(false);
  expect(mundo.esLinea(1050, 450, 5)).toBe(true);
  expect(mundo.esLinea(950, 360, 145)).toBe(false);
  expect(mundo.esLinea(1050, 360, 145)).toBe(true);
  expect(mundo.baldosaEn(1050, 450, 0)?.rot).toBe(0);
  expect(mundo.baldosaEn(1050, 450)?.rot).toBe(90);
});

it('el robot sigue por el suelo debajo de un puente alto, sin subirse a él', () => {
  const estados = correr(crearMundo(puente(25)), { x: 150, y: 450, yaw: 0 }, 4);
  const fin = estados.at(-1)!;
  expect(fin.x).toBeGreaterThan(1400);
  expect(Math.max(...estados.map(e => e.z))).toBe(0);
  expect(estados.some(e => e.choque)).toBe(false);
});

it('bajo un puente más bajo que el robot, choca con la tabla', () => {
  // A 15° la plataforma queda a 80 mm: el Dynamis (117 mm con el asa) no cabe.
  const estados = correr(crearMundo(puente(15)), { x: 150, y: 450, yaw: 0 }, 4);
  expect(estados.some(e => e.choque)).toBe(true);
  expect(estados.at(-1)!.x).toBeLessThan(900);
});

it('el láser ve la tabla del puente desde abajo como un obstáculo', () => {
  const mundo = crearMundo(puente(15));
  // A 20 mm del suelo, mirando al este: la tabla (de 68 a 80 mm) no está en el camino del rayo...
  expect(mundo.raycast({ x: 700, y: 450, z: 20 }, { x: 1, y: 0, z: 0 }, 2000)).toBeNull();
  // ...pero a 75 mm sí: la toca en el borde oeste de la celda (3, 1).
  expect(mundo.raycast({ x: 700, y: 450, z: 75 }, { x: 1, y: 0, z: 0 }, 2000)?.distancia).toBeCloseTo(200, 0);
});

it('editar el suelo: lo que se dibuja bajo un puente queda en `debajo`; quitar el puente deja la línea', () => {
  const p = puente();
  const suelo = capaSuelo(p);
  expect(suelo.debajo).toBeUndefined();
  expect(suelo.baldosas.filter(b => b.c === 3)).toHaveLength(1);
  const otraVez = conCapaSuelo(p, suelo);
  expect(otraVez.debajo).toEqual(p.debajo);
  expect(otraVez.baldosas).toHaveLength(p.baldosas.length);
  // Sin el puente, la línea de abajo pasa a ser la de arriba.
  const sinPuente = vaciarCelda(p, 3, 1);
  expect(sinPuente.debajo).toBeUndefined();
  expect(sinPuente.baldosas.find(b => b.c === 3 && b.r === 1)?.rot).toBe(0);
  expect(ordenarCapas(sinPuente)).toBe(sinPuente);
});

it('la revisión no ve un escalón donde la línea pasa por debajo del puente', () => {
  expect(revisarPista(puente()).some(a => a.mensaje.includes('escalón'))).toBe(false);
});
