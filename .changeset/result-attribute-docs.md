---
"@toolbench/sdk": patch
---

Every result attribute in the type declarations now has its own description, which an editor shows on hover and the site's Results reference is generated from. The `TreemapNode.value` description no longer says a branch's own value overrides its children's sum: the runtime always draws the sum. No behaviour changes.
