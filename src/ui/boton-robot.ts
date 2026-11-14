/**
 * "Botón del robot": hace de botón físico conectado a un pin. Mientras se mantiene apretado (con el
 * mouse, el dedo o la barra espaciadora), digitalRead(pin) lee el nivel contrario al de reposo.
 */
const CLAVE_PIN = 'dynamis.pinBoton';
const PIN_POR_DEFECTO = 12;

export function crearBotonRobot(raiz: Document, presionar: (pin: number, si: boolean) => void): { habilitar(si: boolean): void } {
  const boton = raiz.getElementById('btn-boton') as HTMLButtonElement;
  const entrada = raiz.getElementById('pin-boton') as HTMLInputElement;
  let local: Storage | null = null;
  try { local = raiz.defaultView?.localStorage ?? null; } catch { local = null; }
  const guardado = Number(local?.getItem(CLAVE_PIN) ?? '');
  entrada.value = String(Number.isInteger(guardado) && guardado >= 0 && guardado <= 39 && local?.getItem(CLAVE_PIN) ? guardado : PIN_POR_DEFECTO);

  const pin = () => {
    const n = Math.round(Number(entrada.value));
    return Number.isFinite(n) ? Math.min(39, Math.max(0, n)) : PIN_POR_DEFECTO;
  };
  let apretadoEn: number | null = null;
  const apretar = () => {
    if (boton.disabled || apretadoEn !== null) return;
    apretadoEn = pin();
    presionar(apretadoEn, true);
    boton.setAttribute('aria-pressed', 'true');
  };
  const soltar = () => {
    if (apretadoEn === null) return;
    presionar(apretadoEn, false);
    apretadoEn = null;
    boton.setAttribute('aria-pressed', 'false');
  };

  boton.addEventListener('pointerdown', e => {
    boton.setPointerCapture?.(e.pointerId);
    apretar();
  });
  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'] as const) boton.addEventListener(tipo, soltar);
  boton.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) apretar();
  });
  boton.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') soltar();
  });
  // El clic ya se atendió con pointerdown/up: no hace nada más.
  boton.addEventListener('click', e => e.preventDefault());
  entrada.addEventListener('change', () => {
    soltar();
    entrada.value = String(pin());
    try { local?.setItem(CLAVE_PIN, entrada.value); } catch { /* vale hasta recargar */ }
  });

  return {
    habilitar(si) {
      if (!si) soltar();
      boton.disabled = !si;
    },
  };
}
