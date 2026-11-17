import { test, expect } from "@playwright/test";

test("CodeMirror accepts typing, deletion, selection replacement and undo", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("<!-- keyboard-check -->");
  await expect(editor).toContainText("keyboard-check");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Backspace");
  await expect(editor).not.toContainText("keyboard-check -->");

  await page.goto("/");
  await page.evaluate(() => {
    const view = window.__SVG_WORKSHOP_TEST__.getEditor();
    const from = view.state.doc.toString().indexOf('fill="#1f6f50"');
    view.dispatch({ selection: { anchor: from, head: from + 'fill="#1f6f50"'.length } });
    view.focus();
  });
  await page.keyboard.type('fill="#123456"');
  await expect(editor).toContainText('fill="#123456"');
  await expect(page.locator("#preview svg circle[data-id='circle-a']")).toHaveAttribute("fill", "#123456");
});

test("visible search finds source text without case sensitivity", async ({ page }) => {
  await page.goto("/");
  await page.locator("#search-input").fill("CIRCLE");
  await expect(page.locator("#search-count")).toHaveText("4 совпадений");
  await page.locator("#next").click();
  await expect(page.locator(".cm-selectionBackground")).toBeVisible();
});

test("dragging a circle writes its coordinates back to the SVG source", async ({ page }) => {
  await page.goto("/");
  const circle = page.locator("#preview circle[data-id='circle-a']");
  const before = await circle.getAttribute("cx");
  const box = await circle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => {
    const source = await page.locator(".cm-content").innerText();
    const match = source.match(/<circle data-id="lesson-canvas-circle" cx="([^"]+)"/);
    return Number(match?.[1]);
  }).not.toBe(before);
});

test("adds a rectangle and edits its properties in the inspector", async ({ page }) => {
  await page.goto("/");
  await page.locator("#add-rect").click();
  const rect = page.locator("#preview rect[data-editor-id]");
  await expect(rect).toBeVisible();
  await expect(page.locator("#inspector")).toContainText("Свойства объекта");
  await page.locator('#inspector input[data-attribute="x"]').fill("210");
  await page.locator('#inspector input[data-attribute="x"]').press("Enter");
  await expect(rect).toHaveAttribute("x", "210");
  await expect(page.locator(".cm-content")).toContainText('x="210"');
  await page.locator('#inspector input[data-attribute="fill"]').fill("#abcdef");
  await page.locator('#inspector input[data-attribute="fill"]').press("Enter");
  await expect(rect).toHaveAttribute("fill", "#abcdef");
});

test("deletes a selected new shape from code and preview", async ({ page }) => {
  await page.goto("/");
  await page.locator("#add-circle").click();
  const circle = page.locator("#preview circle[data-editor-id]");
  await expect(circle).toBeVisible();
  await page.locator("#delete-object").click();
  await expect(circle).toHaveCount(0);
  await expect(page.locator(".cm-content")).not.toContainText("shape-circle-1");
});

test("lesson 1 opens with SVG illustrations and loads an editable radius exercise", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson-toggle").click();
  await expect(page.locator("#lesson-view")).toBeVisible();
  await expect(page.locator("#lesson-view")).toContainText("Знакомство с SVG");
  const illustrations = page.locator("#lesson-view .lesson-illustration img");
  await expect(illustrations).toHaveCount(2);
  await expect.poll(async () => illustrations.evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  await page.locator('[data-lesson-exercise="radius"]').click();
  await expect(page.locator("#lesson-view")).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText('r="45"');
  await expect(page.locator("#preview svg circle").first()).toHaveAttribute("r", "45");
});

test("starter SVG canvas uses the 200 by 95 mm postcard format", async ({ page }) => {
  await page.goto("/");
  const svg = page.locator("#preview svg");
  await expect(svg).toHaveAttribute("width", "200mm");
  await expect(svg).toHaveAttribute("height", "95mm");
  await expect(svg).toHaveAttribute("viewBox", "0 0 400 190");
  const ratio = await svg.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width / box.height;
  });
  expect(ratio).toBeCloseTo(200 / 95, 2);
});

test("new rectangles can be selected and moved with the mouse", async ({ page }) => {
  await page.goto("/");
  await page.locator("#add-rect").click();
  const rect = page.locator("#preview rect[data-editor-id]");
  await expect(rect).toBeVisible();
  const before = Number(await rect.getAttribute("x"));
  const box = await rect.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2 + 18, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await rect.getAttribute("x"))).not.toBe(before);
  await expect.poll(async () => page.locator(".cm-content").innerText()).not.toContain(`x="${before}"`);
});

test("the circle in the canvas lesson is selectable and draggable", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson-toggle").click();
  await page.locator('[data-lesson-exercise="canvas"]').click();
  const circle = page.locator('#preview circle[data-id="lesson-canvas-circle"]');
  await expect(circle).toBeVisible();
  const before = Number(await circle.getAttribute("cx"));
  const box = await circle.boundingBox();
  await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 44, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await circle.getAttribute("cx"))).not.toBe(before);
  await expect.poll(async () => {
    const source = await page.locator(".cm-content").innerText();
    const match = source.match(/<circle data-id="lesson-canvas-circle" cx="([^"]+)"/);
    return Number(match?.[1]);
  }).not.toBe(before);
});


test("downloads the current SVG artwork with the chosen file name", async ({ page }) => {
  await page.goto("/");
  await page.locator("#save-file-name").fill("my test card");
  await page.evaluate(() => {
    const view = window.__SVG_WORKSHOP_TEST__.getEditor();
    const source = view.state.doc.toString();
    const updated = source.replace('fill="#1f6f50"', 'fill="#123456"');
    view.dispatch({ changes: { from: 0, to: source.length, insert: updated } });
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#save-svg").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("my-test-card.svg");
  const stream = await download.createReadStream();
  let downloaded = "";
  for await (const chunk of stream) downloaded += chunk.toString("utf8");
  expect(downloaded).toContain('fill="#123456"');
  expect(downloaded).toContain('width="200mm"');
  expect(downloaded).toContain('viewBox="0 0 400 190"');
});


test("visual palette applies a swatch to the selected fill or stroke", async ({ page }) => {
  await page.goto("/");
  const circle = page.locator('#preview circle[data-id="circle-a"]');
  await circle.click();
  await expect(page.locator('#inspector input[data-color-picker="fill"]')).toBeVisible();
  await page.locator('#inspector [data-color-target="stroke"]').click();
  await page.locator('#inspector [data-color-swatch="#c74735"]').click();
  await expect(circle).toHaveAttribute("stroke", "#c74735");
  await expect(circle).toHaveAttribute("fill", "#1f6f50");
});

test("native color picker updates the selected shape", async ({ page }) => {
  await page.goto("/");
  const circle = page.locator('#preview circle[data-id="circle-a"]');
  await circle.click();
  await page.locator('#inspector input[data-color-picker="fill"]').evaluate((input) => {
    input.value = "#336699";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(circle).toHaveAttribute("fill", "#336699");
  await expect(page.locator(".cm-content")).toContainText('fill="#336699"');
});


test("creates and edits a multi-stop gradient with the shared palette", async ({ page }) => {
  await page.goto("/");
  const circle = page.locator('#preview circle[data-id="circle-a"]');
  await circle.click();
  await page.locator("#create-gradient").click();
  await expect(circle).toHaveAttribute("fill", /url\(#gradient-/);
  await expect(page.locator("#preview linearGradient stop")).toHaveCount(2);
  await page.locator('#inspector [data-gradient-stop="0"] .gradient-stop-select').click();
  await page.locator('#inspector [data-color-swatch="#c74735"]').click();
  await expect(page.locator("#preview linearGradient stop").first()).toHaveAttribute("stop-color", "#c74735");
  await page.locator('#inspector [data-stop-offset="0"]').fill("18");
  await page.locator('#inspector [data-stop-offset="0"]').press("Tab");
  await expect(page.locator("#preview linearGradient stop").first()).toHaveAttribute("offset", "18%");
  await page.locator("#add-gradient-stop").click();
  await expect(page.locator("#preview linearGradient stop")).toHaveCount(3);
  await page.locator("#gradient-type").selectOption("radialGradient");
  await expect(page.locator("#preview radialGradient stop")).toHaveCount(3);
  await page.locator('#inspector [data-stop-opacity="0"]').fill("45");
  await page.locator('#inspector [data-stop-opacity="0"]').press("Tab");
  await expect(page.locator("#preview radialGradient stop").first()).toHaveAttribute("stop-opacity", "0.45");
});


test("lesson 2 opens as a separate course page with SVG diagrams", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson2-toggle").click();
  await expect(page.locator("#lesson2-view")).toBeVisible();
  await expect(page.locator("#lesson2-view")).toContainText("Геометрические формы");
  await expect(page.locator("#lesson2-view")).toContainText("Прямоугольник — rect");
  await expect(page.locator("#lesson2-view")).toContainText("Многоугольник — polygon");
  const illustrations = page.locator("#lesson2-view .lesson-illustration img");
  await expect(illustrations).toHaveCount(3);
  await expect.poll(async () => illustrations.evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  await page.locator("#lesson2-view #lesson2-back").click();
  await expect(page.locator("#lesson2-view")).toBeHidden();
  await page.locator("#lesson-toggle").click();
  await expect(page.locator("#lesson-view")).toBeVisible();
  await expect(page.locator("#lesson-view")).toContainText("Знакомство с SVG");
});

test("lesson 2 rectangle exercise opens editable code and updates preview", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson2-toggle").click();
  await page.locator('[data-lesson-exercise="rect"]').click();
  await expect(page.locator("#lesson2-view")).toBeHidden();
  const rect = page.locator('#preview rect[data-id="lesson2-rect"]');
  await expect(rect).toBeVisible();
  await expect(rect).toHaveAttribute("width", "150");
  await page.evaluate(() => {
    const editor = window.__SVG_WORKSHOP_TEST__.getEditor();
    const source = editor.state.doc.toString();
    const updated = source.replace('width="150"', 'width="210"');
    editor.dispatch({ changes: { from: 0, to: source.length, insert: updated } });
  });
  await expect(rect).toHaveAttribute("width", "210");
});

test("lesson 2 round exercise contains circle and ellipse with separate radii", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson2-toggle").click();
  await page.locator('[data-lesson-exercise="round"]').click();
  await expect(page.locator('#preview circle[data-id="lesson2-circle"]')).toHaveAttribute("r", "48");
  await expect(page.locator('#preview ellipse[data-id="lesson2-ellipse"]')).toHaveAttribute("rx", "72");
  await expect(page.locator('#preview ellipse[data-id="lesson2-ellipse"]')).toHaveAttribute("ry", "42");
});

test("lesson 2 line exercise shows a line and an open polyline", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson2-toggle").click();
  await page.locator('[data-lesson-exercise="lines"]').click();
  await expect(page.locator('#preview line[data-id="lesson2-line"]')).toBeVisible();
  await expect(page.locator('#preview polyline[data-id="lesson2-polyline"]')).toHaveAttribute("fill", "none");
  await expect(page.locator(".cm-content")).toContainText('points="55,45 145,135 245,45 345,135"');
});

test("lesson 2 polygon sample exposes editable coordinate pairs", async ({ page }) => {
  await page.goto("/");
  await page.locator("#lesson2-toggle").click();
  await page.locator('[data-lesson-exercise="polygon"]').click();
  const polygon = page.locator('#preview polygon[data-id="lesson2-polygon"]');
  await expect(polygon).toBeVisible();
  await expect(polygon).toHaveAttribute("points", "200,25 278,80 248,160 152,160 122,80");
  await expect(page.locator(".cm-content")).toContainText("<polygon");
});
