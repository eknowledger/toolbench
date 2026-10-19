---
"@toolbench/sdk": patch
"@toolbench/runtime": patch
---

**Fixed: a manifest link could run script in the host page.** `links[].href` was checked only as a string and written straight into `<a href>`, so a manifest carrying `javascript:...` rendered a link that ran in the host's origin when a reader followed it. The validator now refuses a link that does not resolve to `http`, `https` or `mailto`, or that contains a space or a control character, and the element renders such a link as plain text even from a source that never validated. The check asks the browser's own URL parser for the scheme, because the parser strips tab and newline before reading it and a pattern on the text can be walked past.

**Fixed: a code result could add any class to its element.** `lang` was written into `class="language-<lang>"`, and a class attribute is a list, so `json tb-hidden` put a class of the tool's choosing on the element. The class is now written only when `lang` is a single language name.

⚠️ **Heads-up:** validation is narrower. A manifest whose link has a space in it, or another scheme such as `ftp:`, was accepted before and is now refused with the field named. Encode the space as `%20`.
