---
"@toolbench/runtime": patch
---

**Fixed: undo in Chrome took back one character at a time.** Once a result was on screen, every keystroke rewrote the status line, and Chrome ends an undo group whenever a node is inserted anywhere in the page, so typing "abc def" took 7 presses of undo to take back. The status line is now written only when its text changes, and one undo takes back the burst, as it does in Firefox and WebKit.
