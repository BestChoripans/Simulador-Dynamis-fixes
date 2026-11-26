import { aLocal } from '../pista/baldosas';
import { crearCapas } from '../pista/capas';
import { figurasDe, type Figura } from '../pista/catalogo';
import { COLOR_CINTA, COLOR_FONDO, type Baldosa, type Pista } from '../pista/tipos';

export interface Rgb { r: number; g: number; b: number }

export interface Superficie {
  /** Color 0–255 del suelo en (x, y); z: la altura de quien mira (debajo de un puente, el suelo). */
  color(x: number, y: number, z?: number): Rgb;
  /** true si (x, y) cae sobre la cinta de la línea (negra, o blanca en una baldosa invertida). */
  esLinea(x: number, y: number, z?: number): boolean;
}

export function hexARgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function contiene(f: Figura, u: number, v: number): boolean {
  if (f.forma === 'rect') return u >= f.u0 && u < f.u1 && v >= f.v0 && v < f.v1;
  const d = Math.hypot(u - f.cu, v - f.cv);
  if (d < f.r0 || d >= f.r1) return false;
  const a = Math.atan2(v - f.cv, u - f.cu);
  return a >= f.a0 && a <= f.a1;
}

/**
 * Color (hex) con que se ve una figura de una baldosa, o su fondo si figura es null. La misma regla
 * sirve para lo que siente el robot y para lo que dibuja la pantalla.
 */
export function colorVisible(b: Baldosa, f: Figura | null): string {
  const invertida = b.props.invertida;
  if (f === null) return invertida ? COLOR_CINTA : COLOR_FONDO;
  if (f.rol === 'linea') return invertida ? COLOR_FONDO : COLOR_CINTA;
  return f.forma === 'rect' && f.color ? f.color : COLOR_CINTA;
}

/**
 * Superficie de la pista: evalúa las figuras del catálogo, las mismas que se dibujan en pantalla.
 * Fuera de la grilla y en celdas sin baldosa hay fondo blanco.
 */
export function crearSuperficie(p: Pista): Superficie {
  const capas = crearCapas(p);
  const figuras = new Map<Baldosa, Figura[]>([...p.baldosas, ...(p.debajo ?? [])].map(b => [b, figurasDe(b, p.colorMarcas)]));
  const fondo = hexARgb(COLOR_FONDO);
  const colores = new Map<string, Rgb>();
  const colorDe = (hex: string) => {
    let rgb = colores.get(hex);
    if (!rgb) colores.set(hex, (rgb = hexARgb(hex)));
    return rgb;
  };

  /** La baldosa bajo (x, y) y la figura visible en ese punto (null = fondo de la baldosa). */
  const consultar = (x: number, y: number, z?: number): { baldosa: Baldosa; figura: Figura | null } | null => {
    const { baldosa } = capas.piso(x, y, z);
    if (!baldosa) return null;
    const { u, v } = aLocal(baldosa, x, y);
    const lista = figuras.get(baldosa)!;
    for (let i = lista.length - 1; i >= 0; i--) if (contiene(lista[i], u, v)) return { baldosa, figura: lista[i] };
    return { baldosa, figura: null };
  };

  return {
    color(x, y, z) {
      const q = consultar(x, y, z);
      if (!q) return { ...fondo };
      return { ...colorDe(colorVisible(q.baldosa, q.figura)) };
    },
    esLinea(x, y, z) {
      return consultar(x, y, z)?.figura?.rol === 'linea';
    },
  };
}
