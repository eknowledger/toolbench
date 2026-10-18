/**
 * Where each edge attaches, decided before any routing. The rule:
 *   - an edge leaves from the side FACING its other end (in a layered layout, the flow side);
 *   - one edge on a side attaches at the side's midpoint;
 *   - several are packed symmetrically out from the centre, PG apart, ordered by where their other ends
 *     are, so they do not cross at the node (ELK's CENTER and DISTRIBUTED, ordered by opposite barycentre);
 *   - another side only when the facing side is full, or the tool forces one; never a corner;
 *   - a shape's own geometry limits a side: a diamond's left side has room only at its vertex.
 * F1b let the router pick any free grid point on any side, which is why ends looked arbitrary.
 */
import type { Graph } from "@toolbench/sdk";
import type { Side } from "./chunks.ts";
import { clip, hyp, P, PG, polygon, vertical } from "./geometry.ts";
import type { Box } from "./model.ts";

export type End = { side: Side; off: number };

/** The farthest an outline may sit inside its box at a port: further, and the stub reads as a spike. */
const DEPTH = P;
/** A port is at least this far from a corner, as in ports.py: inside the corner radius, never at it. */
const INSET = 12;

export function facing(a: Box, b: Box): Side {
	const dx = b.x + b.w / 2 - (a.x + a.w / 2);
	const dy = b.y + b.h / 2 - (a.y + a.h / 2);
	return Math.abs(dx) * a.h >= Math.abs(dy) * a.w ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
}

/** Whether k ports fit on a side, symmetric about its centre, PG apart, inside the inset and the outline. */
export function fits(shape: string, b: Box, side: Side, k: number, badge = 0): boolean {
	if (!k) return true;
	// A badge sits over the top-right corner; ports on the top side keep clear of it, symmetrically.
	const half = (vertical(side) ? b.h : b.w) / 2 - (side === "top" && badge ? badge + 4 - INSET : 0);
	const span = (PG * (k - 1)) / 2;
	if (k > 1 && span > half - INSET) return false;
	const poly = polygon(shape, b);
	for (const off of [-span, span]) {
		const [x, y, dx, dy] = ring(b, side, off);
		const hit = clip(poly, [x, y], [x + dx * 1e4, y + dy * 1e4]);
		if (!hit || hyp(hit[0] - x, hit[1] - y) > DEPTH + P / 2 + 0.5) return false;
	}
	return true;
}

/** The ring point for a port (P/2 outside the box) and the inward direction. */
export function ring(b: Box, side: Side, off: number): [number, number, number, number] {
	const cx = b.x + b.w / 2 + (vertical(side) ? 0 : off);
	const cy = b.y + b.h / 2 + (vertical(side) ? off : 0);
	return side === "left" ? [b.x - P / 2, cy, 1, 0] : side === "right" ? [b.x + b.w + P / 2, cy, -1, 0] : side === "top" ? [cx, b.y - P / 2, 0, 1] : [cx, b.y + b.h + P / 2, 0, -1];
}

const PERP: Record<Side, Side[]> = { left: ["top", "bottom"], right: ["top", "bottom"], top: ["left", "right"], bottom: ["left", "right"] };

/**
 * Sides, then slots. `hints` are the flow sides a layered or tree layout prefers; `keys` the coordinate
 * along the side of what each end reaches next. `rowOff` gives a record row's offset when an edge names one.
 */
export function assign(g: Graph, boxes: Box[], shapes: string[], hints: { out?: Side | undefined; in?: Side | undefined }[], keys: { from?: number | number[]; to?: number | number[] }[] | undefined, rowOff: (u: number, row: string) => number | undefined, badges: number[]): { ends: End[][]; moved: number; share: number[] } {
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const res: End[][] = g.edges.map(() => []);
	/** One end on one side: its edge, which end, the key it is ordered by, its merge key, and whether forced there. */
	type Slot = { i: number; e: number; key: number; m: string; f: boolean };
	const lists = new Map<string, Slot[]>();
	const rowUsed = new Map<string, number>();
	const share: number[] = g.edges.map(() => 0);
	g.edges.forEach((ed, i) => {
		const ends = [idx.get(ed.from)!, idx.get(ed.to)!];
		const loop = ends[0] === ends[1];
		for (const e of [0, 1]) {
			const u = ends[e]!;
			const v = ends[1 - e]!;
			const forced = e ? ed.toSide : ed.fromSide;
			const row = e ? ed.toPort : ed.fromPort;
			const off = row === undefined ? undefined : rowOff(u, row);
			if (off !== undefined) {
				// A row port: the row's side facing the other end, at the row's centre. Several edges from one
				// row share that port and leave as one trunk, as one key referenced from several tables reads.
				// Giving the second edge the row's far side instead sent it round the whole table.
				const side: Side = forced ?? (boxes[v]!.x + boxes[v]!.w / 2 >= boxes[u]!.x + boxes[u]!.w / 2 ? "right" : "left");
				const k = `${u}:${row}:${side}`;
				const first = rowUsed.get(k);
				if (first !== undefined) share[i] = share[first] = share[first] || 3e6 + i;
				else rowUsed.set(k, i);
				res[i]![e] = { side, off };
				continue;
			}
			const hint = e ? hints[i]?.in : hints[i]?.out;
			const side: Side = forced ?? hint ?? (loop ? (e ? "right" : "top") : facing(boxes[u]!, boxes[v]!));
			const b = boxes[v]!;
			// A loop's two ends sit at the ends of their sides nearest the corner they share.
			// A key is a coordinate along the side, or a point, read along whichever side the end lands on.
			const kk = e ? keys?.[i]?.to : keys?.[i]?.from;
			const key = loop ? (e ? -1e9 : 1e9) : typeof kk === "number" ? kk : kk ? kk[vertical(side) ? 1 : 0]! : vertical(side) ? b.y + b.h / 2 : b.x + b.w / 2;
			const m = g.merge === "source" && !e ? `s${u}` : g.merge === "target" && e ? `t${u}` : `${i}:${e}`;
			const k = `${u}:${side}`;
			(lists.get(k) ?? lists.set(k, []).get(k)!).push({ i, e, key, m, f: forced !== undefined });
		}
	});
	const sorted = (L: Slot[]) => L.sort((a, b) => a.key - b.key || a.i - b.i || a.e - b.e);
	const count = (L: Slot[]) => new Set(L.map((s) => s.m)).size;
	let overflow = 0;
	// Overflow: while a side cannot hold its ports, the end reaching furthest round goes to the next side.
	for (let guard = 0, moved = true; moved && guard < 1000; guard++) {
		moved = false;
		for (const [k, L] of [...lists]) {
			const [us, side] = k.split(":") as [string, Side];
			const u = +us;
			sorted(L);
			// A forced end stays where it was forced: moving one undid the layout's own move of a walled-in end.
			const free = L.filter((x) => !x.f);
			if (fits(shapes[u]!, boxes[u]!, side, count(L), badges[u]) || L.length < 2 || !free.length) continue;
			const c = vertical(side) ? boxes[u]!.y + boxes[u]!.h / 2 : boxes[u]!.x + boxes[u]!.w / 2;
			const last = free[free.length - 1]!.key - c >= c - free[0]!.key;
			const s0 = last ? free[free.length - 1]! : free[0]!;
			L.splice(L.indexOf(s0), 1);
			const order: Side[] = last ? [PERP[side][1]!, PERP[side][0]!] : PERP[side];
			const to = order.find((o) => fits(shapes[u]!, boxes[u]!, o, count(lists.get(`${u}:${o}`) ?? []) + 1, badges[u])) ?? order[0]!;
			const k2 = `${u}:${to}`;
			(lists.get(k2) ?? lists.set(k2, []).get(k2)!).push(s0);
			moved = true;
			overflow++;
		}
	}
	for (const [k, L] of lists) {
		const side = k.split(":")[1] as Side;
		sorted(L);
		const ms = [...new Set(L.map((s) => s.m))];
		for (const s of L) res[s.i]![s.e] = { side, off: (ms.indexOf(s.m) - (ms.length - 1) / 2) * PG };
	}
	return { ends: res, moved: overflow, share };
}
