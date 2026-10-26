import { Platform } from 'react-native';

export function rem(value: number): number | string {
  if (Platform.OS === 'web') return `${value}rem`;
  // React Native already scales `fontSize` by the system font scale (`allowFontScaling`),
  // so multiplying by `PixelRatio.getFontScale()` here would apply it twice.
  return 16 * value;
}

export function em(value: number): number | string {
  if (Platform.OS === 'web') return `${value}em`;
  return rem(value);
}
