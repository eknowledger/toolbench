import type { Output, Row, Tool } from "@toolbench/sdk";

// A type alias, not an interface: an interface does not satisfy the SDK's index-signature constraint.
type Input = { limits: Row[]; methods: string[]; requests: string };

export default {
	run({ limits, methods, requests }): Output {
		const rules = limits.map((row) => ({ path: String(row.path), limit: Number(row.limit) }));
		for (const [i, rule] of rules.entries()) {
			if (!rule.path.startsWith("/")) return { kind: "error", message: `"${rule.path}" must start with "/".`, input: "limits", row: i };
			const same = rules.findIndex((other) => other.path === rule.path);
			if (same < i) return { kind: "error", message: `Path "${rule.path}" is already in row ${same + 1}.`, input: "limits", row: i };
			// A later prefix an earlier one covers can never match, which is what reordering the rows is for.
			const covers = rules.findIndex((other, j) => j < i && rule.path.startsWith(other.path));
			if (covers >= 0) return { kind: "error", message: `"${rule.path}" never matches: row ${covers + 1}, "${rules[covers]?.path}", matches it first. Move it above.`, input: "limits", row: i };
		}
		const rows: (string | number)[][] = [];
		let offset = 0;
		for (const line of requests.split("\n")) {
			const at = offset;
			offset += line.length + 1;
			if (line.trim() === "") continue;
			const [method = "", path = "", extra] = line.trim().split(/\s+/);
			if (extra !== undefined || !path.startsWith("/")) {
				return { kind: "error", message: `"${line.trim()}" is not a method and a path, such as "GET /api/orders".`, input: "requests", at, len: line.length };
			}
			const upper = method.toUpperCase();
			const rule = methods.includes(upper) ? rules.findIndex((r) => path.startsWith(r.path)) : -1;
			rows.push([`${upper} ${path}`, !methods.includes(upper) ? `${upper} is not limited` : rule < 0 ? "no rule matches" : `row ${rule + 1}, ${rules[rule]?.path}`, rule < 0 ? "none" : (rules[rule]?.limit ?? 0)]);
		}
		if (rows.length === 0) return { kind: "error", message: "No requests yet. Add one per line, a method and a path.", input: "requests" };
		return { kind: "table", caption: "The limit each request meets, first match winning", columns: [{ label: "Request" }, { label: "Rule" }, { label: "Limit (req/s)", align: "end" }], rows };
	},
} satisfies Tool<Input>;
