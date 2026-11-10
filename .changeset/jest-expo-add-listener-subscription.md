---
'jest-expo': patch
---

Return a subscription with a `remove` method from the `addListener` mock of native modules that have no hand-written mock. `expo-notifications` subscribes its default notification handler on import, so calling `setNotificationHandler()` under `jest-expo` threw `handleSubscription.remove is not a function`.
