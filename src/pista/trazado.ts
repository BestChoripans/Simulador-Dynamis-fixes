import { ladoEnMundo } from './baldosas';
import { bocasDe } from './catalogo';
import { baldosaEn, colocarBaldosa } from './edicion';
import type { Baldosa, Lado, Pista, Rotacion, TipoBaldosa } from './tipos';

/**
 * Dibujar la línea arrastrando por la grilla: cada paso entre dos celdas vecinas une sus bordes, y
 * cada celda queda con la pieza que tiene esas salidas (recta, giro, unión en T o cruce) y la
 * rotación correcta. Funciones puras, como las de edicion.ts.
 */
export type EstiloCurva = 'giroSuave' | 'giroL';
export interface Celda { c: number; r: number }

const ROTACIONES: Rotacion[] = [0, 90, 180, 270];
const OPUESTO: Record<Lado, Lado> = { este: 'oeste', oeste: 'este', norte: 'sur', sur: 'norte' };
const VECINO: Record<Lado, [number, number]> = { este: [1, 0], oeste: [-1, 0], norte: [0, 1], sur: [0, -1] };
/** Piezas rectas que se pueden conservar si la línea sigue por su mismo eje. */
const RECTAS: ReadonlySet<TipoBaldosa> = new Set(['recta', 'cortes', 'rampa', 'indicadorF2', 'cuadradoF1', 'partida']);
/** Piezas de línea simple, a las que se les puede quitar un brazo suelto al seguir dibujando. */
const SIMPLES: ReadonlySet<TipoBaldosa> = new Set(['recta', 'giroSuave', 'giroL']);

/** Los bordes del mundo por donde sale la línea de una baldosa. */
export function ladosDe(b: Baldosa | null): Set<Lado> {
  return new Set(b ? bocasDe(b).map(l => ladoEnMundo(b, l)) : []);
}

const iguales = (a: Set<Lado>, b: Set<Lado>) => a.size === b.size && [...a].every(l => b.has(l));

/** Las rotaciones con que una pieza sale exactamente por esos bordes. */
function rotacionesPara(tipo: TipoBaldosa, props: Record<string, unknown>, lados: Set<Lado>): Rotacion[] {
  return ROTACIONES.filter(rot => iguales(ladosDe({ c: 0, r: 0, rot, nivel: 0, tipo, props } as Baldosa), lados));
}

/** Hacia qué lado está la celda b vista desde a (vecinas), o null. */
export function ladoHacia(a: Celda, b: Celda): Lado | null {
  for (const [lado, [dc, dr]] of Object.entries(VECINO) as [Lado, [number, number]][]) {
    if (a.c + dc === b.c && a.r + dr === b.r) return lado;
  }
  return null;
}

/** Las celdas de a hasta b de a una por vez (sin diagonales), para no saltarse celdas al arrastrar rápido. */
export function celdasEntre(a: Celda, b: Celda): Celda[] {
  const pasos: Celda[] = [];
  let { c, r } = a;
  while (c !== b.c || r !== b.r) {
    const dc = b.c - c;
    const dr = b.r - r;
    if (Math.abs(dc) >= Math.abs(dr)) c += Math.sign(dc);
    else r += Math.sign(dr);
    pasos.push({ c, r });
  }
  return pasos;
}

/**
 * La pieza que sale por esos bordes. Conserva la que había si ya sirve (por ejemplo, una rampa o
 * una recta con cortes por la que la línea sigue derecho, o las marcas de un cruce).
 */
function piezaPara(lados: Set<Lado>, existente: Baldosa | null, estilo: EstiloCurva): { tipo: TipoBaldosa; rot: Rotacion; props: Record<string, unknown> } | null {
  if (existente && iguales(ladosDe(existente), lados)) return null;
  const marcas = existente && (existente.tipo === 'cruce' || existente.tipo === 'unionT') ? { marcas: existente.props.marcas } : {};
  const lista = [...lados];
  if (lista.length === 1 || (lista.length === 2 && OPUESTO[lista[0]] === lista[1])) {
    const horizontal = lista[0] === 'este' || lista[0] === 'oeste';
    // Una pieza recta que ya estaba en ese eje se queda (girada si hace falta para seguir sirviendo).
    if (existente && RECTAS.has(existente.tipo)) {
      const suyos = [...ladosDe(existente)];
      if ((suyos[0] === 'este' || suyos[0] === 'oeste') === horizontal) return null;
    }
    return { tipo: 'recta', rot: horizontal ? 0 : 90, props: {} };
  }
  if (lista.length === 2) {
    const tipo: TipoBaldosa = existente && (existente.tipo === 'giroSuave' || existente.tipo === 'giroL') ? existente.tipo : estilo;
    return { tipo, rot: rotacionesPara(tipo, {}, lados)[0], props: {} };
  }
  if (lista.length === 3) {
    for (const rama of ['izq', 'der'] as const) {
      const rot = rotacionesPara('unionT', { rama }, lados)[0];
      if (rot !== undefined) return { tipo: 'unionT', rot, props: { ...marcas, rama } };
    }
  }
  return { tipo: 'cruce', rot: existente?.tipo === 'cruce' ? existente.rot : 0, props: marcas };
}

/** Pone en (c, r) la pieza que sale por `lados`, si cambia algo. */
function conLados(p: Pista, celda: Celda, lados: Set<Lado>, estilo: EstiloCurva): Pista {
  const existente = baldosaEn(p, celda.c, celda.r);
  const pieza = piezaPara(lados, existente, estilo);
  return pieza ? colocarBaldosa(p, celda.c, celda.r, pieza.tipo, pieza.rot, pieza.props) : p;
}

/**
 * El trazo completo de un arrastre, calculado desde la pista de antes de empezar: cada celda del
 * camino queda con las salidas que tenía más las que le agrega el camino. Así, una celda que el
 * trazo acaba de crear como extremo no se cuenta como una recta con dos salidas al seguir.
 */
export function trazarCamino(base: Pista, camino: Celda[], estilo: EstiloCurva): Pista {
  const dentro = (k: Celda) => k.c >= 0 && k.r >= 0 && k.c < base.columnas && k.r < base.filas;
  const agregados = new Map<string, { celda: Celda; lados: Set<Lado> }>();
  const agregar = (k: Celda, lado: Lado) => {
    const clave = `${k.c},${k.r}`;
    if (!agregados.has(clave)) agregados.set(clave, { celda: k, lados: new Set() });
    agregados.get(clave)!.lados.add(lado);
  };
  for (let i = 1; i < camino.length; i++) {
    const a = camino[i - 1];
    const b = camino[i];
    const lado = ladoHacia(a, b);
    if (!lado || !dentro(a) || !dentro(b)) continue;
    agregar(a, lado);
    agregar(b, OPUESTO[lado]);
  }
  let p = base;
  for (const { celda, lados } of agregados.values()) {
    const existente = baldosaEn(base, celda.c, celda.r);
    const todos = ladosDe(existente);
    // Una recta o un giro con un brazo suelto (sin línea al otro lado) es el final de una línea:
    // al seguir dibujando desde ahí, ese brazo se quita para que la línea doble en vez de hacer una T.
    if (existente && SIMPLES.has(existente.tipo)) {
      for (const l of [...todos]) {
        const [dc, dr] = VECINO[l];
        if (!lados.has(l) && !ladosDe(baldosaEn(base, celda.c + dc, celda.r + dr)).has(OPUESTO[l])) todos.delete(l);
      }
    }
    for (const l of lados) todos.add(l);
    p = conLados(p, celda, todos, estilo);
  }
  return p;
}

/** Une dos celdas vecinas con la línea (un trazo de un paso). */
export function trazarTramo(p: Pista, a: Celda, b: Celda, estilo: EstiloCurva): Pista {
  return trazarCamino(p, [a, b], estilo);
}

/**
 * La rotación con que una pieza nueva en (c, r) se une mejor a sus vecinas: suma por cada salida que
 * encuentra una línea que llega, y resta por cada salida que da a una baldosa sin línea hacia acá.
 * Si ninguna rotación se une a nada, se queda la actual.
 */
export function rotacionAutomatica(p: Pista, c: number, r: number, tipo: TipoBaldosa, props: Record<string, unknown>, actual: Rotacion): Rotacion {
  const llegan = new Set<Lado>();
  const tapadas = new Set<Lado>();
  for (const [lado, [dc, dr]] of Object.entries(VECINO) as [Lado, [number, number]][]) {
    const vecina = baldosaEn(p, c + dc, r + dr);
    if (!vecina) continue;
    if (ladosDe(vecina).has(OPUESTO[lado])) llegan.add(lado);
    else tapadas.add(lado);
  }
  if (llegan.size === 0) return actual;
  let mejor = actual;
  let mejorPuntaje = -Infinity;
  for (const rot of [actual, ...ROTACIONES.filter(x => x !== actual)]) {
    const lados = ladosDe({ c, r, rot, nivel: 0, tipo, props } as Baldosa);
    let puntaje = 0;
    for (const l of lados) puntaje += llegan.has(l) ? 2 : tapadas.has(l) ? -1 : 0;
    // Una línea que llega y no encuentra salida también cuenta en contra.
    for (const l of llegan) if (!lados.has(l)) puntaje -= 1;
    if (puntaje > mejorPuntaje) {
      mejor = rot;
      mejorPuntaje = puntaje;
    }
  }
  return mejor;
}
