---
'expo-router': patch
---

Fix the JS stack drag-back gesture activating on vertical swipes (and blocking scrolling) by passing `activeOffset*`/`failOffset*` to `PanGestureHandler` instead of props it no longer supports.
