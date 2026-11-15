import { describe, expect, it } from "vitest";
import { updateCircleAttribute, countMatches } from "../src/editor-utils.js";

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
  it("rejects unsupported attributes", () => {
    expect(() => updateCircleAttribute(sample, "c1", "fill", "red")).toThrow();
  });
  it("counts search matches", () => {
    expect(countMatches("circle circle circle", "circle")).toBe(3);
    expect(countMatches("circle", "")).toBe(0);
  });
});