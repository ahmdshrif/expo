---
'@expo/ui': patch
---

Fix the universal `Text` on web ignoring the `colorScheme` of its `Host`. The default text color now follows the Host's foreground color, like the other universal web components, and falls back to the system color scheme outside a `Host`.
