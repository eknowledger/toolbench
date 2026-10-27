/**
 * The checks `<tool-host>` makes before every run (#203, #204), fetched with a tool's code when it activates
 * so the first Run never waits on a request.
 *
 * Apart from the validation chunk, because a site whose manifests the build plugin checked never fetches
 * that, and a reader still types values.
 */
export { inputProblem } from "@toolbench/sdk";
