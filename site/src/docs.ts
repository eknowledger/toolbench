// The docs pages run no tool, so they do not load the runtime: the theme switch, copy buttons, and this.
import "./theme.ts";
import "./copy.ts";
import "./panels.ts";

// A page that embeds a live tool loads the runtime; every other docs page stays without it.
if (document.querySelector("tool-host")) void import("./docs-tools.ts");

import { followSections } from "./spy.ts";

followSections(".docs-toc", ".prose h2[id], .prose h3[id]");
