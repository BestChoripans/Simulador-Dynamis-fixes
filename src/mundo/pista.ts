import { crearCapas } from '../pista/capas';
import type { Baldosa, Pista } from '../pista/tipos';
import { crearObjetos } from './objetos';
import { crearRelieve, type Relieve } from './relieve';
import { crearSuperficie } from './superficie';
import type { Colision, Mundo, Punto2 } from './tipos';

/** El Mundo de una pista, más lo que necesita el juez (y que los modelos no usan). */
export interface MundoPista extends Mundo {
  readonly pista: Pista;
  /** true si (x, y) cae sobre la cinta de la línea (negra, o blanca en una baldosa invertida). z: ver Mundo.altura. */
  esLinea(x: number, y: number, z?: number): boolean;
  /** La baldosa bajo (x, y) (con z, la del piso en que está), o null si la celda está vacía o fuera de la grilla. */
  baldosaEn(x: number, y: number, z?: number): Baldosa | null;
}

/** Puntos de la huella donde se mira si hay un puente encima: las esquinas, el medio de cada lado y el centro. */
function puntosDeHuella(poligono: Punto2[]): Punto2[] {
  const puntos = [...poligono];
  poligono.forEach((a, i) => {
    const b = poligono[(i + 1) % poligono.length];
    puntos.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  });
  const n = poligono.length;
  puntos.push({ x: poligono.reduce((s, p) => s + p.x, 0) / n, y: poligono.reduce((s, p) => s + p.y, 0) / n });
  return puntos;
}

/** El robot (de alto `alto`, apoyado a la altura z) no cabe bajo la tabla de un puente sobre su huella. */
function chocaConPuente(relieve: Relieve, poligono: Punto2[], z: number, alto: number): Colision | null {
  for (const p of puntosDeHuella(poligono)) {
    const techo = relieve.techo(p.x, p.y, z);
    if (techo !== null && techo < z + alto) {
      return { objeto: { tipo: 'puente', x: p.x, y: p.y, rot: 0, props: {} }, penetracion: z + alto - techo };
    }
  }
  return null;
}

export function crearMundo(p: Pista): MundoPista {
  const superficie = crearSuperficie(p);
  const relieve = crearRelieve(p);
  const objetos = crearObjetos(p, relieve);
  const capas = crearCapas(p);
  return {
    pista: p,
    muestrear: superficie.color,
    esLinea: superficie.esLinea,
    altura: relieve.altura,
    inclinacion: relieve.inclinacion,
    raycast: objetos.raycast,
    colisiona(poligono, z, alto) {
      const objeto = objetos.colisiona(poligono, z, alto);
      if (objeto || z === undefined || alto === undefined) return objeto;
      return chocaConPuente(relieve, poligono, z, alto);
    },
    objetosCerca: objetos.objetosCerca,
    baldosaEn(x, y, z) {
      return capas.piso(x, y, z).baldosa;
    },
  };
}
