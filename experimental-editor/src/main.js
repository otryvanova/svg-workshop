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
import canvasIllustration from "./assets/lesson-01-canvas.svg";
import radiusIllustration from "./assets/lesson-01-radius.svg";

const initialSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="95mm" viewBox="0 0 400 190">
  <rect width="400" height="190" fill="#ffffff"/>
  <circle data-id="circle-a" cx="112" cy="95" r="30" fill="#1f6f50" stroke="#173f32" stroke-width="3"/>
  <circle data-id="circle-b" cx="290" cy="95" r="25" fill="#c74735" stroke="#70291f" stroke-width="3"/>
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
      <div class="interaction-help" role="note">
        <strong>Как работать с фигурами</strong>
        <span>Щёлкни по фигуре, чтобы выбрать. Чтобы переместить — зажми левую кнопку мыши на фигуре и перетащи. Свойства выбранной фигуры находятся ниже, SVG-код — слева.</span>
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
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); updateSelectedAttribute(name, input.value); input.blur(); } });
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
    element.style.cursor = "grabbing";
    element.setPointerCapture?.(event.pointerId);
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
      element.removeEventListener("pointercancel", end);
      element.style.cursor = "grab";
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
    element.addEventListener("pointercancel", end, { once: true });
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
    rect: { x: 145, y: 55, width: 110, height: 80, fill: "#dce8e2", stroke: "#1f6f50", "stroke-width": 3 },
    circle: { cx: 200, cy: 95, r: 32, fill: "#f4ded8", stroke: "#c74735", "stroke-width": 3 },
    ellipse: { cx: 200, cy: 95, rx: 55, ry: 35, fill: "#e8e0f2", stroke: "#76549a", "stroke-width": 3 }
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

const lessonSamples = {
  canvas: `<svg xmlns="http://www.w3.org/2000/svg"
     width="200mm" height="95mm" viewBox="0 0 400 190">
  <rect x="1" y="1" width="398" height="188"
        fill="#f8fafc" stroke="#64748b" stroke-width="1.5"/>
  <path d="M0 95 H400 M200 0 V190"
        fill="none" stroke="#cbd5e1" stroke-width="1"
        stroke-dasharray="5 5"/>
  <circle data-id="lesson-canvas-circle" cx="200" cy="95" r="35"
          fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
  <circle cx="200" cy="95" r="3" fill="#2563eb"/>
</svg>`,
  radius: `<svg xmlns="http://www.w3.org/2000/svg"
     width="200mm" height="95mm" viewBox="0 0 400 190">
  <rect width="400" height="190" fill="#ffffff"/>
  <circle data-id="lesson-radius-circle" cx="150" cy="95" r="45"
          fill="#dbeafe" fill-opacity="0.65"
          stroke="#2563eb" stroke-width="2"/>
  <circle cx="150" cy="95" r="3" fill="#2563eb"/>
  <path d="M150 95 H195" fill="none"
        stroke="#dc6b35" stroke-width="2"/>
</svg>`
};

const lessonButton = document.createElement("button");
lessonButton.id = "lesson-toggle";
lessonButton.className = "lesson-tab";
lessonButton.type = "button";
lessonButton.textContent = "Занятие 01";
root.querySelector(".topbar").insertBefore(lessonButton, status);

const lessonView = document.createElement("main");
lessonView.id = "lesson-view";
lessonView.className = "lesson-view";
lessonView.hidden = true;
lessonView.innerHTML = `
  <header class="lesson-heading">
    <div class="lesson-eyebrow">SVG-МАСТЕРСКАЯ · УЧЕБНАЯ ПРОГРАММА</div>
    <div class="lesson-heading-row">
      <div>
        <div class="lesson-number">ЗАНЯТИЕ 01</div>
        <h2>Знакомство с SVG</h2>
        <p>Документ, холст, размеры и система координат</p>
      </div>
      <div class="lesson-duration">Основы · практика в редакторе</div>
    </div>
  </header>

  <section class="lesson-intro">
    <h3>Что изучим</h3>
    <p>Разберём, как устроен SVG-документ, чем физический размер отличается от координатной системы, где находится начало координат и как задаются параметры окружности. Все примеры можно открыть в редакторе и изменить самостоятельно.</p>
  </section>

  <section class="lesson-section">
    <div class="lesson-section-title"><span>01</span><div><h3>Что такое SVG</h3><p>Векторное изображение как текстовое описание</p></div></div>
    <div class="lesson-copy">
      <p>SVG — формат векторной графики. Внутри файла записаны элементы изображения и их свойства: геометрические формы, координаты, размеры, заливки и обводки. Браузер или графический редактор читает описание и отображает изображение.</p>
      <p>Документ начинается с корневого элемента <code>&lt;svg&gt;</code>. Внутри него размещаются другие элементы: например, <code>&lt;rect&gt;</code> — прямоугольник, <code>&lt;circle&gt;</code> — окружность, <code>&lt;path&gt;</code> — произвольный контур.</p>
      <pre class="lesson-code"><code>&lt;svg xmlns="http://www.w3.org/2000/svg"
     width="200mm" height="95mm"
     viewBox="0 0 400 190"&gt;
  &lt;circle cx="200" cy="95" r="35" /&gt;
&lt;/svg&gt;</code></pre>
      <p>В этом примере корневой элемент задаёт размер документа и координатную область, а элемент <code>circle</code> описывает окружность.</p>
    </div>
  </section>

  <section class="lesson-section">
    <div class="lesson-section-title"><span>02</span><div><h3>Что такое холст</h3><p>Физический размер и координатная система</p></div></div>
    <div class="lesson-example">
      <a class="lesson-illustration" href="${canvasIllustration}" target="_blank" rel="noopener">
        <img src="${canvasIllustration}" alt="Схема холста SVG с началом координат, осями X и Y и центральной точкой">
      </a>
      <div class="lesson-copy">
        <p>Холст — область, в которой размещается изображение. В нашем курсе базовый формат документа — открытка <strong>200 × 95 мм</strong>.</p>
        <p>Атрибуты <code>width</code> и <code>height</code> задают физический размер. Атрибут <code>viewBox</code> описывает внутреннюю координатную область, с которой работает SVG.</p>
        <p>В примере <code>viewBox="0 0 400 190"</code>: начало координат находится в левом верхнем углу; X увеличивается вправо, Y — вниз. Центр этой области — точка (200, 95).</p>
        <p class="lesson-note">При соотношении 400 × 190 единиц и физическом размере 200 × 95 мм одна внутренняя единица соответствует 0,5 мм.</p>
        <a class="lesson-source-link" href="${canvasIllustration}" target="_blank" rel="noopener">Открыть исходный SVG</a>
      </div>
    </div>
  </section>

  <section class="lesson-section">
    <div class="lesson-section-title"><span>03</span><div><h3>Разберём окружность и радиус</h3><p>Три параметра, которые задают круг</p></div></div>
    <div class="lesson-example">
      <a class="lesson-illustration" href="${radiusIllustration}" target="_blank" rel="noopener">
        <img src="${radiusIllustration}" alt="Окружность с отмеченным центром и радиусом">
      </a>
      <div class="lesson-copy">
        <p>Элемент <code>&lt;circle&gt;</code> описывает окружность с помощью трёх основных параметров:</p>
        <ul>
          <li><code>cx</code> — координата центра по горизонтали;</li>
          <li><code>cy</code> — координата центра по вертикали;</li>
          <li><code>r</code> — радиус, расстояние от центра до линии окружности.</li>
        </ul>
        <p>Например, <code>&lt;circle cx="150" cy="95" r="45" /&gt;</code> задаёт окружность с центром (150, 95) и радиусом 45 единиц.</p>
        <a class="lesson-source-link" href="${radiusIllustration}" target="_blank" rel="noopener">Открыть исходный SVG</a>
      </div>
    </div>
  </section>

  <section class="lesson-section lesson-practice">
    <div class="lesson-section-title"><span>04</span><div><h3>Практика в редакторе</h3><p>Изменяем код и наблюдаем результат</p></div></div>
    <p class="lesson-practice-intro">Нажми «Открыть задание в редакторе». В коде найди указанный атрибут, измени его значение и посмотри, как изменилось изображение. Можно возвращаться к исходному значению и пробовать снова.</p>
    <div class="lesson-task-grid">
      <article class="lesson-task">
        <span class="lesson-task-number">ЗАДАНИЕ 1</span>
        <h4>Холст и координаты</h4>
        <p>Найди <code>width</code>, <code>height</code> и <code>viewBox</code>. Сравни физический размер документа и внутреннюю координатную область. Измени координату центра окружности <code>cx</code> с 200 на 240.</p>
        <button type="button" data-lesson-exercise="canvas">Открыть задание в редакторе</button>
      </article>
      <article class="lesson-task">
        <span class="lesson-task-number">ЗАДАНИЕ 2</span>
        <h4>Радиус окружности</h4>
        <p>Найди в строке <code>&lt;circle&gt;</code> параметр <code>r="45"</code>. Измени его на <code>r="65"</code>, затем попробуй значения 25 и 80. Наблюдай, как меняется размер круга.</p>
        <button type="button" data-lesson-exercise="radius">Открыть задание в редакторе</button>
      </article>
    </div>
    <details class="lesson-check">
      <summary>Самопроверка: что важно запомнить?</summary>
      <ol>
        <li>Какой элемент является корневым в SVG-документе? — <code>&lt;svg&gt;</code>.</li>
        <li>Какие атрибуты задают физический размер открытки? — <code>width</code> и <code>height</code>.</li>
        <li>Для чего нужен <code>viewBox</code>? — Он задаёт внутреннюю координатную область SVG.</li>
        <li>Где находится начало координат? — В левом верхнем углу.</li>
        <li>Как задаётся радиус окружности? — Атрибутом <code>r</code>.</li>
      </ol>
    </details>
  </section>
  <footer class="lesson-footer">
    <span>Занятие 01 · Знакомство с SVG</span>
    <button type="button" id="lesson-back">Вернуться в лабораторию</button>
  </footer>
`;
root.append(lessonView);

function showLesson(visible) {
  lessonView.hidden = !visible;
  root.querySelector(".workspace").hidden = visible;
  lessonButton.textContent = visible ? "Вернуться в лабораторию" : "Занятие 01";
  if (visible) lessonView.scrollIntoView({ behavior: "instant", block: "start" });
  else root.querySelector(".workspace").scrollIntoView({ behavior: "instant", block: "start" });
}

lessonButton.addEventListener("click", () => showLesson(lessonView.hidden));
lessonView.querySelector("#lesson-back").addEventListener("click", () => showLesson(false));
lessonView.addEventListener("click", (event) => {
  const button = event.target.closest("[data-lesson-exercise]");
  if (!button) return;
  const source = lessonSamples[button.dataset.lessonExercise];
  if (!source) return;
  selectedId = null;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  renderPreview(source);
  updateSearchCountOnly();
  searchInput.value = "";
  showLesson(false);
  view.focus();
});

window.__SVG_WORKSHOP_TEST__ = { getEditor: () => view, renderPreview, setSelection, showLesson };
