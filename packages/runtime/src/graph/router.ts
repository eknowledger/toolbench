/**
 * The router. Every edge is a path on a grid of pitch P between two FIXED ports, found by A* with
 * libavoid's penalty model: a crossing costs 1000, a bend 35, a segment running backwards 60, a shared
 * stretch 4000 (and is forbidden outright unless nothing else exists).
 *
 * The grid is what makes "no overlap" structural: a grid edge has one owner, a vertex where a route turns
 * belongs to it, a vertex a route passes straight through can be crossed once, at right angles, and node
 * interiors, rings, labels, titles and every port's own lane are blocked to everyone else.
 *
 * Routes can be ripped up and rerouted against all the others, which is what the search does: F1b routed
 * each edge once, in order, and nothing ever looked at the crossings that left.
 */
import type { Graph } from "@toolbench/sdk";
import { ext } from "./chunks.ts";
import { clip, P, r1 } from "./geometry.ts";
import type { Box, Pt } from "./model.ts";
import { ring, type End } from "./ports.ts";

export const FREE = 0;
export const BLOCK = 1;
export const RING = 2;
export const TAKEN = 3;
export const H = 1;
export const V = 2;
export const D1 = 4;
export const D2 = 8;
export const DX = [1, 0, -1, 0, 1, -1, -1, 1];
export const DY = [0, 1, 0, -1, 1, 1, -1, -1];
export const AXIS = [H, V, H, V, D1, D2, D1, D2];
/** Which grid-edge owner array a move in direction d writes: horizontal, vertical, and the two diagonals. */
export const EA = [0, 1, 0, 1, 2, 3, 2, 3];
export const dirOf = (dx: number, dy: number): number => DX.findIndex((x, i) => x === Math.sign(dx) && DY[i] === Math.sign(dy));

export type RIn = {
	g: Graph;
	boxes: Box[];
	polys: Pt[][];
	ends: End[][];
	titles: Box[];
	borders: Box[];
	guides?: ({ r0: number; r1: number; o0: number; o1: number }[] | undefined)[] | undefined;
	rankAxis?: "x" | "y" | undefined;
	D: number;
	cross: number;
	/**
	 * The lines chunk's pass, run on the empty grid before any lane is reserved: the straight lines or
	 * direct curves it could draw cleanly, rasterised so grid routes cross them but never run beside them.
	 */
	pre?: ((api: never) => { extra: (Pt[] | undefined)[]; labels: (Box | undefined)[] }) | undefined;
	/** Edges the lines chunk must not draw straight, so the grid routes them: see its `unwall`. */
	skip?: Set<number> | undefined;
	/** Per edge, a shared key when it leaves a record row another edge leaves too: they share a trunk. */
	share?: number[];
	/** Search work done so far, in A* states taken from the queue: the deterministic unit of budget. */
	work: { pops: number; soft: number };
	weight?: number;
};
export type Route = { v: number[]; lab?: Box | undefined; soft?: boolean };

export function router(I: RIn) {
	const { g, boxes, D } = I;
	const E = g.edges.length;
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const ue = g.edges.map((e) => [idx.get(e.from)!, idx.get(e.to)!]);
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const b of [...boxes, ...I.borders, ...I.titles]) ((x0 = Math.min(x0, b.x)), (y0 = Math.min(y0, b.y)), (x1 = Math.max(x1, b.x + b.w)), (y1 = Math.max(y1, b.y + b.h)));
	const gx = Math.floor(x0 / P) * P - 6 * P;
	const gy = Math.floor(y0 / P) * P - 6 * P;
	const nx = Math.ceil((x1 - gx) / P) + 7;
	const ny = Math.ceil((y1 - gy) / P) + 7;
	const nv = nx * ny;
	const X = (v: number) => gx + (v % nx) * P;
	const Y = (v: number) => gy + Math.floor(v / nx) * P;
	const at = (x: number, y: number) => Math.round((y - gy) / P) * nx + Math.round((x - gx) / P);
	const st = new Uint8Array(nv);
	const near = new Uint8Array(nv);
	const rl = new Int32Array(nv);
	const ow = new Int32Array(nv);
	const mk = new Uint8Array(nv);
	const lm = new Uint8Array(nv);
	// Which straight line marked each point, plus one: how the lines chunk finds the line a route ran beside.
	const lo = new Int32Array(nv);
	// The approach to each lane: whose it is, and along which axis. Apart from the occupancy marks, which
	// a crossing route turns into "mixed": kept there, a lane's owner was then barred from its own approach.
	const am = new Int32Array(nv);
	const aa = new Uint8Array(nv);
	const DEEP = 64;
	const eo = [new Int32Array(nv), new Int32Array(nv), new Int32Array(D > 4 ? nv : 0), new Int32Array(D > 4 ? nv : 0)];
	const inside = (b: Box, pad: number, fn: (v: number) => void) => {
		const i0 = Math.max(0, Math.floor((b.x - pad - gx) / P) + 1);
		const i1 = Math.min(nx - 1, Math.ceil((b.x + b.w + pad - gx) / P) - 1);
		const j0 = Math.max(0, Math.floor((b.y - pad - gy) / P) + 1);
		const j1 = Math.min(ny - 1, Math.ceil((b.y + b.h + pad - gy) / P) - 1);
		for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * nx + i);
	};
	for (const b of boxes) {
		inside(b, 0, (v) => (st[v] = BLOCK));
		inside(b, P - 0.5, (v) => st[v] === FREE && (st[v] = RING));
	}
	for (const t of I.titles) inside(t, 2, (v) => (st[v] = BLOCK));
	for (const b of I.borders)
		for (const [x, y, w, h] of [[b.x, b.y, 0, b.h], [b.x + b.w, b.y, 0, b.h], [b.x, b.y, b.w, 0], [b.x, b.y + b.h, b.w, 0]] as number[][])
			inside({ x: x! - 1, y: y! - 1, w: w! + 2, h: h! + 2 }, 3, (v) => (near[v] = 1));

	const key = (i: number) => I.share?.[i] || (g.merge === "source" ? ue[i]![0]! + 1 : g.merge === "target" ? ue[i]![1]! + 1 : 1e6 + i);
	const R: (Route | undefined)[] = new Array(E).fill(undefined);
	const labels: (Box | undefined)[] = new Array(E).fill(undefined);
	const step = (v: number, d: number) => {
		const i = (v % nx) + DX[d]!;
		const j = Math.floor(v / nx) + DY[d]!;
		return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
	};
	const api = { g, boxes, polys: I.polys, ends: I.ends, titles: I.titles, st, ow, mk, lm, lo, am, eo, nx, ny, nv, step, X, Y, at, gx, gy, inside, R, key, labels, skip: I.skip ?? new Set<number>() };
	const pre = I.pre?.(api as never);
	pre?.labels.forEach((b, i) => (labels[i] = b));
	// Each end's lane: its ring vertex and the straight run out from it, long enough for the marker.
	const lanes = g.edges.map((e, i) =>
		[0, 1].map((k) => {
			const u = ue[i]![k]!;
			const end = I.ends[i]![k]!;
			const [rx, ry, ix, iy] = ring(boxes[u]!, end.side, end.off);
			const m = k ? (e.head ?? ((g.directed ?? true) ? "arrow" : "none")) : (e.tail ?? "none");
			const need = Math.max(m === "none" ? 0 : m === "arrow" || m === "open" ? 12 : 25, ue[i]![0] === ue[i]![1] ? 3 * P : 0);
			const steps = Math.max(1, Math.ceil((need - P / 2) / P));
			const out = [at(rx!, ry!)];
			for (let s = 1; s <= steps; s++) out.push(at(rx! - ix! * P * s, ry! - iy! * P * s));
			return { v: out, d: dirOf(-ix!, -iy!), din: dirOf(ix!, iy!) };
		}),
	);
	const routed = (i: number) => !pre?.extra[i];
	for (let i = 0; i < E; i++)
		if (routed(i))
			for (const ln of lanes[i]!)
				// A lane is its edge's own: a straight line drawn earlier near it no longer bars it.
				for (const v of ln.v) {
					lm[v] = 0;
					if (st[v] === FREE && v !== ln.v[0]) ((st[v] = BLOCK), (rl[v] = key(i)));
				}
	/*
	 * ⚠️ And the points just past each lane: another route may cross them, but not turn there or run along
	 * them. Left free, one route turned in front of another's port and the second could not reach its own lane
	 * at all; its fallback then shared a corner with the first. Two points deep: with one, a route turning on
	 * the second point boxed another out of its port. The second point bars only turning and running along;
	 * crossing it costs a third of a crossing, because the owner usually turns in at the first. Priced as a
	 * full crossing, it sent two routes into 8px loops to avoid it.
	 *
	 * After every lane, not edge by edge, and stopping at the first point that is not free: reserved in edge
	 * order, an early approach ran on into a later lane, and on seeded networks of 120 nodes and more the two
	 * owners then walled each other out of their ports.
	 */
	for (let i = 0; i < E; i++)
		if (routed(i))
			for (const ln of lanes[i]!)
				for (let a = step(ln.v[ln.v.length - 1]!, ln.d), m = 0; m < 2 && a >= 0 && st[a] === FREE && !am[a]; m++, a = step(a, ln.d)) ((am[a] = key(i)), (aa[a] = AXIS[ln.d]! | (m ? DEEP : 0)));
	const st0 = st.slice();
	const mk0 = mk.slice();
	const ow0 = ow.slice();

	// The grid edge leaving v in direction d: which owner array, and the index in it. No tuples: this runs
	// for every neighbour of every state.
	const eIdx = (v: number, d: number) => (d === 2 ? v - 1 : d === 3 ? v - nx : d === 6 ? v - nx - 1 : d === 7 ? v - nx + 1 : v);
	const ang = [0, 2, 4, 6, 1, 3, 5, 7];
	const turnOf = (a: number, b: number) => {
		const d = Math.abs(ang[a]! - ang[b]!) % 8;
		return Math.min(d, 8 - d);
	};

	// A* over (vertex, arriving direction), storage reused across searches by a stamp.
	const S = nv * D;
	const gs = new Float64Array(S);
	const from = new Int32Array(S);
	const stamp = new Int32Array(S);
	let run = 0;
	// A binary heap in typed arrays: states and their f, grown by doubling.
	let hs = new Int32Array(1024);
	let hf = new Float64Array(1024);
	let hn = 0;
	const push = (s: number, fv: number) => {
		if (hn === hs.length) {
			const a = new Int32Array(hn * 2);
			const b = new Float64Array(hn * 2);
			a.set(hs);
			b.set(hf);
			hs = a;
			hf = b;
		}
		let i = hn++;
		while (i) {
			const p = (i - 1) >> 1;
			if (hf[p]! < fv || (hf[p] === fv && hs[p]! < s)) break;
			hs[i] = hs[p]!;
			hf[i] = hf[p]!;
			i = p;
		}
		hs[i] = s;
		hf[i] = fv;
	};
	const pop = () => {
		const top = hs[0]!;
		const ls = hs[--hn]!;
		const lf = hf[hn]!;
		let i = 0;
		for (;;) {
			const l = 2 * i + 1;
			if (l >= hn) break;
			const m = l + 1 < hn && (hf[l + 1]! < hf[l]! || (hf[l + 1] === hf[l] && hs[l + 1]! < hs[l]!)) ? l + 1 : l;
			if (hf[m]! > lf || (hf[m] === lf && hs[m]! >= ls)) break;
			hs[i] = hs[m]!;
			hf[i] = hf[m]!;
			i = m;
		}
		hs[i] = ls;
		hf[i] = lf;
		return top;
	};
	const rx = I.rankAxis !== "y";
	const hook = ext.lines?.grid as undefined | ((r: unknown) => { diag: (v: number, w: number, d: number, k: number) => number; turn: (v: number, k: number) => boolean; claim: (a: number, b: number, d: number, k: number) => void });
	const hk = D > 4 ? hook?.(api) : undefined;

	/** A* from one lane end to the other, under the strict rules or, when `soft`, at a price for breaking them. */
	function search(i: number, soft: 0 | 1 | 2, hate = 1): number[] | undefined {
		const [a, b] = lanes[i]!;
		const k = key(i);
		const sv = a!.v[a!.v.length - 1]!;
		const tv = b!.v[b!.v.length - 1]!;
		const guide = I.guides?.[i];
		const odx = Math.sign(X(tv) - X(sv));
		// ⚠️ A crossing is worth at most twice the edge's own length in detour. At a flat 1000, a 150px back
		// edge in the flowchart went 700px round the whole graph rather than cross one line.
		const cross = hate * Math.min(I.cross, 2 * (Math.abs(X(tv) - X(sv)) + Math.abs(Y(tv) - Y(sv))) + 200);
		const ody = Math.sign(Y(tv) - Y(sv));
		const ti = tv % nx;
		const tj = Math.floor(tv / nx);
		const h = (v: number) => {
			const di = Math.abs((v % nx) - ti);
			const dj = Math.abs(Math.floor(v / nx) - tj);
			return D > 4 ? (Math.max(di, dj) + 0.41421356 * Math.min(di, dj)) * P : (di + dj) * P;
		};
		const pass = (w: number) => st[w] !== BLOCK || rl[w] === k;
		// The heuristic, weighted a hair over one so that among equal costs the search runs towards the goal
		// instead of fanning out across a plateau; more on graphs past 120 nodes, where speed matters more.
		// A soft search is a last resort whose 4000-point penalties the heuristic cannot see: unweighted it
		// fanned out over two million states per route at 250 nodes. Weighted 3 it heads for the goal.
		const W = soft ? 3 : (I.weight ?? 1.001);
		// ⚠️ Even weighted, a 4000-point violation is worth 500 grid steps, so the search still filled every
		// state that much cheaper first: 1.5 million per route at 250 nodes, repeated on every unshare. So soft
		// is tried with a small budget, then once more with violations at 300, which reaches in a few thousand.
		const SP = soft === 2 ? 300 : 4000;
		const goal = tv * D + b!.din;
		run++;
		hn = 0;
		// The corridor as two arrays along the rank axis, so straying costs one lookup per step.
		const glo = new Float64Array(rx ? nx : ny).fill(NaN);
		const ghi = new Float64Array(rx ? nx : ny);
		if (guide)
			for (let c = 0; c < glo.length; c++) {
				const r = (rx ? gx : gy) + c * P;
				const q = guide.find((q) => r >= q.r0 && r <= q.r1);
				if (q) ((glo[c] = q.o0), (ghi[c] = q.o1));
			}
		const s0 = sv * D + a!.d;
		stamp[s0] = run;
		gs[s0] = 0;
		from[s0] = -1;
		push(s0, W * h(sv));
		let found = -1;
		// ⚠️ A strict search that cannot reach its goal explores the whole grid before saying so: 13 million
		// states for a 250-node graph. Past 150,000 it gives up and the soft search, which always reaches,
		// takes over; unshare then reroutes whatever the soft route ran into.
		let budget = soft === 2 ? 2e6 : soft ? 5e4 : 6e4;
		while (hn && budget--) {
			const f0 = hf[0]!;
			const s = pop();
			I.work.pops++;
			const gv = gs[s]!;
			const v = Math.floor(s / D);
			if (f0 > gv + W * h(v) + 1e-9) continue;
			if (s === goal) {
				found = s;
				break;
			}
			const d = s % D;
			for (let d2 = 0; d2 < D; d2++) {
				const tn = turnOf(d, d2);
				if (tn > 2 || (D === 4 && tn === 1)) continue;
				let c = tn ? 35 : 0;
				if (tn) {
					// Turning here: the vertex must be ours alone.
					if ((mk[v] && ow[v] !== k) || lm[v] || (am[v] && am[v] !== k) || (hk && !hk.turn(v, k))) {
						if (!soft) continue;
						c += SP;
					}
					// A new segment running against the overall direction costs 60, as in libavoid.
					if ((DX[d2]! && DX[d2] === -odx) || (DY[d2]! && DY[d2] === -ody)) c += 60;
				} else {
					const fa = am[v] && am[v] !== k ? aa[v]! : 0;
					const fm = (ow[v] !== k ? mk[v]! : 0) | (fa & ~DEEP);
					if (fm) {
						if (fm & AXIS[d2]! || fm & (fm - 1)) {
							if (!soft) continue;
							c += SP;
						} else c += fa & DEEP && fm === (fa & ~DEEP) ? cross / 3 : cross;
					}
					// A straight line is marked across about three grid points: each costs a third of a crossing.
					if (lm[v]) {
						// Running along a straight line costs the full 4000 even in the last search: a straight line
						// cannot be rerouted out of the way, so a route left beside one stays there.
						if (lm[v]! & AXIS[d2]!) {
							if (!soft) continue;
							c += 4000;
						} else c += cross / 3;
					}
				}
				const w = step(v, d2);
				if (w < 0 || (st[w] === RING && w !== tv)) continue;
				// ⚠️ Soft may run through another edge's lane too. Where a force layout puts two nodes closer
				// than two lanes deep, a lane can wall off a port entirely, and a soft search that may not cross it
				// explored the whole grid, a million states, before failing anyway.
				if (!pass(w)) {
					if (!soft) continue;
					c += SP;
				}
				if (st[w] === TAKEN && ow[w] !== k) {
					if (!soft) continue;
					c += SP;
				}
				const arr = eo[EA[d2]!]!;
				const ei = eIdx(v, d2);
				let mv = d2 < 4 ? P : P * 1.41421356;
				if (arr[ei]) {
					if (arr[ei] === k) mv *= 0.25;
					else if (!soft) continue;
					else c += SP;
				}
				if (d2 >= 4) {
					// The hook says forbidden (-1), a crossing of the other diagonal (1), or clear (0).
					const x = hk!.diag(v, w, d2, k);
					if (x < 0) {
						if (!soft) continue;
						c += SP;
					} else c += x * cross;
				}
				if (near[w]) c += 6;
				if (guide) {
					const cc = rx ? w % nx : Math.floor(w / nx);
					const o = rx ? Y(w) : X(w);
					const lo = glo[cc]!;
					if (lo === lo) c += o < lo ? (lo - o) * 0.3 : o > ghi[cc]! ? (o - ghi[cc]!) * 0.3 : 0;
				}
				const ns = w * D + d2;
				const ng = gv + c + mv;
				if (stamp[ns] === run && gs[ns]! <= ng) continue;
				stamp[ns] = run;
				gs[ns] = ng;
				from[ns] = s;
				push(ns, ng + W * h(w));
			}
		}
		if (found < 0) {
			return undefined;
		}
		const path: number[] = [];
		for (let s = found; s >= 0; s = from[s]!) path.push(Math.floor(s / D));
		path.reverse();
		return [...a!.v.slice(0, -1), ...path, ...[...b!.v].reverse().slice(1)];
	}

	function occupy(vs: number[], k: number) {
		for (let j = 0; j + 1 < vs.length; j++) {
			const d = dirOf(X(vs[j + 1]!) - X(vs[j]!), Y(vs[j + 1]!) - Y(vs[j]!));
			const arr = eo[EA[d]!]!;
			const ei = eIdx(vs[j]!, d);
			if (!arr[ei]) arr[ei] = k;
			if (d >= 4) hk?.claim(vs[j]!, vs[j + 1]!, d, k);
		}
		for (let j = 1; j + 1 < vs.length; j++) {
			const v = vs[j]!;
			if (st[v] === RING) continue;
			const d1 = dirOf(X(v) - X(vs[j - 1]!), Y(v) - Y(vs[j - 1]!));
			const d2 = dirOf(X(vs[j + 1]!) - X(v), Y(vs[j + 1]!) - Y(v));
			if (d1 !== d2) {
				if (st[v] === FREE) st[v] = TAKEN;
				ow[v] = k;
				mk[v] = 15;
			} else {
				mk[v]! |= AXIS[d1]!;
				ow[v] = !ow[v] || ow[v] === k ? k : -2;
			}
		}
	}

	const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
	/** A label on its route: the reserved box first, then on the line anywhere along it, then beside it. */
	function label(i: number): Box | undefined {
		const text = g.edges[i]!.label;
		const r = R[i];
		if (!text || !r) return undefined;
		const w = Math.ceil(text.length * 11 * 0.605) + 8;
		const h = 15;
		const own = new Set(r.v);
		const pts = r.v.map((v) => [X(v), Y(v)]);
		const total = pts.length;
		const want = { start: 0.2, end: 0.8 }[g.edges[i]!.labelAt as "start"] ?? 0.5;
		const cand = pts.map((p, j) => ({ p, j, horiz: j + 1 < total && pts[j + 1]![1] === p[1] })).sort((a, b) => Math.abs(a.j / total - want) - Math.abs(b.j / total - want) || a.j - b.j);
		const tries: Box[] = [];
		const loop = ue[i]![0] === ue[i]![1];
		const on = cand.map(({ p }) => ({ x: p[0]! - w / 2, y: p[1]! - h / 2, w, h }));
		const off = cand.flatMap(({ p, horiz }) => (horiz ? [{ x: p[0]! - w / 2, y: p[1]! - h - 4, w, h }, { x: p[0]! - w / 2, y: p[1]! + 4, w, h }] : [{ x: p[0]! + 5, y: p[1]! - h / 2, w, h }, { x: p[0]! - w - 5, y: p[1]! - h / 2, w, h }]));
		tries.push(...(loop ? [...off, ...on] : [...on, ...off]));
		for (const b of tries) {
			let ok = true;
			const mine: number[] = [];
			inside(b, 2, (v) => {
				if (own.has(v)) mine.push(v);
				else if (st[v] !== FREE || mk[v] || lm[v] || eo[0]![v] || eo[1]![v] || (am[v] && am[v] !== key(i))) ok = false;
			});
			if (!ok) continue;
			if (mine.length) {
				// On the line: the route must run straight through the box, along an axis or a diagonal, so a
				// label never hides a bend.
				const js = mine.map((v) => r.v.indexOf(v)).sort((a, c) => a - c);
				const seg = r.v.slice(Math.max(0, js[0]! - 1), js[js.length - 1]! + 2);
				const [p0, p1] = [seg[0]!, seg[1]!];
				const ux = X(p1) - X(p0);
				const uy = Y(p1) - Y(p0);
				if (seg.some((q) => (X(q) - X(p0)) * uy !== (Y(q) - Y(p0)) * ux)) continue;
			}
			if (labels.some((l, j) => l && j !== i && hit(l, b)) || boxes.some((n) => hit(n, b)) || I.titles.some((t) => hit(t, b))) continue;
			blockLabel(b, own, key(i));
			return b;
		}
		return undefined;
	}
	function blockLabel(b: Box, own: Set<number>, k: number) {
		inside(b, 2, (v) => {
			if (own.has(v)) ((st[v] = TAKEN), (ow[v] = k), (mk[v] = 15));
			else st[v] = BLOCK;
		});
	}

	/** Grid state with every route but `skip` in place: what rerouting one edge needs. */
	function replay(skip: number) {
		st.set(st0);
		ow.set(ow0);
		mk.set(mk0);
		for (const a of eo) a.fill(0);
		R.forEach((r, j) => {
			if (!r || j === skip) return;
			occupy(r.v, key(j));
			if (r.lab) blockLabel(r.lab, new Set(r.v), key(j));
		});
	}

	function route(i: number, hate = 1) {
		let v = search(i, 0, hate);
		let soft = false;
		if (!v) ((v = search(i, 1) ?? search(i, 2)), (soft = true), I.work.soft++);
		if (!v) {
			R[i] = undefined;
			labels[i] = undefined;
			return;
		}
		R[i] = { v, soft };
		occupy(v, key(i));
		const lab = label(i);
		R[i]!.lab = lab;
		labels[i] = lab;
	}

	/** The drawn polyline: grid vertices, the two ends moved from the ring onto the outline. */
	function pts(i: number): Pt[] {
		const r = R[i]!;
		const p: Pt[] = r.v.map((v) => [X(v), Y(v)]);
		const end = (k: number, n: number, poly: Pt[]) => {
			const a = p[k]!;
			const b = p[n]!;
			p[k] = clip(poly, a, [a[0] + (a[0] - b[0]) * 40, a[1] + (a[1] - b[1]) * 40]) ?? a;
		};
		end(0, 1, I.polys[ue[i]![0]!]!);
		end(p.length - 1, p.length - 2, I.polys[ue[i]![1]!]!);
		const out: Pt[] = [p[0]!];
		for (let j = 1; j < p.length; j++) {
			const q = p[j]!;
			const o = out[out.length - 1]!;
			if (q[0] === o[0] && q[1] === o[1]) continue;
			const o2 = out[out.length - 2];
			if (o2 && (o[0] - o2[0]) * (q[1] - o[1]) === (o[1] - o2[1]) * (q[0] - o[0]) && (o[0] - o2[0]) * (q[0] - o[0]) + (o[1] - o2[1]) * (q[1] - o[1]) > 0) out[out.length - 1] = q;
			else out.push(q);
		}
		return out.map(([x, y]) => [r1(x), r1(y)]);
	}

	return { R, labels, route, replay, pts, key, api, ue, lanes, eIdx, extra: pre?.extra ?? [] };
}

export type Router = ReturnType<typeof router>;

export type Api = Router["api"];
