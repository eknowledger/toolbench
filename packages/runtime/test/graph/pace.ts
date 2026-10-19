/**
 * How much slower this machine is than the one the graph layout's time budgets were set on, so a budget holds on
 * any machine that runs `pnpm test` and still catches a regression on every one of them.
 *
 * A budget in milliseconds is a budget for one machine. The layout's 50 ms per family was set on an M3 Pro, where
 * the call graph took 22.8 ms; on a GitHub runner the same family took 82.4 ms and the test failed with nothing
 * wrong in the layout. Raising the number would let a real regression through on the laptop, and skipping in CI
 * would stop the gate running where it is enforced.
 *
 * So the test times a fixed workload shaped like the layout's own: objects allocated, sorted by two keys, hashed
 * into a Map and walked. It is deterministic, seeded and free of the code under test, so it measures the machine
 * and not the change. The budget scales by how much slower it ran here than it did where the budget was set,
 * never below 1, so a faster machine keeps the full budget. A layout twice as slow fails on both machines.
 */

/**
 * The reference workload's median on the machine the budgets were set on: an M3 Pro on Node 26, inside a full
 * `pnpm check` run so the other test files compete for the CPU as they do whenever this runs. Five runs measured
 * 13.6, 14.2, 14.5, 14.5 and 14.8 ms; this is their median. Re-measure it if a budget is ever set again.
 */
export const REFERENCE_MS = 14.5;

function workload(): number {
	// A linear congruential generator, so every machine sorts the same numbers in the same order.
	let s = 12345;
	const next = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
	const points: { x: number; y: number; id: number }[] = [];
	for (let i = 0; i < 30_000; i++) points.push({ x: next() % 1000, y: next() % 1000, id: i });
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

/** The workload's median of five on this machine, in ms, after one warming run. */
export function referenceMs(): number {
	workload();
	const ms: number[] = [];
	for (let r = 0; r < 5; r++) {
		const t0 = performance.now();
		workload();
		ms.push(performance.now() - t0);
	}
	return ms.sort((x, y) => x - y)[2]!;
}

/** How many times slower than the reference machine this one ran the workload, never below 1. */
export function pace(): { factor: number; measured: number } {
	const measured = referenceMs();
	return { factor: Math.max(1, measured / REFERENCE_MS), measured };
}
