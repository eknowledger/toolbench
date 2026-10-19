/** The tree chunk: tidy tree and radial placements. */
import type { Graph } from "@toolbench/sdk";
import { ext, type Side } from "./chunks.ts";
import { oddUp, P, PG } from "./geometry.ts";
import { settle } from "./graph-free.ts";
import type { Box } from "./model.ts";

/* ⚠️ Math.sin and Math.cos are not correctly rounded and engines differ in the last bit, which moved radial
   coordinates between Chrome and Firefox. This series uses only + - * /, which IEEE 754 fixes. */
const TAU = 6.283185307179586;
function sin(x: number) {
	x -= TAU * Math.floor(x / TAU);
	if (x > TAU / 2) x -= TAU;
	if (x > TAU / 4) x = TAU / 2 - x;
	else if (x < -TAU / 4) x = -TAU / 2 - x;
	let term = x;
	let sum = x;
	for (let k = 1; k < 12; k++) sum += term *= (-x * x) / (2 * k * (2 * k + 1));
	return sum;
}
const cos = (x: number) => sin(x + TAU / 4);

/** A spanning forest by BFS from the nodes nothing points at, in input order. */
function forest(g: Graph) {
	const n = g.nodes.length;
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const out: number[][] = g.nodes.map(() => []);
	const indeg = new Array<number>(n).fill(0);
	for (const e of g.edges) {
		const u = idx.get(e.from)!;
		const v = idx.get(e.to)!;
		if (u !== v) (out[u]!.push(v), indeg[v]!++);
	}
	const parent = new Array<number>(n).fill(-2);
	const kids: number[][] = g.nodes.map(() => []);
	const roots: number[] = [];
	const depth = new Array<number>(n).fill(0);
	const order: number[] = [];
	const visit = (r: number) => {
		parent[r] = -1;
		roots.push(r);
		const q = [r];
		for (let i = 0; i < q.length; i++)
			for (const v of out[q[i]!]!)
				if (parent[v] === -2) ((parent[v] = q[i]!), kids[q[i]!]!.push(v), (depth[v] = depth[q[i]!]! + 1), q.push(v));
	};
	for (let u = 0; u < n; u++) if (!indeg[u] && parent[u] === -2) visit(u);
	for (let u = 0; u < n; u++) if (parent[u] === -2) visit(u);
	const stack = [...roots].reverse();
	while (stack.length) {
		const u = stack.pop()!;
		order.push(u);
		stack.push(...[...kids[u]!].reverse());
	}
	return { kids, roots, depth, order };
}

/** Tidy tree: each subtree packed against its left siblings by contour, the parent centred over its children. */
ext.place.tree = (g, sz) => {
	const dir = g.direction ?? "TB";
	const lr = dir === "LR" || dir === "RL";
	const sp = g.spacing === "compact" ? 0.75 : g.spacing === "loose" ? 1.5 : 1;
	const { kids, roots, depth, order } = forest(g);
	// The side facing the children holds one port per child, 16 apart, unless they share a bus.
	const sizes = sz.map((s, u) => {
		const k = g.merge === "source" ? Math.min(1, kids[u]!.length) : kids[u]!.length;
		const need = oddUp(PG * k + 8);
		return lr ? [s[0]!, Math.max(s[1]!, need)] : [Math.max(s[0]!, need), s[1]!];
	});
	const oX = (u: number) => sizes[u]![lr ? 1 : 0]!;
	const rX = (u: number) => sizes[u]![lr ? 0 : 1]!;
	const off = new Array<number>(g.nodes.length).fill(0);
	const cont = new Map<number, number[][]>();
	for (const u of [...order].reverse()) {
		const half = oX(u) / 2;
		const ks = kids[u]!;
		if (!ks.length) {
			cont.set(u, [[-half], [half]]);
			continue;
		}
		const L: number[] = [];
		const R: number[] = [];
		const xs = ks.map((c, ci) => {
			const [cl, cr] = cont.get(c)!;
			let x = 0;
			if (ci) {
				x = -Infinity;
				for (let d = 0; d < Math.min(cl!.length, R.length); d++) x = Math.max(x, R[d]! - cl![d]! + 32 * sp);
			}
			cl!.forEach((v, d) => ((L[d] = Math.min(L[d] ?? Infinity, x + v)), (R[d] = Math.max(R[d] ?? -Infinity, x + cr![d]!))));
			return x;
		});
		const mid = (xs[0]! + xs[xs.length - 1]!) / 2;
		ks.forEach((c, ci) => (off[c] = xs[ci]! - mid));
		cont.set(u, [[-half, ...L.map((v) => v - mid)], [half, ...R.map((v) => v - mid)]]);
	}
	const o = new Array<number>(g.nodes.length).fill(0);
	let cur = 0;
	for (const r of roots) {
		const [cl, cr] = cont.get(r)!;
		o[r] = cur - Math.min(...cl!);
		cur += Math.max(...cr!) - Math.min(...cl!) + 64 * sp;
	}
	for (const u of order) for (const c of kids[u]!) o[c] = o[u]! + off[c]!;
	const maxD = Math.max(...depth);
	const thick = Array.from({ length: maxD + 1 }, (_, d) => Math.max(...g.nodes.map((_, u) => (depth[u] === d ? rX(u) : 0))));
	const start: number[] = [];
	let at = 0;
	for (let d = 0; d <= maxD; d++) (start.push(at), (at += thick[d]! + 64 * sp));
	const total = at - 64 * sp;
	const boxes: Box[] = g.nodes.map((_, u) => {
		let r = start[depth[u]!]! + thick[depth[u]!]! / 2;
		if (dir === "BT" || dir === "RL") r = total - r;
		const [w, h] = sizes[u]!;
		return lr ? { x: r - w! / 2, y: o[u]! - h! / 2, w: w!, h: h! } : { x: o[u]! - w! / 2, y: r - h! / 2, w: w!, h: h! };
	});
	const flow: Side[] = dir === "TB" ? ["bottom", "top"] : dir === "BT" ? ["top", "bottom"] : dir === "LR" ? ["right", "left"] : ["left", "right"];
	return { boxes, sides: g.edges.map(() => ({ out: flow[0], in: flow[1] })) };
};

/** Radial: the root at the centre, each depth a ring, each subtree a wedge sized by its leaves. */
ext.place.radial = (g, sizes) => {
	const { kids, roots, depth, order } = forest(g);
	const n = g.nodes.length;
	const leaves = new Array<number>(n).fill(1);
	for (const u of [...order].reverse()) if (kids[u]!.length) leaves[u] = kids[u]!.reduce((s, c) => s + leaves[c]!, 0);
	const ang = new Array<number>(n).fill(0);
	const wedge = new Array<number>(n).fill(TAU);
	const total = roots.reduce((s, r) => s + leaves[r]!, 0);
	let a0 = 0;
	for (const r of roots) ((wedge[r] = roots.length === 1 ? TAU : (TAU * leaves[r]!) / total), (ang[r] = a0 + wedge[r]! / 2), (a0 += wedge[r]!));
	for (const u of order) {
		let s = ang[u]! - wedge[u]! / 2;
		for (const c of kids[u]!) ((wedge[c] = (wedge[u]! * leaves[c]!) / leaves[u]!), (ang[c] = s + wedge[c]! / 2), (s += wedge[c]!));
	}
	const diag = (u: number) => Math.sqrt(sizes[u]![0]! * sizes[u]![0]! + sizes[u]![1]! * sizes[u]![1]!);
	const maxD = Math.max(...depth);
	const rad = [roots.length === 1 ? 0 : Math.max(...roots.map(diag))];
	for (let d = 1; d <= maxD; d++) {
		const ring = order.filter((u) => depth[u] === d);
		let r = rad[d - 1]! + Math.max(...order.filter((u) => depth[u] === d - 1).map(diag)) / 2 + Math.max(...ring.map(diag)) / 2 + 6 * P;
		for (const u of ring) r = Math.max(r, (diag(u) + 24) / Math.min(wedge[u]!, 3));
		rad.push(r);
	}
	const boxes = g.nodes.map((_, u) => {
		const r = rad[depth[u]!]!;
		const [w, h] = sizes[u]!;
		return { x: r * cos(ang[u]!) - w! / 2, y: r * sin(ang[u]!) - h! / 2, w: w!, h: h! };
	});
	settle(g, boxes, 5 * P, boxes.map(() => false));
	return { boxes };
};
