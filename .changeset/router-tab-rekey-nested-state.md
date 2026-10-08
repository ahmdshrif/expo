---
'expo-router': patch
---

Fix a `dangerouslySingular` tab or drawer route that is re-keyed for a new id keeping the previous id's nested navigator state, which showed the old screen and rewrote the URL back to the old id.
