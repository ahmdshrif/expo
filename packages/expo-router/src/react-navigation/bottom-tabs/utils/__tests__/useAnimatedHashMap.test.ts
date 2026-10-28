import { renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';

import type { BottomTabViewState } from '../../types';
import { useAnimatedHashMap } from '../useAnimatedHashMap';

function createState(keys: [string, string][], index: number): BottomTabViewState {
  return {
    index,
    routes: keys.map(([key, name]) => ({ key, name })),
  } as BottomTabViewState;
}

function getValue(value: Animated.Value | undefined) {
  return (value as unknown as { __getValue(): number }).__getValue();
}

it('initializes values relative to the focused route', () => {
  const { result } = renderHook(() =>
    useAnimatedHashMap(
      createState(
        [
          ['home-1', 'home'],
          ['feed-1', 'feed'],
          ['settings-1', 'settings'],
        ],
        1
      )
    )
  );

  expect(getValue(result.current['home-1'])).toBe(-1);
  expect(getValue(result.current['feed-1'])).toBe(0);
  expect(getValue(result.current['settings-1'])).toBe(1);
});

it('keeps the values of existing routes when routes change', () => {
  const { result, rerender } = renderHook(
    ({ state }: { state: BottomTabViewState }) => useAnimatedHashMap(state),
    {
      initialProps: {
        state: createState(
          [
            ['home-1', 'home'],
            ['settings-1', 'settings'],
          ],
          0
        ),
      },
    }
  );
  const home = result.current['home-1'];

  rerender({
    state: createState(
      [
        ['home-1', 'home'],
        ['settings-1', 'settings'],
        ['profile-1', 'profile'],
      ],
      2
    ),
  });

  expect(result.current['home-1']).toBe(home);
  expect(getValue(result.current['profile-1'])).toBe(0);
});

it('reuses the value of a placeholder route replaced by the real route on first visit', () => {
  const { result, rerender } = renderHook(
    ({ state }: { state: BottomTabViewState }) => useAnimatedHashMap(state),
    {
      initialProps: {
        state: createState(
          [
            ['home-1', 'home'],
            ['settings', 'settings'],
          ],
          0
        ),
      },
    }
  );
  const placeholder = result.current['settings'];
  expect(getValue(placeholder)).toBe(1);

  rerender({
    state: createState(
      [
        ['home-1', 'home'],
        ['settings-1', 'settings'],
      ],
      1
    ),
  });

  // The incoming route must start from its entering position so it can animate to 0
  expect(result.current['settings-1']).toBe(placeholder);
  expect(getValue(result.current['settings-1'])).toBe(1);
  expect(result.current['settings']).toBeUndefined();
});
