import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { search, setSearchQuery, findNext, findPrevious, SearchQuery } from "@codemirror/search";
import { updateCircleAttribute, countMatches } from "./editor-utils.js";
import "./style.css";

const initialSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="600" height="360">
  <rect width="600" height="360" fill="#ffffff"/>
  <circle data-id="circle-a" cx="180" cy="150" r="48" fill="#1f6f50" stroke="#173f32" stroke-width="3"/>
  <circle data-id="circle-b" cx="360" cy="210" r="34" fill="#c74735" stroke="#70291f" stroke-width="3"/>
</svg>`;

const root = document.querySelector("#app");
root.innerHTML = `
  <header class="topbar"><div><div class="eyebrow">SVG WORKSHOP · EXPERIMENT</div><h1>Векторная лаборатория</h1></div><div id="status" class="status">Запуск редактора…</div></header>
  <main class="workspace">
    <section class="panel code-panel">
      <div class="panel-head"><strong>SVG-код</strong><span>CodeMirror 6 · XML</span></div>
      <div class="searchbar"><input id="search-input" type="search" placeholder="Найти в коде…" aria-label="Поиск по коду"><span id="search-count">0 совпадений</span><button id="prev" title="Предыдущее совпадение">↑</button><button id="next" title="Следующее совпадение">↓</button></div>
      <div id="editor" aria-label="Редактор SVG-кода"></div>
      <div class="footnote">Изменения кода сразу отображаются в предпросмотре. Перемещайте окружности мышью.</div>
    </section>
    <section class="panel preview-panel">
      <div class="panel-head"><strong>Предпросмотр</strong><span>Перетаскивание объектов включено</span></div>
      <div id="preview" class="preview" aria-label="Предпросмотр SVG"></div>
      <div class="hint">Выберите окружность и перетащите её. Координаты обновятся в коде.</div>
    </section>
  </main>`;

let view;
let syncingFromCanvas = false;
const editorHost = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
const searchInput = document.querySelector("#search-input");
const searchCount = document.querySelector("#search-count");

function renderPreview(source) {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
    status.textContent = "В коде есть ошибка XML";
    status.dataset.kind = "error";
    return;
  }
  const svg = parsed.documentElement;
  for (const node of svg.querySelectorAll("script, foreignObject")) node.remove();
  for (const node of svg.querySelectorAll("*")) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  const safeSvg = document.importNode(svg, true);
  safeSvg.removeAttribute("style");
  preview.replaceChildren(safeSvg);
  for (const circle of safeSvg.querySelectorAll("circle[data-id]")) enableDrag(circle);
  status.textContent = "Редактор готов";
  status.dataset.kind = "ok";
}

function enableDrag(circle) {
  circle.style.cursor = "grab";
  circle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const svg = circle.ownerSVGElement;
    const point = svg.createSVGPoint();
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const start = svg.createSVGPoint();
    start.x = event.clientX; start.y = event.clientY;
    const origin = start.matrixTransform(matrix.inverse());
    const cx = Number(circle.getAttribute("cx") || 0);
    const cy = Number(circle.getAttribute("cy") || 0);
    circle.setPointerCapture?.(event.pointerId);
    circle.style.cursor = "grabbing";
    const move = (moveEvent) => {
      point.x = moveEvent.clientX; point.y = moveEvent.clientY;
      const current = point.matrixTransform(matrix.inverse());
      const x = Math.round(cx + current.x - origin.x);
      const y = Math.round(cy + current.y - origin.y);
      circle.setAttribute("cx", String(x));
      circle.setAttribute("cy", String(y));
    };
    const end = () => {
      circle.removeEventListener("pointermove", move);
      circle.removeEventListener("pointerup", end);
      circle.style.cursor = "grab";
      const id = circle.getAttribute("data-id");
      const x = circle.getAttribute("cx");
      const y = circle.getAttribute("cy");
      syncingFromCanvas = true;
      const source = view.state.doc.toString();
      const next = updateCircleAttribute(updateCircleAttribute(source, id, "cx", x), id, "cy", y);
      view.dispatch({ changes: { from: 0, to: source.length, insert: next } });
      syncingFromCanvas = false;
    };
    circle.addEventListener("pointermove", move);
    circle.addEventListener("pointerup", end, { once: true });
  });
}

function updateSearch() {
  const query = searchInput.value;
  searchCount.textContent = query ? `${countMatches(view.state.doc.toString(), query)} совпадений` : "Поиск не задан";
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query, caseSensitive: false })) });
}
function applySearch(direction) {
  if (!searchInput.value) return;
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: searchInput.value })) });
  view.focus();
  view.dispatch(direction > 0 ? findNext(view) : findPrevious(view));
}

view = new EditorView({
  state: EditorState.create({
    doc: initialSVG,
    extensions: [
      basicSetup,
      xml(),
      search(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !syncingFromCanvas) {
          renderPreview(update.state.doc.toString());
          updateSearchCountOnly();
        }
      })
    ]
  }),
  parent: editorHost
});

function updateSearchCountOnly() {
  const query = searchInput.value;
  searchCount.textContent = query ? `${countMatches(view.state.doc.toString(), query)} совпадений` : "Поиск не задан";
}
searchInput.addEventListener("input", updateSearch);
document.querySelector("#next").addEventListener("click", () => applySearch(1));
document.querySelector("#prev").addEventListener("click", () => applySearch(-1));
renderPreview(initialSVG);
updateSearchCountOnly();
window.__SVG_WORKSHOP_TEST__ = { getEditor: () => view, renderPreview, updateCircleAttribute };
