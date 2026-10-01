---
"@toolbench/runtime": patch
---

**Fixed: a second y axis shows its title, and an area chart fills from zero.** `yLabelRight` was accepted but never drawn, and an area's fill started at the lowest value instead of at zero, which overstated every difference.
