import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dibujarPista } from './dibujo';
import type { PunteroPista } from './editor-pista';
import { alturaEnBaldosa, capaSuelo, crearCapas, esElevada, GROSOR_PUENTE_MM } from '../pista/capas';
import { crearRelieve } from '../mundo/relieve';
import { gradosARadianes, poseInicial } from '../pista/serializacion';
import { TAMANO_BALDOSA as T, type Baldosa, type Pista } from '../pista/tipos';
import type { ConfigRobot } from '../robot/config';
import type { Instantanea } from '../simulacion/ejecucion';
import type { Pose } from '../simulacion/simulador';

/**
 * La pista y el robot en 3D, con Three.js. El mundo va en mm con z hacia arriba, igual que el
 * simulador: la cámara usa z como "arriba". Dibuja solo cuando algo cambió (o la cámara se mueve).
 * Las rampas y plataformas son tablas sobre patas, con el suelo (y su línea, si tiene) debajo.
 * Con `edicion`, el puntero también edita la pista (como en el lienzo 2D).
 */
export type Camara3D = 'orbita' | 'seguir' | 'arriba' | 'robot';

export interface Vista3D {
  /** debajo: se edita el suelo bajo los puentes (los puentes se ven transparentes). */
  mostrarPista(p: Pista, debajo?: boolean): void;
  cambiarRobot(r: ConfigRobot): void;
  mostrarInstantanea(i: Instantanea): void;
  /** El robot quieto en `pose`, sin lecturas ni rastro. */
  reiniciar(pose: Pose): void;
  camara(modo: Camara3D): void;
  /** Mientras está oculta no dibuja. */
  activar(si: boolean): void;
}

const MAXIMO_RASTRO = 3000;
const RADIO_RUEDA = 30;
const ALTO_PLACA = 8;
const QTR_VE_LINEA = 2000;
const SIN_OBJETIVO_MM = 8000;
/** Píxeles de la textura de la pista por mm (se achica en pistas grandes). */
const DETALLE = 2;
const TEXTURA_MAXIMA = 4096;
/** La tabla de los puentes se dibuja apenas más arriba que la física, para no mezclarse con el suelo. */
const SOBRE_SUELO = 0.8;
/** Lado de las patas de los puentes (mm). */
const LADO_PATA = 24;
/** Moverse menos que esto (px) es un clic, no un arrastre. */
const UMBRAL_CLIC_PX = 4;

const COLORES = {
  chasis: 0xd6339b,
  asa: 0x8c88f0,
  placa: 0x4b2a86,
  rueda: 0x1b1b24,
  llanta: 0xf4f4f6,
  loca: 0xf0f0f4,
  pared: 0xe7edf5,
  bajoPuente: 0xc9d2de,
  pata: 0x7b4fd0,
  mesa: 0x8a6a4a,
  obstaculo: 0xe9e2d4,
  rayo: 0xff4d6d,
  rastro: 0xff9fad,
  qtrApagado: 0x2a2a3a,
  qtrVe: 0xffd166,
  resaltado: 0x2f6bff,
};

function variableCss(nombre: string, porDefecto: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || porDefecto;
}

/** La textura de una pista vista desde arriba: lo mismo que el 2D (cinta, marcas, hitos, flecha de inicio). */
function texturaDePista(p: Pista): THREE.CanvasTexture {
  const ancho = p.columnas * T;
  const alto = p.filas * T;
  const escala = Math.min(DETALLE, TEXTURA_MAXIMA / ancho, TEXTURA_MAXIMA / alto);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext('2d')!;
  dibujarPista(ctx, { escala, x0: 0, y0: canvas.height }, p);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  return textura;
}

interface Suelo {
  grupo: THREE.Group;
  /** Lo que se puede tocar con el puntero para editar. */
  tocables: THREE.Object3D[];
}

/**
 * El suelo (plano, con la textura del suelo: lo de abajo de los puentes incluido), los puentes
 * (tablas con la textura de arriba, sus cantos y patas), la mesa, los obstáculos y los baches.
 */
function sueloDePista(p: Pista, debajo: boolean): Suelo {
  const grupo = new THREE.Group();
  const tocables: THREE.Object3D[] = [];
  const ancho = p.columnas * T;
  const alto = p.filas * T;
  const capas = crearCapas(p);
  const puentes = p.baldosas.filter(esElevada);

  // El suelo: un plano con la pista sin los puentes (y con lo que pasa debajo de ellos).
  const texturaSuelo = texturaDePista(capaSuelo(p));
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshStandardMaterial({ map: texturaSuelo, roughness: 0.85 }));
  plano.position.set(ancho / 2, alto / 2, 0);
  plano.receiveShadow = true;
  grupo.add(plano);
  tocables.push(plano);

  if (puentes.length > 0) {
    const texturaArriba = texturaDePista(p);
    const transparente = debajo ? { transparent: true, opacity: 0.28, depthWrite: false } : {};
    const tablaMat = new THREE.MeshStandardMaterial({ map: texturaArriba, roughness: 0.8, side: THREE.DoubleSide, ...transparente });
    const cantoMat = new THREE.MeshStandardMaterial({ color: COLORES.pared, roughness: 0.9, side: THREE.DoubleSide, ...transparente });
    const pataMat = new THREE.MeshStandardMaterial({ color: COLORES.pata, roughness: 0.6, ...transparente });
    const tabla = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
    const canto: number[] = [];
    const patas = new Map<string, { x: number; y: number; h: number }>();
    const DIV = 6;
    const arriba = (b: Baldosa, x: number, y: number) => alturaEnBaldosa(b, x, y) + SOBRE_SUELO;
    const abajo = (b: Baldosa, x: number, y: number) => Math.max(SOBRE_SUELO / 2, arriba(b, x, y) - GROSOR_PUENTE_MM);
    const quad = (a: number[], b: number[], c: number[], d: number[]) => canto.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const b of puentes) {
      const { c, r } = b;
      // La cara de arriba, con la textura de la pista.
      const base = tabla.pos.length / 3;
      for (let i = 0; i <= DIV; i++) {
        for (let j = 0; j <= DIV; j++) {
          const x = c * T + (i / DIV) * T;
          const y = r * T + (j / DIV) * T;
          tabla.pos.push(x, y, arriba(b, x, y));
          tabla.uv.push(x / ancho, y / alto);
        }
      }
      for (let i = 0; i < DIV; i++) {
        for (let j = 0; j < DIV; j++) {
          const a = base + i * (DIV + 1) + j;
          const bb = a + DIV + 1;
          tabla.idx.push(a, bb, a + 1, a + 1, bb, bb + 1);
        }
      }
      // La cara de abajo (dos triángulos por tramo a lo largo de la subida bastan: es plana o inclinada).
      const esquinas: [number, number][] = [[c * T, r * T], [(c + 1) * T, r * T], [(c + 1) * T, (r + 1) * T], [c * T, (r + 1) * T]];
      const bajo = esquinas.map(([x, y]) => [x, y, abajo(b, x, y)]);
      quad(bajo[0], bajo[3], bajo[2], bajo[1]);
      // Los cantos: donde no sigue otra tabla a la misma altura.
      const vecinas: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let k = 0; k < 4; k++) {
        const [x0, y0] = esquinas[k];
        const [x1, y1] = esquinas[(k + 1) % 4];
        const vecina = capas.arriba(c + vecinas[k][0], r + vecinas[k][1]);
        if (esElevada(vecina) && Math.abs(arriba(vecina!, x0, y0) - arriba(b, x0, y0)) < 1 && Math.abs(arriba(vecina!, x1, y1) - arriba(b, x1, y1)) < 1) continue;
        for (let s = 0; s < DIV; s++) {
          const xa = x0 + ((x1 - x0) * s) / DIV, ya = y0 + ((y1 - y0) * s) / DIV;
          const xb = x0 + ((x1 - x0) * (s + 1)) / DIV, yb = y0 + ((y1 - y0) * (s + 1)) / DIV;
          quad([xa, ya, arriba(b, xa, ya)], [xb, yb, arriba(b, xb, yb)], [xb, yb, abajo(b, xb, yb)], [xa, ya, abajo(b, xa, ya)]);
        }
      }
      // Patas en las esquinas que quedan en el aire (una sola donde se juntan dos tablas a la misma altura).
      for (const [x, y] of esquinas) {
        const h = abajo(b, x, y);
        if (h < 15) continue;
        // Hacia adentro de la pista, para que no queden colgando fuera de la mesa.
        const px = Math.min(ancho - LADO_PATA / 2, Math.max(LADO_PATA / 2, x));
        const py = Math.min(alto - LADO_PATA / 2, Math.max(LADO_PATA / 2, y));
        const clave = `${px},${py},${Math.round(h)}`;
        if (!patas.has(clave)) patas.set(clave, { x: px, y: py, h });
      }
    }
    const geoTabla = new THREE.BufferGeometry();
    geoTabla.setAttribute('position', new THREE.Float32BufferAttribute(tabla.pos, 3));
    geoTabla.setAttribute('uv', new THREE.Float32BufferAttribute(tabla.uv, 2));
    geoTabla.setIndex(tabla.idx);
    geoTabla.computeVertexNormals();
    const mallaTabla = new THREE.Mesh(geoTabla, tablaMat);
    mallaTabla.castShadow = !debajo;
    mallaTabla.receiveShadow = true;
    grupo.add(mallaTabla);
    if (!debajo) tocables.push(mallaTabla);
    const geoCanto = new THREE.BufferGeometry();
    geoCanto.setAttribute('position', new THREE.Float32BufferAttribute(canto, 3));
    geoCanto.computeVertexNormals();
    const mallaCanto = new THREE.Mesh(geoCanto, cantoMat);
    mallaCanto.castShadow = !debajo;
    mallaCanto.receiveShadow = true;
    grupo.add(mallaCanto);
    for (const { x, y, h } of patas.values()) {
      const pata = new THREE.Mesh(new THREE.BoxGeometry(LADO_PATA, LADO_PATA, h), pataMat);
      pata.position.set(x, y, h / 2);
      pata.castShadow = !debajo;
      pata.receiveShadow = true;
      grupo.add(pata);
    }
  }

  // La mesa: un tablero bajo la pista, un poco más grande y algo más abajo (para que no se mezcle con el suelo).
  const mesa = new THREE.Mesh(new THREE.BoxGeometry(ancho + 120, alto + 120, 30), new THREE.MeshStandardMaterial({ color: COLORES.mesa, roughness: 0.8 }));
  mesa.position.set(ancho / 2, alto / 2, -15 - 6);
  mesa.receiveShadow = true;
  grupo.add(mesa);

  // Obstáculos (cajas) y baches (medio cilindro), sobre el piso de arriba (como en la física).
  const relieve = crearRelieve(p);
  for (const o of p.objetos) {
    if (o.tipo === 'obstaculo') {
      const caja = new THREE.Mesh(new THREE.BoxGeometry(o.props.largo, o.props.ancho, o.props.alto), new THREE.MeshStandardMaterial({ color: COLORES.obstaculo, roughness: 0.7 }));
      caja.position.set(o.x, o.y, relieve.altura(o.x, o.y) + SOBRE_SUELO + o.props.alto / 2);
      caja.rotation.z = gradosARadianes(o.rot);
      caja.castShadow = true;
      caja.receiveShadow = true;
      grupo.add(caja);
      tocables.push(caja);
    } else if (o.tipo === 'bache') {
      const cilindro = new THREE.Mesh(
        new THREE.CylinderGeometry(o.props.radio, o.props.radio, o.props.largo, 16, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }));
      // El cilindro de Three va a lo largo de y: se acuesta a lo largo de `rot`.
      cilindro.rotation.order = 'ZXY';
      cilindro.rotation.set(0, Math.PI / 2, gradosARadianes(o.rot) + Math.PI / 2);
      const { baldosa, enPuente } = capas.piso(o.x, o.y);
      cilindro.position.set(o.x, o.y, (enPuente && baldosa ? alturaEnBaldosa(baldosa, o.x, o.y) : 0) + SOBRE_SUELO);
      cilindro.castShadow = true;
      grupo.add(cilindro);
    }
  }
  return { grupo, tocables };
}

interface ModeloRobot {
  grupo: THREE.Group;
  ruedaIzq: THREE.Object3D;
  ruedaDer: THREE.Object3D;
  leds: THREE.MeshStandardMaterial[];
  tcs: THREE.MeshStandardMaterial[];
  rayo: THREE.Line;
  /** Dónde nace el rayo del VL53L0X, en el marco del robot. */
  origenRayo: THREE.Vector3;
  direccionRayo: THREE.Vector3;
}

/** Un rectángulo de esquinas redondeadas (para el marco del asa). */
function rectanguloRedondeado(forma: THREE.Shape | THREE.Path, x: number, y: number, ancho: number, alto: number, radio: number): void {
  forma.moveTo(x + radio, y);
  forma.lineTo(x + ancho - radio, y);
  forma.quadraticCurveTo(x + ancho, y, x + ancho, y + radio);
  forma.lineTo(x + ancho, y + alto - radio);
  forma.quadraticCurveTo(x + ancho, y + alto, x + ancho - radio, y + alto);
  forma.lineTo(x + radio, y + alto);
  forma.quadraticCurveTo(x, y + alto, x, y + alto - radio);
  forma.lineTo(x, y + radio);
  forma.quadraticCurveTo(x, y, x + radio, y);
}

/**
 * El robot en su marco (x adelante, y izquierda, z arriba; origen en el eje de las ruedas, en el
 * suelo), como el Dynamis de verdad: base magenta, el marco lila del asa cruzado de lado a lado y
 * ruedas blancas.
 */
function modeloRobot(robot: ConfigRobot): ModeloRobot {
  const grupo = new THREE.Group();
  const { chasis, ruedas, ruedasLocas, qtr, vl53l0x, tcs34725, tcs34725b, mpu6050 } = robot;
  const radio = ruedas.diametro / 2 || RADIO_RUEDA;
  const mat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
  const sombra = <M extends THREE.Mesh>(m: M) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const xCentro = chasis.xDelantero - chasis.largo / 2;
  const zBase = Math.max(12, radio - 12);

  // Base del chasis (impresa en 3D, magenta) con la ventana de los sensores, y la placa encima.
  const base = sombra(new THREE.Mesh(new THREE.BoxGeometry(chasis.largo, chasis.ancho - 56, 5), mat(COLORES.chasis)));
  base.position.set(xCentro, 0, zBase);
  grupo.add(base);
  // Los soportes de los motores, que bajan de la base.
  for (const lado of [1, -1]) {
    const soporte = sombra(new THREE.Mesh(new THREE.BoxGeometry(40, 6, radio + 6), mat(COLORES.chasis)));
    soporte.position.set(ruedas.x, lado * (chasis.ancho / 2 - 34), zBase + 2 - (radio + 6) / 2 + 8);
    grupo.add(soporte);
  }
  const zPlaca = zBase + 3 + ALTO_PLACA;
  const placa = sombra(new THREE.Mesh(new THREE.BoxGeometry(chasis.largo * 0.82, chasis.ancho * 0.5, 2), mat(COLORES.placa, { roughness: 0.4 })));
  placa.position.set(xCentro, 0, zPlaca);
  grupo.add(placa);
  // Postes de la placa, la batería, el ESP32 y unos módulos.
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, ALTO_PLACA, 8), mat(0xd9d9e0, { metalness: 0.6 }));
    poste.rotation.x = Math.PI / 2;
    poste.position.set(xCentro + dx * chasis.largo * 0.36, dy * chasis.ancho * 0.22, zBase + 3 + ALTO_PLACA / 2);
    grupo.add(poste);
  }
  const bateria = sombra(new THREE.Mesh(new THREE.BoxGeometry(60, 34, 18), mat(0x2b2b33)));
  bateria.position.set(xCentro - 18, 0, zPlaca + 10);
  grupo.add(bateria);
  const esp = sombra(new THREE.Mesh(new THREE.BoxGeometry(48, 26, 5), mat(0x111111)));
  esp.position.set(xCentro + 28, 16, zPlaca + 3.5);
  grupo.add(esp);
  for (const [dx, dy, color] of [[22, -24, 0xe8b04a], [40, -8, 0x2c7be5], [-2, 30, 0xf2f2f2]] as const) {
    const modulo = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 6), mat(color));
    modulo.position.set(xCentro + dx, dy, zPlaca + 4);
    grupo.add(modulo);
  }

  // El asa: un marco lila (rectángulo redondeado hueco) de pie, cruzado de lado a lado.
  const anchoAsa = Math.min(chasis.ancho - 24, chasis.ancho * 0.8);
  const altoAsa = Math.max(40, chasis.alto - zBase);
  const barra = 9;
  const forma = new THREE.Shape();
  rectanguloRedondeado(forma, -anchoAsa / 2, 0, anchoAsa, altoAsa, 14);
  const hueco = new THREE.Path();
  rectanguloRedondeado(hueco, -anchoAsa / 2 + barra, barra, anchoAsa - 2 * barra, altoAsa - 2 * barra, 8);
  forma.holes.push(hueco);
  const asa = sombra(new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 10, bevelEnabled: false, curveSegments: 6 }), mat(COLORES.asa)));
  // La forma está en el plano xy de Three: su x pasa a ser el y del robot, su y la altura y el grosor va hacia adelante.
  asa.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  asa.position.set(xCentro - chasis.largo * 0.12 - 5, 0, zBase);
  grupo.add(asa);

  // Ruedas motrices: blancas, con una goma fina. Giran sobre su eje y.
  const rueda = (lado: number) => {
    const pivote = new THREE.Group();
    pivote.position.set(ruedas.x, lado * ruedas.trocha / 2, radio);
    const goma = sombra(new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 18, 32), mat(COLORES.rueda, { roughness: 0.95 })));
    pivote.add(goma);
    const llanta = sombra(new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.86, radio * 0.86, 19, 32), mat(COLORES.llanta, { roughness: 0.5 })));
    pivote.add(llanta);
    // Agujeros de la llanta: se ve que gira.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const agujero = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.13, radio * 0.13, 19.6, 12), mat(0x9a9aa6));
      agujero.position.set(Math.cos(a) * radio * 0.5, 0, Math.sin(a) * radio * 0.5);
      pivote.add(agujero);
    }
    grupo.add(pivote);
    return pivote;
  };
  const ruedaIzq = rueda(1);
  const ruedaDer = rueda(-1);
  // Motores (GA25-370) hacia adentro.
  for (const lado of [1, -1]) {
    const motor = sombra(new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 50, 16), mat(0xb8bcc8, { metalness: 0.7, roughness: 0.3 })));
    motor.position.set(ruedas.x, lado * (ruedas.trocha / 2 - 38), radio);
    grupo.add(motor);
  }
  // Ruedas locas.
  if (ruedasLocas.instalado) {
    const r = ruedasLocas.diametro / 2;
    for (const lado of [1, -1]) {
      const loca = sombra(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 12, 24), mat(COLORES.loca)));
      loca.position.set(ruedasLocas.x, lado * ruedasLocas.trocha / 2, r);
      grupo.add(loca);
    }
  }

  // QTR: la barra con 8 LEDs que se encienden cuando ven la línea.
  const n = qtr.pines.length;
  const barraQtr = sombra(new THREE.Mesh(new THREE.BoxGeometry(12, (n + 1) * qtr.separacion, 3), mat(0x1a1a1a)));
  barraQtr.position.set(qtr.x, 0, qtr.altura + 2);
  grupo.add(barraQtr);
  const leds: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < n; i++) {
    const m = mat(COLORES.qtrApagado, { emissive: 0x000000 });
    const led = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1.5), m);
    led.position.set(qtr.x, ((n - 1) / 2 - i) * qtr.separacion, qtr.altura);
    grupo.add(led);
    leds.push(m);
  }

  // TCS34725: muestran el color que miden.
  const tcs: THREE.MeshStandardMaterial[] = [];
  for (const s of [tcs34725, tcs34725b.instalado ? tcs34725b : null]) {
    if (!s) continue;
    const m = mat(0xffffff, { emissive: 0x000000 });
    const caja = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 3), m);
    caja.position.set(s.x, s.y, Math.max(3, s.z + 2));
    grupo.add(caja);
    tcs.push(m);
  }

  // VL53L0X y su rayo.
  const laser = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 10), mat(0x222222));
  laser.position.set(vl53l0x.x, vl53l0x.y, vl53l0x.z);
  grupo.add(laser);
  const origenRayo = new THREE.Vector3(vl53l0x.x + 3, vl53l0x.y, vl53l0x.z);
  const yaw = gradosARadianes(vl53l0x.yaw);
  const pitch = gradosARadianes(vl53l0x.pitch);
  const direccionRayo = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch));
  const rayo = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origenRayo, origenRayo.clone()]),
    new THREE.LineBasicMaterial({ color: COLORES.rayo, transparent: true, opacity: 0.85 }));
  grupo.add(rayo);

  // MPU6050.
  const mpu = new THREE.Mesh(new THREE.BoxGeometry(20, 16, 3), mat(0x1d4ed8));
  mpu.position.set(mpu6050.x, mpu6050.y, Math.max(zPlaca + 2, mpu6050.z));
  grupo.add(mpu);

  return { grupo, ruedaIzq, ruedaDer, leds, tcs, rayo, origenRayo, direccionRayo };
}

/** Color aproximado que ve un TCS34725 (cuentas crudas → RGB de pantalla). */
function colorTCS(l: { r: number; g: number; b: number; c: number }): THREE.Color {
  const max = Math.max(l.r, l.g, l.b, 1);
  const brillo = Math.min(1, l.c / 6000);
  return new THREE.Color(l.r / max * brillo, l.g / max * brillo, l.b / max * brillo);
}

export function crearVista3D(contenedor: HTMLElement, robotInicial: ConfigRobot, edicion?: PunteroPista): Vista3D {
  // Profundidad logarítmica: sin ella, el suelo y la mesa (a pocos mm) se mezclan en franjas a lo lejos.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'lienzo lienzo-3d';
  renderer.domElement.setAttribute('aria-label', edicion
    ? 'Vista 3D para editar la pista: con una herramienta, el clic edita y el clic derecho gira la cámara; con Elegir, arrastra para girar. La rueda acerca.'
    : 'Vista 3D de la pista y el robot: arrastra para girar, rueda para acercar, clic derecho para mover.');
  contenedor.append(renderer.domElement);
  const lienzo = renderer.domElement;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 4 / 3, 10, 40000);
  camara.up.set(0, 0, 1);

  escena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 1.5;
  escena.add(sol);
  escena.add(sol.target);

  let pista: Pista | null = null;
  let verDebajo = false;
  let suelo: Suelo | null = null;
  let tamanoPista = '';
  let reconstruir = false;
  let relieve: ReturnType<typeof crearRelieve> | null = null;
  let robot = robotInicial;
  let modelo = modeloRobot(robot);
  escena.add(modelo.grupo);
  let modo: Camara3D = 'orbita';
  let activa = false;
  let pendiente = false;
  let pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  let anterior: typeof pose | null = null;
  let giroIzq = 0;
  let giroDer = 0;
  let reinicio = -1;
  const rastroPuntos: THREE.Vector3[] = [];
  const rastro = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORES.rastro }));
  escena.add(rastro);

  // La celda bajo el puntero al editar: un cuadro azul sobre el piso.
  const resaltado = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: COLORES.resaltado, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  const bordeResaltado = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORES.resaltado }));
  resaltado.visible = bordeResaltado.visible = false;
  escena.add(resaltado, bordeResaltado);

  // El puntero de la edición va antes que la cámara: si edita, la cámara no se entera del clic.
  const raycaster = new THREE.Raycaster();
  const puntoBajo = (e: PointerEvent | MouseEvent): THREE.Vector3 | null => {
    if (!suelo) return null;
    const caja = lienzo.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - caja.left) / caja.width) * 2 - 1, -((e.clientY - caja.top) / caja.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camara);
    const impacto = raycaster.intersectObjects(suelo.tocables, false)[0];
    if (!impacto || !pista) return null;
    const { x, y } = impacto.point;
    return x >= 0 && y >= 0 && x < pista.columnas * T && y < pista.filas * T ? impacto.point : null;
  };
  const resaltar = (p: THREE.Vector3 | null) => {
    if (!p || !pista) {
      if (resaltado.visible) {
        resaltado.visible = bordeResaltado.visible = false;
        pedir();
      }
      return;
    }
    const c = Math.floor(p.x / T);
    const r = Math.floor(p.y / T);
    const b = verDebajo ? null : crearCapas(pista).arriba(c, r);
    const h = (x: number, y: number) => (b && esElevada(b) ? alturaEnBaldosa(b, x, y) : 0) + SOBRE_SUELO + 1.5;
    const esquinas = [[c * T, r * T], [(c + 1) * T, r * T], [(c + 1) * T, (r + 1) * T], [c * T, (r + 1) * T]].map(([x, y]) => new THREE.Vector3(x, y, h(x, y)));
    resaltado.geometry.dispose();
    resaltado.geometry = new THREE.BufferGeometry().setFromPoints([esquinas[0], esquinas[1], esquinas[2], esquinas[0], esquinas[2], esquinas[3]]);
    bordeResaltado.geometry.dispose();
    bordeResaltado.geometry = new THREE.BufferGeometry().setFromPoints(esquinas);
    resaltado.visible = bordeResaltado.visible = true;
    pedir();
  };
  let editando = false;
  let posibleClic: { x: number; y: number; punto: THREE.Vector3 } | null = null;
  const px = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  if (edicion) {
    lienzo.addEventListener('pointerdown', e => {
      // Con una herramienta, el clic derecho gira la cámara (el izquierdo edita).
      controles.mouseButtons.RIGHT = edicion.herramientaActiva() ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      posibleClic = null;
      if (e.button !== 0) return;
      const p = puntoBajo(e);
      if (!p) return;
      if (edicion.presionar({ x: p.x, y: p.y }, 0, px(e))) {
        e.stopImmediatePropagation();
        e.preventDefault();
        editando = true;
        lienzo.setPointerCapture(e.pointerId);
      } else {
        posibleClic = { x: e.clientX, y: e.clientY, punto: p };
      }
    });
    lienzo.addEventListener('pointermove', e => {
      if (editando) {
        const p = puntoBajo(e);
        if (p) edicion.mover({ x: p.x, y: p.y }, px(e));
        resaltar(p);
        return;
      }
      if (e.buttons !== 0) return;
      const p = puntoBajo(e);
      edicion.mover(p ? { x: p.x, y: p.y } : null, px(e));
      resaltar(p);
      lienzo.style.cursor = edicion.herramientaActiva() && p ? 'crosshair' : '';
    });
    const soltar = (e: PointerEvent) => {
      if (editando) {
        editando = false;
        edicion.soltar();
        return;
      }
      if (posibleClic && Math.hypot(e.clientX - posibleClic.x, e.clientY - posibleClic.y) < UMBRAL_CLIC_PX) {
        edicion.clic({ x: posibleClic.punto.x, y: posibleClic.punto.y });
      }
      posibleClic = null;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    lienzo.addEventListener('pointerleave', () => {
      if (editando) return;
      edicion.mover(null, { x: 0, y: 0 });
      resaltar(null);
    });
    lienzo.addEventListener('dblclick', e => {
      const p = puntoBajo(e);
      if (p) edicion.dobleClic({ x: p.x, y: p.y });
    });
  }

  const controles = new OrbitControls(camara, lienzo);
  controles.enableDamping = true;
  controles.dampingFactor = 0.12;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.minDistance = 120;
  controles.maxDistance = 9000;

  const fondo = () => {
    escena.background = new THREE.Color(variableCss('--nube', '#F4FAFF'));
    pedir();
  };
  new MutationObserver(fondo).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  const encuadrar = () => {
    if (!pista) return;
    const ancho = pista.columnas * T;
    const alto = pista.filas * T;
    const centro = new THREE.Vector3(ancho / 2, alto / 2, 0);
    const lado = Math.max(ancho, alto);
    controles.target.copy(centro);
    camara.position.set(ancho / 2, -alto * 0.45, lado * 0.95);
    sol.position.set(ancho * 0.2, -alto * 0.3, lado * 1.2);
    sol.target.position.copy(centro);
    const s = sol.shadow.camera as THREE.OrthographicCamera;
    s.left = -lado; s.right = lado; s.top = lado; s.bottom = -lado; s.near = 10; s.far = lado * 4;
    s.updateProjectionMatrix();
    controles.update();
  };

  const ubicarRobot = () => {
    modelo.grupo.position.set(pose.x, pose.y, pose.z);
    modelo.grupo.rotation.set(pose.roll, pose.pitch, pose.yaw, 'ZYX');
    modelo.ruedaIzq.rotation.y = giroIzq;
    modelo.ruedaDer.rotation.y = giroDer;
  };

  const posicionCamara = new THREE.Vector3();
  const objetivo = new THREE.Vector3();
  const seguirCamara = (suave: boolean) => {
    const c = Math.cos(pose.yaw);
    const s = Math.sin(pose.yaw);
    if (modo === 'seguir') {
      posicionCamara.set(pose.x - 420 * c, pose.y - 420 * s, pose.z + 260);
      objetivo.set(pose.x + 120 * c, pose.y + 120 * s, pose.z + 20);
    } else if (modo === 'robot') {
      // Desde el frente del robot, mirando hacia adelante y un poco hacia abajo.
      const adelante = robot.chasis.xDelantero;
      posicionCamara.set(pose.x + (adelante - 20) * c, pose.y + (adelante - 20) * s, pose.z + 95);
      objetivo.set(pose.x + (adelante + 300) * c, pose.y + (adelante + 300) * s, pose.z);
    } else if (modo === 'arriba' && pista) {
      posicionCamara.set(pose.x, pose.y - 1, pose.z + 1400);
      objetivo.set(pose.x, pose.y, pose.z);
    } else return;
    if (suave) {
      camara.position.lerp(posicionCamara, 0.15);
      controles.target.lerp(objetivo, 0.25);
    } else {
      camara.position.copy(posicionCamara);
      controles.target.copy(objetivo);
    }
  };

  const tamano = () => {
    const ancho = contenedor.clientWidth;
    const alto = Math.round(ancho * 3 / 4);
    if (ancho === 0) return;
    renderer.setSize(ancho, alto, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = 'auto';
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    pedir();
  };
  new ResizeObserver(tamano).observe(contenedor);

  /** Arma de nuevo el suelo y los puentes con la pista de ahora (una vez por cuadro, aunque cambie muchas veces). */
  const armarSuelo = () => {
    reconstruir = false;
    if (!pista) return;
    if (suelo) {
      escena.remove(suelo.grupo);
      suelo.grupo.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    suelo = sueloDePista(pista, verDebajo);
    escena.add(suelo.grupo);
    const tamanoNuevo = `${pista.columnas}x${pista.filas}`;
    if (tamanoNuevo !== tamanoPista) {
      tamanoPista = tamanoNuevo;
      encuadrar();
    }
  };

  function dibujar() {
    pendiente = false;
    if (!activa) return;
    if (reconstruir) armarSuelo();
    const sigue = controles.update();
    if (modo !== 'orbita') seguirCamara(true);
    renderer.render(escena, camara);
    // Mientras la cámara se acomoda (amortiguación o seguimiento), sigue dibujando.
    if (sigue || (modo !== 'orbita' && camara.position.distanceTo(posicionCamara) > 1)) pedir();
  }
  function pedir() {
    if (pendiente || !activa) return;
    pendiente = true;
    requestAnimationFrame(dibujar);
  }
  controles.addEventListener('change', pedir);
  controles.addEventListener('start', () => {
    // Girar la cámara a mano vuelve a la órbita libre.
    if (modo !== 'orbita') {
      modo = 'orbita';
      contenedor.dispatchEvent(new CustomEvent('camara3d', { detail: modo }));
    }
  });

  const reconstruirRobot = () => {
    escena.remove(modelo.grupo);
    modelo = modeloRobot(robot);
    escena.add(modelo.grupo);
    ubicarRobot();
  };

  fondo();
  return {
    mostrarPista(p, debajo = false) {
      if (p === pista && debajo === verDebajo) return;
      const otra = p !== pista;
      pista = p;
      verDebajo = debajo;
      relieve = crearRelieve(p);
      reconstruir = true;
      if (!activa) armarSuelo();
      if (otra) this.reiniciar(poseInicial(p));
      pedir();
    },
    cambiarRobot(r) {
      robot = r;
      reconstruirRobot();
      pedir();
    },
    mostrarInstantanea(i) {
      if (i.reinicio !== reinicio) {
        reinicio = i.reinicio;
        anterior = null;
        rastroPuntos.push(new THREE.Vector3(NaN, NaN, NaN));
      }
      const e = i.estado;
      pose = { x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: e.pitch, roll: e.roll };
      // Las ruedas giran lo que avanzó cada lado desde el cuadro anterior.
      if (anterior) {
        const dx = pose.x - anterior.x;
        const dy = pose.y - anterior.y;
        const avance = dx * Math.cos(anterior.yaw) + dy * Math.sin(anterior.yaw);
        const giro = pose.yaw - anterior.yaw;
        const radio = robot.ruedas.diametro / 2 || RADIO_RUEDA;
        giroIzq += (avance - giro * robot.ruedas.trocha / 2) / radio;
        giroDer += (avance + giro * robot.ruedas.trocha / 2) / radio;
      }
      anterior = pose;
      ubicarRobot();
      // LEDs del QTR, color de los TCS y el rayo del láser.
      const s = i.sensores;
      modelo.leds.forEach((m, k) => {
        const ve = (s.qtr[k] ?? 0) > QTR_VE_LINEA;
        m.color.setHex(ve ? COLORES.qtrVe : COLORES.qtrApagado);
        m.emissive.setHex(ve ? COLORES.qtrVe : 0x000000);
      });
      [s.color, s.color2].forEach((l, k) => {
        if (!l || !modelo.tcs[k]) return;
        const c = colorTCS(l);
        modelo.tcs[k].color.copy(c);
        modelo.tcs[k].emissive.copy(c).multiplyScalar(0.6);
      });
      const largo = Math.min(s.distanciaMm, SIN_OBJETIVO_MM);
      const fin = modelo.origenRayo.clone().addScaledVector(modelo.direccionRayo, largo);
      modelo.rayo.geometry.setFromPoints([modelo.origenRayo, fin]);
      modelo.rayo.visible = s.distanciaMm < SIN_OBJETIVO_MM;
      // El rastro.
      const ultimo = rastroPuntos.at(-1);
      if (!ultimo || Number.isNaN(ultimo.x) || ultimo.distanceTo(new THREE.Vector3(e.x, e.y, e.z)) > 8) {
        rastroPuntos.push(new THREE.Vector3(e.x, e.y, e.z + 1.5 + SOBRE_SUELO));
        if (rastroPuntos.length > MAXIMO_RASTRO) rastroPuntos.splice(0, rastroPuntos.length - MAXIMO_RASTRO);
        // Los NaN separan los tramos de cada reinicio: la línea se dibuja solo con los del último.
        const corte = rastroPuntos.map(p => Number.isNaN(p.x)).lastIndexOf(true);
        rastro.geometry.dispose();
        rastro.geometry = new THREE.BufferGeometry().setFromPoints(rastroPuntos.slice(corte + 1));
      }
      pedir();
    },
    reiniciar(p) {
      // Como el simulador: el robot empieza en el piso de arriba.
      pose = { x: p.x, y: p.y, z: relieve ? relieve.altura(p.x, p.y) : 0, yaw: p.yaw, pitch: 0, roll: 0 };
      anterior = null;
      rastroPuntos.length = 0;
      rastro.geometry.dispose();
      rastro.geometry = new THREE.BufferGeometry();
      reinicio = -1;
      modelo.leds.forEach(m => { m.color.setHex(COLORES.qtrApagado); m.emissive.setHex(0); });
      modelo.rayo.visible = false;
      ubicarRobot();
      if (modo !== 'orbita') seguirCamara(false);
      pedir();
    },
    camara(m) {
      modo = m;
      if (m === 'orbita') encuadrar();
      else seguirCamara(false);
      pedir();
    },
    activar(si) {
      activa = si;
      if (si) {
        tamano();
        pedir();
      }
    },
  };
}
