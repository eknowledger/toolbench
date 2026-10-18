/**
 * The crossing search, a chunk of its own: fetched only for a layered graph the base layout leaves dense with
 * crossings (see `wantsSearch`), which on the bench is one family in eleven.
 *
 * The score is libavoid's, measured on the drawn routes rather than between layers: a crossing 1000, a bend
 * 35, a pixel of length 1, 4000 for a label that could not be placed, and a route that had to accept a shared
 * stretch is never kept while one without exists. Three moves, each placed and routed for real and kept only
 * if the score drops:
 *   - every order of a layer of two to four nodes among the slots they hold;
 *   - a swap of neighbours of a node on an edge that still crosses;
 *   - ripping up an edge that still crosses and rerouting it against all the others, as it was and then
 *     hating crossings three times as much.
 *
 * ⚠️ The budget is counted in A* states, never in milliseconds: a wall-clock budget would make the result
 * depend on the machine, and the same input must give the same picture everywhere.
 */
import type { Graph } from "@toolbench/sdk";
import type { Pt } from "./model.ts";
import { ext } from "./chunks.ts";
import { place, swappable, type LState, type Placement } from "./layered.ts";
import type { Built, Search } from "./layout.ts";

/** After layer l's nodes are reordered, a neighbouring layer of dummies only follows by barycentre. */
function follow(st: LState, l: number) {
	st.layers.forEach((L) => L.forEach((k, p) => (st.items[k]!.p = p)));
	for (const m of [l - 1, l + 1]) {
		const L = st.layers[m];
		if (!L || L.some((k) => st.items[k]!.n >= 0 || st.items[k]!.s)) continue;
		const key = (k: number) => {
			const ns = [...st.items[k]!.up, ...st.items[k]!.dn];
			return ns.reduce((s, q) => s + st.items[q]!.p, 0) / (ns.length || 1);
		};
		L.sort((a, b) => key(a) - key(b) || a - b);
		L.forEach((k, p) => (st.items[k]!.p = p));
	}
}

/** Proper crossings between two polylines: an interior point of each, meeting at an angle. */
function crossCount(a: Pt[], b: Pt[]): number {
	let c = 0;
	const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	for (let i = 0; i + 1 < a.length; i++)
		for (let j = 0; j + 1 < b.length; j++) {
			const [p, q, r, s] = [a[i]!, a[i + 1]!, b[j]!, b[j + 1]!];
			if (Math.max(p[0], q[0]) < Math.min(r[0], s[0]) || Math.max(r[0], s[0]) < Math.min(p[0], q[0]) || Math.max(p[1], q[1]) < Math.min(r[1], s[1]) || Math.max(r[1], s[1]) < Math.min(p[1], q[1])) continue;
			if (o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0) c++;
		}
	return c;
}

type Score = { total: number; crossings: number; per: number[] };

function score(g: Graph, { rt, extra }: Built): Score {
	const E = g.edges.length;
	const lines = g.edges.map((_, i) => (rt.R[i] ? rt.pts(i) : extra[i]));
	const per = new Array<number>(E).fill(0);
	let crossings = 0;
	let rest = 0;
	for (let i = 0; i < E; i++) {
		const a = lines[i];
		if (!a) {
			rest += 1e7;
			continue;
		}
		if (g.edges[i]!.label && rt.R[i] && !rt.R[i]!.lab) rest += 4000;
		// As much as a missing route: at 4000, the search traded a shared stretch for five crossings.
		if (rt.R[i]?.soft) rest += 1e7;
		rest += 35 * Math.max(0, a.length - 2);
		for (let k = 0; k + 1 < a.length; k++) rest += Math.abs(a[k + 1]![0] - a[k]![0]) + Math.abs(a[k + 1]![1] - a[k]![1]);
		for (let j = i + 1; j < E; j++) {
			const b = lines[j];
			if (!b || rt.key(i) === rt.key(j)) continue;
			const c = crossCount(a, b);
			crossings += c;
			per[i]! += c;
			per[j]! += c;
		}
	}
	return { total: rest + 1000 * crossings, crossings, per };
}

/** Rip up and reroute the edges that still cross, most crossed first, while the score drops. */
function improve(g: Graph, b: Built, more: () => boolean, cur: Score): void {
	const rt = b.rt;
	for (let round = 0, better = true; better && round < 8 && more() && cur.crossings; round++) {
		better = false;
		const hot = cur.per
			.map((c, i) => [c, i] as const)
			.filter(([c, i]) => c && rt.R[i])
			.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
		for (const [, i] of hot)
			for (const hate of [1, 3]) {
				if (!more()) break;
				// Everything is saved, because rerouting a fallback may reroute others too.
				const routes = rt.R.slice();
				const labels = rt.labels.slice();
				rt.replay(i);
				rt.route(i, hate);
				if (rt.R[i]?.soft) ext.repair!.unshare(rt as never);
				const s = score(g, b);
				if (s.total < cur.total - 1e-6) ((cur = s), (better = true));
				else (routes.forEach((r, j) => (rt.R[j] = r)), labels.forEach((l, j) => (rt.labels[j] = l)), rt.replay(-1));
			}
	}
}

const search: Search = (g, st, first, build, budget, work) => {
	const start = work.pops;
	// Six tenths of the budget for reordering, the rest for rerouting.
	let end = start + budget * 0.6;
	const more = () => work.pops < end;
	let cur = first;
	let sc = score(g, cur);
	// The current order of st, placed and routed, kept if it scores lower.
	const attempt = () => {
		const next = build(place(st));
		const s = score(g, next);
		return s.total < sc.total - 1e-6 && ((cur = next), (sc = s), true);
	};
	const snap = () => st.layers.map((x) => [...x]);
	const restore = (o: number[][]) => st.layers.forEach((x, m) => x.splice(0, x.length, ...o[m]!));
	const perms = (a: number[]): number[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
	// Every order of a small layer's nodes among their slots, the dummies either side following.
	for (let q = 0; q < 3 * st.LC && sc.crossings && more(); q++) {
		const l = q % st.LC;
		const L = st.layers[l]!;
		const slots = L.flatMap((k, i) => (st.items[k]!.n >= 0 ? [i] : []));
		if (slots.length < 2 || slots.length > 4 || slots.some((i) => !swappable(st, L[slots[0]!]!, L[i]!))) continue;
		const was = slots.map((i) => L[i]!);
		let best = snap();
		for (const p of perms(was).slice(1)) {
			if (!more()) break;
			const before = snap();
			slots.forEach((i, j) => (L[i] = p[j]!));
			follow(st, l);
			if (attempt()) best = snap();
			restore(before);
		}
		restore(best);
	}
	// Swaps of neighbours of nodes on edges that still cross.
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	for (let round = 0, better = true; better && round < 4 && more() && sc.crossings; round++) {
		better = false;
		const hot = new Set<number>();
		sc.per.forEach((c, i) => c && (hot.add(idx.get(g.edges[i]!.from)!), hot.add(idx.get(g.edges[i]!.to)!)));
		const seen = new Set<string>();
		for (const u of [...hot].sort((a, b) => a - b)) {
			const l = st.items[u]!.l;
			const L = st.layers[l]!;
			for (const d of [-1, 1]) {
				const q = Math.min(L.indexOf(u), L.indexOf(u) + d);
				if (q < 0 || q + 1 >= L.length || seen.has(`${l}:${q}`) || !swappable(st, L[q]!, L[q + 1]!) || !more()) continue;
				seen.add(`${l}:${q}`);
				[L[q], L[q + 1]] = [L[q + 1]!, L[q]!];
				if (attempt()) better = true;
				else [L[q], L[q + 1]] = [L[q + 1]!, L[q]!];
			}
		}
	}
	end = start + budget;
	improve(g, cur, more, sc);
	return cur;
};
ext.search = search;

export type { LState, Placement };
