/**
 * No overlaps on seeded graphs of 30, 60 and 120 nodes (#152), in every `pnpm test`. The 250 and 500 node
 * graphs, where the reviewed mockup's overlaps were, are `pnpm test:graph-scale`: they took the suite from under
 * a second to 25, and CI runs them as a step of their own on every pull request. See test/graph/scale.ts.
 */
import { noOverlapsAt } from "../test/graph/scale.ts";

noOverlapsAt([30, 60, 120]);
