/**
 * The site's own example tools, held to the same standard as tools/: every manifest validates, its id
 * matches its directory, and its cases.json passes. The Base64 decoder's cases are the ones
 * docs/authoring-a-tool.md prints, so the walkthrough's fixture is checked against its own code.
 */
import { describe, it } from "node:test";
import { checkToolDirectory } from "@toolbench/sdk/fixtures";

checkToolDirectory(new URL("./examples/", import.meta.url), { describe, it });
