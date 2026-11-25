import { describe, expect, it } from 'vitest';
import { celdasEntre, ladosDe, rotacionAutomatica, trazarCamino } from '../../src/pista/trazado';
import { baldosaEn, colocarBaldosa } from '../../src/pista/edicion';
import { pistaVacia } from '../../src/pista/serializacion';
import type { Pista } from '../../src/pista/tipos';

/** Traza un camino de celdas, como al arrastrar el lápiz. */
function trazar(p: Pista, camino: [number, number][], estilo: 'giroSuave' | 'giroL' = 'giroSuave'): Pista {
  return trazarCamino(p, camino.map(([c, r]) => ({ c, r })), estilo);
}
const lados = (p: Pista, c: number, r: number) => [...ladosDe(baldosaEn(p, c, r))].sort();

describe('dibujar la línea', () => {
  it('una línea derecha pone rectas en su eje', () => {
    const p = trazar(pistaVacia(), [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
    expect(baldosaEn(p, 1, 0)).toMatchObject({ tipo: 'recta', rot: 0 });
    expect(baldosaEn(p, 2, 1)).toMatchObject({ tipo: 'recta', rot: 90 });
    expect(lados(p, 0, 0)).toEqual(['este', 'oeste']);
  });

  it('las esquinas son giros con la rotación justa (suaves o en L)', () => {
    for (const estilo of ['giroSuave', 'giroL'] as const) {
      const p = trazar(pistaVacia(), [[0, 0], [1, 0], [1, 1], [0, 1]], estilo);
      expect(baldosaEn(p, 1, 0)!.tipo).toBe(estilo);
      expect(lados(p, 1, 0)).toEqual(['norte', 'oeste']);
      expect(lados(p, 1, 1)).toEqual(['oeste', 'sur']);
    }
  });

  it('cruzar una línea hace un cruce, y salir de una hace una unión en T', () => {
    let p = trazar(pistaVacia(), [[0, 1], [1, 1], [2, 1]]);
    p = trazar(p, [[1, 0], [1, 1], [1, 2]]);
    expect(baldosaEn(p, 1, 1)!.tipo).toBe('cruce');
    p = trazar(pistaVacia(), [[0, 1], [1, 1], [2, 1]]);
    p = trazar(p, [[1, 1], [1, 2]]);
    expect(baldosaEn(p, 1, 1)!.tipo).toBe('unionT');
    expect(lados(p, 1, 1)).toEqual(['este', 'norte', 'oeste']);
  });

  it('una rampa o una recta con cortes se conservan si la línea sigue derecho por ellas', () => {
    let p = colocarBaldosa(pistaVacia(), 1, 0, 'rampa', 0);
    p = colocarBaldosa(p, 2, 0, 'cortes', 180);
    p = trazar(p, [[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(baldosaEn(p, 1, 0)!.tipo).toBe('rampa');
    expect(baldosaEn(p, 2, 0)).toMatchObject({ tipo: 'cortes', rot: 180 });
  });

  it('las marcas de un cruce se conservan', () => {
    let p = colocarBaldosa(pistaVacia(), 1, 1, 'unionT', 0, { rama: 'izq', marcas: { ai: true } });
    p = trazar(p, [[1, 1], [1, 0]]);
    expect(baldosaEn(p, 1, 1)).toMatchObject({ tipo: 'cruce', props: { marcas: { ai: true } } });
  });

  it('seguir dibujando desde el final de una línea dobla, no hace una T', () => {
    let p = trazar(pistaVacia(), [[0, 0], [1, 0], [2, 0]]);
    p = trazar(p, [[2, 0], [2, 1], [2, 2]]);
    expect(baldosaEn(p, 2, 0)!.tipo).toBe('giroSuave');
    expect(lados(p, 2, 0)).toEqual(['norte', 'oeste']);
    // Desde el medio de una línea sí sale una T.
    p = trazar(p, [[1, 0], [1, 1]]);
    expect(baldosaEn(p, 1, 0)!.tipo).toBe('unionT');
  });

  it('volver sobre el mismo camino no deja piezas de más', () => {
    const p = trazar(pistaVacia(), [[0, 0], [1, 0], [2, 0], [1, 0]]);
    expect(lados(p, 1, 0)).toEqual(['este', 'oeste']);
  });

  it('arrastrar rápido no se salta celdas', () => {
    expect(celdasEntre({ c: 0, r: 0 }, { c: 2, r: 1 })).toEqual([{ c: 1, r: 0 }, { c: 2, r: 0 }, { c: 2, r: 1 }]);
  });
});

describe('rotación automática', () => {
  it('una pieza nueva gira para unirse a la línea que llega', () => {
    const p = trazar(pistaVacia(), [[0, 0], [1, 0], [1, 1]]);
    // Recta junto a la que sube por (1, 1): vertical.
    expect(rotacionAutomatica(p, 1, 2, 'recta', {}, 0)).toBe(90);
    // Un giro en (2, 0)? (1, 0) es una esquina sin salida al este: no se une a nada y queda como estaba.
    expect(rotacionAutomatica(p, 2, 0, 'giroSuave', {}, 0)).toBe(0);
    // La partida al lado de una recta que sale hacia el este: mira al este.
    const q = trazar(pistaVacia(), [[1, 0], [2, 0], [3, 0]]);
    expect(rotacionAutomatica(q, 0, 0, 'partida', {}, 90)).toBe(0);
  });
});
