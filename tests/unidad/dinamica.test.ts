import { it, expect } from 'vitest';
import { estadoInicial, pasoDinamica } from '../../src/modelos/dinamica.js';
import { crearMundo } from '../../src/mundo/pista';
import { mundoPlano } from '../../src/mundo/plano';
import { ROBOT_POR_DEFECTO, type ConfigRobot } from '../../src/robot/config';
import type { Motores } from '../../src/simulacion/motores';
import { pistaDe } from '../ayuda/pistas';

const GRADOS = Math.PI / 180;
const RAMPA = () => crearMundo(pistaDe({ columnas: 2, filas: 1, baldosas: [{ c: 0, r: 0, tipo: 'recta' }, { c: 1, r: 0, tipo: 'rampa' }] }));
const sinLocas = (): ConfigRobot => ({ ...structuredClone(ROBOT_POR_DEFECTO), ruedasLocas: { ...ROBOT_POR_DEFECTO.ruedasLocas, instalado: false } });

it('con ruedas locas, el robot se inclina cuando ellas llegan a la rampa, no cuando llega el frente del chasis', () => {
  // La rampa empieza en x = 300. En x = 220 las locas (x + 70) siguen en lo plano y el frente (x + 97) ya está en la rampa.
  expect(estadoInicial({ x: 220, y: 150, yaw: 0 }, ROBOT_POR_DEFECTO, RAMPA()).pitch).toBe(0);
  // En x = 250 las locas están 20 mm dentro de la rampa de 20°: suben 7,3 mm en 70 mm.
  const e = estadoInicial({ x: 250, y: 150, yaw: 0 }, ROBOT_POR_DEFECTO, RAMPA());
  expect(e.pitch).toBeCloseTo(-Math.atan2(20 * Math.tan(20 * GRADOS), 70), 6);
  expect(e.z).toBe(0);
});

it('sin ruedas locas, el chasis se apoya en su frente y su cola, como antes', () => {
  const e = estadoInicial({ x: 220, y: 150, yaw: 0 }, sinLocas(), RAMPA());
  // El frente (317) está 17 mm dentro de la rampa; la cola (192), en lo plano: 125 mm entre los dos.
  expect(e.pitch).toBeCloseTo(-Math.atan2(17 * Math.tan(20 * GRADOS), 125), 6);
});

it('un bache de 6 mm bajo el eje casi no inclina al robot', () => {
  const mundo = crearMundo(pistaDe({ columnas: 1, filas: 1, baldosas: [{ c: 0, r: 0, tipo: 'recta' }],
    objetos: [{ tipo: 'bache', x: 150, y: 150, rot: 90, props: { largo: 250, radio: 6 } }] }));
  const e = estadoInicial({ x: 150, y: 150, yaw: 0 }, ROBOT_POR_DEFECTO, mundo);
  expect(Math.abs(e.pitch)).toBeLessThan(5 * GRADOS);
});

it('en la mitad de la rampa la inclinación es la de la rampa', () => {
  const mundo = crearMundo(pistaDe({ columnas: 3, filas: 1, baldosas: [{ c: 0, r: 0, tipo: 'recta' }, { c: 1, r: 0, tipo: 'rampa' }, { c: 2, r: 0, tipo: 'recta', nivel: 109.19 }] }));
  for (const robot of [ROBOT_POR_DEFECTO, sinLocas()]) {
    const e = estadoInicial({ x: 450, y: 150, yaw: 0 }, robot, mundo);
    expect(e.pitch).toBeCloseTo(-20 * GRADOS, 3);
    expect(e.z).toBeCloseTo(150 * Math.tan(20 * GRADOS), 1);
    expect(e.roll).toBeCloseTo(0, 6);
  }
});

/** Corre el modelo `segundos` con motores que pueden cambiar en el tiempo. */
function correr(mundo: ReturnType<typeof mundoPlano>, motores: (t: number) => Motores, segundos: number, pose = { x: 0, y: 150, yaw: 0 }, robot = ROBOT_POR_DEFECTO) {
  let e = estadoInicial(pose, robot, mundo);
  const estados = [e];
  for (let i = 1; i <= Math.round(segundos * 1000); i++) {
    e = pasoDinamica(e, motores(i / 1000), 0.001, mundo, robot, () => 0.5);
    estados.push(e);
  }
  return estados;
}
const A = (izq: number, der = izq): Motores => ({ izq: { duty: izq, modo: izq < 0 ? 'retroceso' : 'avance' }, der: { duty: der, modo: der < 0 ? 'retroceso' : 'avance' } });
const TODOS = (modo: 'freno' | 'libre'): Motores => ({ izq: { duty: 0, modo }, der: { duty: 0, modo } });

it('la velocidad máxima en lo plano es motores.vMaxMmS, y llegar a ella toma tiempo (masa e inercia)', () => {
  const robot = { ...structuredClone(ROBOT_POR_DEFECTO), motores: { ...ROBOT_POR_DEFECTO.motores, vMaxMmS: 300 } };
  const estados = correr(mundoPlano(), () => A(1), 1.5, undefined, robot);
  expect(estados[50].v).toBeGreaterThan(50);
  expect(estados[50].v).toBeLessThan(290);
  expect(estados.at(-1)!.v).toBeCloseTo(300, -1);
  // Con duty 0,5 va a la mitad (más o menos: el roce pesa más a poca velocidad).
  const medio = correr(mundoPlano(), () => A(0.5), 1.5, undefined, robot).at(-1)!.v;
  expect(medio).toBeGreaterThan(120);
  expect(medio).toBeLessThan(150);
});

it('frenar (IN1 = IN2 = 1) detiene en pocos cm; soltar (libre) deja rodar más lejos', () => {
  const frena = correr(mundoPlano(), t => (t < 1 ? A(1) : TODOS('freno')), 2);
  const suelta = correr(mundoPlano(), t => (t < 1 ? A(1) : TODOS('libre')), 2);
  const recorrido = (es: typeof frena) => es.at(-1)!.x - es[1000].x;
  expect(Math.abs(frena.at(-1)!.v)).toBeLessThan(1);
  expect(Math.abs(suelta.at(-1)!.v)).toBeLessThan(1);
  expect(recorrido(frena)).toBeLessThan(80);
  expect(recorrido(suelta)).toBeGreaterThan(recorrido(frena) * 1.5);
});

it('girar sobre su eje: las ruedas en sentidos opuestos cambian el rumbo sin desplazarlo', () => {
  const e = correr(mundoPlano(), () => A(-0.5, 0.5), 1).at(-1)!;
  expect(e.yaw).toBeGreaterThan(1.5);
  expect(Math.hypot(e.x - 0, e.y - 150)).toBeLessThan(1);
});

it('un motor un poco más fuerte que el otro: con el mismo duty, el robot se desvía apenas', () => {
  let llamadas = 0;
  const azar = () => (llamadas++ === 0 ? 1 : 0);
  let e = estadoInicial({ x: 0, y: 150, yaw: 0 }, ROBOT_POR_DEFECTO, mundoPlano());
  for (let i = 0; i < 2000; i++) e = pasoDinamica(e, A(0.6), 0.001, mundoPlano(), ROBOT_POR_DEFECTO, azar);
  expect(e.yaw).toBeLessThan(0);
  expect(Math.abs(e.yaw)).toBeLessThan(15 * GRADOS);
});

it('la rampa: sube más lento, y suelto en ella rueda hacia abajo', () => {
  const mundo = crearMundo(pistaDe({ columnas: 4, filas: 1, baldosas: [{ c: 0, r: 0, tipo: 'recta' }, { c: 1, r: 0, tipo: 'rampa' }, { c: 2, r: 0, tipo: 'recta', nivel: 109.19 }, { c: 3, r: 0, tipo: 'recta', nivel: 109.19 }] }));
  const sube = correr(mundo, () => A(0.6), 3, { x: 100, y: 150, yaw: 0 });
  const enLoPlano = sube.find(e => e.x > 200)!.v;
  const enLaRampa = sube.find(e => e.x > 450)!.v;
  expect(enLaRampa).toBeLessThan(enLoPlano * 0.7);
  expect(sube.at(-1)!.z).toBeCloseTo(109.19, 0);
  const suelto = correr(mundo, () => TODOS('libre'), 0.5, { x: 450, y: 150, yaw: 0 }).at(-1)!;
  expect(suelto.v).toBeLessThan(-200);
  expect(suelto.x).toBeLessThan(450);
});

it('contra un obstáculo se detiene y las ruedas patinan', () => {
  const mundo = crearMundo(pistaDe({ columnas: 3, filas: 1, baldosas: [{ c: 0, r: 0, tipo: 'recta' }, { c: 1, r: 0, tipo: 'recta' }, { c: 2, r: 0, tipo: 'recta' }],
    objetos: [{ tipo: 'obstaculo', x: 400, y: 150, rot: 0, props: { ancho: 100, largo: 100, alto: 100 } }] }));
  const e = correr(mundo, () => A(1), 2, { x: 100, y: 150, yaw: 0 }).at(-1)!;
  expect(e.choque).toBe(true);
  expect(e.x + ROBOT_POR_DEFECTO.chasis.xDelantero).toBeLessThanOrEqual(351);
  expect(e.patinaIzq || e.ruedaIzq > 100).toBe(true);
});
