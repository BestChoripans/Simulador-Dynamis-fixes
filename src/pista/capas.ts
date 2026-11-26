import { aLocal, celdaDe } from './baldosas';
import { gradosARadianes } from './serializacion';
import { TAMANO_BALDOSA as T, type Baldosa, type Pista } from './tipos';

/**
 * Puentes: las rampas y las baldosas elevadas (nivel > 0) son tablas sobre patas, y debajo puede
 * pasar otra línea (`pista.debajo`, baldosas en el suelo). Un punto tiene entonces dos pisos: el del
 * puente y el suelo. Lo que está más bajo que el puente (por más que lo que sube una rueda) usa el
 * suelo; lo que no, el puente.
 */

/** Lo que una rueda puede subir de un paso: más abajo que esto del puente, se está debajo de él (mm). */
export const SUBIDA_MAXIMA_MM = 60;
/** Grosor de la tabla de un puente (mm). */
export const GROSOR_PUENTE_MM = 12;

/** Altura de una baldosa en su marco local: su nivel, más la subida si es una rampa (sube hacia +u). */
export function alturaBaldosa(b: Baldosa, u: number, _v: number): number {
  return b.tipo === 'rampa' ? b.nivel + u * Math.tan(gradosARadianes(b.props.angulo)) : b.nivel;
}

/** true si la baldosa es un puente: una rampa o una baldosa elevada. */
export function esElevada(b: Baldosa | null | undefined): boolean {
  return !!b && (b.tipo === 'rampa' || b.nivel > 0.5);
}

/** Altura de la tabla de una baldosa en un punto del mundo (acotado a la baldosa). */
export function alturaEnBaldosa(b: Baldosa, x: number, y: number): number {
  const { u, v } = aLocal(b, x, y);
  const acotar = (n: number) => Math.min(T, Math.max(0, n));
  return alturaBaldosa(b, acotar(u), acotar(v));
}

export interface Capas {
  /** La baldosa de arriba (la de `baldosas`) en (c, r). */
  arriba(c: number, r: number): Baldosa | null;
  /** La baldosa del suelo bajo un puente en (c, r). */
  debajo(c: number, r: number): Baldosa | null;
  /**
   * El piso en (x, y) para algo a la altura z: la baldosa (o null si es suelo sin pieza) y si es la
   * tabla de un puente. Sin z, el de arriba (lo que se ve desde arriba).
   */
  piso(x: number, y: number, z?: number): { baldosa: Baldosa | null; enPuente: boolean };
  /** Si (x, y) a la altura z queda debajo de un puente: la altura de la cara de abajo de la tabla. */
  techo(x: number, y: number, z: number): number | null;
}

function indice(p: Pista, lista: Baldosa[]): (c: number, r: number) => Baldosa | null {
  const celdas: (Baldosa | null)[] = new Array(p.columnas * p.filas).fill(null);
  for (const b of lista) if (b.c >= 0 && b.r >= 0 && b.c < p.columnas && b.r < p.filas) celdas[b.r * p.columnas + b.c] = b;
  return (c, r) => (c >= 0 && r >= 0 && c < p.columnas && r < p.filas ? celdas[r * p.columnas + c] : null);
}

export function crearCapas(p: Pista): Capas {
  const arriba = indice(p, p.baldosas);
  const debajo = indice(p, p.debajo ?? []);
  const piso = (x: number, y: number, z?: number) => {
    const { c, r } = celdaDe(x, y);
    const b = arriba(c, r);
    if (!esElevada(b)) return { baldosa: b, enPuente: false };
    if (z !== undefined && z < alturaEnBaldosa(b!, x, y) - SUBIDA_MAXIMA_MM) return { baldosa: debajo(c, r), enPuente: false };
    return { baldosa: b, enPuente: true };
  };
  return {
    arriba,
    debajo,
    piso,
    techo(x, y, z) {
      const { c, r } = celdaDe(x, y);
      const b = arriba(c, r);
      if (!esElevada(b)) return null;
      const tabla = alturaEnBaldosa(b!, x, y);
      return z < tabla - SUBIDA_MAXIMA_MM ? tabla - GROSOR_PUENTE_MM : null;
    },
  };
}

/**
 * El suelo de la pista como una pista de un solo piso: las baldosas del suelo (las de arriba que no
 * son puentes y las de debajo de los puentes). Es lo que se edita con «Ver debajo de los puentes».
 */
export function capaSuelo(p: Pista): Pista {
  const { debajo: _, ...resto } = p;
  return { ...resto, baldosas: [...p.baldosas.filter(b => !esElevada(b)), ...(p.debajo ?? [])] };
}

/**
 * Vuelve a armar la pista con el suelo editado: lo que queda bajo un puente va a `debajo` (siempre
 * en el suelo) y lo demás, arriba. Si en el suelo se puso un puente (una rampa o una baldosa
 * elevada), pasa a ser la baldosa de arriba.
 */
export function conCapaSuelo(p: Pista, suelo: Pista): Pista {
  const puentes = new Map(p.baldosas.filter(esElevada).map(b => [`${b.c},${b.r}`, b]));
  for (const b of suelo.baldosas) if (esElevada(b)) puentes.set(`${b.c},${b.r}`, b);
  const arriba: Baldosa[] = [...puentes.values()];
  const debajo: Baldosa[] = [];
  for (const b of suelo.baldosas) {
    if (esElevada(b)) continue;
    if (puentes.has(`${b.c},${b.r}`)) debajo.push({ ...b, nivel: 0 } as Baldosa);
    else arriba.push(b);
  }
  const { debajo: _, ...resto } = suelo;
  return ordenarCapas({ ...resto, baldosas: arriba, ...(debajo.length > 0 ? { debajo } : {}) });
}

/**
 * Deja las capas en orden: una baldosa de `debajo` cuya celda ya no tiene puente pasa arriba (si la
 * celda quedó vacía) o se descarta (si arriba hay otra pieza en el suelo).
 */
export function ordenarCapas(p: Pista): Pista {
  if (!p.debajo) return p;
  const arriba = new Map(p.baldosas.map(b => [`${b.c},${b.r}`, b]));
  const quedan: Baldosa[] = [];
  const suben: Baldosa[] = [];
  for (const b of p.debajo) {
    const sobre = arriba.get(`${b.c},${b.r}`);
    if (esElevada(sobre)) quedan.push(b);
    else if (!sobre) suben.push(b);
  }
  if (quedan.length === p.debajo.length) return p;
  const { debajo: _, ...resto } = p;
  return { ...resto, baldosas: [...p.baldosas, ...suben], ...(quedan.length > 0 ? { debajo: quedan } : {}) };
}
