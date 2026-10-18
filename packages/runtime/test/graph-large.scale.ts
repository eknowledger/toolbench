/**
 * No overlaps on seeded graphs of 250 and 500 nodes (#152): `pnpm test:graph-scale`, a CI step of its own.
 *
 * ⚠️ Named `.scale.ts`, not `.test.ts`, so `pnpm test`'s glob does not pick it up: in that suite these graphs
 * took it from under a second to 25. Overlaps at these sizes were what the reviewed mockup got wrong, so CI runs
 * this on every pull request rather than leaving it to be remembered. See graph/scale.ts.
 */
import { noOverlapsAt } from "./graph/scale.ts";

noOverlapsAt([250, 500]);
