/**
 * Every tool's fixtures, run against the current contract.
 *
 * This is the mechanism behind the compatibility promise in `docs/versioning.md`: it walks this
 * directory, so a new tool is covered the moment it exists and nobody has to remember to add a test, and
 * it re-runs **every** tool's cases on **every** change to the SDK or the runtime. That is what makes
 * "old tools keep working" a tested claim rather than an intention.
 *
 * The walk itself now lives in `@toolbench/sdk/fixtures`, because a host authoring its own tools needs
 * exactly these guarantees and was otherwise going to copy them. Keeping this file as a call to the
 * exported helper means the extraction is proven by the thing it was extracted from: if the helper stops
 * enforcing something, this suite stops enforcing it too, and the tools here notice first.
 */
import { describe, it } from "node:test";
import { checkToolDirectory } from "../packages/sdk/src/fixtures.ts";

checkToolDirectory(new URL(".", import.meta.url), { describe, it, label: "tools" });
