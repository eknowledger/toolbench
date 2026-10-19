/**
 * What the free placements (tree, radial, force, manual) share, and the layered one does not need:
 * pushing boxes apart, growing a node for its ports, and boxing groups round their members.
 */
import type { Graph } from "@toolbench/sdk";
import { ext, type GroupBox, type Side } from "./chunks.ts";
import { oddUp, P, PG, textW } from "./geometry.ts";
import type { Box } from "./model.ts";
import { facing } from "./ports.ts";

/** How many ends each side of each node takes, before slots: what a free layout grows its nodes by. */
function loads(g: Graph, boxes: Box[]): number[][] {
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const out = g.nodes.map(() => [0, 0, 0, 0]);
	const at: Record<Side, number> = { left: 0, right: 1, top: 2, bottom: 3 };
	for (const ed of g.edges) {
		const u = idx.get(ed.from)!;
		const v = idx.get(ed.to)!;
		out[u]![at[ed.fromSide ?? (u === v ? "top" : facing(boxes[u]!, boxes[v]!))]]!++;
		out[v]![at[ed.toSide ?? (u === v ? "right" : facing(boxes[v]!, boxes[u]!))]]!++;
	}
	return out;
}

/** Push overlapping boxes apart, keeping `gap` between them; pinned boxes do not move. */
export function separate(boxes: Box[], gap: number, pinned: boolean[]) {
	const n = boxes.length;
	for (let pass = 0, moved = true; moved && pass < 200; pass++) {
		moved = false;
		const ord = [...Array(n).keys()].sort((a, b) => boxes[a]!.x - boxes[b]!.x || a - b);
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++) {
				const a = boxes[ord[i]!]!;
				const b = boxes[ord[j]!]!;
				if (b.x >= a.x + a.w + gap) break;
				const ox = Math.min(a.x + a.w, b.x + b.w) + gap - Math.max(a.x, b.x);
				const oy = Math.min(a.y + a.h, b.y + b.h) + gap - Math.max(a.y, b.y);
				const [pa, pb] = [pinned[ord[i]!], pinned[ord[j]!]];
				if (ox <= 0 || oy <= 0 || (pa && pb)) continue;
				moved = true;
				const sa = pa ? 0 : pb ? 1 : 0.5;
				const horiz = ox < oy;
				const s = horiz ? (a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1) : a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1;
				const o = horiz ? ox : oy;
				if (horiz) ((a.x -= s * o * sa), (b.x += s * o * (1 - sa)));
				else ((a.y -= s * o * sa), (b.y += s * o * (1 - sa)));
			}
	}
}

/**
 * A free layout knows which side faces which neighbour only once it has placed them: grow each node so
 * its busiest side holds its ports 16 apart, then push apart again for the corridors routes need.
 */
export function settle(g: Graph, boxes: Box[], gap: number, pinned: boolean[]) {
	separate(boxes, gap, pinned);
	loads(g, boxes).forEach(([l, r, t, b], u) => {
		const box = boxes[u]!;
		const w = Math.max(box.w, oddUp(PG * Math.max(t!, b!) + 8));
		const h = Math.max(box.h, oddUp(PG * Math.max(l!, r!) + 8));
		box.x -= (w - box.w) / 2;
		box.y -= (h - box.h) / 2;
		box.w = w;
		box.h = h;
	});
	separate(boxes, gap, pinned);
}

/** Group boxes round their members and child groups, deepest first. */
ext.groupBoxes = (g, boxes) => {
	const gs = g.groups ?? [];
	const depth = (id: string): number => {
		const p = gs.find((x) => x.id === id)?.parent;
		return p ? 1 + depth(p) : 1;
	};
	const got = new Map<string, Box>();
	const out: GroupBox[] = [];
	for (const gr of [...gs].sort((a, b) => depth(b.id) - depth(a.id))) {
		const parts = [...boxes.filter((_, u) => g.nodes[u]!.group === gr.id), ...gs.flatMap((c) => (c.parent === gr.id && got.has(c.id) ? [got.get(c.id)!] : []))];
		if (!parts.length) continue;
		const x = Math.min(...parts.map((b) => b.x)) - 2 * P;
		const y = Math.min(...parts.map((b) => b.y)) - 2 * P - 18;
		const box = { x, y, w: Math.max(...parts.map((b) => b.x + b.w)) + 2 * P - x, h: Math.max(...parts.map((b) => b.y + b.h)) + 2 * P - y };
		got.set(gr.id, box);
		out.push({ id: gr.id, box, title: { x: box.x + 6, y: box.y + 2, w: textW(gr.label, 11) + 16, h: 14 }, depth: depth(gr.id) });
	}
	return out;
};
