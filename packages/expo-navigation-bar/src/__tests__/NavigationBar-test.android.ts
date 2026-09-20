import ExpoNavigationBar from '../ExpoNavigationBar';
import * as NavigationBar from '../NavigationBar';
import type { NavigationBarVisibilityEvent } from '../NavigationBar.types';

// `ExpoNavigationBar` only exists on Android, so `jest-expo`'s generated mock table — reflected
// from the iOS implementations — can never describe it. These tests cover the hand-written mock in
// `mocks/ExpoNavigationBar.ts` that stands in for it.

// The mock holds the visibility flag in module scope, exactly as the device holds one bar.
afterEach(async () => {
  await NavigationBar.setVisibilityAsync('visible');
});

it('can be imported under the jest-expo preset', () => {
  expect(() => require('../index')).not.toThrow();
});

it('exposes every member the native module declares', () => {
  expect(typeof ExpoNavigationBar.setStyle).toBe('function');
  expect(typeof ExpoNavigationBar.setHidden).toBe('function');
  expect(typeof ExpoNavigationBar.getVisibilityAsync).toBe('function');
  expect(typeof ExpoNavigationBar.addListener).toBe('function');
});

it('reports the navigation bar as visible by default', async () => {
  await expect(NavigationBar.getVisibilityAsync()).resolves.toBe('visible');
});

it('tracks visibility through setVisibilityAsync', async () => {
  await NavigationBar.setVisibilityAsync('hidden');
  await expect(NavigationBar.getVisibilityAsync()).resolves.toBe('hidden');

  await NavigationBar.setVisibilityAsync('visible');
  await expect(NavigationBar.getVisibilityAsync()).resolves.toBe('visible');
});

it('notifies visibility listeners until they are removed', async () => {
  const events: NavigationBarVisibilityEvent[] = [];
  const subscription = NavigationBar.addVisibilityListener((event) => events.push(event));

  await NavigationBar.setVisibilityAsync('hidden');
  expect(events).toEqual([{ visibility: 'hidden', rawVisibility: 2 }]);

  // Only a change is reported, the way the native listener only fires on a change.
  await NavigationBar.setVisibilityAsync('hidden');
  expect(events).toHaveLength(1);

  subscription.remove();
  await NavigationBar.setVisibilityAsync('visible');
  expect(events).toHaveLength(1);
});
