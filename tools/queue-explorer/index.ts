/**
 * Queue explorer: why latency goes vertical before a system runs out of capacity.
 *
 * The intuition this exists to fix is expensive to lack. At 80% utilisation an M/M/1 queue holds four
 * jobs; at 95% it holds nineteen. Nobody plans for that curve by reasoning about it, so the tool draws
 * it, marks where you are on it, and shows the same numbers two independent ways.
 *
 * Two things make the code worth reading, and both are the reason this tool is in the example set:
 *
 *  1. **It proves its own arithmetic.** The closed-form M/M/1 result and a discrete-event Monte Carlo
 *     simulation are computed side by side. If they disagree beyond sampling error, one of them is
 *     wrong — and the tool says so rather than quietly presenting the formula as truth.
 *  2. **The randomness is seeded**, so a simulation is a *pure function* of its inputs. That is what
 *     lets a fixture assert a simulated mean, and it is the difference between a demo and something
 *     you can regression-test.
 *
 * It declares `thread: "worker"` because its running time is set by an input: at five million samples
 * it would drop frames on the main thread, and only a worker can be stopped.
 */
import type { Chart, Field, Output, Tool } from "@toolbench/sdk";

type Input = {
	arrivals: number;
	service: number;
	samples: number;
	seed: number;
};

/**
 * mulberry32 — small, fast, and good enough for queueing samples.
 *
 * Chosen over `Math.random()` for one reason: reproducibility. A tool whose output changes between
 * runs cannot have fixtures, and a simulation nobody can pin is a simulation nobody can trust.
 */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Inverse-transform sampling of an exponential. `1 - u` keeps it defined when u is 0. */
const expo = (random: () => number, rate: number) => -Math.log(1 - random()) / rate;

export interface Analytic {
	rho: number;
	/** Mean time in system, ms. */
	w: number;
	/** Mean time waiting, ms. */
	wq: number;
	/** Mean number in system. */
	l: number;
	/** Mean number waiting. */
	lq: number;
}

/** Closed-form M/M/1. λ and μ are per second; the times come back in milliseconds. */
export function analytic(lambda: number, mu: number): Analytic {
	const rho = lambda / mu;
	const w = 1 / (mu - lambda);
	return {
		rho,
		w: w * 1000,
		wq: (rho / (mu - lambda)) * 1000,
		l: rho / (1 - rho),
		lq: (rho * rho) / (1 - rho),
	};
}

/**
 * Lindley's recursion: the waiting time of the next arrival is the previous one's wait, plus its
 * service, minus the gap since it arrived — floored at zero, because you cannot wait negative time.
 *
 * That single line is the whole simulation, which is part of why it is a good thing to publish.
 */
export function simulate(
	lambda: number,
	mu: number,
	samples: number,
	seed: number,
	onProgress?: (done: number, meanSoFar: number) => void,
): number {
	const random = rng(seed);
	let wait = 0;
	let total = 0;
	const step = Math.max(1, Math.floor(samples / 20));
	for (let i = 0; i < samples; i++) {
		const service = expo(random, mu);
		const gap = expo(random, lambda);
		total += wait + service;
		wait = Math.max(0, wait + service - gap);
		if (onProgress && (i + 1) % step === 0) onProgress(i + 1, (total / (i + 1)) * 1000);
	}
	return (total / samples) * 1000;
}

const fmt = (value: number, digits = 2) =>
	Number.isFinite(value) ? value.toFixed(digits) : "n/a";

function curve(mu: number, current: number): Chart {
	/*
	 * The x axis is utilisation rather than arrival rate, because the shape is the point and it is the
	 * same shape for every system. Stopping at 0.98 is deliberate: the formula diverges at 1, and a
	 * chart whose last point is infinity tells you nothing about the interesting part.
	 */
	const xs: number[] = [];
	for (let rho = 0.05; rho <= 0.981; rho += 0.05) xs.push(Math.round(rho * 100) / 100);
	const latency = xs.map((rho) => (1 / (mu - rho * mu)) * 1000);
	const inSystem = xs.map((rho) => rho / (1 - rho));
	return {
		xLabel: "Utilisation",
		yLabel: "Time in system",
		yUnit: "ms",
		xUnit: "ρ",
		x: xs,
		series: [
			{ label: "Time in system", points: latency, unit: "ms", shape: "line" },
			{ label: "Jobs in system", points: inSystem, unit: "jobs", shape: "line", axis: "right" },
		],
		annotations: [{ x: Math.round(current * 100) / 100, label: `you are here (ρ ${fmt(current, 2)})` }],
		yLabelRight: "Jobs in system",
	};
}

const tool: Tool<Input> = {
	async run({ arrivals, service, samples, seed }, ctx) {
		const lambda = arrivals;
		const mu = 1000 / service;

		if (lambda >= mu) {
			/*
			 * Not a crash, and not a number: at ρ ≥ 1 the queue never drains, so every "mean" is
			 * infinite. Saying that plainly, against the input that caused it, is the correct answer.
			 */
			return {
				kind: "error",
				message:
					`At ${arrivals} arrivals/s and ${service} ms of service, one server can handle ${fmt(mu, 0)}/s. ` +
					"The queue never drains, so there is no steady state to report. Lower the arrival rate or speed up service.",
				input: "arrivals",
			};
		}

		const a = analytic(lambda, mu);

		// Partial results, so a long run shows itself converging instead of hiding behind a bar.
		// #region ctx
		const simulated = simulate(lambda, mu, samples, seed, (done, meanSoFar) => {
			if (ctx.signal.aborted) return;
			ctx.progress(done / samples, {
				kind: "fields",
				fields: [
					{ label: "samples so far", value: done.toLocaleString() },
					{ label: "simulated mean", value: `${fmt(meanSoFar)} ms` },
					{ label: "formula says", value: `${fmt(a.w)} ms` },
				],
			});
		});
		// #endregion

		const error = a.w === 0 ? 0 : ((simulated - a.w) / a.w) * 100;
		const agrees = Math.abs(error) < 5;

		const fields: Field[] = [
			{ label: "utilisation", value: fmt(a.rho, 3), note: "ρ = arrivals ÷ capacity" },
			{ label: "time in system", value: `${fmt(a.w)} ms`, group: "Formula" },
			{ label: "time waiting", value: `${fmt(a.wq)} ms`, group: "Formula" },
			{ label: "jobs in system", value: fmt(a.l), group: "Formula" },
			{ label: "jobs waiting", value: fmt(a.lq), group: "Formula" },
			{ label: "time in system", value: `${fmt(simulated)} ms`, group: "Simulation", note: `${samples.toLocaleString()} samples, seed ${seed}` },
			{
				label: "difference",
				value: `${error >= 0 ? "+" : ""}${fmt(error, 1)}%`,
				group: "Simulation",
				tone: agrees ? "good" : "warn",
				note: agrees ? "the two methods agree" : "more samples would narrow this",
			},
		];

		return {
			kind: "group",
			parts: [
				{ kind: "series", chart: curve(mu, a.rho) },
				{ kind: "fields", fields },
			],
		} satisfies Output;
	},
};

export default tool;
