import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dibujarPista } from './dibujo';
import { aLocal } from '../pista/baldosas';
import { alturaBaldosa } from '../mundo/relieve';
import { gradosARadianes, poseInicial } from '../pista/serializacion';
import { TAMANO_BALDOSA as T, type Baldosa, type Pista } from '../pista/tipos';
import type { ConfigRobot } from '../robot/config';
import type { Instantanea } from '../simulacion/ejecucion';
import type { Pose } from '../simulacion/simulador';

/**
 * La pista y el robot en 3D, con Three.js. El mundo va en mm con z hacia arriba, igual que el
 * simulador: la cámara usa z como "arriba". Dibuja solo cuando algo cambió (o la cámara se mueve).
 */
export type Camara3D = 'orbita' | 'seguir' | 'arriba' | 'robot';

export interface Vista3D {
  mostrarPista(p: Pista): void;
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

const COLORES = {
  chasis: 0x6a4fd8,
  placa: 0x1e7b5a,
  rueda: 0x1b1b24,
  llanta: 0xd9dde8,
  loca: 0xc9ccd6,
  pared: 0xdfe8f2,
  mesa: 0x8a6a4a,
  obstaculo: 0xa9b4e0,
  rayo: 0xff4d6d,
  rastro: 0xff9fad,
  qtrApagado: 0x2a2a3a,
  qtrVe: 0xffd166,
};

function variableCss(nombre: string, porDefecto: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || porDefecto;
}

/** La textura de la pista vista desde arriba: lo mismo que el 2D (cinta, marcas, hitos, flecha de inicio). */
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

/** Altura del suelo de una baldosa en un punto del mundo (sin baches): la de la baldosa aunque el punto esté en su borde. */
function alturaEn(b: Baldosa, x: number, y: number): number {
  const { u, v } = aLocal(b, x, y);
  const acotar = (n: number) => Math.min(T, Math.max(0, n));
  return alturaBaldosa(b, acotar(u), acotar(v));
}

/** El suelo: una malla por baldosa (plana, elevada o en rampa) con la textura de la pista, y paredes bajo lo elevado. */
function sueloDePista(p: Pista, textura: THREE.Texture): THREE.Group {
  const grupo = new THREE.Group();
  const ancho = p.columnas * T;
  const alto = p.filas * T;
  const material = new THREE.MeshStandardMaterial({ map: textura, roughness: 0.85, metalness: 0 });
  const pared = new THREE.MeshStandardMaterial({ color: COLORES.pared, roughness: 0.9 });
  const indice = new Map(p.baldosas.map(b => [`${b.c},${b.r}`, b]));
  const posiciones: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const paredes: number[] = [];
  const DIV = 6;
  for (let c = 0; c < p.columnas; c++) {
    for (let r = 0; r < p.filas; r++) {
      const b = indice.get(`${c},${r}`);
      const h = (x: number, y: number) => (b ? alturaEn(b, x, y) : 0);
      const base = posiciones.length / 3;
      for (let i = 0; i <= DIV; i++) {
        for (let j = 0; j <= DIV; j++) {
          const x = c * T + (i / DIV) * T;
          const y = r * T + (j / DIV) * T;
          posiciones.push(x, y, h(x, y));
          uvs.push(x / ancho, y / alto);
        }
      }
      for (let i = 0; i < DIV; i++) {
        for (let j = 0; j < DIV; j++) {
          const a = base + i * (DIV + 1) + j;
          const bb = a + DIV + 1;
          indices.push(a, bb, a + 1, a + 1, bb, bb + 1);
        }
      }
      // Paredes: donde el borde de la baldosa queda más alto que el suelo de al lado.
      if (!b) continue;
      const bordes: [number, number, number, number, number, number][] = [
        [c * T, r * T, (c + 1) * T, r * T, 0, -1], [(c + 1) * T, r * T, (c + 1) * T, (r + 1) * T, 1, 0],
        [(c + 1) * T, (r + 1) * T, c * T, (r + 1) * T, 0, 1], [c * T, (r + 1) * T, c * T, r * T, -1, 0],
      ];
      for (const [x0, y0, x1, y1, dc, dr] of bordes) {
        const vecina = indice.get(`${c + dc},${r + dr}`);
        const hv = (x: number, y: number) => (vecina ? alturaEn(vecina, x, y) : 0);
        const a0 = h(x0, y0), a1 = h(x1, y1), b0 = hv(x0, y0), b1 = hv(x1, y1);
        if (a0 - b0 < 1 && a1 - b1 < 1) continue;
        paredes.push(x0, y0, a0, x1, y1, a1, x1, y1, b1, x0, y0, a0, x1, y1, b1, x0, y0, b0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const suelo = new THREE.Mesh(geo, material);
  suelo.receiveShadow = true;
  grupo.add(suelo);
  if (paredes.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(paredes, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, pared);
    m.material.side = THREE.DoubleSide;
    m.castShadow = true;
    m.receiveShadow = true;
    grupo.add(m);
  }
  // La mesa: un tablero bajo la pista, un poco más grande.
  const mesa = new THREE.Mesh(new THREE.BoxGeometry(ancho + 120, alto + 120, 30), new THREE.MeshStandardMaterial({ color: COLORES.mesa, roughness: 0.8 }));
  mesa.position.set(ancho / 2, alto / 2, -15.5);
  mesa.receiveShadow = true;
  grupo.add(mesa);

  // Obstáculos (cajas) y baches (medio cilindro).
  for (const o of p.objetos) {
    if (o.tipo === 'obstaculo') {
      const caja = new THREE.Mesh(new THREE.BoxGeometry(o.props.largo, o.props.ancho, o.props.alto), new THREE.MeshStandardMaterial({ color: COLORES.obstaculo, roughness: 0.6 }));
      const b = indice.get(`${Math.floor(o.x / T)},${Math.floor(o.y / T)}`);
      caja.position.set(o.x, o.y, (b ? alturaEn(b, o.x, o.y) : 0) + o.props.alto / 2);
      caja.rotation.z = gradosARadianes(o.rot);
      caja.castShadow = true;
      caja.receiveShadow = true;
      grupo.add(caja);
    } else if (o.tipo === 'bache') {
      const cilindro = new THREE.Mesh(
        new THREE.CylinderGeometry(o.props.radio, o.props.radio, o.props.largo, 16, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }));
      // El cilindro de Three va a lo largo de y: se acuesta a lo largo de `rot`.
      cilindro.rotation.order = 'ZXY';
      cilindro.rotation.set(0, Math.PI / 2, gradosARadianes(o.rot) + Math.PI / 2);
      const b = indice.get(`${Math.floor(o.x / T)},${Math.floor(o.y / T)}`);
      cilindro.position.set(o.x, o.y, b ? alturaEn(b, o.x, o.y) : 0);
      cilindro.castShadow = true;
      grupo.add(cilindro);
    }
  }
  return grupo;
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

/** El robot en su marco (x adelante, y izquierda, z arriba; origen en el eje de las ruedas, en el suelo). */
function modeloRobot(robot: ConfigRobot): ModeloRobot {
  const grupo = new THREE.Group();
  const { chasis, ruedas, ruedasLocas, qtr, vl53l0x, tcs34725, tcs34725b, mpu6050 } = robot;
  const radio = ruedas.diametro / 2 || RADIO_RUEDA;
  const mat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
  const sombra = <M extends THREE.Mesh>(m: M) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // Base del chasis (impresa en 3D) y la placa encima.
  const xCentro = chasis.xDelantero - chasis.largo / 2;
  const base = sombra(new THREE.Mesh(new THREE.BoxGeometry(chasis.largo, chasis.ancho - 50, 6), mat(COLORES.chasis)));
  base.position.set(xCentro, 0, radio + 4);
  grupo.add(base);
  const placa = sombra(new THREE.Mesh(new THREE.BoxGeometry(chasis.largo * 0.8, chasis.ancho * 0.55, 2), mat(COLORES.placa, { roughness: 0.4 })));
  placa.position.set(xCentro, 0, radio + 4 + 3 + ALTO_PLACA);
  grupo.add(placa);
  // Postes de la placa, la batería y el ESP32.
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, ALTO_PLACA, 8), mat(0xc0c0c8, { metalness: 0.6 }));
    poste.rotation.x = Math.PI / 2;
    poste.position.set(xCentro + dx * chasis.largo * 0.35, dy * chasis.ancho * 0.24, radio + 4 + 3 + ALTO_PLACA / 2);
    grupo.add(poste);
  }
  const bateria = sombra(new THREE.Mesh(new THREE.BoxGeometry(70, 38, 20), mat(0x2b2b33)));
  bateria.position.set(xCentro - 10, 0, radio + 4 + 3 + ALTO_PLACA + 11);
  grupo.add(bateria);
  const esp = sombra(new THREE.Mesh(new THREE.BoxGeometry(50, 26, 6), mat(0x111111)));
  esp.position.set(xCentro + 25, 20, radio + 4 + 3 + ALTO_PLACA + 4);
  grupo.add(esp);
  // El asa (arco) del chasis, como en el robot de la foto.
  const asa = sombra(new THREE.Mesh(new THREE.TorusGeometry(chasis.ancho * 0.3, 4, 8, 24, Math.PI), mat(COLORES.chasis)));
  // El toro de Three está en el plano xy: su arco pasa a cruzar el robot de lado a lado (plano yz).
  asa.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  asa.position.set(xCentro - chasis.largo * 0.2, 0, radio + 10);
  grupo.add(asa);

  // Ruedas motrices: goma y llanta. Giran sobre su eje y.
  const rueda = (lado: number) => {
    const pivote = new THREE.Group();
    pivote.position.set(ruedas.x, lado * ruedas.trocha / 2, radio);
    const goma = sombra(new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 22, 32), mat(COLORES.rueda, { roughness: 0.95 })));
    pivote.add(goma);
    const llanta = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.55, radio * 0.55, 23, 6), mat(COLORES.llanta));
    pivote.add(llanta);
    grupo.add(pivote);
    return pivote;
  };
  const ruedaIzq = rueda(1);
  const ruedaDer = rueda(-1);
  // Motores (GA25-370) hacia adentro.
  for (const lado of [1, -1]) {
    const motor = sombra(new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 55, 16), mat(0xb8bcc8, { metalness: 0.7, roughness: 0.3 })));
    motor.position.set(ruedas.x, lado * (ruedas.trocha / 2 - 40), radio);
    grupo.add(motor);
  }
  // Ruedas locas.
  if (ruedasLocas.instalado) {
    const r = ruedasLocas.diametro / 2;
    for (const lado of [1, -1]) {
      const loca = sombra(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 24), mat(COLORES.loca)));
      loca.position.set(ruedasLocas.x, lado * ruedasLocas.trocha / 2, r);
      grupo.add(loca);
    }
  }

  // QTR: la barra con 8 LEDs que se encienden cuando ven la línea.
  const n = qtr.pines.length;
  const barra = sombra(new THREE.Mesh(new THREE.BoxGeometry(12, (n + 1) * qtr.separacion, 3), mat(0x1a1a1a)));
  barra.position.set(qtr.x, 0, qtr.altura + 2);
  grupo.add(barra);
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
  mpu.position.set(mpu6050.x, mpu6050.y, Math.max(radio + 20, mpu6050.z));
  grupo.add(mpu);

  return { grupo, ruedaIzq, ruedaDer, leds, tcs, rayo, origenRayo, direccionRayo };
}

/** Color aproximado que ve un TCS34725 (cuentas crudas → RGB de pantalla). */
function colorTCS(l: { r: number; g: number; b: number; c: number }): THREE.Color {
  const max = Math.max(l.r, l.g, l.b, 1);
  const brillo = Math.min(1, l.c / 6000);
  return new THREE.Color(l.r / max * brillo, l.g / max * brillo, l.b / max * brillo);
}

export function crearVista3D(contenedor: HTMLElement, robotInicial: ConfigRobot): Vista3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'lienzo lienzo-3d';
  renderer.domElement.setAttribute('aria-label', 'Vista 3D de la pista y el robot: arrastra para girar, rueda para acercar, clic derecho para mover.');
  contenedor.append(renderer.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(45, 4 / 3, 5, 40000);
  camara.up.set(0, 0, 1);
  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;
  controles.dampingFactor = 0.12;
  controles.maxPolarAngle = Math.PI * 0.49;
  controles.minDistance = 120;
  controles.maxDistance = 9000;

  escena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0005;
  escena.add(sol);
  escena.add(sol.target);

  let pista: Pista | null = null;
  let suelo: THREE.Group | null = null;
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

  function dibujar() {
    pendiente = false;
    if (!activa) return;
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
    mostrarPista(p) {
      pista = p;
      if (suelo) {
        escena.remove(suelo);
        suelo.traverse(o => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const m = o.material as THREE.MeshStandardMaterial;
            m.map?.dispose();
            m.dispose();
          }
        });
      }
      suelo = sueloDePista(p, texturaDePista(p));
      escena.add(suelo);
      encuadrar();
      const inicio = poseInicial(p);
      this.reiniciar(inicio);
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
        rastroPuntos.push(new THREE.Vector3(e.x, e.y, e.z + 1.5));
        if (rastroPuntos.length > MAXIMO_RASTRO) rastroPuntos.splice(0, rastroPuntos.length - MAXIMO_RASTRO);
        // Los NaN separan los tramos de cada reinicio: la línea se dibuja solo con los del último.
        const corte = rastroPuntos.map(p => Number.isNaN(p.x)).lastIndexOf(true);
        rastro.geometry.dispose();
        rastro.geometry = new THREE.BufferGeometry().setFromPoints(rastroPuntos.slice(corte + 1));
      }
      pedir();
    },
    reiniciar(p) {
      const z = pista ? (() => {
        const b = pista.baldosas.find(x => x.c === Math.floor(p.x / T) && x.r === Math.floor(p.y / T));
        return b ? alturaEn(b, p.x, p.y) : 0;
      })() : 0;
      pose = { x: p.x, y: p.y, z, yaw: p.yaw, pitch: 0, roll: 0 };
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
