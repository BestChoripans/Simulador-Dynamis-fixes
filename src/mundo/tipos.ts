/**
 * Contrato del mundo: primitivas geométricas que usan los modelos.
 * Marco del mundo: x derecha, y arriba, z arriba (mm); yaw antihorario desde +x (rad).
 */
export interface Punto2 { x: number; y: number }
export interface Punto3 { x: number; y: number; z: number }

export interface ObjetoPista { tipo: string; x: number; y: number; rot: number; props: Record<string, unknown> }
export interface ImpactoRayo { distancia: number; objeto: ObjetoPista | null; normal: Punto3 }
export interface Colision { objeto: ObjetoPista; penetracion: number }

export interface Mundo {
  /**
   * Color 0–255 de la superficie en (x, y). z (opcional): la altura del sensor; debajo de un puente
   * se ve el suelo, no la tabla.
   */
  muestrear(x: number, y: number, z?: number): { r: number; g: number; b: number };
  /**
   * Altura del suelo en mm (rampas, plataformas, baches). z (opcional): la altura de quien pregunta;
   * debajo de un puente es la del suelo. Sin z, la de arriba.
   */
  altura(x: number, y: number, z?: number): number;
  /** Inclinación del suelo bajo (x, y) para un robot con rumbo yaw (rad). */
  inclinacion(x: number, y: number, yaw: number, z?: number): { pitch: number; roll: number };
  raycast(origen: Punto3, dir: Punto3, max: number): ImpactoRayo | null;
  /**
   * El objeto con que choca la huella. Con z y alto (la altura del piso del robot y su alto, mm)
   * también la tabla de un puente bajo la que no cabe, y no los objetos de otro piso.
   */
  colisiona(poligono: Punto2[], z?: number, alto?: number): Colision | null;
  objetosCerca(x: number, y: number, radio: number): ObjetoPista[];
}
