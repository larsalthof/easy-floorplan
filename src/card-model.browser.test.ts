import { afterEach, expect, it } from "vitest";
import "./floorplan-card";
import type { FloorplanCard } from "./floorplan-card";
import type { FloorplanCardConfig } from "./types";
async function mount(extra: Partial<FloorplanCardConfig> = {}) {
  const card = document.createElement("easy-floorplan-card") as FloorplanCard;
  card.style.width = "800px";
  card.setConfig({ type: "custom:easy-floorplan-card", width: 400, height: 400, view: "3d", wallHeight: 120,
    walls: [], openings: [], items: [], furniture: [{ id: "shelf", type: "cornerShelf", x: 200, y: 200, w: 60, h: 60 }], ...extra } as FloorplanCardConfig);
  document.body.append(card);
  await card.updateComplete;
  return card.shadowRoot!;
}
afterEach(() => { document.body.innerHTML = ""; });
it.each([0, 90, 180, 270] as const)("renders three visible shelf levels and three supports at rotation %s", async rotation => {
  const root = await mount({ rotation });
  expect(root.querySelectorAll('.fp-iso-furniture[data-id="shelf"]')).toHaveLength(6);
  const tops = Array.from(root.querySelectorAll('.fp-iso-furniture .fp-iso-top'));
  expect(tops.filter(p => p.getAttribute("points")!.split(" ").length === 5)).toHaveLength(3);
  for (const p of tops) expect(p.getAttribute("points")).not.toMatch(/NaN|Infinity/);
  expect(root.querySelector('.fp-furniture-cornerShelf')).toBeNull();
});
it("keeps the old block fallback for invalid custom model data", async () => {
  const root = await mount({ symbols: { cornerShelf: { id: "cornerShelf", parts: [{ rect: [0, 0, 100, 100] }], model3d: { version: 999 } } } });
  expect(root.querySelectorAll('.fp-iso-furniture[data-id="shelf"]')).toHaveLength(1);
});
it.each([{ view: "2d" }, { wallHeight: 0 }] as Partial<FloorplanCardConfig>[])("keeps plan geometry when not standing: %j", async extra => {
  const root = await mount(extra);
  expect(root.querySelectorAll('.fp-iso-furniture')).toHaveLength(0);
  expect(root.querySelector('.fp-furniture')).not.toBeNull();
});
