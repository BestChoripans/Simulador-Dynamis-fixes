import type { Camara3D, Vista3D } from './vista3d';
import type { PunteroPista } from './editor-pista';
import type { Instantanea } from '../simulacion/ejecucion';
import type { Pose } from '../simulacion/simulador';
import type { Pista } from '../pista/tipos';
import type { ConfigRobot } from '../robot/config';

/**
 * El interruptor 2D / 3D de una vista de la pista. El 3D (Three.js) se carga recién la primera vez
 * que se elige, y mientras tanto se recuerda lo último que había que mostrar para dárselo al crearlo.
 * La elección se recuerda en este navegador.
 */
export interface VistaDoble {
  /** debajo: se edita el suelo bajo los puentes. */
  mostrarPista(p: Pista, debajo?: boolean): void;
  cambiarRobot(r: ConfigRobot): void;
  mostrarInstantanea(i: Instantanea): void;
  reiniciar(pose: Pose): void;
  es3D(): boolean;
}

export function crearVistaDoble(raiz: Document, o: {
  /** Nombre de los radio 2d/3d y clave para recordar la elección. */
  nombre: string;
  caja: HTMLElement;
  lienzo2D: HTMLElement;
  robot: ConfigRobot;
  /** Para editar la pista desde el 3D con el puntero. */
  edicion?: PunteroPista;
  /** Al cambiar entre 2D y 3D (por ejemplo, para ocultar lo que solo sirve en 2D). */
  alCambiar?(es3D: boolean): void;
}): VistaDoble {
  const clave = `dynamis.${o.nombre}`;
  const caja3D = o.caja.querySelector<HTMLElement>('.caja-3d')!;
  const camaras = o.caja.querySelector<HTMLElement>('.camaras-3d')!;
  const cargando = o.caja.querySelector<HTMLElement>('.cargando-3d')!;
  const radios = [...raiz.querySelectorAll<HTMLInputElement>(`input[name="${o.nombre}"]`)];
  let local: Storage | null = null;
  try { local = raiz.defaultView?.localStorage ?? null; } catch { local = null; }

  let vista: Vista3D | null = null;
  let cargandoVista: Promise<Vista3D | null> | null = null;
  let activo = false;
  // Lo último que se mostró, para ponerlo al día al crear el 3D.
  let pista: Pista | null = null;
  let debajo = false;
  let robot = o.robot;
  let ultima: Instantanea | null = null;
  let pose: Pose | null = null;

  const marcarCamara = (modo: Camara3D) => {
    for (const b of camaras.querySelectorAll<HTMLButtonElement>('[data-camara]')) b.setAttribute('aria-pressed', String(b.dataset.camara === modo));
  };
  const cargar = () => {
    cargandoVista ??= import('./vista3d').then(({ crearVista3D }) => {
      const v = crearVista3D(caja3D, robot, o.edicion);
      if (pista) v.mostrarPista(pista, debajo);
      if (pose) v.reiniciar(pose);
      if (ultima) v.mostrarInstantanea(ultima);
      caja3D.addEventListener('camara3d', e => marcarCamara((e as CustomEvent<Camara3D>).detail));
      vista = v;
      return v;
    }).catch(() => {
      cargando.textContent = 'No se pudo abrir la vista 3D en este navegador.';
      return null;
    });
    return cargandoVista;
  };

  const usar = async (es3D: boolean) => {
    activo = es3D;
    for (const r of radios) r.checked = r.value === (es3D ? '3d' : '2d');
    o.lienzo2D.hidden = es3D;
    caja3D.hidden = !es3D;
    camaras.hidden = !es3D;
    o.alCambiar?.(es3D);
    try { local?.setItem(clave, es3D ? '3d' : '2d'); } catch { /* se recuerda hasta recargar */ }
    if (!es3D) {
      vista?.activar(false);
      return;
    }
    cargando.hidden = vista !== null;
    const v = await cargar();
    cargando.hidden = true;
    if (v && activo) v.activar(true);
  };

  for (const r of radios) r.addEventListener('change', () => { if (r.checked) void usar(r.value === '3d'); });
  for (const b of camaras.querySelectorAll<HTMLButtonElement>('[data-camara]')) {
    b.addEventListener('click', () => {
      const modo = b.dataset.camara as Camara3D;
      marcarCamara(modo);
      vista?.camara(modo);
    });
  }
  let guardado: string | null = null;
  try { guardado = local?.getItem(clave) ?? null; } catch { guardado = null; }
  if (guardado === '3d') void usar(true);

  return {
    mostrarPista(p, d = false) {
      pista = p;
      debajo = d;
      vista?.mostrarPista(p, d);
    },
    cambiarRobot(r) {
      robot = r;
      vista?.cambiarRobot(r);
    },
    mostrarInstantanea(i) {
      ultima = i;
      vista?.mostrarInstantanea(i);
    },
    reiniciar(p) {
      pose = p;
      ultima = null;
      vista?.reiniciar(p);
    },
    es3D: () => activo,
  };
}
