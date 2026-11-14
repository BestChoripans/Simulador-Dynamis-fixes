import { Bitacora } from './bitacora';
import { crearConsola } from './consola';
import type { EstadoBluetooth } from '../simulacion/simulador';

/**
 * "Mensajes del robot" con dos pestañas: USB · Serial (el monitor serie) y Bluetooth (un teléfono
 * simulado que se conecta a SerialBT). En las dos se le puede escribir al robot mientras corre.
 */
export interface EventosComunicacion {
  /** Devuelve cuántos bytes entraron al búfer del robot (0 si no corre). */
  enviarSerial(bytes: Uint8Array): number;
  enviarBluetooth(bytes: Uint8Array): number;
  conectarBluetooth(si: boolean): void;
  /** El instante (s) de la prueba, para la hora de cada mensaje enviado. */
  ahora(): number;
}

export interface Comunicacion {
  /** Lo que el robot hizo con el Bluetooth en la última instantánea. */
  mostrarBluetooth(t: number, estado: EstadoBluetooth & { texto: string }): void;
  /** Con la prueba corriendo se puede escribir; si no, el teléfono queda desconectado. */
  habilitar(corriendo: boolean): void;
  refrescarSerial(): void;
  irAlFinal(): void;
}

const FINALES: Record<string, string> = { nl: '\n', nada: '', crnl: '\r\n' };
const CLAVE_FINALES = 'dynamis.finales';
type Canal = 'serial' | 'bt';

function almacen(raiz: Document): Storage | null {
  try {
    return raiz.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function crearComunicacion(raiz: Document, bitacora: Bitacora, eventos: EventosComunicacion): Comunicacion {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => raiz.getElementById(id) as T;
  const consolaSerial = crearConsola($('consola'), $('pildora-nuevos'), null, bitacora);
  const bitacoraBt = new Bitacora();
  const consolaBt = crearConsola($('consola-bt'), $('pildora-bt'), null, bitacoraBt);
  const codificador = new TextEncoder();
  const local = almacen(raiz);

  // Pestañas, con flechas del teclado como los demás tablist de la app.
  const pestanas: Record<Canal, HTMLElement> = { serial: $('tab-serial'), bt: $('tab-bt') };
  const paneles: Record<Canal, HTMLElement> = { serial: $('panel-serial'), bt: $('panel-bt') };
  let activa: Canal = 'serial';
  const elegir = (c: Canal, enfocar = false) => {
    activa = c;
    for (const k of ['serial', 'bt'] as Canal[]) {
      pestanas[k].setAttribute('aria-selected', String(k === c));
      pestanas[k].tabIndex = k === c ? 0 : -1;
      paneles[k].hidden = k !== c;
    }
    if (c === 'bt') $('bt-punto').hidden = true;
    (c === 'serial' ? consolaSerial : consolaBt).irAlFinal();
    if (enfocar) pestanas[c].focus();
  };
  pestanas.serial.addEventListener('click', () => elegir('serial'));
  pestanas.bt.addEventListener('click', () => elegir('bt'));
  for (const p of Object.values(pestanas)) {
    p.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      elegir(activa === 'serial' ? 'bt' : 'serial', true);
    });
  }
  $('btn-limpiar').addEventListener('click', () => {
    if (activa === 'serial') {
      bitacora.limpiar();
      consolaSerial.refrescar();
    } else {
      bitacoraBt.limpiar();
      consolaBt.refrescar();
    }
  });

  // El final de línea elegido en cada pestaña se recuerda en este navegador.
  const selectores: Record<Canal, HTMLSelectElement> = { serial: $('fin-serial'), bt: $('fin-bt') };
  try {
    const guardado = JSON.parse(local?.getItem(CLAVE_FINALES) ?? '{}') as Partial<Record<Canal, string>>;
    for (const c of ['serial', 'bt'] as Canal[]) if (guardado[c] && guardado[c]! in FINALES) selectores[c].value = guardado[c]!;
  } catch {
    // Sin preferencias guardadas: "Nueva línea", como el monitor serie del Arduino IDE.
  }
  for (const s of Object.values(selectores)) {
    s.addEventListener('change', () => {
      try { local?.setItem(CLAVE_FINALES, JSON.stringify({ serial: selectores.serial.value, bt: selectores.bt.value })); } catch { /* no es grave */ }
    });
  }

  let corriendo = false;
  let bt: EstadoBluetooth = { nombre: null, encendido: false, conectado: false };
  /** El clic en Conectar/Desconectar vale hasta que la próxima instantánea lo confirme. */
  let pedido: boolean | null = null;

  const enviar = (canal: Canal, texto: string, conFinal: boolean) => {
    const final = conFinal ? FINALES[selectores[canal].value] ?? '\n' : '';
    const bytes = codificador.encode(texto + final);
    const entraron = canal === 'serial' ? eventos.enviarSerial(bytes) : eventos.enviarBluetooth(bytes);
    const b = canal === 'serial' ? bitacora : bitacoraBt;
    const visible = texto === '' ? '(solo el final de línea)' : texto;
    b.agregarEnviado(eventos.ahora(), entraron < bytes.length ? `${visible}  · no cupo todo: el robot no está leyendo` : visible);
    (canal === 'serial' ? consolaSerial : consolaBt).refrescar();
  };

  const formulario = (canal: Canal, idForm: string, idEntrada: string) => {
    const form = $<HTMLFormElement>(idForm);
    const entrada = $<HTMLInputElement>(idEntrada);
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (entrada.disabled) return;
      enviar(canal, entrada.value, true);
      entrada.value = '';
      entrada.focus();
    });
  };
  formulario('serial', 'form-serial', 'in-serial');
  formulario('bt', 'form-bt', 'in-bt');

  const teclas = [...$('control-bt').querySelectorAll<HTMLButtonElement>('.tecla')];
  for (const tecla of teclas) tecla.addEventListener('click', () => enviar('bt', tecla.dataset.envia ?? '', false));

  const botonConectar = $<HTMLButtonElement>('btn-bt-conectar');
  botonConectar.addEventListener('click', () => {
    const conectar = !(pedido ?? bt.conectado);
    pedido = conectar;
    eventos.conectarBluetooth(conectar);
    if (conectar) bitacoraBt.agregarEnviado(eventos.ahora(), `(conectando el teléfono a «${bt.nombre ?? 'ESP32'}»…)`);
    else bitacoraBt.agregarSistema(eventos.ahora(), 'Desconectaste el teléfono.');
    consolaBt.refrescar();
    dibujarBluetooth();
  });

  const fijarEntrada = (form: string, entrada: string, activa: boolean, aviso: string) => {
    const e = $<HTMLInputElement>(entrada);
    e.disabled = !activa;
    e.placeholder = aviso;
    $(form).querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = !activa;
  };

  function dibujarBluetooth() {
    const conectado = pedido ?? bt.conectado;
    const caja = $('bt-estado');
    const titulo = $('bt-titulo');
    const detalle = $('bt-detalle');
    const nombre = bt.nombre ?? 'ESP32';
    let estado: string;
    if (!corriendo) {
      estado = 'apagado';
      titulo.textContent = 'Teléfono simulado';
      detalle.innerHTML = 'Prueba tu robot. Si tu programa usa <code>SerialBT.begin("Nombre")</code>, aquí podrás conectarte a él.';
    } else if (!bt.encendido) {
      estado = 'apagado';
      titulo.textContent = 'El robot no ha encendido el Bluetooth';
      detalle.innerHTML = 'Agrega <code>#include "BluetoothSerial.h"</code>, <code>BluetoothSerial SerialBT;</code> y en <code>setup()</code> <code>SerialBT.begin("MiRobot");</code>';
    } else if (!conectado) {
      estado = 'visible';
      titulo.textContent = `«${nombre}» está visible`;
      detalle.textContent = 'El robot espera un teléfono. Conéctate para ver lo que envía y escribirle.';
    } else {
      estado = 'conectado';
      titulo.textContent = `Conectado a «${nombre}»`;
      detalle.innerHTML = 'Lo que escribas llega a <code>SerialBT.read()</code>; lo que el robot envía con <code>SerialBT.print</code> aparece abajo.';
    }
    caja.dataset.estado = estado;
    botonConectar.disabled = !corriendo || !bt.encendido;
    botonConectar.textContent = conectado && bt.encendido ? 'Desconectar' : 'Conectar teléfono';
    const listo = corriendo && bt.encendido && conectado;
    fijarEntrada('form-bt', 'in-bt', listo, listo ? `Escribe un mensaje para «${nombre}»` : 'Conecta el teléfono para escribirle al robot');
    for (const t of teclas) t.disabled = !listo;
  }

  const avisarPestana = () => { if (activa !== 'bt') $('bt-punto').hidden = false; };

  dibujarBluetooth();
  return {
    mostrarBluetooth(t, e) {
      const antes = bt;
      bt = { nombre: e.nombre, encendido: e.encendido, conectado: e.conectado };
      if (pedido !== null && pedido === e.conectado) pedido = null;
      if (e.encendido && !antes.encendido) {
        bitacoraBt.agregarSistema(t, `El robot encendió el Bluetooth como «${e.nombre ?? 'ESP32'}».`);
        avisarPestana();
      }
      if (!e.encendido && antes.encendido) bitacoraBt.agregarSistema(t, 'El robot apagó el Bluetooth.');
      // El robot cortó la conexión (disconnect, end o un reinicio) sin que el teléfono la pidiera.
      if (antes.conectado && !e.conectado && pedido === null && e.encendido) bitacoraBt.agregarSistema(t, 'El robot cortó la conexión.');
      if (e.conectado && !antes.conectado) bitacoraBt.agregarSistema(t, `Teléfono conectado a «${e.nombre ?? 'ESP32'}».`);
      if (e.texto) {
        bitacoraBt.agregarSerial(t, e.texto);
        avisarPestana();
      }
      consolaBt.refrescar();
      if (antes.encendido !== bt.encendido || antes.conectado !== bt.conectado || antes.nombre !== bt.nombre) dibujarBluetooth();
    },
    habilitar(si) {
      if (corriendo === si) return;
      corriendo = si;
      if (!si) {
        if (bt.conectado) bitacoraBt.agregarSistema(eventos.ahora(), 'La prueba terminó: el teléfono se desconectó.');
        bt = { ...bt, encendido: false, conectado: false };
        pedido = null;
        consolaBt.refrescar();
      }
      fijarEntrada('form-serial', 'in-serial', si, si ? 'Escribe para el robot: llega a Serial.read()' : 'Prueba tu robot para escribirle por el Serial');
      dibujarBluetooth();
    },
    refrescarSerial: () => consolaSerial.refrescar(),
    irAlFinal() {
      consolaSerial.irAlFinal();
      consolaBt.irAlFinal();
    },
  };
}
