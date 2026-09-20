/**
 * Hand-maintained mock for the ExpoNavigationBar native module.
 *
 * `expo-modules-test-core` reflects mocks from the Swift implementations, so a module that only
 * exists on Android never reaches `jest-expo`'s generated table
 * (`jest-expo/src/preset/moduleMocks/expoModules.js`). `ExpoNavigationBar` is declared solely in
 * `android/src/main/java/expo/modules/navigationbar/NavigationBarModule.kt`, so without this file
 * `requireNativeModule('ExpoNavigationBar')` throws `Cannot find native module 'ExpoNavigationBar'`
 * under `jest-expo/android`, and importing `expo-navigation-bar` at all takes a suite down —
 * `NavigationBar.android.ts` reaches the native module at module scope.
 *
 * The mock keeps the visibility flag in memory so that `setHidden` and `getVisibilityAsync` agree,
 * and emits `ExpoNavigationBar.didChange` when it changes, which is what `addVisibilityListener`
 * and `useVisibility` subscribe to. Behavior stops there: `setStyle` is a no-op, because there is
 * no navigation bar to color, and no event arrives on its own the way the native
 * `setOnSystemUiVisibilityChangeListener` delivers one.
 *
 * DO NOT regenerate this file with `expo-modules-test-core`; it has no Swift source to reflect and
 * would emit a bare stub over the behavior here. Same pattern as
 * `packages/expo-video/mocks/ExpoVideo.ts`.
 */

import type {
  NavigationBarVisibility,
  NavigationBarVisibilityEvent,
} from '../src/NavigationBar.types';

const VISIBILITY_EVENT_NAME = 'ExpoNavigationBar.didChange';

// `View.SYSTEM_UI_FLAG_HIDE_NAVIGATION`. The native module forwards the raw flags it is handed by
// `setOnSystemUiVisibilityChangeListener`, and derives `visibility` from this bit.
const SYSTEM_UI_FLAG_HIDE_NAVIGATION = 0x00000002;

// `requireMockModule` copies these onto a `NativeModule` instance, so `this` is the emitter the
// module's consumers listen on.
type VisibilityEmitter = {
  emit?: (eventName: typeof VISIBILITY_EVENT_NAME, event: NavigationBarVisibilityEvent) => void;
};

// Android shows the navigation bar until something hides it.
let visibility: NavigationBarVisibility = 'visible';

export async function setStyle(style: 'light' | 'dark'): Promise<void> {}

export async function setHidden(this: VisibilityEmitter, hidden: boolean): Promise<void> {
  const nextVisibility: NavigationBarVisibility = hidden ? 'hidden' : 'visible';
  if (nextVisibility === visibility) {
    return;
  }

  visibility = nextVisibility;
  this.emit?.(VISIBILITY_EVENT_NAME, {
    visibility,
    rawVisibility: hidden ? SYSTEM_UI_FLAG_HIDE_NAVIGATION : 0,
  });
}

export async function getVisibilityAsync(): Promise<NavigationBarVisibility> {
  return visibility;
}
