/** mulberry32. */
function prng(seed: number) {
	let a = seed >>> 0 || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), a | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Seeded synthetic graphs for the scaling measurements: a layered DAG and an undirected network. */
import type { Graph } from "@toolbench/sdk";

export function dag(n: number, routing: NonNullable<Graph["routing"]> = "orthogonal"): Graph {
	const rnd = prng(n * 7 + 1);
	const levels = Math.max(3, Math.round(Math.sqrt(n) * 0.9));
	const level = Array.from({ length: n }, (_, i) => Math.floor((i * levels) / n));
	const edges: Graph["edges"] = [];
	for (let v = 0; v < n; v++) {
		if (level[v] === 0) continue;
		// One or two parents from earlier levels, mostly the level just before.
		const k = rnd() < 0.5 ? 1 : 2;
		for (let j = 0; j < k; j++) {
			const back = rnd() < 0.8 ? 1 : 2;
			const cands = [...Array(n).keys()].filter((u) => level[u] === Math.max(0, level[v]! - back));
			const u = cands[Math.floor(rnd() * cands.length)]!;
			if (!edges.some((e) => e.from === `n${u}` && e.to === `n${v}`)) edges.push({ from: `n${u}`, to: `n${v}`, ...(rnd() < 0.2 ? { label: `e${edges.length}` } : {}) });
		}
	}
	return { label: `DAG of ${n}`, direction: "LR", routing, nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `svc-${i}` })), edges };
}

export function net(n: number, routing: NonNullable<Graph["routing"]> = "straight"): Graph {
	const rnd = prng(n * 13 + 5);
	const edges: Graph["edges"] = [];
	// A random spanning tree plus a few extra links, so it has cycles.
	for (let v = 1; v < n; v++) edges.push({ from: `h${Math.floor(rnd() * v)}`, to: `h${v}` });
	for (let k = 0; k < Math.round(n * 0.3); k++) {
		const a = Math.floor(rnd() * n);
		const b = Math.floor(rnd() * n);
		if (a !== b) edges.push({ from: `h${a}`, to: `h${b}` });
	}
	return { label: `Network of ${n}`, layout: "force", directed: false, routing, seed: 3, nodes: Array.from({ length: n }, (_, i) => ({ id: `h${i}`, label: `host-${i}`, shape: "rect" as const })), edges };
}

/** FNV-1a of a string: enough to tell two engines' layouts apart without moving megabytes. */
export function fnv(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
	return h.toString(16);
}
