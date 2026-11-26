import { aLocal } from '../pista/baldosas';
import { alturaBaldosa, crearCapas, GROSOR_PUENTE_MM } from '../pista/capas';
import { gradosARadianes } from '../pista/serializacion';
import type { Bache, Pista } from '../pista/tipos';

export { alturaBaldosa };

/**
 * Relieve analítico de la pista: nivel de cada baldosa, subida de las rampas y
 * perfil de medio cilindro de los baches. No usa un raster.
 */
export interface Relieve {
  /**
   * Altura del suelo en mm. z: la altura de quien pregunta (por ejemplo, el robot): debajo de un
   * puente es la del suelo; sin z, la de arriba.
   */
  altura(x: number, y: number, z?: number): number;
  /** Pendiente del suelo (mm/mm) hacia +x y hacia +y. */
  gradiente(x: number, y: number, z?: number): { dx: number; dy: number };
  /** Inclinación de un robot con rumbo yaw (rad): pitch < 0 con la nariz arriba, roll > 0 con el lado izquierdo arriba (REP-103). */
  inclinacion(x: number, y: number, yaw: number, z?: number): { pitch: number; roll: number };
  /** true si el punto (x, y, z) está dentro de algo sólido: bajo el suelo o en la tabla de un puente. */
  solido(x: number, y: number, z: number): boolean;
  /** Si (x, y) a la altura z queda debajo de un puente: la altura de la cara de abajo de la tabla. */
  techo(x: number, y: number, z: number): number | null;
}

const DELTA = 0.5;
/** Las pruebas comparan con toEqual, que distingue −0 de 0. */
const sinMenosCero = (x: number) => (x === 0 ? 0 : x);

export function crearRelieve(p: Pista): Relieve {
  const capas = crearCapas(p);
  const baches = p.objetos
    .filter((o): o is Bache => o.tipo === 'bache')
    .map(b => {
      const angulo = gradosARadianes(b.rot);
      // Un bache en una celda con puente está sobre la tabla.
      const enPuente = capas.piso(b.x, b.y).enPuente;
      return { x: b.x, y: b.y, cos: Math.cos(angulo), sin: Math.sin(angulo), medioLargo: b.props.largo / 2, radio: b.props.radio, enPuente };
    });

  const altura = (x: number, y: number, z?: number): number => {
    const { baldosa, enPuente } = capas.piso(x, y, z);
    let h = 0;
    if (baldosa) {
      const { u, v } = aLocal(baldosa, x, y);
      h = alturaBaldosa(baldosa, u, v);
    }
    for (const k of baches) {
      if (k.enPuente !== enPuente) continue;
      const dx = x - k.x;
      const dy = y - k.y;
      const a = dx * k.cos + dy * k.sin;
      const d = -dx * k.sin + dy * k.cos;
      if (Math.abs(a) <= k.medioLargo && Math.abs(d) < k.radio) h += Math.sqrt(k.radio * k.radio - d * d);
    }
    return h;
  };

  const gradiente = (x: number, y: number, z?: number) => ({
    dx: sinMenosCero((altura(x + DELTA, y, z) - altura(x - DELTA, y, z)) / (2 * DELTA)),
    dy: sinMenosCero((altura(x, y + DELTA, z) - altura(x, y - DELTA, z)) / (2 * DELTA)),
  });

  const inclinacion = (x: number, y: number, yaw: number, z?: number) => {
    const { dx, dy } = gradiente(x, y, z);
    const adelante = dx * Math.cos(yaw) + dy * Math.sin(yaw);
    const izquierda = -dx * Math.sin(yaw) + dy * Math.cos(yaw);
    return {
      pitch: sinMenosCero(-Math.atan(adelante)),
      roll: sinMenosCero(Math.asin(izquierda / Math.sqrt(1 + adelante * adelante + izquierda * izquierda))),
    };
  };

  const solido = (x: number, y: number, z: number): boolean => {
    if (z <= altura(x, y, z)) return true;
    const techo = capas.techo(x, y, z);
    return techo !== null && z >= techo && z <= techo + GROSOR_PUENTE_MM;
  };

  return { altura, gradiente, inclinacion, solido, techo: capas.techo };
}
