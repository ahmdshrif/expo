---
'jest-expo': patch
---

Fix `Module "1" is missing from the asset registry` when rendering assets (such as `@expo/vector-icons`) in tests. The asset registry mock now also covers the `AssetRegistry` exported from `react-native`, which `expo-asset` uses since React Native 0.88.
