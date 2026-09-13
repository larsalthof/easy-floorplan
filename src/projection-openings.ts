/** Standing opening panels, using the same travel and mirrors as the 2D symbols. */
import type { Opening } from "./types";
import { cssColor, cssColorOr, cssNumber } from "./css-safe";
import {
  WALL_THICKNESS, openingMotion, openingSash, openingSashSpan, openingIsGlazed, sliderStyleOf,
  type OpeningStyle,
} from "./render";
import { SKIN_ACCENT } from "./skins";
import { SILL_FRACTION, GLASS_FRACTION, type IsoSolid, type Pt } from "./projection";

export function openingSolids(
  o: Opening,
  style: OpeningStyle,
  map: (x: number, y: number) => Pt,
  height: number,
): IsoSolid[] {
  if (!(height > 0) || !(o.length > 0)) return [];
  const out: IsoSolid[] = [];
  const half = o.length / 2;
  const z0 = o.type === "window" ? height * SILL_FRACTION : 0;
  const z1 = height * GLASS_FRACTION;
  const clamp = (v: unknown) => Math.max(0, Math.min(1, cssNumber(v, 0)));
  const amount = clamp(style.amount ?? (style.open === false ? 0 : 1));
  const amount2 = style.second ? clamp(style.second.amount) : amount;
  const tone = (a: number, active: boolean | undefined, accent = style.accent) =>
    cssColorOr(active ? accent : a === 0 ? cssColor(style.inactive) ?? style.color : style.color, SKIN_ACCENT);
  const color = tone(amount, style.active);
  const color2 = style.second ? tone(amount2, style.second.active) : color;
  const glazed = openingIsGlazed(o);
  const rad = o.angle * Math.PI / 180;
  const at = (x: number, y: number): Pt => {
    x *= o.flipH ? -1 : 1;
    y *= o.flipV ? -1 : 1;
    return map(o.x + x * Math.cos(rad) - y * Math.sin(rad), o.y + x * Math.sin(rad) + y * Math.cos(rad));
  };
  const pane = (
    x1: number, y1: number, x2: number, y2: number,
    paint = color, bottom = z0, top = z1, glass = glazed,
  ) => {
    if (top <= bottom) return;
    out.push({ kind: "panel", id: o.id, base: [at(x1, y1), at(x2, y2)], z0: bottom, z1: top, color: paint, glazed: glass });
  };
  const swing = (left: number, right: number, width: number, a: number, b: number,
    paint = color, paint2 = color2, side = -1, glass = glazed, offset = 0) => {
    const ra = a * Math.PI / 2;
    pane(left, offset, left + width * Math.cos(ra), offset + side * width * Math.sin(ra), paint, z0, z1, glass);
    if (right > left) {
      const rb = b * Math.PI / 2;
      pane(right, offset, right - width * Math.cos(rb), offset + side * width * Math.sin(rb), paint2, z0, z1, glass);
    }
  };

  // The standing gap remains a keyboard/pointer target even with every panel open.
  out.push({ kind: "opening-hit", id: o.id, base: [at(-half, 0), at(half, 0)], z0, z1 });
  const motion = openingMotion(o);
  if (motion === "swing") {
    const two = openingSash(o) === "double";
    const width = two ? half : o.length * openingSashSpan(o);
    swing(-half, two ? half : -half, width, amount, amount2);
    if (!two && width < o.length) pane(-half + width, 0, half, 0, cssColor(style.color), z0, z1, true);
  } else if (motion === "fixed") {
    pane(-half, 0, half, 0, cssColor(style.color));
  } else if (motion === "roll") {
    pane(-half, 0, half, 0, color, z0 + (z1 - z0) * amount, z1, false);
  } else if (motion === "awning") {
    const angle = amount * Math.PI / 2;
    const reach = (z1 - z0) * Math.sin(angle);
    const bottom = z1 - (z1 - z0) * Math.cos(angle);
    const a = at(-half, -reach);
    const b = at(half, -reach);
    out.push({ kind: "panel", id: o.id, base: [a, b], z0: bottom, z1, color, glazed,
      vertices: [{ ...a, z: bottom }, { ...b, z: bottom },
        { ...at(half, 0), z: z1 }, { ...at(-half, 0), z: z1 }] });
  } else {
    const slider = sliderStyleOf(o);
    const q = half / 2;
    const off = 1.75;
    if (slider === "bypass") {
      pane(-half, off, 0, off, cssColor(style.color));
      pane(-half * amount, -off, half - half * amount, -off);
    } else if (slider === "biparting") {
      pane(-half - half * amount, 0, -half * amount, 0);
      pane(half * amount2, 0, half + half * amount2, 0, color2);
    } else if (slider === "biparting-bypass") {
      pane(-half, off, -q, off, cssColor(style.color));
      pane(q, off, half, off, cssColor(style.color));
      pane(-q - q * amount, -off, -q * amount, -off);
      pane(q * amount2, -off, q + q * amount2, -off, color2);
    } else if (slider === "converging") {
      pane(-half + q * amount, off, q * amount, off);
      pane(-q * amount2, -off, half - q * amount2, -off, color2);
    } else {
      pane(-half + o.length * amount, 0, half + o.length * amount, 0);
    }
  }

  // External shutters retain their independent sensor state and cover the glass.
  if (style.shutter) {
    const shutter = style.shutter;
    const a = clamp(shutter.amount);
    const b = shutter.second ? clamp(shutter.second.amount) : a;
    const paint = tone(a, shutter.active, shutter.accent ?? style.accent);
    const paint2 = shutter.second ? tone(b, shutter.second.active, shutter.accent ?? style.accent) : paint;
    if (shutter.style === "swing") {
      const side = shutter.flip ? -1 : 1;
      swing(-half, half, half, a, b, paint, paint2, side, false, side * ((WALL_THICKNESS + 4) / 2 + 1.5));
    } else {
      pane(-half, 2, half, 2, paint, z0 + (z1 - z0) * a, z1, false);
    }
  }
  return out;
}
