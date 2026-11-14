import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { EditorView, Decoration, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export interface EditorCodigo {
  /** Muestra un archivo. Cada archivo guarda su propio historial: deshacer nunca cruza de una pestaña a otra. */
  mostrar(ruta: string, texto: string): void;
  /** Olvida el historial de un archivo (renombrado o borrado), o de todos (otro proyecto). */
  olvidar(ruta?: string): void;
  texto(): string;
  /** Marca una línea (1 en adelante) con error; null la quita. Editar también la quita. */
  marcarLinea(linea: number | null): void;
  irALinea(linea: number): void;
  enfocar(): void;
  /** Cambia líneas enteras (desde 1) del archivo abierto en una sola transacción: Ctrl+Z la deshace. */
  cambiarLineas(cambios: { linea: number; texto: string }[]): void;
  /** Resalta líneas (desde 1) hasta la próxima edición; [] las quita. */
  resaltarLineas(lineas: number[]): void;
}

const fijarError = StateEffect.define<number | null>();
const marcaError = Decoration.line({ class: 'linea-error' });
const fijarAjustadas = StateEffect.define<number[]>();
const marcaAjustada = Decoration.line({ class: 'linea-ajustada' });

/** Las líneas que cambió "Usar estos valores": se ven resaltadas hasta que el estudiante edite. */
const campoAjustadas = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marcas, tr) {
    let resultado = tr.docChanged ? Decoration.none : marcas;
    for (const e of tr.effects) {
      if (!e.is(fijarAjustadas)) continue;
      const validas = [...new Set(e.value)].filter(l => l >= 1 && l <= tr.state.doc.lines).sort((a, b) => a - b);
      resultado = Decoration.set(validas.map(l => marcaAjustada.range(tr.state.doc.line(l).from)));
    }
    return resultado;
  },
  provide: f => EditorView.decorations.from(f),
});

/** Las marcas `@ajustar grupo [min..max]` se destacan. */
const marcasAjustar = new MatchDecorator({
  regexp: /@ajustar\b(?:[ \t]+[\p{L}_][\p{L}\p{N}_]*(?:[ \t]+[-+\d.,eE]+[ \t]*\.\.[ \t]*[-+\d.,eE]+)?)?/gu,
  decoration: Decoration.mark({ class: 'marca-ajustar' }),
});
const destacarAjustar = ViewPlugin.fromClass(class {
  marcas: DecorationSet;
  constructor(vista: EditorView) { this.marcas = marcasAjustar.createDeco(vista); }
  update(u: ViewUpdate) { this.marcas = marcasAjustar.updateDeco(u, this.marcas); }
}, { decorations: v => v.marcas });

const campoError = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marcas, tr) {
    let resultado = tr.docChanged ? Decoration.none : marcas;
    for (const e of tr.effects) {
      if (!e.is(fijarError)) continue;
      const linea = e.value;
      resultado = linea === null || linea < 1 || linea > tr.state.doc.lines
        ? Decoration.none
        : Decoration.set([marcaError.range(tr.state.doc.line(linea).from)]);
    }
    return resultado;
  },
  provide: f => EditorView.decorations.from(f),
});

/** Tema con la paleta de Dynamis: los colores salen de tema.css, así cambian con el modo oscuro. */
const tema = EditorView.theme({
  '&': { height: '470px', fontSize: '14px', backgroundColor: 'var(--blanco)', color: 'var(--tinta)' },
  // Sin ligaduras: ">=" se ve como dos caracteres, igual que como se escribe.
  '.cm-scroller': { fontFamily: "'JetBrains Mono', monospace", lineHeight: '1.7', fontVariantLigatures: 'none' },
  '.cm-gutters': { backgroundColor: 'var(--blanco)', color: 'var(--cm-gutter)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--nube)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--hielo)', color: 'var(--azul)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--azul)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--azul)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--hielo)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--hielo)', outline: '1px solid var(--borde)' },
  '.cm-tooltip, .cm-panels': { backgroundColor: 'var(--blanco)', color: 'var(--tinta)', border: '1px solid var(--borde)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--hielo)', color: 'var(--azul)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--hielo)', color: 'var(--tinta-suave)', border: 'none' },
  '.linea-error': { backgroundColor: 'var(--cm-error)', boxShadow: 'inset 4px 0 0 var(--cm-error-borde)' },
  '.linea-ajustada': { backgroundColor: 'var(--cm-aj)', boxShadow: 'inset 4px 0 0 var(--sol)' },
  '.marca-ajustar, .marca-ajustar span': { backgroundColor: 'var(--cm-marca)', color: 'var(--cm-marca-tinta)', borderRadius: '6px', fontStyle: 'normal', fontWeight: '600' },
});

/** Colores del código con la paleta de la app (los mismos en claro y oscuro, por variables CSS). */
const colores = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.bool, t.null, t.self], color: 'var(--cm-kw)', fontWeight: '600' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--cm-fn)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: 'var(--cm-tipo)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--cm-num)' },
  { tag: [t.string, t.character, t.special(t.string)], color: 'var(--cm-str)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-com)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--cm-pre)', fontWeight: '600' },
  { tag: t.invalid, color: 'var(--error)' },
]));

export function crearEditor(contenedor: HTMLElement, alCambiar: (texto: string) => void): EditorCodigo {
  const extensiones = [
    basicSetup, cpp(), tema, colores, campoError, campoAjustadas, destacarAjustar,
    EditorView.contentAttributes.of({ 'aria-label': 'Código del programa' }),
    // setState (cambiar de pestaña) no pasa por aquí: solo lo que escribe el estudiante.
    EditorView.updateListener.of(u => { if (u.docChanged) alCambiar(u.state.doc.toString()); }),
  ];
  const nuevo = (texto: string) => EditorState.create({ doc: texto, extensions: extensiones });
  const vista = new EditorView({ parent: contenedor, state: nuevo('') });
  const estados = new Map<string, EditorState>();
  let rutaActual: string | null = null;
  return {
    mostrar(ruta, texto) {
      if (rutaActual !== null) estados.set(rutaActual, vista.state);
      const guardado = estados.get(ruta);
      vista.setState(guardado && guardado.doc.toString() === texto ? guardado : nuevo(texto));
      rutaActual = ruta;
    },
    olvidar(ruta) {
      if (ruta === undefined) {
        estados.clear();
        rutaActual = null;
      } else {
        estados.delete(ruta);
        if (ruta === rutaActual) rutaActual = null;
      }
    },
    texto: () => vista.state.doc.toString(),
    marcarLinea: linea => vista.dispatch({ effects: fijarError.of(linea) }),
    irALinea(linea) {
      const n = Math.min(Math.max(1, linea), vista.state.doc.lines);
      const { from } = vista.state.doc.line(n);
      vista.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
      vista.focus();
    },
    enfocar: () => vista.focus(),
    cambiarLineas(cambios) {
      const doc = vista.state.doc;
      const validos = cambios.filter(c => c.linea >= 1 && c.linea <= doc.lines);
      vista.dispatch({ changes: validos.map(c => ({ from: doc.line(c.linea).from, to: doc.line(c.linea).to, insert: c.texto })) });
    },
    resaltarLineas: lineas => vista.dispatch({ effects: fijarAjustadas.of(lineas) }),
  };
}
