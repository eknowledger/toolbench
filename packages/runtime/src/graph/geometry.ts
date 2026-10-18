/**
 * What every part of the graph kind shares: the grid pitch, text metrics, the shape table, clipping, the
 * markers and the badge. One module, so nothing is defined twice.
 *
 * ⚠️ Determinism: the same graph must give the same picture in every engine, and `Math.sin`, `Math.cos`,
 * `Math.atan2`, `Math.hypot` and `**` are not correctly rounded, so engines differ in the last bit. Nothing in
 * the layout uses them: `hyp` is a square root, which IEEE 754 does fix, an ellipse is drawn by a rational
 * parametrisation, and the radial placement carries its own sine series.
 */
import type { GraphMarker, GraphNode, GraphShape } from "@toolbench/sdk";
import { ext, need, type Side } from "./chunks.ts";
import type { Box, Pt } from "./model.ts";

/** The routing grid's pitch, and the least gap between two parallel edges. */
export const P = 8;
/** Gap between two ports on one side. Twice the pitch, so a symmetric pair sits on grid lines. */
export const PG = 2 * P;
export const hyp = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const r1 = (v: number): number => Math.round(v * 10) / 10;
/** A monospace advance, so geometry never depends on which font is present. */
export const textW = (s: string, size: number): number => Math.ceil(s.length * size * 0.605);
/** Round up to an odd multiple of P, so a box's centre lines are grid lines. */
export const oddUp = (v: number): number => (Math.ceil(v / P) | 1) * P;
export const SIDES: Side[] = ["left", "right", "top", "bottom"];
/** A record's header and rows are 24 high, so every row's centre line is a grid line. */
export const ROW = 24;
export const HEAD = 24;
export const vertical = (s: Side): boolean => s === "left" || s === "right";

/* ── Shapes, as data: a size rule and an outline, either a radius, an ellipse, or a polygon template. ── */

export type ShapeDef = {
	size: (w: number, h: number) => number[];
	/** Rounded rectangle radius; -1 is half the height, a pill. */
	r?: number;
	ell?: 1;
	/** Polygon template, triples of [fraction of w, fraction of h added to x, fraction of h for y]. */
	t?: number[];
	d?: (b: Box) => string;
	pg?: (b: Box) => Pt[];
};
const box = (w: number, h: number) => [w + 24, h + 10];
export const SHAPES: Record<string, ShapeDef> = {
	rect: { size: box, r: 1 },
	rounded: { size: box, r: 6 },
	pill: { size: (w, h) => [w + h + 14, h + 10], r: -1 },
	circle: { size: (w, h) => [Math.max(w, h) + 18, Math.max(w, h) + 18], ell: 1 },
	ellipse: { size: (w, h) => [(w + 18) * 1.3, (h + 14) * 1.3], ell: 1 },
	// A rhombus holds a w x h box when w/W + h/H <= 1; 0.6 and 0.4 keep it from growing tall.
	diamond: { size: (w, h) => [(w + 8) / 0.6, (h + 4) / 0.4], t: [0.5, 0, 0, 1, 0, 0.5, 0.5, 0, 1, 0, 0, 0.5] },
	// A box on the grid with a dot of radius 8 inside it: edges stop at the dot, not at the box.
	point: { size: () => [24, 24], pg: (b) => ellipse(b.x + b.w / 6, b.y + b.h / 6, (b.w * 2) / 3, (b.h * 2) / 3), d: (b) => arcs(b.x + 4, b.y + 4, 16, 16) },
};

/** An ellipse as 32 points, by the rational parametrisation: no trigonometry, so every engine agrees. */
export function ellipse(x: number, y: number, w: number, h: number): Pt[] {
	const out: Pt[] = [];
	for (const s of [1, -1])
		for (let k = 0; k <= 16; k++) {
			const t = k / 8 - 1;
			const q = 1 + t * t;
			out.push([x + w / 2 + (s * w * (1 - t * t)) / (2 * q), y + h / 2 + (s * h * t) / q]);
		}
	return out;
}
const arcs = (x: number, y: number, w: number, h: number) =>
	`M${r1(x)} ${r1(y + h / 2)}A${r1(w / 2)} ${r1(h / 2)} 0 1 1 ${r1(x + w)} ${r1(y + h / 2)}A${r1(w / 2)} ${r1(h / 2)} 0 1 1 ${r1(x)} ${r1(y + h / 2)}Z`;

export const shapeOf = (n: GraphNode): ShapeDef => need(SHAPES[n.shape ?? "rounded"], n.shape === "record" ? "er" : "shapes");

export function polygon(shape: GraphShape | string, b: Box): Pt[] {
	const s = SHAPES[shape]!;
	if (s.pg) return s.pg(b);
	if (s.ell) return ellipse(b.x, b.y, b.w, b.h);
	const t = s.t ?? [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1];
	const out: Pt[] = [];
	for (let i = 0; i < t.length; i += 3) out.push([b.x + t[i]! * b.w + t[i + 1]! * b.h, b.y + t[i + 2]! * b.h]);
	return out;
}

export function outline(shape: GraphShape | string, b: Box): string {
	const s = SHAPES[shape]!;
	if (s.d) return s.d(b);
	if (s.ell) return arcs(b.x, b.y, b.w, b.h);
	if (s.r) {
		const r = s.r < 0 ? b.h / 2 : s.r;
		const { x, y, w, h } = b;
		return `M${r1(x + r)} ${r1(y)}H${r1(x + w - r)}A${r} ${r} 0 0 1 ${r1(x + w)} ${r1(y + r)}V${r1(y + h - r)}A${r} ${r} 0 0 1 ${r1(x + w - r)} ${r1(y + h)}H${r1(x + r)}A${r} ${r} 0 0 1 ${r1(x)} ${r1(y + h - r)}V${r1(y + r)}A${r} ${r} 0 0 1 ${r1(x + r)} ${r1(y)}Z`;
	}
	return `M${polygon(shape, b)
		.map(([a, c]) => `${r1(a)} ${r1(c)}`)
		.join("L")}Z`;
}

/** Where the segment from a towards b first meets the polygon. */
export function clip(poly: Pt[], a: Pt, b: Pt): Pt | undefined {
	let best = 2;
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i]!;
		const q = poly[(i + 1) % poly.length]!;
		const ex = q[0] - p[0];
		const ey = q[1] - p[1];
		const den = dx * ey - dy * ex;
		if (!den) continue;
		const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
		const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
		if (t >= 0 && t < best && u >= 0 && u <= 1) best = t;
	}
	return best <= 1 ? [a[0] + dx * best, a[1] + dy * best] : undefined;
}

/**
 * A marker as [path, fill] at `tip`, the line arriving along unit `u`. Geometry rather than SVG `<marker>`,
 * so a marker is positioned by the same numbers the checks measure. Arrow and open are here; the rest are the
 * ER chunk's.
 */
export function mark(m: GraphMarker, tip: Pt, u: Pt): [string, string] | undefined {
	if (m === "none") return undefined;
	const at = (back: number, side: number) => `${r1(tip[0] - u[0] * back - u[1] * side)} ${r1(tip[1] - u[1] * back + u[0] * side)}`;
	if (m === "arrow" || m === "open") return [`M${at(0, 0)}L${at(8, -4)}L${at(8, 4)}Z`, m === "arrow" ? "solid" : "hollow"];
	return need(ext.mark, "er")(m, at);
}

/** Where a node's badge sits: over its top-right corner. Drawing, routing and the checks use the same box. */
export function badgeBox(badge: string | undefined, n: Box): Box | undefined {
	if (!badge) return undefined;
	const w = Math.max(14, textW(badge, 9) + 8);
	return { x: n.x + n.w - w + 4, y: n.y - 7, w, h: 14 };
}
