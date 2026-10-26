/**
 * Bring a value arriving from outside the form into what its spec allows.
 *
 * Used by typed input, by sample buttons, and by the host `values` setter. A host is not more
 * trustworthy than a reader, so the three paths share this: a number outside min/max is clamped,
 * an invalid select falls back to the default, and a string longer than maxLength is cut.
 *
 * `validateManifest` already refuses a sample outside those bounds, so for samples this is a
 * backstop rather than the guard. A host-set value never went through that check.
 */
import type { InputSpec, InputValues } from "@toolbench/sdk";

export function coerce(spec: InputSpec, value: string | number | boolean): string | number | boolean {
	switch (spec.type) {
		case "number": {
			const n = Number(value);
			return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.default;
		}
		case "toggle":
			return Boolean(value);
		case "select":
			return spec.options.some((option) => option.value === String(value)) ? String(value) : spec.default;
		default: {
			const text = String(value);
			return spec.maxLength !== undefined ? text.slice(0, spec.maxLength) : text;
		}
	}
}

/**
 * Merge a partial set of values onto the current form state.
 *
 * Unspecified inputs keep their current value. Unknown ids are ignored: they are not inputs, and
 * writing them into the map would make `run` see keys the tool never declared.
 */
export function applyPartialValues(inputs: readonly InputSpec[], current: InputValues, partial: InputValues): InputValues {
	const next: InputValues = { ...current };
	for (const spec of inputs) {
		const value = partial[spec.id];
		if (value === undefined) continue;
		next[spec.id] = coerce(spec, value);
	}
	return next;
}
