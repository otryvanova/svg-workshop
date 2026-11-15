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
  await expect.poll(async () => page.locator(".cm-content").innerText()).not.toContain(`cx="${before}"`);
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
  await expect(page.locator("#preview svg circle")).toHaveAttribute("r", "45");
});
