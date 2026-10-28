'use client';
import * as React from 'react';
import { Animated } from 'react-native';

import type { BottomTabViewState } from '../types';

export function useAnimatedHashMap({ routes, index }: BottomTabViewState) {
  const refs = React.useRef<Record<string, Animated.Value>>({});
  const previousRoutesRef = React.useRef<BottomTabViewState['routes']>([]);
  const previous = refs.current;
  const previousRoutes = previousRoutesRef.current;
  const routeKeys = Object.keys(previous);

  if (
    routes.length === routeKeys.length &&
    routes.every((route) => routeKeys.includes(route.key))
  ) {
    return previous;
  }
  refs.current = {};
  previousRoutesRef.current = routes;

  routes.forEach(({ key, name }, i) => {
    // A route can replace one with the same name but a different key, e.g. when an unvisited
    // lazy tab's placeholder is replaced by the real route on first visit. Reuse the replaced
    // route's value so the screen animates from where it was instead of starting at its target.
    const replaced = previousRoutes.find(
      (route) => route.name === name && !routes.some((r) => r.key === route.key)
    );

    refs.current[key] =
      previous[key] ??
      (replaced && previous[replaced.key]) ??
      new Animated.Value(i === index ? 0 : i >= index ? 1 : -1);
  });

  return refs.current;
}
