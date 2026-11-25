import { PALETA, type Pieza } from './paleta';
import { dibujarMarcasEditor, dibujarMiniatura, dibujarPista, type MarcasEditor } from './dibujo';
import { aMundoDesde, aPantalla, vistaInicial, type Vista } from './vista';
import { registrarPrueba } from './pruebas';
import { confirmar } from './dialogo';
import {
  agregarObjeto, baldosaEn, colocarBaldosa, COLUMNAS, FILAS, girarBaldosa, girarObjeto, moverInicio, moverObjeto,
  quitarObjeto, redimensionar, vaciarCelda,
} from '../pista/edicion';
import { celdaDe } from '../pista/baldosas';
import { celdasEntre, rotacionAutomatica, trazarCamino, type EstiloCurva } from '../pista/trazado';
import { revisarPista } from '../pista/revision';
import { gradosARadianes, pistaVacia } from '../pista/serializacion';
import { TAMANO_BALDOSA as T, type Baldosa, type ObjetoDePista, type Pista } from '../pista/tipos';

export type Seleccion = { clase: 'baldosa'; c: number; r: number } | { clase: 'objeto'; indice: number } | { clase: 'inicio' };

export interface EditorPista {
  /** Muestra otra pista (abierta o nueva) sin avisar un cambio. */
  mostrar(p: Pista): void;
  /** Aplica un cambio hecho fuera del lienzo (el panel): conserva lo elegido si sigue existiendo y avisa el cambio. */
  editar(p: Pista): void;
  pista(): Pista;
  seleccion(): Seleccion | null;
  elegir(sel: Seleccion | null): void;
  /** La pieza que se coloca con cada clic, o null con la herramienta Elegir. */
  herramienta(): Pieza | null;
}

type Celda = { c: number; r: number };
type Punto = { x: number; y: number };

const FONDO = '#EAF5FD';
const LADO_MINIATURA_PX = 64;
const FLECHAS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
/** Un clic a menos de esto de un hito o un desafío lo elige (mm). */
const RADIO_PUNTO_MM = 40;
/** El inicio se dibuja como una flecha detrás de su punto: se elige alrededor de ella. */
const ATRAS_INICIO_MM = 40;
const RADIO_INICIO_MM = 60;
/** Margen para elegir un obstáculo o un bache angosto (mm). */
const MARGEN_MM = 15;
/** Moverse menos que esto (px) es un clic, no un arrastre. */
const UMBRAL_ARRASTRE_PX = 4;
/** Cuántos cambios se pueden deshacer. */
const MAXIMO_HISTORIAL = 100;
type Modo = 'elegir' | 'pieza' | 'lapiz' | 'goma';
const AYUDA: Record<Modo, string> = {
  elegir: 'Haz clic en una baldosa u objeto para ver sus propiedades; arrastra objetos y el inicio para moverlos; doble clic gira una baldosa.',
  pieza: 'Haz clic en la grilla para poner la pieza: se gira sola para unirse a la línea. R la gira, Esc vuelve a Elegir.',
  lapiz: 'Arrastra por la grilla: la línea pone rectas, curvas, uniones en T y cruces sola. Pasar sobre otra línea hace un cruce.',
  goma: 'Arrastra sobre las baldosas y objetos que quieras borrar. Ctrl+Z los recupera.',
};

const centroDeCelda = ({ c, r }: Celda): Punto => ({ x: (c + 0.5) * T, y: (r + 0.5) * T });
const centroInicio = (p: Pista): Punto => {
  const yaw = gradosARadianes(p.inicio.yaw);
  return { x: p.inicio.x - ATRAS_INICIO_MM * Math.cos(yaw), y: p.inicio.y - ATRAS_INICIO_MM * Math.sin(yaw) };
};

/** (x, y) en el marco del objeto girado: u a lo largo de su `rot`, v de través. */
function enObjeto(o: ObjetoDePista, x: number, y: number): { u: number; v: number } {
  const a = gradosARadianes(o.rot);
  const dx = x - o.x;
  const dy = y - o.y;
  return { u: dx * Math.cos(a) + dy * Math.sin(a), v: -dx * Math.sin(a) + dy * Math.cos(a) };
}

function tocaObjeto(o: ObjetoDePista, x: number, y: number): boolean {
  const { u, v } = enObjeto(o, x, y);
  switch (o.tipo) {
    case 'obstaculo': return Math.abs(u) <= o.props.largo / 2 + MARGEN_MM && Math.abs(v) <= o.props.ancho / 2 + MARGEN_MM;
    case 'bache': return Math.abs(u) <= o.props.largo / 2 + MARGEN_MM && Math.abs(v) <= o.props.radio + MARGEN_MM;
    default: return Math.hypot(u, v) <= RADIO_PUNTO_MM;
  }
}

/** Lo que hay bajo (x, y) con la herramienta Elegir: gana lo último dibujado (el inicio, después los objetos). */
function loQueHayEn(p: Pista, x: number, y: number): Seleccion | null {
  const c = centroInicio(p);
  if (Math.hypot(x - c.x, y - c.y) <= RADIO_INICIO_MM) return { clase: 'inicio' };
  for (let i = p.objetos.length - 1; i >= 0; i--) if (tocaObjeto(p.objetos[i], x, y)) return { clase: 'objeto', indice: i };
  return null;
}

function anilloDe(p: Pista, sel: Seleccion | null): MarcasEditor['anillo'] {
  if (sel?.clase === 'inicio') return { ...centroInicio(p), radio: RADIO_INICIO_MM };
  if (sel?.clase !== 'objeto' || !p.objetos[sel.indice]) return null;
  const o = p.objetos[sel.indice];
  const radio = o.tipo === 'obstaculo' ? Math.hypot(o.props.largo, o.props.ancho) / 2 + MARGEN_MM
    : o.tipo === 'bache' ? o.props.largo / 2 + MARGEN_MM : RADIO_PUNTO_MM + 10;
  return { x: o.x, y: o.y, radio };
}

/**
 * La vista Construir pista: la paleta, la grilla, el nombre y el tamaño de la pista.
 * Con Elegir, un clic elige una baldosa, un objeto o el inicio, y arrastrar mueve el objeto o el
 * inicio. Con una baldosa, cada clic la coloca y la elige; con un objeto o el inicio, el clic lo
 * pone y vuelve a Elegir. Con el teclado: flechas, Enter, R (Mayús+R al revés), Supr y Esc.
 */
export function crearEditorPista(raiz: Document, eventos: { alCambiar(p: Pista): void; alElegir(sel: Seleccion | null): void }): EditorPista {
  const $ = <E extends HTMLElement>(id: string) => raiz.getElementById(id) as E;
  const canvas = $<HTMLCanvasElement>('lienzo-editor');
  const ctx = canvas.getContext('2d')!;
  const chip = $('chip-herr');
  const botonLapiz = $<HTMLButtonElement>('btn-lapiz');
  const botonGoma = $<HTMLButtonElement>('btn-goma');
  const botonDeshacer = $<HTMLButtonElement>('btn-deshacer');
  const botonRehacer = $<HTMLButtonElement>('btn-rehacer');
  const selectorCurva = $<HTMLSelectElement>('estilo-curva');
  const ayuda = $('ayuda-herr');
  const chipTamano = $('chip-tamano');
  const botonElegir = $('btn-elegir');
  const inputNombre = $<HTMLInputElement>('pista-nombre');
  const inputColumnas = $<HTMLInputElement>('pista-columnas');
  const inputFilas = $<HTMLInputElement>('pista-filas');
  const dpr = () => window.devicePixelRatio || 1;

  let pista: Pista = pistaVacia();
  let celdasConAvisos: Celda[] = [];
  let sel: Seleccion | null = null;
  let herramienta: Pieza | null = null;
  let modo: Modo = 'elegir';
  const deshacer: Pista[] = [];
  const rehacer: Pista[] = [];
  /** Un trazo del lápiz o de la goma en curso: la pista de antes y las celdas recorridas. */
  let trazo: { base: Pista; camino: Celda[]; borrar: boolean } | null = null;
  let cursor: Celda | null = null;
  let foco: Celda = { c: 0, r: 0 };
  let conTeclado = false;
  let vista: Vista = { escala: 0, x0: 0, y0: 0 };
  let pendiente = false;
  /** Arrastre en curso: qué se mueve, desde qué pista y a qué distancia del puntero lo tomó. */
  let arrastre: { que: Seleccion; base: Pista; desfase: Punto; inicioPx: Punto; movido: boolean } | null = null;

  // La paleta: un botón por pieza, con su miniatura.
  const botones = new Map<Pieza, HTMLButtonElement>();
  for (const grupo of PALETA) {
    const titulo = raiz.createElement('h3');
    titulo.textContent = grupo.grupo;
    const piezas = raiz.createElement('div');
    piezas.className = 'piezas';
    for (const pieza of grupo.piezas) {
      const boton = raiz.createElement('button');
      boton.type = 'button';
      boton.className = 'pieza';
      boton.setAttribute('aria-pressed', 'false');
      const miniatura = raiz.createElement('canvas');
      miniatura.width = miniatura.height = Math.round(LADO_MINIATURA_PX * dpr());
      miniatura.setAttribute('aria-hidden', 'true');
      dibujarMiniatura(miniatura, pieza);
      boton.append(miniatura, pieza.nombre);
      boton.addEventListener('click', () => usar(pieza));
      botones.set(pieza, boton);
      piezas.append(boton);
    }
    $('paleta-baldosas').append(titulo, piezas);
  }
  botonElegir.addEventListener('click', () => usar(null));
  botonLapiz.addEventListener('click', () => usarModo('lapiz'));
  botonGoma.addEventListener('click', () => usarModo('goma'));
  $('btn-girar').addEventListener('click', () => girarElegido(1));
  botonDeshacer.addEventListener('click', () => moverEnHistorial(deshacer, rehacer));
  botonRehacer.addEventListener('click', () => moverEnHistorial(rehacer, deshacer));
  const estilo = (): EstiloCurva => (selectorCurva.value === 'giroL' ? 'giroL' : 'giroSuave');

  const usarModo = (m: Modo, pieza: Pieza | null = null) => {
    modo = m;
    herramienta = m === 'pieza' ? pieza : null;
    for (const [p, b] of botones) b.setAttribute('aria-pressed', String(p === herramienta));
    botonElegir.setAttribute('aria-pressed', String(m === 'elegir'));
    botonLapiz.setAttribute('aria-pressed', String(m === 'lapiz'));
    botonGoma.setAttribute('aria-pressed', String(m === 'goma'));
    chip.textContent = m === 'pieza' && pieza ? `Pieza: ${pieza.nombre}` : m === 'lapiz' ? 'Dibujar línea' : m === 'goma' ? 'Borrar' : 'Elegir';
    ayuda.textContent = AYUDA[m];
    canvas.style.cursor = m === 'lapiz' ? 'crosshair' : m === 'goma' ? 'cell' : '';
    pedirDibujo();
  };
  const usar = (pieza: Pieza | null) => usarModo(pieza ? 'pieza' : 'elegir', pieza);

  /** Guarda la pista de antes de un cambio para poder deshacerlo. */
  const recordar = (antes: Pista) => {
    deshacer.push(antes);
    if (deshacer.length > MAXIMO_HISTORIAL) deshacer.shift();
    rehacer.length = 0;
    botonesHistorial();
  };
  const botonesHistorial = () => {
    botonDeshacer.disabled = deshacer.length === 0;
    botonRehacer.disabled = rehacer.length === 0;
  };
  const moverEnHistorial = (desde: Pista[], hacia: Pista[]) => {
    const p = desde.pop();
    if (!p) return;
    hacia.push(pista);
    cambiar(p);
    eventos.alCambiar(p);
    if (!seleccionValida(sel)) elegir(null);
    botonesHistorial();
  };

  const dentro = ({ c, r }: Celda) => c >= 0 && r >= 0 && c < pista.columnas && r < pista.filas;
  const baldosaElegida = (): Baldosa | null => (sel?.clase === 'baldosa' ? baldosaEn(pista, sel.c, sel.r) : null);

  const ajustarVista = () => {
    if (canvas.width > 0) vista = vistaInicial(canvas.width, canvas.height, pista.columnas, pista.filas);
  };

  /** La rotación de una pieza nueva: la que mejor se une a la línea de las vecinas. */
  const rotacionPieza = (k: Celda, tipo: Baldosa['tipo'], props: Record<string, unknown> = {}) =>
    rotacionAutomatica(pista, k.c, k.r, tipo, props, baldosaEn(pista, k.c, k.r)?.rot ?? 0);

  const fantasma = (): Baldosa | null => {
    if (!cursor || herramienta?.clase !== 'baldosa' || !dentro(cursor)) return null;
    const rot = rotacionPieza(cursor, herramienta.tipo, herramienta.props);
    return baldosaEn(colocarBaldosa(pista, cursor.c, cursor.r, herramienta.tipo, rot, herramienta.props), cursor.c, cursor.r);
  };

  const dibujar = () => {
    pendiente = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FONDO;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (vista.escala === 0) return;
    dibujarPista(ctx, vista, pista);
    const nueva = fantasma();
    const sobre = nueva ?? (cursor && dentro(cursor) && !arrastre ? baldosaEn(pista, cursor.c, cursor.r) : null);
    const marcas: MarcasEditor = {
      conAvisos: celdasConAvisos,
      fantasma: nueva,
      flechas: [baldosaElegida(), sobre].filter((b): b is Baldosa => b !== null),
      elegida: sel?.clase === 'baldosa' ? sel : null,
      anillo: anilloDe(pista, sel),
      foco: conTeclado && raiz.activeElement === canvas ? foco : null,
    };
    dibujarMarcasEditor(ctx, vista, marcas);
  };
  const pedirDibujo = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(dibujar);
  };

  /** Muestra la pista (sin avisar): avisos, controles de nombre y tamaño, y la vista si cambió el tamaño. */
  const cambiar = (p: Pista) => {
    const otroTamano = p.columnas !== pista.columnas || p.filas !== pista.filas;
    pista = p;
    celdasConAvisos = revisarPista(p).flatMap(a => a.baldosas ?? []);
    inputNombre.value = p.nombre;
    inputColumnas.value = String(p.columnas);
    inputFilas.value = String(p.filas);
    chipTamano.textContent = `${p.columnas} × ${p.filas} baldosas`;
    foco = { c: Math.min(foco.c, p.columnas - 1), r: Math.min(foco.r, p.filas - 1) };
    if (otroTamano) ajustarVista();
    pedirDibujo();
  };

  const elegir = (s: Seleccion | null) => {
    sel = s;
    if (s?.clase === 'baldosa') foco = { c: s.c, r: s.r };
    eventos.alElegir(s);
    pedirDibujo();
  };

  const editar = (p: Pista) => {
    if (p === pista) return;
    recordar(pista);
    cambiar(p);
    eventos.alCambiar(p);
  };

  const seleccionValida = (s: Seleccion | null) =>
    s?.clase === 'baldosa' ? dentro(s) : s?.clase === 'objeto' ? s.indice < pista.objetos.length : true;

  /** Lo que hace un clic (o Enter) en un punto de la pista según la herramienta. */
  const aplicar = (punto: Punto, alternarEnCelda = false) => {
    const celda = celdaDe(punto.x, punto.y);
    if (!dentro(celda)) {
      elegir(null);
      return;
    }
    if (herramienta?.clase === 'baldosa') {
      const rot = rotacionPieza(celda, herramienta.tipo, herramienta.props);
      editar(colocarBaldosa(pista, celda.c, celda.r, herramienta.tipo, rot, herramienta.props));
      elegir({ clase: 'baldosa', ...celda });
    } else if (herramienta?.clase === 'objeto') {
      const { pista: nueva, indice } = agregarObjeto(pista, herramienta.tipo, punto.x, punto.y);
      editar(nueva);
      elegir({ clase: 'objeto', indice });
      usar(null);
    } else if (herramienta?.clase === 'inicio') {
      editar(moverInicio(pista, punto.x, punto.y, baldosaEn(pista, celda.c, celda.r)?.rot ?? 0));
      elegir({ clase: 'inicio' });
      usar(null);
    } else if (alternarEnCelda) {
      // Con el teclado, Enter recorre lo que hay en la celda: la baldosa, sus objetos y el inicio.
      const enCelda = (q: Punto) => { const k = celdaDe(q.x, q.y); return k.c === celda.c && k.r === celda.r; };
      const opciones: Seleccion[] = [
        { clase: 'baldosa', ...celda },
        ...pista.objetos.flatMap((o, indice): Seleccion[] => (enCelda(o) ? [{ clase: 'objeto', indice }] : [])),
        ...(enCelda(pista.inicio) ? [{ clase: 'inicio' } as Seleccion] : []),
      ];
      const actual = opciones.findIndex(o => JSON.stringify(o) === JSON.stringify(sel));
      elegir(opciones[(actual + 1) % opciones.length]);
    } else {
      elegir(loQueHayEn(pista, punto.x, punto.y) ?? { clase: 'baldosa', ...celda });
    }
  };

  const puntoDelEvento = (e: MouseEvent): Punto => aMundoDesde(vista, e.offsetX * dpr(), e.offsetY * dpr());

  /** Gira lo elegido: una baldosa o un objeto (como girarObjeto) o la dirección del inicio. */
  const girarElegido = (sentido: 1 | -1) => {
    const b = baldosaElegida();
    if (b) editar(girarBaldosa(pista, b.c, b.r, sentido));
    else if (sel?.clase === 'objeto') editar(girarObjeto(pista, sel.indice));
    else if (sel?.clase === 'inicio') editar(moverInicio(pista, pista.inicio.x, pista.inicio.y, (pista.inicio.yaw + 90 * sentido + 360) % 360));
  };
  const quitarElegido = () => {
    const b = baldosaElegida();
    if (b) {
      editar(vaciarCelda(pista, b.c, b.r));
      elegir(sel);
    } else if (sel?.clase === 'objeto') {
      editar(quitarObjeto(pista, sel.indice));
      elegir(null);
    }
  };

  new ResizeObserver(() => {
    const ancho = Math.round(canvas.clientWidth * dpr());
    const alto = Math.round(canvas.clientHeight * dpr());
    if (ancho === canvas.width && alto === canvas.height) return;
    canvas.width = ancho;
    canvas.height = alto;
    ajustarVista();
    pedirDibujo();
  }).observe(canvas);

  /** Un campo con un valor escrito y sin confirmar (panel, nombre, tamaño) lo aplica antes que la pista cambie. */
  const confirmarCampo = () => {
    const activo = raiz.activeElement;
    if (activo instanceof HTMLInputElement || activo instanceof HTMLSelectElement) activo.blur();
  };

  canvas.tabIndex = 0;
  /** Borra en un punto: el objeto que haya ahí o, si no, la baldosa. */
  const borrarEn = (p: Pista, punto: Punto): Pista => {
    const algo = loQueHayEn(p, punto.x, punto.y);
    if (algo?.clase === 'objeto') return quitarObjeto(p, algo.indice);
    const k = celdaDe(punto.x, punto.y);
    return baldosaEn(p, k.c, k.r) ? vaciarCelda(p, k.c, k.r) : p;
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (vista.escala === 0) return;
    const punto = puntoDelEvento(e);
    const celda = celdaDe(punto.x, punto.y);
    // Lápiz y goma (y el clic derecho, que siempre borra): un trazo que se confirma al soltar.
    if (e.button === 2 || (e.button === 0 && (modo === 'lapiz' || modo === 'goma'))) {
      confirmarCampo();
      conTeclado = false;
      const borrar = e.button === 2 || modo === 'goma';
      trazo = { base: pista, camino: [celda], borrar };
      if (borrar) {
        cambiar(borrarEn(pista, punto));
        if (sel && !seleccionValida(sel)) elegir(null);
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    confirmarCampo();
    conTeclado = false;
    const tomado = herramienta ? null : loQueHayEn(pista, punto.x, punto.y);
    aplicar(punto);
    if (!tomado) return;
    const origen = tomado.clase === 'inicio' ? pista.inicio : pista.objetos[(tomado as { indice: number }).indice];
    arrastre = { que: tomado, base: pista, desfase: { x: origen.x - punto.x, y: origen.y - punto.y }, inicioPx: { x: e.clientX, y: e.clientY }, movido: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (vista.escala === 0) return;
    const punto = puntoDelEvento(e);
    if (trazo) {
      const celda = celdaDe(punto.x, punto.y);
      const ultima = trazo.camino.at(-1)!;
      if (trazo.borrar) {
        cambiar(borrarEn(pista, punto));
        if (sel && !seleccionValida(sel)) elegir(null);
      } else if (ultima.c !== celda.c || ultima.r !== celda.r) {
        trazo.camino.push(...celdasEntre(ultima, celda));
        cambiar(trazarCamino(trazo.base, trazo.camino, estilo()));
      }
      cursor = celda;
      return;
    }
    if (arrastre) {
      arrastre.movido ||= Math.hypot(e.clientX - arrastre.inicioPx.x, e.clientY - arrastre.inicioPx.y) >= UMBRAL_ARRASTRE_PX;
      if (!arrastre.movido) return;
      const x = punto.x + arrastre.desfase.x;
      const y = punto.y + arrastre.desfase.y;
      const { que, base } = arrastre;
      cambiar(que.clase === 'inicio' ? moverInicio(base, x, y) : moverObjeto(base, (que as { indice: number }).indice, x, y));
      return;
    }
    const celda = celdaDe(punto.x, punto.y);
    if (cursor?.c === celda.c && cursor.r === celda.r) return;
    cursor = celda;
    pedirDibujo();
  });
  const soltar = () => {
    if (trazo) {
      const { base } = trazo;
      trazo = null;
      if (pista !== base) {
        recordar(base);
        eventos.alCambiar(pista);
      }
      return;
    }
    if (!arrastre) return;
    const { movido, base } = arrastre;
    arrastre = null;
    if (movido) {
      recordar(base);
      eventos.alCambiar(pista);
    }
  };
  // Doble clic con Elegir: gira la baldosa.
  canvas.addEventListener('dblclick', e => {
    if (modo !== 'elegir' || vista.escala === 0) return;
    const punto = puntoDelEvento(e);
    if (loQueHayEn(pista, punto.x, punto.y)) return;
    const k = celdaDe(punto.x, punto.y);
    if (baldosaEn(pista, k.c, k.r)) editar(girarBaldosa(pista, k.c, k.r, 1));
  });
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', () => {
    cursor = null;
    pedirDibujo();
  });
  canvas.addEventListener('focus', pedirDibujo);
  canvas.addEventListener('blur', pedirDibujo);
  canvas.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const flecha = FLECHAS[e.key];
    if (flecha) {
      conTeclado = true;
      foco = {
        c: Math.min(pista.columnas - 1, Math.max(0, foco.c + flecha[0])),
        r: Math.min(pista.filas - 1, Math.max(0, foco.r + flecha[1])),
      };
      pedirDibujo();
    } else if (e.key === 'Enter' || e.key === ' ') {
      conTeclado = true;
      aplicar(centroDeCelda(foco), true);
    } else if (e.key === 'r' || e.key === 'R') {
      girarElegido(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      quitarElegido();
    } else if (e.key === 'Escape') {
      usar(null);
    } else if (e.key === 'd' || e.key === 'D') {
      usarModo('lapiz');
    } else if (e.key === 'b' || e.key === 'B') {
      usarModo('goma');
    } else return;
    e.preventDefault();
  });

  // Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z) en la vista Construir pista, salvo dentro de un campo de texto.
  $('vista-pista').addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'z' && !e.shiftKey) moverEnHistorial(deshacer, rehacer);
    else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) moverEnHistorial(rehacer, deshacer);
    else return;
    e.preventDefault();
  });

  // Nombre y tamaño de la pista.
  inputNombre.addEventListener('change', () => {
    const nombre = inputNombre.value.trim();
    if (nombre === '') inputNombre.value = pista.nombre;
    else editar({ ...pista, nombre });
  });
  const cambiarTamano = async () => {
    const columnas = Number.parseInt(inputColumnas.value, 10);
    const filas = Number.parseInt(inputFilas.value, 10);
    if (!Number.isFinite(columnas) || !Number.isFinite(filas)) {
      cambiar(pista);
      return;
    }
    const antes = pista;
    const { pista: nueva, quitados } = redimensionar(antes, columnas, filas);
    if (quitados > 0) {
      const piezas = quitados === 1 ? '1 pieza que queda' : `${quitados} piezas que quedan`;
      const seguir = await confirmar(raiz, { titulo: `Al achicar la pista se quitan ${piezas} fuera. ¿Seguir?`, boton: 'Seguir' });
      if (!seguir || pista !== antes) {
        cambiar(pista);
        return;
      }
    }
    editar(nueva);
    // Quitar objetos cambia sus índices: lo elegido se suelta.
    if (!seleccionValida(sel) || (quitados > 0 && sel?.clase === 'objeto')) elegir(null);
  };
  inputColumnas.addEventListener('change', () => void cambiarTamano());
  inputFilas.addEventListener('change', () => void cambiarTamano());
  inputColumnas.min = String(COLUMNAS.min);
  inputColumnas.max = String(COLUMNAS.max);
  inputFilas.min = String(FILAS.min);
  inputFilas.max = String(FILAS.max);

  registrarPrueba('editorPista', {
    pista: () => pista,
    seleccion: () => sel,
    aPantalla(x: number, y: number) {
      const { px, py } = aPantalla(vista, x, y);
      return { x: px / dpr(), y: py / dpr() };
    },
  });

  usar(null);
  return {
    mostrar(p) {
      // Abrir otra pista también se puede deshacer (salvo la primera vez, con la pista vacía).
      if (pista.baldosas.length > 0 || pista.objetos.length > 0) recordar(pista);
      cambiar(p);
      ajustarVista();
      foco = { c: 0, r: 0 };
      elegir(null);
    },
    editar(p) {
      editar(p);
      if (!seleccionValida(sel)) elegir(null);
    },
    pista: () => pista,
    seleccion: () => sel,
    elegir,
    herramienta: () => herramienta,
  };
}
