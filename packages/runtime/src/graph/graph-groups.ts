/**
 * The groups chunk: nested groups, swimlanes, and collapsing a group. Everything the layered layout does
 * only when a graph has groups or lanes, so a graph without them never downloads it.
 *
 * Groups at every depth stay contiguous in every layer: each layer sorts by lane, then by each enclosing
 * group's mean, then by item, and a zero-width border item marks each side of a group in every layer it
 * spans. Sibling groups keep one order in every layer. After placement each group is made an exact
 * rectangle and each lane a straight band.
 */
import type { Graph, GraphEdge, GraphNode } from "@toolbench/sdk";
import { svg } from "../dom.ts";
import { ext } from "./chunks.ts";
import type { DrawGroups } from "./draw.ts";
import { P, textW } from "./geometry.ts";
import type { Compound, It, LState } from "./layered.ts";

const GP = 16;
const TH = 18;
const LP = 16;

type X = { chainOf: (gi: number) => number[]; parent: number[] };
const xs = (st: LState) => st.extra as unknown as X;

/** How far group k reaches past its first (end 0) or last (end 1) layer: a padding per group nested there. */
function ring(st: LState, k: number, end: number): number {
	const { parent } = xs(st);
	const nest = (q: number): number => 1 + Math.max(0, ...parent.map((p, c) => (p === q && st.span[c]![end] === st.span[q]![end] ? nest(c) : 0)));
	return nest(k) * (GP + (end || st.lr ? 0 : TH));
}

const compound: Compound = {
	init: (st) => {
		const g = st.g;
		const gs = g.groups ?? [];
		const gi = new Map(gs.map((x, i) => [x.id, i]));
		const li = new Map((g.lanes ?? []).map((x, i) => [x.id, i]));
		const parent = gs.map((x) => (x.parent ? gi.get(x.parent)! : -1));
		const chainOf = (k: number): number[] => (k < 0 ? [] : [...chainOf(parent[k]!), k]);
		Object.assign(st.extra, { chainOf, parent });
		g.nodes.forEach((x, u) => ((st.nc[u] = x.group ? chainOf(gi.get(x.group)!) : []), (st.nl[u] = x.lane ? li.get(x.lane)! : 0)));
	},
	borders: (st, mk) => {
		const { chainOf } = xs(st);
		const gs = st.g.groups ?? [];
		st.span = gs.map(() => [Infinity, -Infinity]);
		st.nc.forEach((c, u) => c.forEach((k) => (st.span[k] = [Math.min(st.span[k]![0]!, st.items[u]!.l), Math.max(st.span[k]![1]!, st.items[u]!.l)])));
		st.borders = gs.map((_, k) => {
			const pair: number[][] = [[], []];
			const [lo, hi] = st.span[k]!;
			if (lo === Infinity) return pair;
			const ln = st.nl[st.nc.findIndex((c) => c.includes(k))]!;
			for (const side of [0, 1])
				for (let l = lo!; l <= hi!; l++) {
					const it = mk(l, -1, chainOf(k), ln);
					it.s = side ? 1 : -1;
					const q = st.items.length;
					const prev = pair[side]!.at(-1);
					if (prev !== undefined) ((st.items[prev]!.bd = q), (it.bu = prev));
					pair[side]!.push(q);
					st.items.push(it);
				}
			return pair;
		});
	},
	cmp: (st, key, L) => {
		const it = st.items;
		const gsum = new Map<number, number[]>();
		for (const k of L)
				for (const g of it[k]!.c) {
					const v = gsum.get(g) ?? [0, 0];
					gsum.set(g, [v[0]! + key(k), v[1]! + 1]);
				}
		const gk = (g: number) => gsum.get(g)![0]! / gsum.get(g)![1]!;
		return (a, b) => {
			const [A, B] = [it[a]!, it[b]!];
			if (A.ln !== B.ln) return A.ln - B.ln;
			for (let d = 0; ; d++) {
				const [ga, gb] = [A.c[d], B.c[d]];
				if (ga !== undefined && gb !== undefined) {
					if (ga === gb) continue;
					return gk(ga) - gk(gb) || ga - gb;
				}
				const la = ga === undefined ? (A.s && A.c.length === d ? A.s * Infinity : key(a)) : gk(ga);
				const lb = gb === undefined ? (B.s && B.c.length === d ? B.s * Infinity : key(b)) : gk(gb);
				if (la !== lb) return la < lb ? -1 : 1;
				if (ga === undefined && gb !== undefined) return -1;
				if (gb === undefined && ga !== undefined) return 1;
				return A.p - B.p;
			}
		};
	},
	// One order for sibling groups in every layer, or two sibling rectangles cannot both be drawn.
	consistent: (st) => {
		const it = st.items;
		const key = st.borders.map(([L]) => (L!.length ? L!.reduce((s, k) => s + it[k]!.p / st.layers[it[k]!.l]!.length, 0) / L!.length : 0));
		type E = number | { g: number; k: E[] };
		const parse = (seq: number[], d: number): E[] => {
			const res: E[] = [];
			for (let i = 0; i < seq.length; ) {
				const x = it[seq[i]!]!;
				const g = x.c[d];
				if (g === undefined || (x.s && x.c.length === d)) {
					res.push(seq[i++]!);
					continue;
				}
				let j = i;
				while (j < seq.length && it[seq[j]!]!.c[d] === g && it[seq[j]!]!.ln === x.ln) j++;
				res.push({ g, k: parse(seq.slice(i, j), d + 1) });
				i = j;
			}
			return res;
		};
		const reorder = (es: E[]): E[] => {
			const slots = es.flatMap((e, i) => (typeof e === "number" ? [] : [i]));
			const blocks = slots.map((i) => es[i] as { g: number; k: E[] }).sort((a, b) => key[a.g]! - key[b.g]! || a.g - b.g);
			const res = [...es];
			slots.forEach((s, j) => (res[s] = { g: blocks[j]!.g, k: reorder(blocks[j]!.k) }));
			return res;
		};
		const flat = (es: E[]): number[] => es.flatMap((e) => (typeof e === "number" ? [e] : flat(e.k)));
		st.layers.forEach((L, l) => {
			const res: number[] = [];
			for (let i = 0; i < L.length; ) {
				let j = i;
				while (j < L.length && it[L[j]!]!.ln === it[L[i]!]!.ln) j++;
				res.push(...flat(reorder(parse(L.slice(i, j), 0))));
				i = j;
			}
			st.layers[l] = res;
			res.forEach((k, p) => (it[k]!.p = p));
		});
	},
	sep: (st, a: It, b: It) => {
		const GM = Math.round(16 * st.sp);
		if (a.ln !== b.ln) return a.a + b.b + 2 * LP;
		if (a.s === -1) return b.b + GP + (st.lr ? TH : 0) + (b.s === 1 ? GP : 0);
		if (b.s === 1) return a.a + GP;
		if (a.s === 1 && b.s === -1) return GM;
		if (a.s === 1 || b.s === -1) return a.a + b.b + GM;
		return undefined;
	},
	// Groups become exact rectangles, each border to its furthest position and everything after pushed on;
	// then whole lanes shift, never single layers, so every lane is one straight band.
	square: (st, seps) => {
		const it = st.items;
		for (let round = 0, ch = true; ch && round < 400; round++) {
			ch = false;
			for (const pair of st.borders)
				for (const ks of pair) {
					const m = Math.max(...ks.map((k) => it[k]!.o));
					for (const k of ks) if (it[k]!.o < m - 1e-9) ((it[k]!.o = m), (ch = true));
				}
			st.layers.forEach((L, l) => {
				for (let i = 1; i < L.length; i++) {
					const m = it[L[i - 1]!]!.o + seps[l]![i]!;
					if (it[L[i]!]!.o < m - 1e-9) ((it[L[i]!]!.o = m), (ch = true));
				}
			});
		}
		const band: number[][] = [];
		for (let k = 0; k < Math.max(1, st.g.lanes?.length ?? 0); k++) {
			const mine = it.filter((x) => x.ln === k);
			let top = mine.length ? Math.min(...mine.map((x) => x.o - x.b)) - LP : (band[k - 1]?.[1] ?? 0);
			let bot = mine.length ? Math.max(...mine.map((x) => x.o + x.a)) + LP : top + 6 * P;
			if (k && mine.length) {
				const shift = band[k - 1]![1]! - top;
				for (const x of it) if (x.ln >= k) x.o += shift;
				top += shift;
				bot += shift;
			}
			band.push([top, bot]);
		}
		st.extra.band = band;
	},
	// Room before (end 0) or after (end 1) layer l for the groups starting or ending there, nested ones
	// each a padding further out; l = -1 is the lane title column at the start.
	pad: (st, l, end) => {
		const lanes = st.g.lanes ?? [];
		if (l < 0) return lanes.length ? (st.lr ? Math.max(...lanes.map((x) => textW(x.label, 11))) + 3 * P : TH + P) + P : 0;
		return Math.max(0, ...st.span.map((s, k) => (s[end] === l ? ring(st, k, end) : 0)));
	},
	out: (st, f) => {
		const it = st.items;
		const { chainOf } = xs(st);
		const band = st.extra.band as number[][];
		const groups = (st.g.groups ?? []).flatMap((gr, k) => {
			const [lo, hi] = st.span[k]!;
			if (lo === Infinity) return [];
			const o0 = Math.min(...st.borders[k]![0]!.map((q) => it[q]!.o));
			const o1 = Math.max(...st.borders[k]![1]!.map((q) => it[q]!.o));
			const b = f.box(f.bs[lo!]! - ring(st, k, 0), f.bs[hi!]! + f.thick[hi!]! + ring(st, k, 1), o0, o1);
			return [{ id: gr.id, box: b, title: { x: b.x + 6, y: b.y + 2, w: textW(gr.label, 11) + 16, h: TH - 4 }, depth: chainOf(k).length }];
		});
		const lanes = (st.g.lanes ?? []).map((ln, i) => {
			const b = f.box(0, f.len, band[i]![0]!, band[i]![1]!);
			const tw = textW(ln.label, 11) + 16;
			return { id: ln.id, label: ln.label, box: b, title: st.lr ? { x: b.x + 8, y: b.y + b.h / 2 - 8, w: tw, h: 16 } : { x: b.x + b.w / 2 - tw / 2, y: b.y + 6, w: tw, h: 16 } };
		});
		return { groups, lanes };
	},
};
ext.compound = compound;
ext.css.groups = `.tb-graph-lane{fill:var(--tb-bg);stroke:var(--tb-border)}.tb-graph-lane:nth-of-type(even){fill:var(--tb-surface)}.tb-graph-group-title{cursor:pointer}
.tb-graph-group{fill:color-mix(in oklab,var(--c,var(--tb-fg)) 4%,transparent);stroke:color-mix(in oklab,var(--c,var(--tb-faint)) 70%,var(--tb-border));stroke-dasharray:5 3}`;

/**
 * Collapsing: a collapsed group becomes one node standing for everything inside it; edges to members go
 * to it, edges among members disappear. A transform of the graph, so layout stays one pure function.
 */
ext.collapse = (g, set) => {
	const gs = g.groups ?? [];
	const by = new Map(gs.map((x) => [x.id, x]));
	const top = (id: string | undefined) => {
		let hit: string | undefined;
		for (let p = id; p !== undefined; p = by.get(p)?.parent) if (set.has(p)) hit = p;
		return hit;
	};
	const to = new Map<string, string>();
	const count = new Map<string, number>();
	for (const n of g.nodes) {
		const c = top(n.group);
		if (c) (to.set(n.id, c), count.set(c, (count.get(c) ?? 0) + 1));
	}
	const nodes = g.nodes.filter((n) => !to.has(n.id));
	const hidden = (id: string) => top(by.get(id)?.parent) !== undefined;
	for (const gr of gs)
		if (set.has(gr.id) && !hidden(gr.id) && count.has(gr.id)) {
			const at = g.nodes.findIndex((n) => to.get(n.id) === gr.id);
			// The stand-in carries the group's id, which is how the drawing knows to open it on a click.
			const node: GraphNode = { id: gr.id, label: gr.label, note: `${count.get(gr.id)} inside`, shape: "rect", badge: "+" };
			if (gr.parent !== undefined) node.group = gr.parent;
			if (gr.role !== undefined) node.role = gr.role;
			if (gr.color !== undefined) node.color = gr.color;
			nodes.splice(Math.min(at, nodes.length), 0, node);
		}
	const seen = new Map<string, number>();
	const edges: Graph["edges"] = [];
	for (const e of g.edges) {
		const from = to.get(e.from) ?? e.from;
		const tt = to.get(e.to) ?? e.to;
		const moved = to.has(e.from) || to.has(e.to);
		if (from === tt && moved) continue;
		// Two edges merged into one by a collapse lose their labels: one label would claim both.
		if (moved && seen.has(`${from}>${tt}`)) {
			delete edges[seen.get(`${from}>${tt}`)!]!.label;
			continue;
		}
		if (moved) seen.set(`${from}>${tt}`, edges.length);
		const edge: GraphEdge = { ...e, from, to: tt };
		if (to.has(e.from)) delete edge.fromPort;
		if (to.has(e.to)) delete edge.toPort;
		edges.push(edge);
	}
	return { ...g, nodes, edges, groups: gs.filter((x) => !set.has(x.id) && !hidden(x.id)) };
};

/** Lanes under everything, then groups outermost first, each with its title; a title closes its group. */
const drawGroups: DrawGroups = (pic, g, L, title, names, close) => {
	for (const ln of L.lanes) pic.append(svg("rect", { class: "tb-graph-lane", "data-id": ln.id, x: ln.x, y: ln.y, width: ln.w, height: ln.h, ...names("lane", g.lanes?.find((x) => x.id === ln.id)?.role) }));
	for (const ln of L.lanes) pic.append(title(ln.title, ln.label));
	for (const gr of [...L.groups].sort((a, b) => a.depth - b.depth)) {
		const def = g.groups!.find((x) => x.id === gr.id)!;
		pic.append(svg("rect", { class: "tb-graph-group", "data-id": gr.id, "data-depth": gr.depth, x: gr.x, y: gr.y, width: gr.w, height: gr.h, rx: 10, ...names("group", def.role, def.color) }));
		const t = title(gr.title, `${close ? "▾ " : ""}${gr.label}`);
		t.setAttribute("data-kind", "group-title");
		t.setAttribute("data-id", gr.id);
		if (close) (t.classList.add("tb-graph-group-title"), t.addEventListener("click", () => close(gr.id)));
		pic.append(t);
	}
};
ext.drawGroups = drawGroups;
