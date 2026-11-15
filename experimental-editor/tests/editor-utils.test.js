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
