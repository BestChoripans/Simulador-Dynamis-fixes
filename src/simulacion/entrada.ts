/**
 * Lo que la página le escribe al robot mientras corre (Serial y Bluetooth). El worker no atiende
 * mensajes mientras corre el programa, así que cada canal es un búfer circular en memoria
 * compartida: la página escribe y el programa lee en cada Serial.read() o SerialBT.read().
 */
export const CAPACIDAD_ENTRADA = 4096;
const IDX = { escritos: 0, leidos: 1, conectado: 2 } as const;
const CABECERA_BYTES = 4 * Int32Array.BYTES_PER_ELEMENT;

export interface Canal {
  readonly memoria: SharedArrayBuffer;
  readonly cabecera: Int32Array;
  readonly datos: Uint8Array;
}

export function crearCanal(): Canal {
  return canalDe(new SharedArrayBuffer(CABECERA_BYTES + CAPACIDAD_ENTRADA));
}

export function canalDe(memoria: SharedArrayBuffer): Canal {
  return { memoria, cabecera: new Int32Array(memoria, 0, 4), datos: new Uint8Array(memoria, CABECERA_BYTES, CAPACIDAD_ENTRADA) };
}

export function disponibles(c: Canal): number {
  return Atomics.load(c.cabecera, IDX.escritos) - Atomics.load(c.cabecera, IDX.leidos);
}

/** Escribe lo que cabe y devuelve cuántos bytes entraron (como el búfer de recepción del ESP32). */
export function escribirCanal(c: Canal, bytes: Uint8Array): number {
  const escritos = Atomics.load(c.cabecera, IDX.escritos);
  const cabe = Math.min(bytes.length, CAPACIDAD_ENTRADA - disponibles(c));
  for (let i = 0; i < cabe; i++) c.datos[(escritos + i) % CAPACIDAD_ENTRADA] = bytes[i];
  Atomics.store(c.cabecera, IDX.escritos, escritos + cabe);
  return cabe;
}

export function espiarCanal(c: Canal): number {
  if (disponibles(c) <= 0) return -1;
  return c.datos[Atomics.load(c.cabecera, IDX.leidos) % CAPACIDAD_ENTRADA];
}

export function leerCanal(c: Canal): number {
  const byte = espiarCanal(c);
  if (byte >= 0) Atomics.add(c.cabecera, IDX.leidos, 1);
  return byte;
}

/** Bota lo que no se alcanzó a leer (al desconectar el teléfono). */
export function vaciarCanal(c: Canal): void {
  Atomics.store(c.cabecera, IDX.leidos, Atomics.load(c.cabecera, IDX.escritos));
}

/** Si el teléfono simulado está conectado (solo el canal Bluetooth lo usa). */
export function conectado(c: Canal): boolean {
  return Atomics.load(c.cabecera, IDX.conectado) === 1;
}

export function fijarConectado(c: Canal, si: boolean): void {
  Atomics.store(c.cabecera, IDX.conectado, si ? 1 : 0);
}

/** Los dos canales de una prueba. */
export interface Entrada { serial: Canal; bluetooth: Canal }

export function crearEntrada(): Entrada {
  return { serial: crearCanal(), bluetooth: crearCanal() };
}
