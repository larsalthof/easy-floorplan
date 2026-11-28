import { html, type TemplateResult } from "lit";
import type { FloorplanCardConfig, FloorplanSource, FloorItem, HomeAssistant } from "./types";

/** Edit the reference and local additions, never a materialized copy of the source. */
export function renderSourceEditor(c: FloorplanCardConfig, hass: HomeAssistant | undefined, change: (c: FloorplanCardConfig) => void): TemplateResult {
  const labels: Record<string, string> = { dashboard: "Source dashboard URL path (blank = default)", view: "Source view path", card_index: "Source card index (starts at 0)", floor_id: "Floor ID (optional)", area_id: "Room / area ID (optional)", entity: "Entity", kind: "Badge type", name: "Custom name", x: "X", y: "Y" };
  const label = (s: { name: string }) => labels[s.name] ?? s.name;
  const sourceSchema = ["dashboard", "view", "floor_id", "area_id"].map((name) => ({ name, selector: { text: {} } }));
  const items = c.items ?? [];
  const itemSchema = [
    { name: "entity", selector: { entity: {} } },
    { name: "name", selector: { text: {} } },
    { name: "kind", selector: { select: { options: ["light", "switch", "sensor", "binary_sensor", "climate", "cover", "media_player", "fan", "camera", "lock", "humidifier", "vacuum", "generic"] } } },
    { name: "x", selector: { number: { mode: "box" } } },
    { name: "y", selector: { number: { mode: "box" } } },
  ];
  return html`<div style="padding:16px">
    <h3>Shared floorplan</h3>
    <p>Geometry is read from the source card. View settings and extra entities belong to this card. Coordinates use the source plan.</p>
    <ha-form .hass=${hass} .data=${c.source} .schema=${[...sourceSchema, { name: "card_index", selector: { number: { min: 0, mode: "box" } } }]} .computeLabel=${label}
      @value-changed=${(e: CustomEvent<{ value: FloorplanSource }>) => {
        const source = { ...e.detail.value };
        for (const key of ["dashboard", "floor_id", "area_id"] as const) if (!source[key]) delete source[key];
        if (source.card_index == null) delete source.card_index;
        change({ ...c, source });
      }}></ha-form>
    <ha-form .hass=${hass} .data=${{ view: c.view ?? "2d" }} .schema=${[{ name: "view", selector: { select: { options: ["2d", "3d"] } } }]} .computeLabel=${() => "This card's default view"}
      @value-changed=${(e: CustomEvent<{ value: { view: "2d" | "3d" } }>) => change({ ...c, view: e.detail.value.view })}></ha-form>
    <h3>Extra entities</h3>
    ${items.map((item, i) => html`<ha-form .hass=${hass} .data=${item} .schema=${itemSchema} .computeLabel=${label}
      @value-changed=${(e: CustomEvent<{ value: FloorItem }>) => change({ ...c, items: items.map((it, j) => j === i ? { ...it, ...e.detail.value } : it) })}></ha-form>
      <button @click=${() => change({ ...c, items: items.filter((_, j) => j !== i) })}>Remove local entity</button>`)}
    <button @click=${() => change({ ...c, items: [...items, { id: `local_${crypto.randomUUID()}`, entity: "", kind: "generic", x: 0, y: 0 }] })}>Add local entity</button>
    <p>Additional display and entity options can be set in the YAML editor. Edit the source card to change the shared drawing.</p>
  </div>`;
}
