---
'@expo/log-box-utils': patch
'expo-router': patch
---

Fixed the web error overlay for server and static rendering errors in development. `@expo/log-box-utils` is now built as CommonJS so Expo CLI can load it, and `expo-router` exports the `./_error` subpath that Expo CLI resolves for the overlay entry. Previously the dev server fell back to a "Project is not setup correctly for static rendering" page instead of showing the error.
