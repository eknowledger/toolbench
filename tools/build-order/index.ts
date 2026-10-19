/**
 * Build order: which packages can be built in which round, drawn as the dependency graph they come from.
 *
 * The tool exists so the `graph` output kind added in contract version 7 has a real tool behind it, and it
 * is a real tool rather than a stub because a renderer nobody uses is a renderer nobody has looked at. It
 * covers what a graph result needs to get right: a layered graph laid out by the runtime, a highlighted path
 * (the longest chain, which bounds how fast a build can be), badges, a graph as one part of a group beside
 * fields, and the case where the answer is that there is no answer, a cycle, drawn with the cycle marked.
 */
import type { Graph, Output, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { deps: string };

type Parsed = { order: string[]; needs: Map<string, string[]> } | { error: string; at: number; len: number };

/**
 * One package per line, `name: dependency, dependency`. A name with no colon is a package with no
 * dependencies; a dependency never declared on a line of its own is one too. Blank lines are skipped.
 */
export function parse(text: string): Parsed {
	const order: string[] = [];
	const needs = new Map<string, string[]>();
	const add = (name: string) => {
		if (!needs.has(name)) (needs.set(name, []), order.push(name));
	};
	const name = /^[A-Za-z0-9@._/-]+$/;
	let at = 0;
	for (const line of text.split("\n")) {
		const start = at;
		at += line.length + 1;
		if (!line.trim()) continue;
		const colon = line.indexOf(":");
		const head = (colon < 0 ? line : line.slice(0, colon)).trim();
		if (!name.test(head)) return { error: `"${head || line.trim()}" is not a package name. Use letters, digits and . _ - / @.`, at: start + line.indexOf(head || line.trim()), len: (head || line.trim()).length };
		add(head);
		if (colon < 0) continue;
		const list = line.slice(colon + 1);
		let from = start + colon + 1;
		for (const part of list.split(",")) {
			const dep = part.trim();
			const offset = from + part.indexOf(dep);
			from += part.length + 1;
			if (!dep) continue;
			if (!name.test(dep)) return { error: `"${dep}" is not a package name.`, at: offset, len: dep.length };
			if (dep === head) return { error: `"${head}" depends on itself.`, at: offset, len: dep.length };
			const mine = needs.get(head)!;
			if (!mine.includes(dep)) mine.push(dep);
		}
	}
	for (const deps of [...needs.values()]) for (const dep of deps) add(dep);
	return { order, needs };
}

/** The first cycle met walking the packages in the order they were written, as names, closed. */
function cycleIn(order: string[], needs: Map<string, string[]>): string[] | undefined {
	const state = new Map<string, number>();
	const path: string[] = [];
	const walk = (n: string): string[] | undefined => {
		state.set(n, 1);
		path.push(n);
		for (const d of needs.get(n)!) {
			if (state.get(d) === 1) return [...path.slice(path.indexOf(d)), d];
			if (!state.has(d)) {
				const found = walk(d);
				if (found) return found;
			}
		}
		path.pop();
		state.set(n, 2);
		return undefined;
	};
	for (const n of order) {
		if (state.has(n)) continue;
		const found = walk(n);
		if (found) return found;
	}
	return undefined;
}

function graphOf(order: string[], needs: Map<string, string[]>, round: Map<string, number> | undefined, highlight: string[]): Graph {
	return {
		label: "Package dependencies",
		// Dependencies below what needs them, so the build reads upwards, round by round.
		direction: "BT",
		// The badge is the round a package builds in.
		nodes: order.map((id) => (round ? { id, badge: String(round.get(id)) } : { id })),
		// From a dependency to what needs it: the arrow says "is built before".
		edges: order.flatMap((pkg) => needs.get(pkg)!.map((dep) => ({ from: dep, to: pkg }))),
		highlight,
	};
}

export default {
	run({ deps }): Output {
		const parsed = parse(deps);
		if ("error" in parsed) return { kind: "error", message: parsed.error, input: "deps", at: parsed.at, len: parsed.len };
		const { order, needs } = parsed;
		if (order.length === 0) return { kind: "error", message: "No packages. Write one per line, as name: dependency, dependency.", input: "deps" };

		const cycle = cycleIn(order, needs);
		if (cycle) {
			// Drawn against the direction of the edges, so the highlighted path runs the way the arrows do.
			const path = [...cycle].reverse();
			return {
				kind: "group",
				parts: [
					{ kind: "fields", fields: [{ label: "Build order", value: "none", note: "a cycle", tone: "bad", role: "verdict" }, { label: "Cycle", value: cycle.join(" → ") }] },
					{ kind: "graph", graph: graphOf(order, needs, undefined, path) },
				],
			};
		}

		// The round each package can be built in: one more than its latest dependency.
		const round = new Map<string, number>();
		const level = (n: string): number => {
			const known = round.get(n);
			if (known !== undefined) return known;
			const r = 1 + Math.max(0, ...needs.get(n)!.map(level));
			round.set(n, r);
			return r;
		};
		for (const n of order) level(n);
		const rounds = Math.max(...round.values());
		const built = [...order].sort((a, b) => round.get(a)! - round.get(b)! || order.indexOf(a) - order.indexOf(b));
		const widest = Math.max(...Array.from({ length: rounds }, (_, r) => built.filter((n) => round.get(n) === r + 1).length));
		// The longest chain, from the first package in the last round down through a dependency a round lower.
		const chain = [built.find((n) => round.get(n) === rounds)!];
		while (round.get(chain.at(-1)!)! > 1) {
			const top = chain.at(-1)!;
			chain.push(needs.get(top)!.find((d) => round.get(d) === round.get(top)! - 1)!);
		}
		const up = [...chain].reverse();
		return {
			kind: "group",
			parts: [
				{
					kind: "fields",
					fields: [
						{ label: "Build order", value: built.join(", "), role: "verdict" },
						{ label: "Rounds", value: String(rounds), note: `up to ${widest} at once` },
						{ label: "Longest chain", value: up.join(" → "), note: `${up.length} package${up.length === 1 ? "" : "s"}` },
					],
				},
				{ kind: "graph", graph: graphOf(order, needs, round, up) },
			],
		};
	},
} satisfies Tool<Input>;
