/**
 * Modo claro u oscuro. index.html lo fija antes de dibujar (el elegido o el del sistema); este botón
 * lo cambia y lo recuerda en este navegador. Mientras no se elija, sigue al sistema.
 */
export type Tema = 'claro' | 'oscuro';
export const CLAVE_TEMA = 'dynamis.tema';

export function crearSelectorTema(raiz: Document): { tema(): Tema } {
  const html = raiz.documentElement;
  const boton = raiz.getElementById('btn-tema');
  const ventana = raiz.defaultView;
  let local: Storage | null = null;
  try { local = ventana?.localStorage ?? null; } catch { local = null; }
  const elegido = (): Tema | null => {
    try {
      const t = local?.getItem(CLAVE_TEMA);
      return t === 'claro' || t === 'oscuro' ? t : null;
    } catch {
      return null;
    }
  };
  const sistema = ventana?.matchMedia?.('(prefers-color-scheme: dark)');
  const actual = (): Tema => (html.dataset.tema === 'oscuro' ? 'oscuro' : 'claro');
  const aplicar = (t: Tema) => {
    html.dataset.tema = t;
    raiz.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'oscuro' ? '#0A0D3D' : '#0B0F98');
    if (!boton) return;
    boton.setAttribute('aria-pressed', String(t === 'oscuro'));
    const texto = raiz.getElementById('txt-tema');
    if (texto) texto.textContent = t === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
    boton.title = t === 'oscuro' ? 'Volver al modo claro' : 'Cambiar al modo oscuro';
  };
  aplicar(elegido() ?? (html.dataset.tema === 'oscuro' || sistema?.matches ? 'oscuro' : 'claro'));
  sistema?.addEventListener?.('change', e => { if (!elegido()) aplicar(e.matches ? 'oscuro' : 'claro'); });
  boton?.addEventListener('click', () => {
    const t: Tema = actual() === 'oscuro' ? 'claro' : 'oscuro';
    try { local?.setItem(CLAVE_TEMA, t); } catch { /* sin almacenamiento, vale hasta recargar */ }
    aplicar(t);
  });
  return { tema: actual };
}
