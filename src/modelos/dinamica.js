// MODELO DE DINÁMICA DEL ROBOT.
// Contrato y unidades: ver src/modelos/README.md. Las constantes físicas están en parametros.js.
import { huellaRobot } from '../robot/config';
import { PARAMETROS as P } from './parametros.js';

/**
 * Estado del robot al empezar una ejecución.
 * @param {{ x: number, y: number, yaw: number }} pose mm y rad, en el marco del mundo
 * @param {import('../robot/config').ConfigRobot} robot
 * @param {import('../mundo/tipos').Mundo} mundo
 */
export function estadoInicial(pose, robot, mundo) {
  return {
    x: pose.x, y: pose.y, yaw: pose.yaw, ...apoyo(pose.x, pose.y, pose.yaw, robot, mundo),
    // Velocidades del cuerpo (mm/s y rad/s): hacia adelante, hacia la izquierda y de giro.
    v: 0, vLat: 0, w: 0,
    // Velocidad del borde de cada rueda motriz (mm/s): si no es la del suelo, la rueda patina.
    ruedaIzq: 0, ruedaDer: 0,
    patinaIzq: false, patinaDer: false, choque: false,
    // Cuánto más fuerte es cada motor que lo nominal: se sortea con el azar en el primer paso.
    fuerzaIzq: null, fuerzaDer: null,
  };
}

/**
 * Altura e inclinación del robot apoyado en el suelo. z es la altura del suelo bajo el eje de las
 * ruedas. El roll sale de la altura del suelo bajo cada rueda motriz. El pitch, de dos apoyos a lo
 * largo del robot: el eje de las ruedas y el de las ruedas locas, si las tiene; si no, el frente y la
 * cola del chasis. Así el robot empieza a subir cuando su apoyo delantero llega a la rampa, y un
 * bache chico lo inclina poco.
 */
function apoyo(x, y, yaw, robot, mundo) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const suelo = (adelante, izquierda) => mundo.altura(x + adelante * c - izquierda * s, y + adelante * s + izquierda * c);
  const locas = robot.ruedasLocas;
  const conLocas = locas?.instalado && locas.x !== robot.ruedas.x;
  const delante = conLocas ? locas.x : robot.chasis.xDelantero;
  const atras = conLocas ? robot.ruedas.x : robot.chasis.xDelantero - robot.chasis.largo;
  const medio = robot.ruedas.trocha / 2;
  const hDelante = suelo(delante, 0);
  const hAtras = suelo(atras, 0);
  const z = hAtras + ((hDelante - hAtras) * (robot.ruedas.x - atras)) / (delante - atras);
  const pitch = -Math.atan2(hDelante - hAtras, delante - atras);
  const roll = Math.atan2(suelo(robot.ruedas.x, medio) - suelo(robot.ruedas.x, -medio), 2 * medio);
  return { z, pitch: pitch === 0 ? 0 : pitch, roll: roll === 0 ? 0 : roll };
}

/**
 * Integra una velocidad con una fuerza y un roce de Coulomb: el roce se opone al movimiento, pero no
 * lo invierte, y no mueve algo detenido si la fuerza no lo vence.
 */
function conRoce(vel, fuerza, roce, masa, dt) {
  const quieto = Math.abs(vel) < 1e-6;
  if (quieto && Math.abs(fuerza) <= roce) return 0;
  const dir = quieto ? signo(fuerza) : signo(vel);
  const nueva = vel + ((fuerza - dir * roce) / masa) * dt;
  // El roce solo puede detenerlo: si cambió de sentido sin que la fuerza lo empujara, queda quieto.
  if (!quieto && signo(nueva) !== dir && Math.abs(fuerza) <= roce) return 0;
  return nueva;
}
const signo = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Fuerza del motor en el borde de la rueda (N), con la curva torque–velocidad de un motor DC:
 * máxima con la rueda detenida y cero a la velocidad sin carga. En freno, el motor en corto frena
 * en proporción a la velocidad; libre, solo queda el roce de la caja.
 */
function fuerzaMotor(m, vRueda, vMax, fuerza) {
  const roce = -P.roceCaja * signo(vRueda);
  const relativa = vRueda / vMax;
  if (m.modo === 'avance' || m.modo === 'retroceso') return fuerza * (m.duty - relativa) + roce;
  if (m.modo === 'freno') return -fuerza * P.frenoCorto * relativa + roce;
  return roce;
}

/**
 * Avanza el estado del robot un paso de dt segundos.
 *
 * Modelo: un cuerpo rígido en el plano del suelo con dos ruedas motrices. Cada rueda tiene su motor
 * DC (curva torque–velocidad, freno en corto, roce de la caja) y su inercia. El suelo empuja cada
 * rueda con la fuerza que iguala la velocidad de la rueda y la del suelo, hasta el límite de la
 * fricción (μ·N): si se pasa, la rueda patina con fricción dinámica. Las ruedas no deslizan de lado
 * hasta el mismo límite. La gravedad tira hacia abajo de las rampas y reparte el peso; hay
 * resistencia a la rodadura y roce de las ruedas locas al girar. Si el chasis choca con un
 * obstáculo, el robot se detiene contra él y las ruedas siguen girando (patinan).
 *
 * @param {Record<string, any>} estado { x, y, z, yaw, pitch, roll, ...campos propios }
 * @param {import('../simulacion/motores').Motores} motores duty ∈ [−1, 1] y modo de cada motor
 * @param {number} dt segundos
 * @param {import('../mundo/tipos').Mundo} mundo
 * @param {import('../robot/config').ConfigRobot} robot
 * @param {() => number} azar números aleatorios en [0, 1) con la semilla de la ejecución
 */
export function pasoDinamica(estado, motores, dt, mundo, robot, azar) {
  // Unidades SI adentro (m, s, N, kg); el estado sigue en mm.
  // vMaxMmS es la velocidad máxima que se mide en el robot en lo plano: la del motor sin carga es un
  // poco más, la que compensa el roce de la caja y la rodadura.
  const perdidas = (P.roceCaja + (P.rodadura * P.masa * P.gravedad) / 2) / P.fuerzaArranque;
  const vMax = Math.max(1, robot.motores.vMaxMmS) / 1000 / Math.max(0.5, 1 - perdidas);
  const b = robot.ruedas.trocha / 1000;
  const m = P.masa;
  const largo = robot.chasis.largo / 1000;
  const ancho = robot.chasis.ancho / 1000;
  const inercia = (m * (largo * largo + ancho * ancho)) / 12;
  const g = P.gravedad;

  // Cada motor es un poco distinto (como en el robot real): se sortea una vez por ejecución.
  const fuerzaIzq = estado.fuerzaIzq ?? P.fuerzaArranque * (1 + P.diferenciaMotores * (2 * azar() - 1));
  const fuerzaDer = estado.fuerzaDer ?? P.fuerzaArranque * (1 + P.diferenciaMotores * (2 * azar() - 1));

  let v = (estado.v ?? 0) / 1000;
  let vLat = (estado.vLat ?? 0) / 1000;
  let w = estado.w ?? 0;
  let ruedaIzq = (estado.ruedaIzq ?? v * 1000) / 1000;
  let ruedaDer = (estado.ruedaDer ?? v * 1000) / 1000;

  // La inclinación del robot apoyado (la de su cuerpo, no la del suelo bajo un punto): el peso se
  // reparte (cos) y una parte tira cuesta abajo (sin). Al pasar la cima de una rampa, con las locas
  // ya arriba, el cuerpo está menos inclinado que la rampa y cuesta menos seguir.
  const pitch = estado.pitch ?? 0;
  const roll = estado.roll ?? 0;
  const normal = m * g * Math.cos(pitch) * Math.cos(roll);
  // Al subir, el peso se corre hacia atrás (a las motrices, que van atrás); al bajar, hacia adelante.
  const enMotrices = Math.min(0.95, Math.max(0.3, P.pesoEnMotrices - 2 * Math.sin(pitch) * 0.25));
  const nRueda = (normal * enMotrices) / 2;
  const nLocas = normal * (1 - enMotrices);
  const cuestaAbajo = g * Math.sin(pitch); // pitch < 0 subiendo: frena
  const deLado = -g * Math.sin(roll); // roll > 0 con la izquierda arriba: se cae a la derecha

  // Velocidad del suelo bajo cada rueda.
  const sueloIzq = v - (w * b) / 2;
  const sueloDer = v + (w * b) / 2;

  // Fuerza del suelo en cada rueda: la que deja iguales la rueda y el suelo al final de este paso
  // (con el empuje del motor y la cuesta incluidos), hasta μ·N; si no alcanza, la rueda patina.
  const fMotorIzq = fuerzaMotor(motores.izq, ruedaIzq, vMax, fuerzaIzq);
  const fMotorDer = fuerzaMotor(motores.der, ruedaDer, vMax, fuerzaDer);
  const contacto = (vRueda, vSuelo, fMotor) => {
    const necesaria = (vRueda - vSuelo + dt * (fMotor / P.inerciaRueda - cuestaAbajo)) / (dt * (1 / P.inerciaRueda + 2 / m));
    const limite = P.friccionEstatica * nRueda;
    if (Math.abs(necesaria) <= limite) return { fuerza: necesaria, patina: false };
    return { fuerza: signo(necesaria) * P.friccionDinamica * nRueda, patina: true };
  };
  const tIzq = contacto(ruedaIzq, sueloIzq, fMotorIzq);
  const tDer = contacto(ruedaDer, sueloDer, fMotorDer);

  // Cada rueda: la empuja su motor y la frena el suelo.
  ruedaIzq += ((fMotorIzq - tIzq.fuerza) / P.inerciaRueda) * dt;
  ruedaDer += ((fMotorDer - tDer.fuerza) / P.inerciaRueda) * dt;

  // El cuerpo: avance, giro y deslizamiento lateral.
  v = conRoce(v, tIzq.fuerza + tDer.fuerza + m * cuestaAbajo, P.rodadura * normal, m, dt);
  // Giro: lo frena el roce de las ruedas locas (y un poco el de las motrices al pivotar).
  w = conRoce(w, ((tDer.fuerza - tIzq.fuerza) * b) / 2, P.roceGiro * nLocas + 0.002 * normal, inercia, dt);

  // De lado, las ruedas no deslizan hasta su límite de fricción.
  const lateralNecesaria = -m * vLat / dt - m * deLado;
  const lateralLimite = P.friccionEstatica * normal;
  const fLat = Math.abs(lateralNecesaria) <= lateralLimite ? lateralNecesaria : signo(lateralNecesaria) * P.friccionDinamica * normal;
  vLat += (fLat / m + deLado) * dt;

  // Posición nueva (mm).
  const yaw = estado.yaw + w * dt;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let x = estado.x + (v * c - vLat * s) * 1000 * dt;
  let y = estado.y + (v * s + vLat * c) * 1000 * dt;
  let nuevoYaw = yaw;
  let choque = false;
  if (mundo.colisiona(huellaRobot(x, y, yaw, robot))) {
    // Contra un obstáculo: se queda donde estaba y pierde la velocidad; las ruedas siguen girando.
    choque = true;
    x = estado.x;
    y = estado.y;
    nuevoYaw = mundo.colisiona(huellaRobot(x, y, yaw, robot)) ? estado.yaw : yaw;
    v = 0;
    vLat = 0;
    w = nuevoYaw === estado.yaw ? 0 : w;
  }

  return {
    ...estado, x, y, yaw: nuevoYaw, ...apoyo(x, y, nuevoYaw, robot, mundo),
    v: v * 1000, vLat: vLat * 1000, w,
    ruedaIzq: ruedaIzq * 1000, ruedaDer: ruedaDer * 1000,
    patinaIzq: tIzq.patina, patinaDer: tDer.patina, choque,
    fuerzaIzq, fuerzaDer,
  };
}
