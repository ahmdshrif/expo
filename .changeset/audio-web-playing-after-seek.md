---
'expo-audio': patch
---

[Web] Fix `playing` reported as `false` in the status update after a seek to the start, or into a range that is not buffered yet, while the audio keeps playing.
