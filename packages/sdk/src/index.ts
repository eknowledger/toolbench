/**
 * @toolbench/sdk — the contract a tool implements.
 *
 * A tool is one function plus one manifest. Nothing here touches the DOM, a framework, or a host
 * site, which is what lets a tool be tested in plain Node and reused by any runtime.
 *
 *   import type { Tool } from "@toolbench/sdk";
 *
 *   export default {
 *     run({ value }, ctx) {
 *       return { kind: "fields", fields: [{ label: "doubled", value: String(Number(value) * 2) }] };
 *     },
 *   } satisfies Tool<{ value: string }>;
 */
export {
	CAPABILITIES,
	INPUT_TYPES,
	OUTPUT_KINDS,
	type Capability,
	type Case,
	type ByteRange,
	type Cell,
	type Chart,
	type Column,
	type Ctx,
	type Field,
	type InputSpec,
	type InputType,
	type InputValue,
	type Row,
	type RowColumn,
	type RowColumnBase,
	type InputValues,
	type LoadedTool,
	type Manifest,
	type Output,
	type OutputKind,
	type Sample,
	type SelectOption,
	type TextareaGrammar,
	type Heatmap,
	type Pie,
	type Radar,
	type Treemap,
	type TreemapNode,
	type Venn,
	type Graph,
	type GraphColor,
	type GraphEdge,
	type GraphGroup,
	type GraphLane,
	type GraphMarker,
	type GraphNode,
	type GraphRow,
	type GraphShape,
	type GraphSide,
	type Readout,
	type Series,
	type Tone,
	type TextTone,
	type PartNames,
	type Tool,
	type ToolModule,
} from "./types.ts";

export { ManifestError, describeSdkVersion, validateManifest } from "./validate.ts";
export { inputProblem } from "./inputs.ts";
export { VALIDATED_KEY } from "./brand.ts";
export { isSafeLinkHref } from "./links.ts";
export { shareableInputs } from "./share.ts";
export { GRAPH_COLORS, graphProblem } from "./graph.ts";
export { checkManifestFeatures, outputFeatureProblem } from "./features.ts";

export { SeedError, defaultInputs, seed, serialiseSeed, type SeedOptions } from "./seed.ts";
export { MIGRATIONS, VersionError, canLoad, upgradeOutput, type Migration } from "./migrate.ts";
export { upgradeManifest } from "./upgrade.ts";
export { assertCases, compare, runCases, testCtx, type CaseResult, type RunCasesOptions } from "./testing.ts";
export { SDK_CHANGELOG, SDK_VERSION, SUPPORTED_SDK_VERSIONS } from "./version.ts";
