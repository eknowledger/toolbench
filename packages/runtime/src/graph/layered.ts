/**
 * Layered placement: Sugiyama in four directions with pinned ranks. Split into `order` and `place`, so
 * the search can reorder a layer and place again. Groups and lanes are the groups chunk's, through hooks.
 *
 *   1. cycles broken by DFS in input order; self-loops set aside
 *   2. ranks by longest path, pins honoured, doubled so labels get layers of their own
 *   3. dummies for long edges; a label is a dummy, so the space for it is reserved
 *   4. order: barycentre and median sweeps, transposition after each, the fewest crossings kept
 *   5. place: weighted means made feasible by isotonic regression; one-to-one chains straightened; each
 *      gap as wide as the routes through it need
 */
import type { Graph } from "@toolbench/sdk";
import { ext, need, type Side } from "./chunks.ts";
import { oddUp, P, PG, textW } from "./geometry.ts";
import type { Box } from "./model.ts";

const CLEAR = 12;

/** An item in a layer: a node, a dummy, or (groups chunk) a group border. Short keys: the minifier keeps them. */
export type It = { l: number; n: number; c: number[]; s: number; ln: number; b: number; a: number; r: number; p: number; o: number; up: number[]; dn: number[]; uw: number[]; dw: number[]; bu: number; bd: number };

export type Placement = {
	boxes: Box[];
	groups: { id: string; box: Box; title: Box; depth: number }[];
	lanes: { id: string; label: string; box: Box; title: Box }[];
	sides: { out?: Side | undefined; in?: Side | undefined }[];
	/** Per edge end, the coordinate along the side of what it reaches next: what orders ports on a side. */
	keys: { from?: number; to?: number }[];
	guides: ({ r0: number; r1: number; o0: number; o1: number }[] | undefined)[];
	rankAxis: "x" | "y";
};
export type LState = ReturnType<typeof order>;
export type Frame = { mid: (l: number) => number; bs: number[]; thick: number[]; box: (ra: number, rb: number, oa: number, ob: number) => Box; len: number };
/** What the groups chunk supplies. */
export type Compound = {
	init: (st: LState) => void;
	borders: (st: LState, mk: (l: number, n: number, c: number[], ln: number) => It) => void;
	cmp: (st: LState, key: (k: number) => number, L: number[]) => (a: number, b: number) => number;
	consistent: (st: LState) => void;
	sep: (st: LState, a: It, b: It) => number | undefined;
	square: (st: LState, seps: number[][]) => void;
	pad: (st: LState, l: number, end: number) => number;
	out: (st: LState, f: Frame) => Pick<Placement, "groups" | "lanes">;
};

export function order(g: Graph, sizes: number[][]) {
	const dir = g.direction ?? "LR";
	const lr = dir === "LR" || dir === "RL";
	const sp = g.spacing === "compact" ? 0.75 : g.spacing === "loose" ? 1.5 : 1;
	const cx = g.groups?.length || g.lanes?.length ? (need(ext.compound, "groups") as Compound) : undefined;
	const n = g.nodes.length;
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const rX = (u: number) => sizes[u]![lr ? 0 : 1]!;
	const oX = (u: number) => sizes[u]![lr ? 1 : 0]!;

	// 1. Cycles, by an iterative DFS: a 500-node chain recursed past the stack.
	const out: number[][] = g.nodes.map(() => []);
	const loops: number[][] = g.nodes.map(() => []);
	const ue = g.edges.map((e) => [idx.get(e.from)!, idx.get(e.to)!]);
	ue.forEach(([u, v], i) => (u === v ? loops : out)[u!]!.push(i));
	const seen = new Uint8Array(n);
	const rev = g.edges.map(() => false);
	for (let s = 0; s < n; s++) {
		if (seen[s]) continue;
		const stack = [[s, 0]];
		seen[s] = 1;
		while (stack.length) {
			const top = stack.at(-1)!;
			const u = top[0]!;
			if (top[1]! < out[u]!.length) {
				const i = out[u]![top[1]!++]!;
				const v = ue[i]![1]!;
				if (seen[v] === 1) rev[i] = true;
				else if (!seen[v]) ((seen[v] = 1), stack.push([v, 0]));
			} else ((seen[u] = 2), stack.pop());
		}
	}
	const pin = (u: number) => g.nodes[u]!.rank;
	ue.forEach(([u, v], i) => {
		if (pin(u!) !== undefined && pin(v!) !== undefined && u !== v) rev[i] = pin(u!)! > pin(v!)!;
	});
	const ori = ue.map(([u, v], i) => (rev[i] ? [v!, u!] : [u!, v!]));

	// 2. Ranks: longest path in Kahn's order, sources pulled up to just before their nearest successor.
	const preds: number[][] = g.nodes.map(() => []);
	const succs: number[][] = g.nodes.map(() => []);
	for (const [u, v] of ori) if (u !== v) (succs[u!]!.push(v!), preds[v!]!.push(u!));
	const indeg = preds.map((p) => p.length);
	const topo = [...Array(n).keys()].filter((u) => !indeg[u]);
	for (let q = 0; q < topo.length; q++) for (const v of succs[topo[q]!]!) if (!--indeg[v]!) topo.push(v);
	const rank = new Array<number>(n).fill(0);
	for (const u of topo) {
		if (pin(u) !== undefined) rank[u] = Math.max(rank[u]!, pin(u)!);
		for (const v of succs[u]!) rank[v] = Math.max(rank[v]!, rank[u]! + 1);
	}
	for (const u of [...topo].reverse()) if (pin(u) === undefined && !preds[u]!.length && succs[u]!.length) rank[u] = Math.min(...succs[u]!.map((v) => rank[v]!)) - 1;
	const r0 = Math.min(...rank);
	for (let u = 0; u < n; u++) rank[u] = (rank[u]! - r0) * 2;
	const LC = Math.max(...rank) + 1;

	// 3. Items. A node's extent along the layer grows with its busiest flow side, a port gap per edge.
	const sideIn = new Array<number>(n).fill(0);
	const sideOut = new Array<number>(n).fill(0);
	for (const [u, v] of ori) if (u !== v) (sideOut[u!]!++, sideIn[v!]!++);
	// A badge sits over the top-right corner; where the top is a flow side (TB, BT) it takes room from
	// both halves of that side, because ports are symmetric.
	const badge = (u: number) => (!lr && g.nodes[u]!.badge ? 2 * Math.max(0, Math.max(14, textW(g.nodes[u]!.badge!, 9) + 8) - 8) : 0);
	const oe = g.nodes.map((_, u) => Math.max(oX(u), oddUp(PG * Math.max(sideIn[u]!, sideOut[u]! + loops[u]!.length) + 8 + badge(u))));
	const items: It[] = [];
	const mk = (l: number, nn: number, c: number[], ln: number): It => ({ l, n: nn, c, s: 0, ln, b: 0, a: 0, r: 0, p: 0, o: 0, up: [], dn: [], uw: [], dw: [], bu: -1, bd: -1 });
	const st = { g, dir, lr, sp, n, cx, items, layers: [] as number[][], chains: [] as number[][], chainEdge: [] as number[], rev, LC, rX, oe, nc: g.nodes.map(() => [] as number[]), nl: g.nodes.map(() => 0), borders: [] as number[][][], span: [] as number[][], extra: {} as Record<string, unknown> };
	cx?.init(st as never);
	for (let u = 0; u < n; u++) {
		const it = mk(rank[u]!, u, st.nc[u]!, st.nl[u]!);
		it.b = it.a = oe[u]! / 2;
		it.r = rX(u);
		if (loops[u]!.length) {
			// A loop leaves the top (LR) or right (TB) side and comes back on the next; its label sits beside it.
			const lab = Math.max(...loops[u]!.map((i) => textW(g.edges[i]!.label ?? "", 11) + 8));
			if (lr) ((it.b += 5 * P + 16), (it.r += lab / 2));
			else ((it.a += 5 * P + lab), (it.r += 16));
		}
		items.push(it);
	}
	ori.forEach(([u, v], i) => {
		if (u === v) return;
		const e = g.edges[i]!;
		const [lo, hi] = [rank[u!]!, rank[v!]!];
		const ll = lo + 2 * Math.floor((hi - lo) / 4) + 1;
		const ch = [u!];
		const a = st.nc[u!]!;
		const b = st.nc[v!]!;
		let k = 0;
		while (k < a.length && a[k] === b[k]) k++;
		for (let l = lo + 1; l < hi; l++) {
			const it = mk(l, -1, a.slice(0, k), st.nl[l < (lo + hi) / 2 ? u! : v!]!);
			it.b = it.a = P / 2;
			if (l === ll && e.label) {
				const w = textW(e.label, 11) + 8;
				it.b = it.a = (lr ? 3 * P : w + P) / 2;
				it.r = lr ? w + 2 * P : 3 * P;
			}
			ch.push(items.length);
			items.push(it);
		}
		ch.push(v!);
		st.chains.push(ch);
		st.chainEdge.push(i);
		for (let j = 0; j + 1 < ch.length; j++) {
			const [x, y] = [items[ch[j]!]!, items[ch[j + 1]!]!];
			const w = x.n < 0 && y.n < 0 ? 8 : x.n < 0 || y.n < 0 ? 2 : 1;
			(x.dn.push(ch[j + 1]!), x.dw.push(w), y.up.push(ch[j]!), y.uw.push(w));
		}
	});
	cx?.borders(st as never, mk);
	st.layers = Array.from({ length: LC }, () => []);
	items.forEach((it, k) => st.layers[it.l]!.push(k));
	sortAll(st);
	return st;
}

const setPos = (st: LState) => st.layers.forEach((L) => L.forEach((k, p) => (st.items[k]!.p = p)));

/** Crossings between layer l and l+1, as inversions of the lower ends once sorted by the upper. */
function crossAt(st: LState, l: number): number {
	const it = st.items;
	const segs: number[][] = [];
	for (const k of st.layers[l]!) for (const d of it[k]!.dn) segs.push([it[k]!.p, it[d]!.p]);
	segs.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
	let c = 0;
	const sort = (a: number[]): number[] => {
		if (a.length < 2) return a;
		const [x, y] = [sort(a.slice(0, a.length >> 1)), sort(a.slice(a.length >> 1))];
		const m: number[] = [];
		let i = 0;
		let j = 0;
		while (i < x.length && j < y.length) x[i]! <= y[j]! ? m.push(x[i++]!) : ((c += x.length - i), m.push(y[j++]!));
		return m.concat(x.slice(i), y.slice(j));
	};
	sort(segs.map((s) => s[1]!));
	return c;
}
export const crossings = (st: LState) => st.layers.reduce((c, _, l) => c + (l + 1 < st.LC ? crossAt(st, l) : 0), 0);

/** One layer sorted by the barycentre or median of its neighbours; groups and lanes by the groups chunk. */
function sortLayer(st: LState, l: number, side: "up" | "dn", median: boolean) {
	const it = st.items;
	const L = st.layers[l]!;
	const key = new Map<number, number>();
	for (const k of L) {
		const x = it[k]!;
		const b = side === "up" ? x.bu : x.bd;
		const ns = (x.s ? (b >= 0 ? [b] : []) : x[side]).map((m) => it[m]!.p).sort((a, c) => a - c);
		key.set(k, !ns.length ? x.p : median ? (ns[(ns.length - 1) >> 1]! + ns[ns.length >> 1]!) / 2 : ns.reduce((s, v) => s + v, 0) / ns.length);
	}
	const kf = (k: number) => key.get(k)!;
	L.sort(st.cx ? st.cx.cmp(st, kf, L) : (a, b) => kf(a) - kf(b) || it[a]!.p - it[b]!.p);
	L.forEach((k, p) => (it[k]!.p = p));
}

/** Whether two items may trade places: same lane, same group, neither a border. */
export const swappable = (st: LState, a: number, b: number) => {
	const [A, B] = [st.items[a]!, st.items[b]!];
	return A.ln === B.ln && !A.s && !B.s && A.c.length === B.c.length && A.c.every((x, i) => x === B.c[i]);
};

/** Swap neighbours in a layer while it removes crossings, counted on both sides: greedy switch. */
function transpose(st: LState) {
	const it = st.items;
	const pair = (u: number, v: number) => {
		let c = 0;
		for (const s of ["up", "dn"] as const) for (const a of it[u]![s]) for (const b of it[v]![s]) if (it[a]!.p > it[b]!.p) c++;
		return c;
	};
	for (let round = 0, better = true; better && round < 12; round++) {
		better = false;
		for (const L of st.layers)
			for (let i = 0; i + 1 < L.length; i++) {
				const [u, v] = [L[i]!, L[i + 1]!];
				if (swappable(st, u, v) && pair(u, v) > pair(v, u)) ((L[i] = v), (L[i + 1] = u), (it[u]!.p = i + 1), (it[v]!.p = i), (better = true));
			}
	}
}

/**
 * Ordering. Two rules (barycentre, median), 24 alternating sweeps each with transposition after every
 * sweep; the fewest crossings wins. On the eleven families a second start (depth first) and sifting each
 * removed no crossing, so neither is here; the median rule removed two.
 */
function sortAll(st: LState) {
	setPos(st);
	for (let l = 0; l < st.LC; l++) sortLayer(st, l, "up", false);
	const start = st.layers.map((L) => [...L]);
	let best = start;
	let bestC = Infinity;
	for (const median of [false, true]) {
		st.layers.forEach((L, l) => L.splice(0, L.length, ...start[l]!));
		setPos(st);
		for (let iter = 0; iter < 24 && bestC; iter++) {
			if (iter % 2) for (let l = st.LC - 2; l >= 0; l--) sortLayer(st, l, "dn", median);
			else for (let l = 1; l < st.LC; l++) sortLayer(st, l, "up", median);
			transpose(st);
			const c = crossings(st);
			if (c < bestC) ((bestC = c), (best = st.layers.map((L) => [...L])));
		}
	}
	st.layers.forEach((L, l) => L.splice(0, L.length, ...best[l]!));
	setPos(st);
	st.cx?.consistent(st);
}


/** Coordinates for the current order. */
export function place(st: LState): Placement {
	const { g, lr, dir, items: it, layers, LC, cx } = st;
	const GN = Math.round(32 * st.sp);
	const GM = Math.round(16 * st.sp);
	setPos(st);
	const sep = (a: It, b: It) => cx?.sep(st, a, b) ?? a.a + b.b + (a.n >= 0 && b.n >= 0 ? GN : a.n >= 0 || b.n >= 0 ? GM : P);
	const seps = layers.map((L) => L.map((k, i) => (i ? sep(it[L[i - 1]!]!, it[k]!) : 0)));
	layers.forEach((L, l) => L.reduce((acc, k, i) => (it[k]!.o = acc + seps[l]![i]!), 0));
	// Weighted means of neighbours, made feasible by pool-adjacent-violators on o minus cumulative gaps.
	const placeLayer = (l: number) => {
		const L = layers[l]!;
		let acc = 0;
		const blocks: number[][] = [];
		L.forEach((k, i) => {
			const S = (acc += seps[l]![i]!);
			const x = it[k]!;
			let sum = 0;
			let w = 0;
			x.up.forEach((m, j) => ((sum += it[m]!.o * x.uw[j]!), (w += x.uw[j]!)));
			x.dn.forEach((m, j) => ((sum += it[m]!.o * x.dw[j]!), (w += x.dw[j]!)));
			for (const m of [x.bu, x.bd]) if (m >= 0) ((sum += it[m]!.o * 4), (w += 4));
			const wt = w || 0.01;
			let b = [((w ? sum / w : x.o) - S) * wt, wt, i];
			while (blocks.length && blocks.at(-1)![0]! / blocks.at(-1)![1]! > b[0]! / b[1]!) {
				const q = blocks.pop()!;
				b = [q[0]! + b[0]!, q[1]! + b[1]!, i];
			}
			blocks.push(b);
		});
		let s0 = 0;
		acc = 0;
		const S = L.map((_, i) => (acc += seps[l]![i]!));
		for (const b of blocks) {
			for (let i = s0; i <= b[2]!; i++) it[L[i]!]!.o = b[0]! / b[1]! + S[i]!;
			s0 = b[2]! + 1;
		}
	};
	for (let sw = 0; sw < 40; sw++) for (let q = 0; q < LC; q++) placeLayer(sw % 2 ? LC - 1 - q : q);
	// Straighten one-to-one chains when every layer leaves room: weighted means left such pairs a few
	// pixels apart, which the grid drew as an 8px jog in front of the arrowhead.
	const fitsAt = (k: number, o: number) => {
		const L = layers[it[k]!.l]!;
		const p = L.indexOf(k);
		const sl = seps[it[k]!.l]!;
		return (!p || o >= it[L[p - 1]!]!.o + sl[p]! - 1e-9) && (p === L.length - 1 || o <= it[L[p + 1]!]!.o - sl[p + 1]! + 1e-9);
	};
	for (const c of st.chains) {
		const [a, b] = [it[c[0]!]!, it[c.at(-1)!]!];
		if (a.dn.length !== 1 || b.up.length !== 1 || a.o === b.o) continue;
		for (const o of [a.o, b.o]) {
			const moving = c.filter((k) => it[k]!.o !== o);
			if (moving.every((k) => fitsAt(k, o))) {
				for (const k of moving) it[k]!.o = o;
				break;
			}
		}
	}
	cx?.square(st, seps);
	// The rank axis. Each gap holds as many tracks as routes may need side by side in it.
	const thick = layers.map((L) => Math.max(0, ...L.map((k) => it[k]!.r)));
	const demand = layers.map((L) => {
		const ev: number[][] = [];
		for (const k of L)
			for (const d of it[k]!.dn) {
				const [a, b] = [it[k]!.o, it[d]!.o];
				if (Math.abs(a - b) >= 1) ev.push([Math.min(a, b), 1], [Math.max(a, b), -1]);
			}
		ev.sort((x, y) => x[0]! - y[0]! || x[1]! - y[1]!);
		let cur = 0;
		return ev.reduce((m, [, d]) => Math.max(m, (cur += d!)), 0);
	});
	const bs: number[] = [];
	let at = cx?.pad(st, -1, 0) ?? 0;
	for (let l = 0; l < LC; l++) {
		bs.push((at += cx?.pad(st, l, 0) ?? 0));
		at += thick[l]! + (cx?.pad(st, l, 1) ?? 0) + (l + 1 < LC ? 2 * CLEAR + demand[l]! * P : 0);
	}
	const len = at;
	const mid = (l: number) => bs[l]! + thick[l]! / 2;
	const toR = (r: number) => (dir === "RL" || dir === "BT" ? len - r : r);
	const box = (ra: number, rb: number, oa: number, ob: number): Box => {
		const [a, b] = [toR(ra), toR(rb)].sort((x, y) => x - y);
		return lr ? { x: a!, y: oa, w: b! - a!, h: ob - oa } : { x: oa, y: a!, w: ob - oa, h: b! - a! };
	};
	const flow: Side[] = dir === "LR" ? ["right", "left"] : dir === "RL" ? ["left", "right"] : dir === "TB" ? ["bottom", "top"] : ["top", "bottom"];
	const keys: Placement["keys"] = g.edges.map(() => ({}));
	const guides: Placement["guides"] = g.edges.map(() => undefined);
	st.chains.forEach((c, ci) => {
		const i = st.chainEdge[ci]!;
		const [second, before] = [it[c[1]!]!.o, it[c.at(-2)!]!.o];
		keys[i] = st.rev[i] ? { from: before, to: second } : { from: second, to: before };
		// The corridor crossing reduction chose: in each band the lane its dummy holds, in each gap the span
		// between the lanes either side. The router pays for straying outside it.
		guides[i] = c.flatMap((q, j) => {
			const x = it[q]!;
			const half = x.n >= 0 ? x.b : P;
			const [a, b] = [toR(bs[x.l]!), toR(bs[x.l]! + thick[x.l]!)].sort((u, v) => u - v);
			const seg = [{ r0: a!, r1: b!, o0: x.o - half, o1: x.o + half }];
			const y = it[c[j + 1]!];
			if (y) {
				const [ga, gb] = [toR(bs[x.l]! + thick[x.l]!), toR(bs[y.l]!)].sort((u, v) => u - v);
				seg.push({ r0: ga!, r1: gb!, o0: Math.min(x.o, y.o) - P, o1: Math.max(x.o, y.o) + P });
			}
			return seg;
		});
	});
	return {
		boxes: g.nodes.map((_, u) => {
			const x = it[u]!;
			const rw = st.rX(u);
			return box(mid(x.l) - rw / 2, mid(x.l) + rw / 2, x.o - st.oe[u]! / 2, x.o + st.oe[u]! / 2);
		}),
		...(cx?.out(st, { mid, bs, thick, box, len }) ?? { groups: [], lanes: [] }),
		sides: g.edges.map((e, i) => (e.from === e.to ? { out: lr ? "top" : "right", in: lr ? "right" : "bottom" } : st.rev[i] ? { out: flow[1], in: flow[0] } : { out: flow[0], in: flow[1] })),
		keys,
		guides,
		rankAxis: lr ? "x" : "y",
	};
}
