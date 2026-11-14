import { gestureActivationCriteria } from '../gestureActivationCriteria';

const layout = { width: 400, height: 800 };

// Props that `PanGestureHandler` stopped accepting in react-native-gesture-handler 2.0.
// They are filtered out before reaching the native handler, so the card gesture
// would have no direction limits.
const LEGACY_PAN_PROPS = [
  'minDeltaX',
  'minDeltaY',
  'maxDeltaX',
  'maxDeltaY',
  'minOffsetX',
  'minOffsetY',
];

describe(gestureActivationCriteria, () => {
  it('uses activeOffsetX and failOffsetY for horizontal gestures', () => {
    expect(
      gestureActivationCriteria({ direction: 'ltr', gestureDirection: 'horizontal', layout })
    ).toEqual({
      activeOffsetX: 5,
      failOffsetY: [-20, 20],
      hitSlop: { right: -layout.width + 50 },
      enableTrackpadTwoFingerGesture: true,
    });
  });

  it('uses a negative activeOffsetX for inverted horizontal gestures', () => {
    expect(
      gestureActivationCriteria({
        direction: 'ltr',
        gestureDirection: 'horizontal-inverted',
        layout,
      })
    ).toEqual({
      activeOffsetX: -5,
      failOffsetY: [-20, 20],
      hitSlop: { left: -layout.width + 50 },
      enableTrackpadTwoFingerGesture: true,
    });

    expect(
      gestureActivationCriteria({ direction: 'rtl', gestureDirection: 'horizontal', layout })
    ).toEqual({
      activeOffsetX: -5,
      failOffsetY: [-20, 20],
      hitSlop: { left: -layout.width + 50 },
      enableTrackpadTwoFingerGesture: true,
    });
  });

  it('uses activeOffsetY and failOffsetX for vertical gestures', () => {
    expect(
      gestureActivationCriteria({ direction: 'ltr', gestureDirection: 'vertical', layout })
    ).toEqual({
      failOffsetX: [-15, 15],
      activeOffsetY: 5,
      hitSlop: { bottom: -layout.height + 135 },
      enableTrackpadTwoFingerGesture: true,
    });

    expect(
      gestureActivationCriteria({
        direction: 'ltr',
        gestureDirection: 'vertical-inverted',
        layout,
      })
    ).toEqual({
      failOffsetX: [-15, 15],
      activeOffsetY: -5,
      hitSlop: { top: -layout.height + 135 },
      enableTrackpadTwoFingerGesture: true,
    });
  });

  it('respects gestureResponseDistance', () => {
    expect(
      gestureActivationCriteria({
        direction: 'ltr',
        gestureDirection: 'horizontal',
        gestureResponseDistance: layout.width,
        layout,
      }).hitSlop
    ).toEqual({ right: 0 });
  });

  it.each(['horizontal', 'horizontal-inverted', 'vertical', 'vertical-inverted'] as const)(
    'does not return props that PanGestureHandler ignores (%s)',
    (gestureDirection) => {
      const criteria = gestureActivationCriteria({ direction: 'ltr', gestureDirection, layout });

      for (const prop of LEGACY_PAN_PROPS) {
        expect(criteria).not.toHaveProperty(prop);
      }
    }
  );
});
