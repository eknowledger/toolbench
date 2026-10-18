/**
 * The repair chunk: what happens when a route could only be found by sharing a stretch with another, which no
 * bench family needs and dense graphs of a hundred nodes and more do. Fetched the first time a layout leaves
 * a route like that, so the graphs that never do never download it.
 *
 * Two repairs, in order. First the routes the shared one ran into are rerouted against it, and it is routed
 * again. Then, for an end that is walled in (the only way out of its port is another port's approach or
 * another route's turn), that end moves to the next side of its node, and everything is routed again.
 */
import { BLOCK, dirOf, EA, RING, TAKEN, type Router } from "./router.ts";
import { ext, type Side } from "./chunks.ts";
import { SIDES } from "./geometry.ts";
import type { Built } from "./layout.ts";

/**
 * A route that had to share is not kept that way: the routes it runs into are rerouted against it, then it is
 * routed again. On the dense call graph one route was boxed out of its own port by two others, and its
 * fallback ran 8px along a third.
 */
function unshare(rt: Router): void {
	const { R, key, replay, route, eIdx } = rt;
	const { eo, ow, X, Y } = rt.api;
	for (let round = 0; round < 4; round++) {
		const soft = R.flatMap((r, i) => (r?.soft ? [i] : []));
		if (!soft.length) return;
		for (const i of soft) {
			const r = R[i];
			if (!r?.soft) continue;
			const keys = new Set<number>();
			for (let j = 0; j + 1 < r.v.length; j++) {
				const a = r.v[j]!;
				const b = r.v[j + 1]!;
				const d = dirOf(X(b) - X(a), Y(b) - Y(a));
				const o = eo[EA[d]!]![eIdx(a, d)]!;
				if (o && o !== key(i)) keys.add(o);
				if (ow[b] && ow[b] !== key(i) && ow[b] !== -2) keys.add(ow[b]!);
			}
			const others = R.flatMap((x, j) => (x && j !== i && keys.has(key(j)) ? [j] : []));
			for (const j of others) (replay(j), route(j));
			replay(i);
			route(i);
		}
	}
}

/**
 * Which of a shared route's two ends is walled in: the first point past its lane is another route's turn or
 * lane, or another port's approach. Neither found, both are moved.
 */
function boxed(rt: Router, i: number): [boolean, boolean] {
	const k = rt.key(i);
	const { st, ow, am, step } = rt.api;
	const out = rt.lanes[i]!.map((ln) => {
		const a = step(ln.v[ln.v.length - 1]!, ln.d);
		return a < 0 || st[a] === BLOCK || st[a] === RING || (st[a] === TAKEN && ow[a] !== k) || (am[a] !== 0 && am[a] !== k);
	});
	return out[0] || out[1] ? [out[0]!, out[1]!] : [true, true];
}

type Moves = Map<number, { fromSide?: Side; toSide?: Side }>;

/*
 * ⚠️ Where a force layout packs nodes closer than two ports' approaches, one port's approach can be another's
 * only way out, and no rerouting of the routes alone frees it; on seeded networks of 120 to 500 nodes that left
 * one to five edges drawn too close to another. So the walled-in end moves to the side of its node facing the
 * other end most squarely of the other three, and everything is routed again, up to three times while that
 * leaves fewer shared routes.
 */
function reattach(b: Built, again: (moves: Moves) => Built): Built {
	let moves: Moves = new Map();
	for (let round = 0; round < 3; round++) {
		const soft = b.rt.R.flatMap((r, i) => (r?.soft ? [i] : []));
		if (!soft.length) return b;
		moves = new Map(moves);
		for (const i of soft) {
			const [u, v] = b.rt.ue[i]!;
			const walled = boxed(b.rt, i);
			const m = { ...moves.get(i) };
			for (const k of [0, 1] as const) {
				if (!walled[k]) continue;
				const [at, far] = k ? [v!, u!] : [u!, v!];
				const side = b.ends[i]![k]!.side;
				const [ax, ay] = [b.boxes[far]!.x + b.boxes[far]!.w / 2 - (b.boxes[at]!.x + b.boxes[at]!.w / 2), b.boxes[far]!.y + b.boxes[far]!.h / 2 - (b.boxes[at]!.y + b.boxes[at]!.h / 2)];
				const facing = (s: Side) => (s === "left" ? -ax : s === "right" ? ax : s === "top" ? -ay : ay);
				const next = SIDES.filter((s) => s !== side).sort((p, q) => facing(q) - facing(p))[0]!;
				if (k) m.toSide = next;
				else m.fromSide = next;
			}
			moves.set(i, m);
		}
		const next = again(moves);
		if (next.rt.R.filter((r) => r?.soft).length >= soft.length) return b;
		b = next;
	}
	return b;
}

ext.repair = { unshare, reattach };
