import { describe, expect, it } from "vitest";
import {
  addSvgElement,
  countMatches,
  removeSvgElement,
  updateCircleAttribute,
  updateElementAttributes
} from "../src/editor-utils.js";

const sample = '<svg><circle data-id="c1" cx="10" cy="20" r="5"/></svg>';

describe("SVG source updates", () => {
  it("updates only the selected circle coordinate", () => {
    expect(updateCircleAttribute(sample, "c1", "cx", 42)).toContain('cx="42"');
    expect(updateCircleAttribute(sample, "c1", "cx", 42)).toContain('cy="20"');
  });
  it("adds a missing coordinate without changing other markup", () => {
    expect(updateCircleAttribute('<svg><circle data-id="c1" r="5"/></svg>', "c1", "cy", 18)).toContain('cy="18"');
  });
  it("does not change a different circle", () => {
    expect(updateCircleAttribute(sample, "other", "cx", 42)).toBe(sample);
  });
  it("updates visual style attributes", () => {
    const next = updateElementAttributes(sample, "c1", { fill: "#123456", "stroke-width": 4 });
    expect(next).toContain('fill="#123456"');
    expect(next).toContain('stroke-width="4"');
  });
  it("adds new basic shapes before the closing SVG tag", () => {
    const next = addSvgElement(sample, "rect", { "data-editor-id": "r1", x: 10, y: 20, width: 80, height: 50 });
    expect(next).toContain('<rect data-editor-id="r1" x="10" y="20" width="80" height="50"/>');
  });
  it("removes a selected element without changing surrounding markup", () => {
    expect(removeSvgElement(sample, "c1")).toBe("<svg></svg>");
  });
  it("counts search matches without case sensitivity", () => {
    expect(countMatches("circle CIRCLE Circle", "cIrClE")).toBe(3);
    expect(countMatches("circle", "")).toBe(0);
  });
});

 
describe("SVG gradient source updates", () => {
  it("creates and reads linear gradient stops and opacity", async () => {
    const { upsertGradientDefinition, readGradientDefinition } = await import("../src/editor-utils.js");
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const next = upsertGradientDefinition(source, "g1", "linearGradient", [
      { offset: 0, color: "#123456", opacity: 1 },
      { offset: 100, color: "#ffffff", opacity: 0.5 }
    ]);
    expect(next).toContain("<defs>");
    expect(readGradientDefinition(next, "g1")).toEqual({
      id: "g1", type: "linearGradient",
      stops: [
        { offset: 0, color: "#123456", opacity: 1 },
        { offset: 100, color: "#ffffff", opacity: 0.5 }
      ]
    });
  });
  it("replaces a linear gradient with a radial one without duplicating its id", async () => {
    const { upsertGradientDefinition, readGradientDefinition } = await import("../src/editor-utils.js");
    const initial = upsertGradientDefinition("<svg><defs></defs><circle/></svg>", "g2", "linearGradient", [
      { offset: 0, color: "#000000" }, { offset: 100, color: "#ffffff" }
    ]);
    const radial = upsertGradientDefinition(initial, "g2", "radialGradient", [
      { offset: 0, color: "#c74735" }, { offset: 100, color: "#ffffff" }
    ]);
    expect((radial.match(/id="g2"/g) || [])).toHaveLength(1);
    expect(readGradientDefinition(radial, "g2")?.type).toBe("radialGradient");
    expect(radial).toContain('cx="50%" cy="50%" r="50%"');
  });
});
