/** Shared floorplan lookup and composition. Never writes to the source dashboard. */
import type { FloorplanCardConfig, FloorplanSource, HomeAssistant, Floor, AreaPoint, Wall } from "./types";
import { getFloors } from "./types";
import { pointInPolygon } from "./render";

interface View { path?: string; cards?: unknown[]; sections?: { cards?: unknown[] }[] }
interface Dashboard { views?: View[] }

export function findSourceCard(dashboard: Dashboard, source: FloorplanSource): FloorplanCardConfig {
  const view = dashboard.views?.find((v, i) => (v.path ?? String(i)) === source.view);
  if (!view) throw new Error(`Source view not found: ${source.view}`);
  const found: FloorplanCardConfig[] = [];
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const c = value as Record<string, unknown>;
    if (c.type === "custom:easy-floorplan-card") found.push(c as unknown as FloorplanCardConfig);
    if (Array.isArray(c.cards)) c.cards.forEach(walk);
    if (c.card) walk(c.card);
  };
  view.cards?.forEach(walk);
  view.sections?.forEach((s) => s.cards?.forEach(walk));
  if (source.card_index === undefined && found.length > 1) throw new Error("Source view has several floorplan cards; set source.card_index (starting at 0)");
  const index = source.card_index ?? 0;
  if (!Number.isInteger(index) || index < 0 || !found[index]) throw new Error("Source floorplan card not found");
  return found[index];
}

export async function loadFloorplanSource(hass: HomeAssistant, local: FloorplanCardConfig, visited = new Set<string>()): Promise<FloorplanCardConfig> {
  const source = local.source;
  if (!source) return local;
  if (!source.view || typeof source.view !== "string") throw new Error("source.view must name a dashboard view path");
  const key = JSON.stringify([source.dashboard ?? null, source.view, source.card_index ?? 0]);
  if (visited.has(key) || visited.size >= 8) throw new Error("Circular or excessively nested floorplan source");
  const next = new Set(visited).add(key);
  const dashboard = await hass.callWS<Dashboard>({ type: "lovelace/config", url_path: source.dashboard ?? null });
  const base = await loadFloorplanSource(hass, findSourceCard(dashboard, source), next);
  return composeFloorplanSource(base, local);
}

const EPS = 1e-7;
/** Include points on a room boundary (windows and wall-mounted devices). */
export function inRoom(p: AreaPoint, polygon: AreaPoint[]): boolean {
  return pointInPolygon(polygon, p.x, p.y) || polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    return Math.abs(cross) < EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS
      && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
  });
}

/** Split at every boundary crossing, retaining inside intervals even for concave rooms. */
export function clipRoomWall(w: Wall, polygon: AreaPoint[]): Wall[] {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x, ey = b.y - a.y, det = dx * ey - dy * ex;
    if (Math.abs(det) < EPS) {
      if (Math.abs((a.x - w.x1) * dy - (a.y - w.y1) * dx) < EPS) {
        for (const p of [a, b]) {
          const t = Math.abs(dx) > Math.abs(dy) ? (p.x - w.x1) / dx : (p.y - w.y1) / dy;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
      continue;
    }
    const ax = a.x - w.x1, ay = a.y - w.y1;
    const t = (ax * ey - ay * ex) / det, u = (ax * dy - ay * dx) / det;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((a, b) => a - b);
  const out: Wall[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i], mid = (a + b) / 2;
    if (b - a < EPS || !inRoom({ x: w.x1 + dx * mid, y: w.y1 + dy * mid }, polygon)) continue;
    out.push({ ...w, id: `${w.id}:room:${i}`, x1: w.x1 + dx * a, y1: w.y1 + dy * a, x2: w.x1 + dx * b, y2: w.y1 + dy * b });
  }
  return out;
}

export function composeFloorplanSource(base: FloorplanCardConfig, local: FloorplanCardConfig): FloorplanCardConfig {
  const source = local.source!;
  let floors = getFloors(base);
  if (source.floor_id) floors = floors.filter((f) => f.id === source.floor_id);
  if (!floors.length) throw new Error(`Source floor not found: ${source.floor_id}`);
  if (source.area_id) {
    floors = floors.filter((f) => f.areas.some((a) => a.id === source.area_id));
    if (floors.length !== 1) throw new Error("Source room must match exactly one floor; check area_id and floor_id");
  }
  if (local.items?.length && floors.length !== 1) throw new Error("Set source.floor_id when adding local items to a multi-floor source");
  floors = floors.map((f): Floor => {
    const extra = local.floors?.find((lf) => lf.id === f.id)?.items ?? [];
    const items = [...f.items, ...extra, ...(floors.length === 1 ? local.items ?? [] : [])];
    if (new Set(items.map((it) => it.id)).size !== items.length) throw new Error(`Duplicate item id on source floor ${f.id}; give local items unique ids`);
    if (!source.area_id) return { ...f, items };
    const area = f.areas.find((a) => a.id === source.area_id)!;
    if (area.points.length < 3) throw new Error("Source room needs a polygon with at least three points");
    const inside = (p: AreaPoint) => inRoom(p, area.points);
    return { ...f, isOutdoor: false, image: undefined, imageDark: undefined,
      walls: f.walls.flatMap((w) => clipRoomWall(w, area.points)),
      openings: f.openings.filter(inside), items: items.filter(inside),
      furniture: f.furniture.filter(inside), texts: f.texts.filter(inside),
      trackers: f.trackers.filter((t) => inside({ x: t.x + t.w / 2, y: t.y + t.h / 2 })),
      areas: [area], roofs: [], panels: f.panels?.filter(inside), summary: { enabled: false },
    };
  });
  const { source: _source, floors: _floors, items: _items, ...settings } = local;
  return { ...base, ...settings, source: undefined, floors, symbols: { ...base.symbols, ...local.symbols },
    walls: [], openings: [], items: [], furniture: [], texts: [], trackers: [], areas: [], roofs: [], panels: [] };
}
