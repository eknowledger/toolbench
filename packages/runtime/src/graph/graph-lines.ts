/**
 * The lines chunk: everything that is not an orthogonal route. Straight lines and direct curves between
 * ports for free layouts; eight-direction grid routes for polyline and spline, with the rules that keep
 * diagonals apart; and the corner radii that keep a smoothed spline clear of its neighbours.
 */
import { ext } from "./chunks.ts";
import { clip, hyp, P, textW } from "./geometry.ts";
import type { Box, Pt } from "./model.ts";
import { ring } from "./ports.ts";
import type { Built } from "./layout.ts";
import { BLOCK, D1, D2, FREE, H, RING, TAKEN, V, type Api } from "./router.ts";

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
/** Whether segment a-c enters box b, by Liang-Barsky. */
function segBox(a: Pt, c: Pt, b: Box): boolean {
	let t0 = 0;
	let t1 = 1;
	const dx = c[0] - a[0];
	const dy = c[1] - a[1];
	for (const [p, q] of [[-dx, a[0] - b.x], [dx, b.x + b.w - a[0]], [-dy, a[1] - b.y], [dy, b.y + b.h - a[1]]] as number[][]) {
		if (!p) {
			if (q! <= 0) return false;
			continue;
		}
		const r = q! / p;
		if (p < 0) t0 = Math.max(t0, r);
		else t1 = Math.min(t1, r);
		if (t0 > t1) return false;
	}
	return t1 - t0 > 1e-6;
}
const dist = (p: Pt, a: Pt, b: Pt) => {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
	return hyp(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

ext.lines = {
	/**
	 * Straight lines or direct curves, port to port. Kept only when they clear every other node and title,
	 * stay MIN_SEP from earlier ones unless crossing at a clear angle, and leave a shared node at least 26
	 * degrees from its neighbours; the rest go to the grid.
	 */
	direct: ((routing: string) => (a: Api) => {
		const { g, boxes, polys, ends, titles, inside, nx, ny, gx, gy, st, lm, lo, skip } = a;
		const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
		const extra: (Pt[] | undefined)[] = [];
		const labels: (Box | undefined)[] = [];
		const kept: { i: number; u: number; v: number; p: Pt[] }[] = [];
		const port = (u: number, e: { side: string; off: number }) => {
			const [x, y, ix, iy] = ring(boxes[u]!, e.side as never, e.off);
			return [clip(polys[u]!, [x!, y!], [x! + ix! * 1e4, y! + iy! * 1e4]) ?? [x!, y!], [-ix!, -iy!]] as Pt[];
		};
		g.edges.forEach((e, i) => {
			const u = idx.get(e.from)!;
			const v = idx.get(e.to)!;
			if (u === v || skip.has(i)) return;
			const [A, na] = port(u, ends[i]![0]!);
			const [B, nb] = port(v, ends[i]![1]!);
			const L = hyp(B![0] - A![0], B![1] - A![1]) * 0.45;
			const pts: Pt[] = [];
			if (routing === "straight") pts.push(A!, B!);
			else
				for (let k = 0; k <= 24; k++) {
					const t = k / 24;
					const m = 1 - t;
					const c1 = [A![0] + na![0] * L, A![1] + na![1] * L];
					const c2 = [B![0] + nb![0] * L, B![1] + nb![1] * L];
					pts.push([m * m * m * A![0] + 3 * m * m * t * c1[0]! + 3 * m * t * t * c2[0]! + t * t * t * B![0], m * m * m * A![1] + 3 * m * m * t * c1[1]! + 3 * m * t * t * c2[1]! + t * t * t * B![1]]);
				}
			const segs = pts.slice(1).map((p, k) => [pts[k]!, p] as Pt[]);
			// Clear of every other node by a half pitch, and out of its own two: a port moved to a side away from
			// the other end left a line straight back through its own node.
			if (boxes.some((b, k) => segs.some(([p, q]) => segBox(p!, q!, k !== u && k !== v ? grow(b, P / 2) : grow(b, -1.5))))) return;
			if (titles.some((t) => segs.some(([p, q]) => segBox(p!, q!, grow(t, 2))))) return;
			const close = kept.some((o) =>
				segs.some(([p, q]) => {
					const d = [q![0] - p![0], q![1] - p![1]];
					return o.p.slice(1).some((r, k) => {
						const s0 = o.p[k]!;
						const dd = [r[0] - s0[0], r[1] - s0[1]];
						const cos = Math.abs(d[0]! * dd[0]! + d[1]! * dd[1]!) / (hyp(d[0]!, d[1]!) * hyp(dd[0]!, dd[1]!) || 1);
						if (cos < 0.9) return false;
						// Lines leaving one port do so by design; only away from it do they collide. Only a port they
						// share: two ports 16px apart on one node are two lines, and at 500 nodes two such lines left
						// at a shallow angle and ran within 6px for 10px.
						const ends = [o.p[0]!, o.p[o.p.length - 1]!];
						const shared = [A!, B!].filter((e) => ends.some((x) => hyp(x[0] - e[0], x[1] - e[1]) < 0.5));
						// ⚠️ Sampled every 4px, not just at the ends: two long lines at a shallow angle can run within
						// 6px of each other in the middle while all four ends are far apart. At 250 nodes, five pairs did.
						const n = Math.ceil(hyp(d[0]!, d[1]!) / 4);
						for (let m = 0; m <= n; m++) {
							const x: Pt = [p![0] + (d[0]! * m) / n, p![1] + (d[1]! * m) / n];
							if (dist(x, s0, r) < 6.5 && shared.every((e) => hyp(x[0] - e[0], x[1] - e[1]) > 12)) return true;
						}
						return false;
					});
				}),
			);
			if (close) return;
			kept.push({ i, u, v, p: pts });
			extra[i] = pts;
			// Rasterise: every grid point within 10px, marked with the directions within 26 degrees of the
			// line's, so a grid route may cross it but never run along it.
			for (const [p, q] of segs) {
				const l = hyp(q![0] - p![0], q![1] - p![1]) || 1;
				const ux = (q![0] - p![0]) / l;
				const uy = (q![1] - p![1]) / l;
				let bit = 0;
				for (const [ax, cx, cy] of [[H, 1, 0], [D1, 0.7071, 0.7071], [V, 0, 1], [D2, -0.7071, 0.7071]]) if (Math.abs(ux * cx! + uy * cy!) > 0.8988) bit |= ax!;
				// Not within 14px of either end: there the line leaves its node beside the lanes of that node's
				// other ports, and marking them shut those ports to the grid routes that needed them.
				for (let t = 14; t <= l - 14; t += P / 2) {
					const x = p![0] + ux * t;
					const y = p![1] + uy * t;
					const i0 = Math.round((x - gx) / P);
					const j0 = Math.round((y - gy) / P);
					for (let di = -2; di <= 2; di++)
						for (let dj = -2; dj <= 2; dj++) {
							const ii = i0 + di;
							const jj = j0 + dj;
							if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && hyp(gx + ii * P - x, gy + jj * P - y) <= 10 && st[jj * nx + ii] === FREE) ((lm[jj * nx + ii]! |= bit || H | V), lo[jj * nx + ii] ||= i + 1);
						}
				}
			}
		});
		// Labels slid along their line to the first spot clear of nodes, titles, labels and other lines.
		for (const { i, p } of kept) {
			const text = g.edges[i]!.label;
			if (!text) continue;
			const w = textW(text, 11) + 8;
			for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) {
				const c = p[Math.round((p.length - 1) * t)]!;
				const c2 = p.length === 2 ? [p[0]![0] + (p[1]![0] - p[0]![0]) * t, p[0]![1] + (p[1]![1] - p[0]![1]) * t] : c;
				const b = { x: c2[0]! - w / 2, y: c2[1]! - 7.5, w, h: 15 };
				const hitB = (o: Box) => o.x < b.x + b.w && b.x < o.x + o.w && o.y < b.y + b.h && b.y < o.y + o.h;
				if (boxes.some((n) => hitB(grow(n, 2))) || titles.some(hitB) || labels.some((l) => l && hitB(l))) continue;
				if (kept.some((o) => o.i !== i && o.p.slice(1).some((r, k) => segBox(o.p[k]!, r, grow(b, 2))))) continue;
				labels[i] = b;
				inside(b, 2, (v: number) => st[v] === FREE && (st[v] = BLOCK));
				break;
			}
		}
		return { extra, labels };
	}) as never,

	/** Eight-direction moves on the grid: the rules that keep diagonals clear of corners and of each other. */
	grid: ((a: Api) => {
		const { st, ow, eo, nx, step } = a;
		const cell = (v: number, w: number) => Math.min(Math.floor(v / nx), Math.floor(w / nx)) * nx + Math.min(v % nx, w % nx);
		return {
			diag: (v: number, w: number, d: number, k: number) => {
				const p = step(v, d === 4 || d === 7 ? 0 : 2);
				const q = step(v, d === 4 || d === 5 ? 1 : 3);
				// Never clip a node's corner, slip between a node and its ring, or cut beside another's corner.
				for (const c of [p, q]) if (c < 0 || st[c] === BLOCK || st[c] === RING || (st[c] === TAKEN && ow[c] !== k)) return -1;
				const c = cell(v, w);
				const other = d === 4 || d === 6 ? eo[3]![c + 1]! : eo[2]![c]!;
				return other && other !== k ? 1 : 0;
			},
			turn: (v: number, k: number) => {
				const i = v % nx;
				const j = Math.floor(v / nx);
				for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
					const c = cj! * nx + ci!;
					if (c < 0) continue;
					const o = v === c || v === c + nx + 1 ? eo[3]![c + 1]! : eo[2]![c]!;
					if (o && o !== k) return false;
				}
				return true;
			},
			// ⚠️ Parallel diagonals in neighbouring cells are only 5.7px apart: claim the neighbours' too.
			claim: (v: number, w: number, d: number, k: number) => {
				const c = cell(v, w);
				const d1 = d === 4 || d === 6;
				for (const nc of [c - 1, c + 1, c - nx, c + nx]) {
					const arr = d1 ? eo[2]! : eo[3]!;
					const at = d1 ? nc : nc + 1;
					if (at >= 0 && at < arr.length && !arr[at]) arr[at] = k;
				}
			},
		};
	}) as never,

	/** Per corner, the largest radius whose curve keeps 6.5px from anything else on the grid. */
	smooth: ((rt: { api: Api; key: (i: number) => number }, i: number, p: Pt[]) => {
		const { st, mk, ow, lm, at, gx, gy, nv } = rt.api;
		const own = rt.key(i);
		const foreign = (w: number) => w >= 0 && w < nv && (st[w] === BLOCK || st[w] === RING || ((mk[w] || st[w] === TAKEN) && ow[w] !== own) || !!lm[w]);
		return p.map((b, k) => {
			if (!k || k === p.length - 1) return 0;
			const a = p[k - 1]!;
			const c = p[k + 1]!;
			const la = hyp(b[0] - a[0], b[1] - a[1]);
			const lc = hyp(c[0] - b[0], c[1] - b[1]);
			for (const r of [3 * P, 2 * P, 1.5 * P, P, P / 2]) {
				const rr = Math.min(r, la / 2, lc / 2);
				const p1 = [b[0] - ((b[0] - a[0]) / la) * rr, b[1] - ((b[1] - a[1]) / la) * rr];
				const p2 = [b[0] + ((c[0] - b[0]) / lc) * rr, b[1] + ((c[1] - b[1]) / lc) * rr];
				const curve: Pt[] = [];
				for (let t = 0; t <= 8; t++) {
					const u = t / 8;
					const m = 1 - u;
					curve.push([m * m * p1[0]! + 2 * m * u * b[0] + u * u * p2[0]!, m * m * p1[1]! + 2 * m * u * b[1] + u * u * p2[1]!]);
				}
				let ok = true;
				for (let y = Math.ceil((b[1] - rr - 8 - gy) / P) * P + gy; ok && y <= b[1] + rr + 8; y += P)
					for (let x = Math.ceil((b[0] - rr - 8 - gx) / P) * P + gx; ok && x <= b[0] + rr + 8; x += P) if (foreign(at(x, y)) && curve.some((q) => hyp(q[0] - x, q[1] - y) < 6.5)) ok = false;
				if (ok) return r;
			}
			return P / 2;
		});
	}) as never,

	/*
	 * ⚠️ In a straight graph a grid route can end soft because straight lines wall it in, and a straight line
	 * cannot be rerouted out of the way. The lines it had to run along are routed on the grid as well, and
	 * everything routed again: on a seeded network of 500 nodes two routes otherwise ran within 6px of a line.
	 */
	unwall: ((b: Built, again: (skip: Set<number>) => Built) => {
		let skip = new Set<number>();
		for (let round = 0; round < 2; round++) {
			const { R, lm, lo, X, Y } = b.rt.api;
			const lines = new Set<number>();
			for (const r of R) {
				if (!r?.soft) continue;
				for (let j = 0; j + 1 < r.v.length; j++) {
					const [v, w] = [r.v[j]!, r.v[j + 1]!];
					const [dx, dy] = [X(w) - X(v), Y(w) - Y(v)];
					const axis = !dy ? H : !dx ? V : dx * dy > 0 ? D1 : D2;
					if (lm[v]! & axis && lo[v]) lines.add(lo[v]! - 1);
				}
			}
			if (!lines.size) return b;
			skip = new Set([...skip, ...lines]);
			b = again(skip);
		}
		return b;
	}) as never,
};
