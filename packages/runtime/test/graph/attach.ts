/**
 * Attachment metrics, measured on the finished geometry: where each edge actually meets each node.
 *   - single: sides holding one end; ok when that end is within 1px of the side's midpoint
 *   - multi: sides holding several; ok when their offsets are symmetric about the centre at one even gap
 *   - corner: ends within 6px of a box corner along their side (must be 0)
 *   - away: ends on a side other than the one geometrically facing the other end's centre; in a layered
 *     layout most of these are by design, on the flow side. moved: ends a full side pushed to the next
 *     side, from the layout's own account; forced: ends the tool placed with fromSide or toSide
 *   - rows: ends at a record row, and how many sit within 8px of that row's centre
 * Shared ends (a merged bus) count once.
 */
import type { Graph, GraphSide as Side } from "@toolbench/sdk";
import type { GraphLayout, Pt } from "../../src/graph/model.ts";

export type Attach = { ends: number; single: number; singleOk: number; multi: number; multiOk: number; corner: number; away: number; moved: number; forced: number; rows: number; rowsOk: number };

const sideOf = (p: Pt, b: { x: number; y: number; w: number; h: number }): Side => {
	const dx = p[0] - (b.x + b.w / 2);
	const dy = p[1] - (b.y + b.h / 2);
	return Math.abs(dx) * b.h >= Math.abs(dy) * b.w ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
};

export function attach(g: Graph, L: GraphLayout): Attach {
	const r: Attach = { ends: 0, single: 0, singleOk: 0, multi: 0, multiOk: 0, corner: 0, away: 0, moved: L.meta?.moved ?? 0, forced: g.edges.reduce((s, e) => s + (e.fromSide ? 1 : 0) + (e.toSide ? 1 : 0), 0), rows: 0, rowsOk: 0 };
	const byId = new Map(L.nodes.map((n) => [n.id, n]));
	const sides = new Map<string, Set<string>>();
	for (const e of L.edges) {
		const ge = g.edges[e.index]!;
		for (const k of [0, 1]) {
			const n = byId.get(k ? e.to : e.from)!;
			const o = byId.get(k ? e.from : e.to)!;
			const p = e.ports[k]!;
			const row = k ? ge.toPort : ge.fromPort;
			r.ends++;
			if (row !== undefined) {
				r.rows++;
				const rb = n.rows?.find((x) => x.id === row);
				if (rb && Math.abs(p[1] - (rb.y + rb.h / 2)) <= 8.5) r.rowsOk++;
				continue;
			}
			const s = sideOf(p, n);
			const vert = s === "left" || s === "right";
			const along = vert ? p[1] - (n.y + n.h / 2) : p[0] - (n.x + n.w / 2);
			if (Math.abs(along) > (vert ? n.h : n.w) / 2 - 6) r.corner++;
			if (n.id !== o.id && s !== sideOf([o.x + o.w / 2, o.y + o.h / 2], n)) r.away++;
			const key = `${n.id}:${s}`;
			(sides.get(key) ?? sides.set(key, new Set()).get(key)!).add(String(Math.round(along * 2) / 2));
		}
	}
	for (const offs of sides.values()) {
		const o = [...offs].map(Number).sort((a, b) => a - b);
		if (o.length === 1) {
			r.single++;
			if (Math.abs(o[0]!) <= 1) r.singleOk++;
		} else {
			r.multi++;
			const gaps = o.slice(1).map((v, i) => v - o[i]!);
			if (o.every((v, i) => Math.abs(v + o[o.length - 1 - i]!) <= 1) && gaps.every((d) => Math.abs(d - gaps[0]!) <= 1)) r.multiOk++;
		}
	}
	return r;
}
