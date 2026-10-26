---
"@toolbench/sdk": minor
"@toolbench/runtime": minor
---

**New: Inputs kept out of links.** `"share": false` on an input tells a host's links to leave it out. <!-- whats-new: docs=docs-ref-inputs.html#common-attributes -->

A host building a shareable link from `host.values` leaves that input out and does not read it back, for a password or pasted private material. ([#211](https://github.com/eknowledger/toolbench/issues/211))

- Contract version 8. Without `share`, an input is shareable, as before.
- A hint for hosts, not access control: the runtime builds no links and enforces nothing. `shareableInputs(manifest)` in `@toolbench/sdk` lists the inputs a link may carry.
