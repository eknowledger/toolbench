/**
 * How much slower this machine is than the one the graph layout's time budgets were set on, so a budget holds on
 * any machine that runs `pnpm test` and still catches a regression on every one of them.
 *
 * A budget in milliseconds is a budget for one machine. The layout's 50 ms per family was set on an M3 Pro, where
 * the call graph took 22.8 ms; on a GitHub runner the same family took 82.4 ms and the test failed with nothing
 * wrong in the layout. Raising the number would let a real regression through on the laptop, and skipping in CI
 * would stop the gate running where it is enforced.
 *
 * So the test times a fixed workload shaped like the layout's own two halves: objects allocated, sorted by two
 * keys and hashed into a Map, as layering does, then shortest paths over a weighted grid through a binary heap in
 * typed arrays, as the router does. It is deterministic, seeded and free of the code under test, so it measures
 * the machine and not the change. The budget scales by how much slower it ran here than where the budget was set,
 * never below 1, so a faster machine keeps the full budget.
 *
 * ⚠️ The reference runs interleaved with the work it calibrates, one round of each at a time, not once up front. A
 * shared runner's speed changes within seconds: the first calibrated CI run had the call graph at 41.3 ms on one
 * leg and 81.5 ms on the other, the same code on the same kind of machine. Timed apart, the reference can catch
 * a quiet moment and the layout a busy one.
 */

/**
 * The reference workload's fastest of five on the machine the budgets were set on: an M3 Pro on Node 26,
 * inside a full `pnpm check` run so the other test files compete for the CPU as they do whenever this runs. Five runs measured
 * 11.4, 11.1, 11.0, 10.5 and 11.8 ms, with the call graph's fastest at 22.1 to 23.2 ms beside them; this is
 * their median. Re-measure it if a budget is ever set again; the test prints the figure as a diagnostic.
 */
export const REFERENCE_MS = 11.1;

/** A linear congruential generator, so every machine works on the same numbers in the same order. */
function lcg(seed: number): () => number {
	let s = seed;
	return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
}

function layering(): number {
	const next = lcg(12345);
	const points: { x: number; y: number; id: number }[] = [];
	for (let i = 0; i < 15_000; i++) points.push({ x: next() % 1000, y: next() % 1000, id: i });
	points.sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
	const cells = new Map<string, number>();
	for (const p of points) {
		const key = `${p.x >> 3},${p.y >> 3}`;
		cells.set(key, (cells.get(key) ?? 0) + 1);
	}
	let sum = 0;
	for (const [key, n] of cells) sum += key.length * n;
	return sum;
}

function routing(): number {
	const W = 120;
	const N = W * W;
	const next = lcg(54321);
	const cost = new Uint8Array(N);
	for (let i = 0; i < N; i++) cost[i] = 1 + (next() % 9);
	let total = 0;
	for (let q = 0; q < 4; q++) {
		const d = new Float64Array(N).fill(Infinity);
		let hs = new Int32Array(1024);
		let hf = new Float64Array(1024);
		let hn = 0;
		const push = (v: number, f: number) => {
			if (hn === hs.length) {
				const a = new Int32Array(hn * 2);
				a.set(hs);
				hs = a;
				const b = new Float64Array(hn * 2);
				b.set(hf);
				hf = b;
			}
			let i = hn++;
			while (i > 0) {
				const p = (i - 1) >> 1;
				if (hf[p]! <= f) break;
				hs[i] = hs[p]!;
				hf[i] = hf[p]!;
				i = p;
			}
			hs[i] = v;
			hf[i] = f;
		};
		const pop = () => {
			const top = hs[0]!;
			const v = hs[--hn]!;
			const f = hf[hn]!;
			let i = 0;
			for (;;) {
				let c = 2 * i + 1;
				if (c >= hn) break;
				if (c + 1 < hn && hf[c + 1]! < hf[c]!) c++;
				if (hf[c]! >= f) break;
				hs[i] = hs[c]!;
				hf[i] = hf[c]!;
				i = c;
			}
			hs[i] = v;
			hf[i] = f;
			return top;
		};
		const src = next() % N;
		d[src] = 0;
		push(src, 0);
		while (hn) {
			const u = pop();
			const x = u % W;
			const y = (u / W) | 0;
			const relax = (v: number) => {
				const nd = d[u]! + cost[v]!;
				if (nd < d[v]!) {
					d[v] = nd;
					push(v, nd);
				}
			};
			if (x + 1 < W) relax(u + 1);
			if (x > 0) relax(u - 1);
			if (y + 1 < W) relax(u + W);
			if (y > 0) relax(u - W);
		}
		total += d[N - 1]!;
	}
	return total;
}

/** The reference workload once, in ms. */
export function reference(): number {
	const t0 = performance.now();
	layering();
	routing();
	return performance.now() - t0;
}

const fastest = (ms: number[]) => Math.min(...ms);
const median = (ms: number[]) => [...ms].sort((x, y) => x - y)[ms.length >> 1]!;

/**
 * Times each task `rounds` times, a reference run before every round, and returns each task's fastest run, the
 * reference's fastest and how many times slower than the reference machine this one ran, never below 1.
 *
 * The fastest, not the median: contention only ever adds time, so the fastest of five is the run least disturbed,
 * for the layout and the reference alike, and their ratio is the machine's rather than the moment's. Across six
 * CI legs the ratio of medians, call graph to reference, ran from 1.86 to 3.29 against 1.85 here, and the worst
 * left the budget 1.22 times above the layout. The medians are kept for the diagnostic.
 */
export function paced<K>(tasks: readonly (readonly [K, () => unknown])[], rounds = 5) {
	reference();
	const ref: number[] = [];
	const ms = tasks.map(() => [] as number[]);
	for (let r = 0; r < rounds; r++) {
		ref.push(reference());
		tasks.forEach(([, run], i) => {
			const t0 = performance.now();
			run();
			ms[i]!.push(performance.now() - t0);
		});
	}
	const measured = fastest(ref);
	return {
		measured,
		factor: Math.max(1, measured / REFERENCE_MS),
		times: tasks.map(([key], i) => [key, fastest(ms[i]!)] as const),
		medians: { reference: median(ref), tasks: tasks.map(([key], i) => [key, median(ms[i]!)] as const) },
	};
}

/**
 * V8 coverage instruments every line of the layout and almost none of the reference, whose time is in the
 * engine's own sort, Map and typed arrays. Measured locally, the call graph went from 23 to 133 ms under
 * `pnpm coverage` while the reference did not move, so a time taken there describes the instrumentation.
 */
export const instrumented = Boolean(process.env.NODE_V8_COVERAGE);
