/**
 * Geometric checks on a finished layout. Everything here measures the drawn geometry, not the router's
 * bookkeeping, so a bug in the router cannot hide behind its own accounting.
 *
 * Overlap and crossing are different things and are counted apart:
 *   - an OVERLAP is two edges sharing a stretch of line, or running closer than MIN_SEP side by side, or an
 *     edge passing through a node, a label or a title. These must be zero.
 *   - a CROSSING is two edges meeting at a point at an angle. A non-planar graph cannot avoid them; the
 *     layout keeps them low and this counts them.
 */
import type { Graph } from "@toolbench/sdk";
import { badgeBox, polygon } from "../../src/graph/geometry.ts";
import type { Box, GraphLayout, Pt } from "../../src/graph/model.ts";

export const MIN_SEP = 6;

export type Audit = {
	crossings: number;
	sharedSegments: number;
	tooClose: number;
	throughNode: number;
	throughLabel: number;
	throughTitle: number;
	throughBadge: number;
	labelOverlaps: number;
	nodeOverlaps: number;
	groupIntruders: number;
	groupNesting: number;
	alongBorder: number;
	mergedRuns: number;
	unrouted: number;
	/** An edge the tool labelled whose label could not be placed clear of everything: the label is lost. */
	labelsMissing: number;
};

/** Points every `step` px along a polyline. */
function densify(pts: Pt[], step = 2): { p: Pt; dir: Pt }[] {
	const out: { p: Pt; dir: Pt }[] = [];
	for (let i = 0; i + 1 < pts.length; i++) {
		const [ax, ay] = pts[i]!;
		const [bx, by] = pts[i + 1]!;
		const len = Math.hypot(bx - ax, by - ay);
		if (len < 1e-9) continue;
		const dir: Pt = [(bx - ax) / len, (by - ay) / len];
		const n = Math.max(1, Math.ceil(len / step));
		for (let k = 0; k < n; k++) out.push({ p: [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n], dir });
	}
	const last = pts[pts.length - 1]!;
	if (out.length) out.push({ p: last, dir: out[out.length - 1]!.dir });
	return out;
}

const inBox = (p: Pt, b: Box, shrink: number) => p[0] > b.x + shrink && p[0] < b.x + b.w - shrink && p[1] > b.y + shrink && p[1] < b.y + b.h - shrink;
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function inPoly(p: Pt, poly: Pt[]): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i]!;
		const [xj, yj] = poly[j]!;
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const l2 = dx * dx + dy * dy;
	const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
	return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function properCross(p: Pt, q: Pt, r: Pt, s: Pt): boolean {
	const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	const d1 = d(r, s, p);
	const d2 = d(r, s, q);
	const d3 = d(p, q, r);
	const d4 = d(p, q, s);
	return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * An edge's drawn path as points, read back from its `d`: each line end, and each quadratic corner sampled
 * eight times. The checks measure what is drawn, so they read the path rather than any figure the layout keeps.
 */
export function pointsOf(d: string): Pt[] {
	const out: Pt[] = [];
	for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
		const n = args!.trim().split(/\s+/).map(Number);
		if (cmd !== "Q") out.push([n[0]!, n[1]!]);
		else {
			const a = out[out.length - 1]!;
			for (let k = 1; k <= 8; k++) {
				const [t, m] = [k / 8, 1 - k / 8];
				out.push([m * m * a[0] + 2 * m * t * n[0]! + t * t * n[2]!, m * m * a[1] + 2 * m * t * n[1]! + t * t * n[3]!]);
			}
		}
	}
	return out;
}

export function audit(g: Graph, L: GraphLayout): Audit {
	const r: Audit = { crossings: 0, sharedSegments: 0, tooClose: 0, throughNode: 0, throughLabel: 0, throughTitle: 0, throughBadge: 0, labelOverlaps: 0, nodeOverlaps: 0, groupIntruders: 0, groupNesting: 0, alongBorder: 0, mergedRuns: 0, unrouted: 0, labelsMissing: 0 };
	const byId = new Map(L.nodes.map((n) => [n.id, n]));
	const edges = L.edges.map((e) => ({ ...e, points: pointsOf(e.d) }));
	// Spatial hash of every edge segment, 16px cells.
	const CELL = 16;
	const grid = new Map<string, [number, number][]>();
	const keyOf = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
	edges.forEach((e, ei) => {
		for (let k = 0; k + 1 < e.points.length; k++) {
			const [ax, ay] = e.points[k]!;
			const [bx, by] = e.points[k + 1]!;
			const x0 = Math.floor((Math.min(ax, bx) - MIN_SEP) / CELL);
			const x1 = Math.floor((Math.max(ax, bx) + MIN_SEP) / CELL);
			const y0 = Math.floor((Math.min(ay, by) - MIN_SEP) / CELL);
			const y1 = Math.floor((Math.max(ay, by) + MIN_SEP) / CELL);
			for (let i = x0; i <= x1; i++)
				for (let j = y0; j <= y1; j++) {
					const kk = `${i},${j}`;
					(grid.get(kk) ?? grid.set(kk, []).get(kk)!).push([ei, k]);
				}
		}
	});
	const merged = (a: number, b: number) => edges[a]!.merge !== undefined && edges[a]!.merge === edges[b]!.merge;

	// Crossings: proper intersections, each pair of segments once.
	const seen = new Set<string>();
	for (const list of grid.values())
		for (let x = 0; x < list.length; x++)
			for (let y = x + 1; y < list.length; y++) {
				const [ea, ka] = list[x]!;
				const [eb, kb] = list[y]!;
				if (ea === eb || merged(ea, eb)) continue;
				const id = ea < eb ? `${ea}:${ka}:${eb}:${kb}` : `${eb}:${kb}:${ea}:${ka}`;
				if (seen.has(id)) continue;
				seen.add(id);
				const A = edges[ea]!.points;
				const B = edges[eb]!.points;
				if (properCross(A[ka]!, A[ka + 1]!, B[kb]!, B[kb + 1]!)) r.crossings++;
			}

	// Overlaps between edges: runs of one edge within MIN_SEP of another, running parallel.
	edges.forEach((e, ei) => {
		const dense = densify(e.points);
		const runs = new Map<number, { close: number; shared: number }>();
		for (const { p, dir } of dense) {
			const list = grid.get(keyOf(p[0], p[1])) ?? [];
			const best = new Map<number, number>();
			for (const [ej, k] of list) {
				if (ej <= ei) continue;
				const B = edges[ej]!.points;
				const a = B[k]!;
				const b = B[k + 1]!;
				const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
				const cosv = Math.abs((dir[0] * (b[0] - a[0]) + dir[1] * (b[1] - a[1])) / len);
				if (cosv < 0.9) continue;
				const d = segDist(p, a, b);
				best.set(ej, Math.min(best.get(ej) ?? Infinity, d));
			}
			for (const [ej, d] of best) {
				const st = runs.get(ej) ?? { close: 0, shared: 0 };
				if (d < MIN_SEP) st.close++;
				if (d < 1) st.shared++;
				runs.set(ej, st);
			}
		}
		// A run counts once it is longer than a few pixels: two lines meeting at a shallow crossing are close
		// for a pixel or two, a shared stretch for much longer.
		for (const [ej, st] of runs) {
			if (merged(ei, ej)) {
				if (st.shared > 4) r.mergedRuns++;
				continue;
			}
			if (st.shared > 3) r.sharedSegments++;
			else if (st.close > 4) r.tooClose++;
		}
	});

	// Edges through nodes, labels and titles.
	const labels = edges.flatMap((e, ei) => (e.label ? [{ b: e.label as Box, ei }] : []));
	const titles = [...L.groups.map((x) => x.title), ...L.lanes.map((x) => x.title)];
	// Badges sit over a node's corner, outside its box, so they count as obstacles of their own.
	const badges = L.nodes.flatMap((n) => {
		const b = badgeBox(g.nodes.find((x) => x.id === n.id)?.badge, n);
		return b ? [b] : [];
	});
	edges.forEach((e, ei) => {
		const dense = densify(e.points);
		if (e.points.length < 2) r.unrouted++;
		let node = false;
		let lab = false;
		let tit = false;
		let badge = false;
		for (const { p } of dense) {
			for (const n of L.nodes) {
				const own = n.id === e.from || n.id === e.to;
				if (own ? inBox(p, n, 1) && inPoly(p, polygon(n.shape, { x: n.x + 1.5, y: n.y + 1.5, w: n.w - 3, h: n.h - 3 })) : inBox(p, n, 0.5)) node = true;
			}
			for (const l of labels) if (l.ei !== ei && inBox(p, l.b, 0.5)) lab = true;
			for (const t of titles) if (inBox(p, t, 0.5)) tit = true;
			for (const t of badges) if (inBox(p, t, 0.5)) badge = true;
		}
		if (node) r.throughNode++;
		if (lab) r.throughLabel++;
		if (tit) r.throughTitle++;
		if (badge) r.throughBadge++;
		// Along a group or lane outline: within 2px of a border, parallel, for more than a pitch.
		for (const b of [...L.groups, ...L.lanes]) {
			let run = 0;
			let worst = 0;
			for (const { p, dir } of dense) {
				const nearV = (Math.abs(p[0] - b.x) < 2 || Math.abs(p[0] - b.x - b.w) < 2) && p[1] > b.y && p[1] < b.y + b.h && Math.abs(dir[1]) > 0.9;
				const nearH = (Math.abs(p[1] - b.y) < 2 || Math.abs(p[1] - b.y - b.h) < 2) && p[0] > b.x && p[0] < b.x + b.w && Math.abs(dir[0]) > 0.9;
				run = nearV || nearH ? run + 1 : 0;
				worst = Math.max(worst, run);
			}
			if (worst > 4) r.alongBorder++;
		}
	});

	// Labels against nodes, other labels and titles.
	const solids = [...L.nodes.map((n) => ({ b: n as Box, t: "n" })), ...labels.map((l) => ({ b: l.b, t: "l" })), ...titles.map((t) => ({ b: t, t: "t" })), ...badges.map((t) => ({ b: t, t: "b" }))];
	for (let i = 0; i < solids.length; i++)
		for (let j = i + 1; j < solids.length; j++) {
			const a = solids[i]!;
			const b = solids[j]!;
			// A badge overlaps its own node by design: skip badge against node.
			if ((a.t === "b" && b.t === "n") || (a.t === "n" && b.t === "b")) {
				const bb = a.t === "b" ? a.b : b.b;
				const nn = a.t === "n" ? a.b : b.b;
				if (Math.abs(bb.x + bb.w - 4 - (nn.x + nn.w)) < 0.01 && Math.abs(bb.y + 7 - nn.y) < 0.01) continue;
			}
			if (a.t === "n" && b.t === "n") {
				if (hit(a.b, b.b)) r.nodeOverlaps++;
			} else if (hit(a.b, b.b)) r.labelOverlaps++;
		}
	// Groups: no non-member inside, every child inside its parent.
	const groupOf = new Map((g.groups ?? []).map((x) => [x.id, x]));
	const memberOf = (nodeGroup: string | undefined, gid: string) => {
		for (let p = nodeGroup; p !== undefined; p = groupOf.get(p)?.parent) if (p === gid) return true;
		return false;
	};
	for (const gr of L.groups) {
		for (const n of L.nodes) if (!memberOf(n.group, gr.id) && n.id !== gr.id && hit(n, gr)) r.groupIntruders++;
		if (gr.parent) {
			const p = L.groups.find((x) => x.id === gr.parent);
			if (p && !(gr.x >= p.x && gr.y >= p.y && gr.x + gr.w <= p.x + p.w && gr.y + gr.h <= p.y + p.h)) r.groupNesting++;
		}
		for (const other of L.groups) {
			if (other === gr || memberOf(other.id, gr.id) || memberOf(gr.id, other.id)) continue;
			if (hit(other, gr)) r.groupIntruders++;
		}
	}
	void byId;
	// Against the graph as laid out, so a collapsed group's dropped internal edges do not count.
	for (const e of L.edges) if (g.edges[e.index]?.label && !e.label && g.edges[e.index]!.from === e.from && g.edges[e.index]!.to === e.to) r.labelsMissing++;
	return r;
}

/** The overlap total that must be zero. */
export const overlaps = (a: Audit) => a.sharedSegments + a.tooClose + a.throughNode + a.throughLabel + a.throughTitle + a.throughBadge + a.labelOverlaps + a.nodeOverlaps + a.groupIntruders + a.groupNesting + a.unrouted + a.labelsMissing;
