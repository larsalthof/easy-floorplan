import { afterEach, describe, expect, it, vi } from "vitest";
import "./floorplan-card";
import "./editor";
import type { FloorplanCard } from "./floorplan-card";
import type { FloorplanCardConfig, HomeAssistant } from "./types";

const source = (): FloorplanCardConfig => ({ type: "custom:easy-floorplan-card", width: 400, height: 200,
  areas: [{ id: "room", points: [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 180, y: 180 }, { x: 0, y: 180 }] }],
  walls: [{ id: "wall", x1: 0, y1: 0, x2: 400, y2: 0 }],
  items: [{ id: "inside", kind: "light", entity: "light.inside", x: 50, y: 50 },
    { id: "outside", kind: "light", entity: "light.outside", x: 300, y: 50 }],
});
const local = (view: "2d" | "3d" = "2d"): FloorplanCardConfig => ({ type: "custom:easy-floorplan-card", view,
  source: { dashboard: "lovelace-home", view: "house", area_id: "room" },
  items: [{ id: "extra", kind: "sensor", entity: "sensor.extra", x: 80, y: 80 }],
} as FloorplanCardConfig);
const configOf = (card: FloorplanCard) => (card as unknown as { _config?: FloorplanCardConfig })._config;
function host(callWS = vi.fn().mockResolvedValue({ views: [{ path: "house", cards: [source()] }] })) {
  const card = document.createElement("easy-floorplan-card") as FloorplanCard;
  const hass = { callWS, states: {}, entities: {}, formatEntityState: (s: { state: string }) => s.state } as unknown as HomeAssistant;
  card.hass = hass;
  return { card, hass, callWS };
}
afterEach(() => { document.body.innerHTML = ""; });

describe("source card", () => {
  it.each(["2d", "3d"] as const)("renders only the selected room and local items in %s", async (view) => {
    const { card, callWS } = host();
    card.setConfig(local(view)); document.body.append(card);
    await vi.waitFor(() => expect(configOf(card)?.floors).toHaveLength(1));
    await card.updateComplete;
    expect(configOf(card)!.floors![0].items.map((i) => i.id)).toEqual(["inside", "extra"]);
    expect(card.shadowRoot!.querySelectorAll(".fp-item")).toHaveLength(2);
    expect(!!card.shadowRoot!.querySelector(".fp-iso")).toBe(view === "3d");
    card.hass = { ...card.hass!, states: {} };
    await card.updateComplete;
    expect(callWS).toHaveBeenCalledTimes(1);
  });
  it("does not install an obsolete response after a configuration change", async () => {
    let resolve!: (v: unknown) => void;
    const { card } = host(vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; })));
    card.setConfig(local()); document.body.append(card);
    card.setConfig(source());
    resolve({ views: [{ path: "house", cards: [source()] }] });
    await new Promise((r) => setTimeout(r, 20));
    expect(configOf(card)?.items).toHaveLength(2);
    expect(configOf(card)?.floors).toBeUndefined();
  });
  it("shows source failures and can retry", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("Not authorized to read dashboard"));
    const { card } = host(callWS);
    card.setConfig(local()); document.body.append(card);
    await vi.waitFor(() => expect(card.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("Not authorized"));
    callWS.mockResolvedValue({ views: [{ path: "house", cards: [source()] }] });
    (card.shadowRoot!.querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(configOf(card)?.floors).toHaveLength(1));
  });
  it("refreshes saved sources and unsubscribes when disconnected", async () => {
    const { card, hass, callWS } = host();
    let saved!: () => void;
    const unsubscribe = vi.fn();
    hass.connection = { subscribeEvents: vi.fn((cb) => { saved = cb; return Promise.resolve(unsubscribe); }) } as unknown as HomeAssistant["connection"];
    card.setConfig(local()); document.body.append(card);
    await vi.waitFor(() => expect(configOf(card)?.floors).toHaveLength(1));
    const changed = source(); changed.items![0].x = 60;
    callWS.mockResolvedValue({ views: [{ path: "house", cards: [changed] }] }); saved();
    await vi.waitFor(() => expect(configOf(card)?.floors![0].items[0].x).toBe(60));
    card.remove(); expect(unsubscribe).toHaveBeenCalled();
  });
  it("keeps source references and local additions when using the visual editor", async () => {
    const editor = document.createElement("easy-floorplan-card-editor") as HTMLElement & { setConfig(c: FloorplanCardConfig): void; updateComplete: Promise<unknown> };
    editor.setConfig(local()); document.body.append(editor); await editor.updateComplete;
    let saved: FloorplanCardConfig | undefined;
    editor.addEventListener("config-changed", (e) => { saved = (e as CustomEvent).detail.config; });
    const forms = editor.shadowRoot!.querySelectorAll("ha-form");
    forms[1].dispatchEvent(new CustomEvent("value-changed", { detail: { value: { view: "3d" } } }));
    expect(saved?.source).toEqual(local().source);
    expect(saved?.items).toEqual(local().items);
    expect(saved?.floors).toBeUndefined();
    expect(saved?.width).toBeUndefined();
    expect(saved?.view).toBe("3d");
  });
});
