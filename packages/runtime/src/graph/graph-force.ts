/**
 * The force chunk: seeded Fruchterman-Reingold, and manual placement. Only + - * / and sqrt, which IEEE 754
 * fixes, so the result is the same in every engine although the method is chaotic.
 */
import { ext } from "./chunks.ts";
import { P } from "./geometry.ts";
import { settle } from "./graph-free.ts";
import type { Box } from "./model.ts";

/** mulberry32: integer arithmetic only. */
function prng(seed: number) {
	let a = seed >>> 0 || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), a | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

ext.place.force = (g, sizes) => {
	const n = g.nodes.length;
	const rnd = prng(g.seed ?? 1);
	const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
	const k = ((sizes.reduce((s, z) => s + Math.sqrt(z[0]! * z[0]! + z[1]! * z[1]!), 0) / n) * 0.55 + 40) * (g.spacing === "compact" ? 0.8 : g.spacing === "loose" ? 1.4 : 1);
	const side = k * Math.sqrt(n);
	const pin = g.nodes.map((x) => x.x !== undefined && x.y !== undefined);
	const x = g.nodes.map((nd, i) => (pin[i] ? nd.x! : rnd() * side));
	const y = g.nodes.map((nd, i) => (pin[i] ? nd.y! : rnd() * side));
	const ed = g.edges.map((e) => [idx.get(e.from)!, idx.get(e.to)!]).filter(([a, b]) => a !== b);
	for (let it = 0; it < 300; it++) {
		const t = (side / 8) * (1 - it / 300) + 1;
		const dx = new Float64Array(n);
		const dy = new Float64Array(n);
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++) {
				let ex = x[i]! - x[j]!;
				let ey = y[i]! - y[j]!;
				let d2 = ex * ex + ey * ey;
				if (d2 < 1e-6) ((ex = 1), (ey = 0), (d2 = 1));
				const f = (k * k) / d2;
				dx[i]! += ex * f;
				dy[i]! += ey * f;
				dx[j]! -= ex * f;
				dy[j]! -= ey * f;
			}
		for (const [a, b] of ed) {
			const ex = x[a!]! - x[b!]!;
			const ey = y[a!]! - y[b!]!;
			const f = Math.sqrt(ex * ex + ey * ey) / k;
			dx[a!]! -= ex * f;
			dy[a!]! -= ey * f;
			dx[b!]! += ex * f;
			dy[b!]! += ey * f;
		}
		// A weak pull to the centre keeps leaves and separate components from drifting off.
		const mx = x.reduce((s, v) => s + v, 0) / n;
		const my = y.reduce((s, v) => s + v, 0) / n;
		for (let i = 0; i < n; i++) {
			if (pin[i]) continue;
			const fx = dx[i]! - (x[i]! - mx) * 0.05;
			const fy = dy[i]! - (y[i]! - my) * 0.05;
			const d = Math.sqrt(fx * fx + fy * fy) + 1e-9;
			const m = Math.min(d, t) / d;
			x[i]! += fx * m;
			y[i]! += fy * m;
		}
	}
	const boxes: Box[] = g.nodes.map((_, i) => ({ x: x[i]! - sizes[i]![0]! / 2, y: y[i]! - sizes[i]![1]! / 2, w: sizes[i]![0]!, h: sizes[i]![1]! }));
	settle(g, boxes, 5 * P, pin);
	return { boxes };
};

ext.place.manual = (g, sizes) => {
	const boxes = g.nodes.map((nd, i) => ({ x: (nd.x ?? 0) - sizes[i]![0]! / 2, y: (nd.y ?? 0) - sizes[i]![1]! / 2, w: sizes[i]![0]!, h: sizes[i]![1]! }));
	settle(g, boxes, 3 * P, boxes.map(() => true));
	return { boxes };
};
