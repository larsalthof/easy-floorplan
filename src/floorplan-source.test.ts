import { describe, it, expect, vi } from "vitest";
import { clipRoomWall, composeFloorplanSource, findSourceCard, loadFloorplanSource } from "./floorplan-source";
import { collectWatchedEntities } from "./render";
import type { FloorplanCardConfig, HomeAssistant } from "./types";

const room = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const base = (): FloorplanCardConfig => ({ type: "custom:easy-floorplan-card", width: 500, height: 300,
  view: "3d", areas: [{ id: "room", points: room }, { id: "other", points: room.map((p) => ({ ...p, x: p.x + 200 })) }],
  walls: [{ id: "wall", x1: -50, y1: 0, x2: 250, y2: 0 }],
  openings: [{ id: "window", type: "window", x: 50, y: 0, length: 30, angle: 0 }],
  items: [{ id: "inside", entity: "light.inside", kind: "light", x: 50, y: 50 },
    { id: "outside", entity: "light.outside", kind: "light", x: 250, y: 50 }],
  furniture: [{ id: "table", type: "table", x: 250, y: 50, w: 50, h: 50 }],
});
const local = (): FloorplanCardConfig => ({ type: "custom:easy-floorplan-card", source: { view: "house", area_id: "room" }, view: "2d" } as FloorplanCardConfig);

describe("shared floorplan", () => {
  it("filters before rendering and watching entities, preserves coordinates, and appends local entities", () => {
    const original = base(), snapshot = structuredClone(original), config = local();
    config.items = [{ id: "local", entity: "sensor.local", kind: "sensor", x: 20, y: 20 }];
    const resolved = composeFloorplanSource(original, config);
    const f = resolved.floors![0];
    expect(resolved.view).toBe("2d");
    expect(resolved.width).toBe(500);
    expect(f.items.map((i) => i.id)).toEqual(["inside", "local"]);
    expect(f.areas).toHaveLength(1);
    expect(f.furniture).toEqual([]);
    expect(f.openings).toHaveLength(1);
    expect(f.walls[0]).toMatchObject({ x1: 0, x2: 100, y1: 0, y2: 0 });
    expect(collectWatchedEntities(resolved)).not.toContain("light.outside");
    expect(collectWatchedEntities(resolved)).toContain("sensor.local");
    expect(original).toEqual(snapshot);
  });
  it("retains all source floors unless selected and rejects ambiguous local additions", () => {
    const b = base();
    b.floors = [{ id: "a", name: "A" }, { id: "b", name: "B" }] as never;
    const c = local(); delete c.source!.area_id;
    expect(composeFloorplanSource(b, c).floors).toHaveLength(2);
    c.items = base().items;
    expect(() => composeFloorplanSource(b, c)).toThrow("floor_id");
    c.source!.floor_id = "b";
    expect(composeFloorplanSource(b, c).floors![0].items).toHaveLength(2);
  });
  it("rejects missing rooms, floors and duplicate IDs", () => {
    const c = local(); c.source!.area_id = "missing";
    expect(() => composeFloorplanSource(base(), c)).toThrow("room");
    c.source!.floor_id = "missing";
    expect(() => composeFloorplanSource(base(), c)).toThrow("floor");
    const duplicate = local(); duplicate.items = [base().items![0]];
    expect(() => composeFloorplanSource(base(), duplicate)).toThrow("Duplicate");
  });
  it("finds nested stacks, conditional cards and sections without silently selecting an ambiguous card", () => {
    const first = base(), second = base();
    const dashboard = { views: [{ path: "house", cards: [{ type: "conditional", card: first }], sections: [{ cards: [{ type: "vertical-stack", cards: [second] }] }] }] };
    expect(() => findSourceCard(dashboard, { view: "house" })).toThrow("several");
    expect(findSourceCard(dashboard, { view: "house", card_index: 1 })).toBe(second);
    expect(() => findSourceCard(dashboard, { view: "missing" })).toThrow("view");
  });
  it("clips concave rooms into distinct wall segments", () => {
    const u = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 70, y: 100 }, { x: 70, y: 30 }, { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 }];
    const result = clipRoomWall({ id: "cross", x1: -10, y1: 50, x2: 110, y2: 50 }, u);
    expect(result.map((w) => [w.x1, w.x2])).toEqual([[0, 30], [70, 100]]);
  });
  it("loads through HA and rejects reference cycles", async () => {
    const callWS = vi.fn().mockResolvedValue({ views: [{ path: "house", cards: [base()] }] });
    const hass = { callWS } as unknown as HomeAssistant;
    expect((await loadFloorplanSource(hass, local())).floors![0].areas).toHaveLength(1);
    expect(callWS).toHaveBeenCalledWith({ type: "lovelace/config", url_path: null });
    callWS.mockResolvedValue({ views: [{ path: "house", cards: [local()] }] });
    await expect(loadFloorplanSource(hass, local())).rejects.toThrow("Circular");
    callWS.mockRejectedValue(new Error("Unauthorized"));
    await expect(loadFloorplanSource(hass, local())).rejects.toThrow("Unauthorized");
  });
});
