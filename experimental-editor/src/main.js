import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { search, setSearchQuery, findNext, findPrevious, SearchQuery } from "@codemirror/search";
import {
  addSvgElement,
  countMatches,
  removeSvgElement,
  updateElementAttributes
} from "./editor-utils.js";
import "./style.css";

const initialSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="600" height="360">
  <rect width="600" height="360" fill="#ffffff"/>
  <circle data-id="circle-a" cx="180" cy="150" r="48" fill="#1f6f50" stroke="#173f32" stroke-width="3"/>
  <circle data-id="circle-b" cx="360" cy="210" r="34" fill="#c74735" stroke="#70291f" stroke-width="3"/>
</svg>`;

const root = document.querySelector("#app");
root.innerHTML = `
  <header class="topbar">
    <div><div class="eyebrow">SVG WORKSHOP · EXPERIMENT 0.2</div><h1>Векторная лаборатория</h1></div>
    <div id="status" class="status">Запуск редактора…</div>
  </header>
  <main class="workspace">
    <section class="panel code-panel">
      <div class="panel-head"><strong>SVG-код</strong><span>CodeMirror 6 · XML</span></div>
      <div class="searchbar">
        <input id="search-input" type="search" placeholder="Найти в коде…" aria-label="Поиск по коду">
        <span id="search-count">Поиск не задан</span>
        <button id="prev" title="Предыдущее совпадение">↑</button>
        <button id="next" title="Следующее совпадение">↓</button>
      </div>
      <div id="editor" aria-label="Редактор SVG-кода"></div>
      <div class="footnote">Код можно редактировать вручную. Изменения сразу отображаются в предпросмотре.</div>
    </section>
    <section class="panel preview-panel">
      <div class="panel-head"><strong>Рабочее поле</strong><span id="selection-label">Объект не выбран</span></div>
      <div class="object-toolbar">
        <button id="add-rect" type="button">＋ Прямоугольник</button>
        <button id="add-circle" type="button">＋ Круг</button>
        <button id="add-ellipse" type="button">＋ Эллипс</button>
        <button id="delete-object" type="button" disabled>Удалить объект</button>
      </div>
      <div id="preview" class="preview" aria-label="Предпросмотр SVG"></div>
      <section id="inspector" class="inspector">
        <div class="inspector-empty">Выбери фигуру на рабочем поле, чтобы изменить её свойства.</div>
      </section>
      <div class="hint">Можно добавлять фигуры кнопками, выбирать их на поле и перетаскивать мышью. Исходный код остаётся доступным для ручного редактирования.</div>
    </section>
  </main>`;

let view;
let syncingFromCanvas = false;
let selectedId = null;
const editorHost = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const status = document.querySelector("#status");
const searchInput = document.querySelector("#search-input");
const searchCount = document.querySelector("#search-count");
const inspector = document.querySelector("#inspector");
const selectionLabel = document.querySelector("#selection-label");
const deleteButton = document.querySelector("#delete-object");

function getElementId(element) {
  return element.getAttribute("data-editor-id") || element.getAttribute("data-id");
}

function selectedElement() {
  if (!selectedId) return null;
  return preview.querySelector('[data-editor-id="' + selectedId + '"], [data-id="' + selectedId + '"]');
}

function setSelection(id) {
  selectedId = id;
  preview.querySelectorAll("[data-editor-id], [data-id]").forEach((element) => {
    element.classList.toggle("is-selected", getElementId(element) === selectedId);
  });
  const element = selectedElement();
  selectionLabel.textContent = element ? "Выбран: " + element.tagName.toLowerCase() : "Объект не выбран";
  deleteButton.disabled = !element;
  renderInspector();
}

function renderInspector() {
  const element = selectedElement();
  if (!element) {
    inspector.innerHTML = '<div class="inspector-empty">Выбери фигуру на рабочем поле, чтобы изменить её свойства.</div>';
    return;
  }

  const tag = element.tagName.toLowerCase();
  const geometry = {
    circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"]
  }[tag] || [];
  const properties = [...geometry, "fill", "stroke", "stroke-width", "opacity"];
  inspector.innerHTML = '<div class="inspector-title">Свойства объекта <span>' + tag + "</span></div><div class='property-grid'></div>";
  const grid = inspector.querySelector(".property-grid");
  for (const name of properties) {
    const wrapper = document.createElement("label");
    wrapper.className = "property";
    const caption = document.createElement("span");
    caption.textContent = name;
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.attribute = name;
    input.value = element.getAttribute(name) ?? "";
    input.setAttribute("aria-label", name);
    input.addEventListener("change", () => updateSelectedAttribute(name, input.value));
    wrapper.append(caption, input);
    grid.append(wrapper);
  }
}

function updateSelectedAttribute(name, value) {
  if (!selectedId) return;
  const source = view.state.doc.toString();
  const next = updateElementAttributes(source, selectedId, { [name]: value });
  if (next !== source) {
    syncingFromCanvas = true;
    view.dispatch({ changes: { from: 0, to: source.length, insert: next } });
    syncingFromCanvas = false;
    renderPreview(next);
    setSelection(selectedId);
  }
}

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
  for (const element of safeSvg.querySelectorAll("[data-editor-id], [data-id]")) {
    bindSelectableElement(element);
  }
  if (selectedId) setSelection(selectedId);
  status.textContent = "Редактор готов";
  status.dataset.kind = "ok";
}

function bindSelectableElement(element) {
  const id = getElementId(element);
  if (!id) return;
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelection(id);
  });
  if (!["circle", "ellipse", "rect"].includes(element.tagName.toLowerCase())) {
    element.style.cursor = "pointer";
    return;
  }
  element.style.cursor = "grab";
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSelection(id);
    const svg = element.ownerSVGElement;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const start = point.matrixTransform(matrix.inverse());
    const tag = element.tagName.toLowerCase();
    const xName = tag === "rect" ? "x" : "cx";
    const yName = tag === "rect" ? "y" : "cy";
    const startX = Number(element.getAttribute(xName) || 0);
    const startY = Number(element.getAttribute(yName) || 0);
    const move = (moveEvent) => {
      point.x = moveEvent.clientX;
      point.y = moveEvent.clientY;
      const current = point.matrixTransform(matrix.inverse());
      element.setAttribute(xName, String(Math.round(startX + current.x - start.x)));
      element.setAttribute(yName, String(Math.round(startY + current.y - start.y)));
    };
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      const updated = {
        [xName]: element.getAttribute(xName),
        [yName]: element.getAttribute(yName)
      };
      const source = view.state.doc.toString();
      const next = updateElementAttributes(source, id, updated);
      syncingFromCanvas = true;
      view.dispatch({ changes: { from: 0, to: source.length, insert: next } });
      syncingFromCanvas = false;
      setSelection(id);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end, { once: true });
  });
}

function updateSearch() {
  const query = searchInput.value;
  searchCount.textContent = query ? countMatches(view.state.doc.toString(), query) + " совпадений" : "Поиск не задан";
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query, caseSensitive: false })) });
}

function updateSearchCountOnly() {
  const query = searchInput.value;
  searchCount.textContent = query ? countMatches(view.state.doc.toString(), query) + " совпадений" : "Поиск не задан";
}

function applySearch(direction) {
  if (!searchInput.value) return;
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: searchInput.value, caseSensitive: false })) });
  view.focus();
  if (direction > 0) findNext(view);
  else findPrevious(view);
}

function addShape(tag) {
  const source = view.state.doc.toString();
  let index = 1;
  let id = "shape-" + tag + "-" + index;
  while (source.includes('data-editor-id="' + id + '"')) {
    index += 1;
    id = "shape-" + tag + "-" + index;
  }
  const palette = {
    rect: { x: 150, y: 95, width: 140, height: 100, fill: "#dce8e2", stroke: "#1f6f50", "stroke-width": 3 },
    circle: { cx: 300, cy: 150, r: 45, fill: "#f4ded8", stroke: "#c74735", "stroke-width": 3 },
    ellipse: { cx: 300, cy: 150, rx: 70, ry: 42, fill: "#e8e0f2", stroke: "#76549a", "stroke-width": 3 }
  };
  const attrs = { "data-editor-id": id, ...palette[tag] };
  const next = addSvgElement(source, tag, attrs);
  view.dispatch({ changes: { from: 0, to: source.length, insert: next } });
  setSelection(id);
}

function deleteSelected() {
  if (!selectedId) return;
  const source = view.state.doc.toString();
  const next = removeSvgElement(source, selectedId);
  if (next === source) return;
  selectedId = null;
  view.dispatch({ changes: { from: 0, to: source.length, insert: next } });
  setSelection(null);
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

searchInput.addEventListener("input", updateSearch);
document.querySelector("#next").addEventListener("click", () => applySearch(1));
document.querySelector("#prev").addEventListener("click", () => applySearch(-1));
document.querySelector("#add-rect").addEventListener("click", () => addShape("rect"));
document.querySelector("#add-circle").addEventListener("click", () => addShape("circle"));
document.querySelector("#add-ellipse").addEventListener("click", () => addShape("ellipse"));
deleteButton.addEventListener("click", deleteSelected);
renderPreview(initialSVG);
updateSearchCountOnly();
window.__SVG_WORKSHOP_TEST__ = { getEditor: () => view, renderPreview, setSelection };
