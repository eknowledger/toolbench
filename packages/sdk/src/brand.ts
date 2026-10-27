/**
 * The key of the symbol a build puts on a manifest it validated (`Symbol.for(VALIDATED_KEY)`).
 *
 * ⚠️ A module of its own, because the runtime reads it in the chunk every page loads and build.ts, which
 * writes it, imports the validator. One import of build.ts from the runtime would put the validator back.
 */
export const VALIDATED_KEY = "toolbench.validated";
