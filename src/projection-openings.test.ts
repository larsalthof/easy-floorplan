import { describe, expect, it } from "vitest";
import { openingSolids } from "./projection-openings";
import { rotatePlanPoint, type OpeningStyle, type PlanRotation } from "./render";
import type { Opening } from "./types";

const door: Opening = { id: "door", type: "door", x: 100, y: 100, length: 80, angle: 0 };
const identity = (x: number, y: number) => ({ x, y });
const panels = (o: Partial<Opening> = {}, style: Partial<OpeningStyle> = {}) =>
  openingSolids({ ...door, ...o }, { color: "#333333", amount: 0, ...style }, identity, 60)
    .filter((s) => s.kind === "panel");

describe("standing openings", () => {
  it("keeps the hinge fixed and swings a full-length leaf off the wall", () => {
    expect(panels()[0].base).toEqual([{ x: 60, y: 100 }, { x: 140, y: 100 }]);
    const open = panels({}, { amount: 1 })[0];
    expect(open.base[0]).toEqual({ x: 60, y: 100 });
    expect(open.base[1].x).toBeCloseTo(60);
    expect(open.base[1].y).toBeCloseTo(20);
    const partial = panels({}, { amount: 0.5 })[0];
    expect(Math.hypot(partial.base[1].x - 60, partial.base[1].y - 100)).toBeCloseTo(80);
    expect(partial.z0).toBe(0);
    expect(partial.z1).toBe(51);
  });

  it.each([0, 90, 180, 270] as PlanRotation[])("applies hinge/swing mirrors before display rotation %s", (rotation) => {
    const solids = openingSolids({ ...door, flipH: true, flipV: true }, { color: "#333", amount: 1 },
      (x, y) => rotatePlanPoint(x, y, 400, 300, rotation), 60);
    const panel = solids.find((s) => s.kind === "panel")!;
    expect(panel.base[0]).toEqual(rotatePlanPoint(140, 100, 400, 300, rotation));
    const end = rotatePlanPoint(140, 180, 400, 300, rotation);
    expect(panel.base[1].x).toBeCloseTo(end.x);
    expect(panel.base[1].y).toBeCloseTo(end.y);
  });

  it("reads each window contact independently and raises the sashes above the sill", () => {
    const [left, right] = panels({ type: "window" }, {
      amount: 1, active: true, accent: "#00ff00", inactive: "#ff0000", second: { amount: 0 },
    });
    expect(left.base[1].y).toBeCloseTo(60);
    expect(right.base[1]).toEqual({ x: 100, y: 100 });
    expect(left.z0).toBe(21);
    expect(left.glazed).toBe(true);
    expect(left.color).toBe("#00ff00");
    expect(right.color).toBe("#ff0000");
  });

  it("keeps the fixed part of a narrow sash glazed and in its frame", () => {
    const [leaf, fixed] = panels({ sash: "single", sashSpan: 0.5 }, { amount: 1 });
    expect(leaf.base[1].y).toBeCloseTo(60);
    expect(fixed.base).toEqual([{ x: 100, y: 100 }, { x: 140, y: 100 }]);
    expect(fixed.glazed).toBe(true);
  });

  it("rolls upward and leaves a standing hit target when fully open", () => {
    expect(panels({ motion: "roll" }, { amount: 0.5 })[0].z0).toBe(25.5);
    expect(panels({ motion: "roll" }, { amount: 1 })).toEqual([]);
    expect(openingSolids({ ...door, motion: "roll" }, { color: "#333", amount: 1 }, identity, 60))
      .toMatchObject([{ kind: "opening-hit", z0: 0, z1: 51 }]);
  });

  it("tilts an awning about its head while retaining panel height", () => {
    const panel = panels({ type: "window", motion: "awning" }, { amount: 0.5 })[0];
    const [bottom, , , top] = panel.vertices!;
    expect(top).toEqual({ x: 60, y: 100, z: 51 });
    expect(Math.hypot(bottom.y - top.y, bottom.z - top.z)).toBeCloseTo(30);
    expect(bottom.y).toBeLessThan(100);
  });

  it.each([
    ["single", 1], ["bypass", 2], ["biparting", 2], ["biparting-bypass", 4], ["converging", 2],
  ] as const)("draws all %s sliding panels", (sliderStyle, count) => {
    const shut = panels({ motion: "slide", sliderStyle });
    const open = panels({ motion: "slide", sliderStyle }, { amount: 1, second: { amount: 0 } });
    expect(open).toHaveLength(count);
    expect(open).not.toEqual(shut);
    expect(open.every((s) => s.base[0].y === s.base[1].y)).toBe(true);
  });

  it("keeps fixed glazing still and uses a shutter's independent position", () => {
    const [glass, shutter] = panels({ type: "window", motion: "fixed" }, {
      amount: 1, active: true, accent: "#00ff00", shutter: { amount: 0.5 },
    });
    expect(glass.base).toEqual([{ x: 60, y: 100 }, { x: 140, y: 100 }]);
    expect(glass.color).toBe("#333333");
    expect(shutter.z0).toBe(36);
    expect(shutter.glazed).toBe(false);
  });

  it("uses the same safe accent fallback as the flat symbol", () => {
    const panel = panels({}, { amount: 1, active: true, accent: "red;opacity:0" })[0];
    expect(panel.color).toBe("var(--fp-skin-accent, var(--primary-color, #03a9f4))");
  });

  it("does not emit standing geometry for zero-height relief", () => {
    expect(openingSolids(door, { color: "#333" }, identity, 0)).toEqual([]);
  });
});
