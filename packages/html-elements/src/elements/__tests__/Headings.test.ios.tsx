import { render } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import * as Headings from '../Headings';

const headingComponentNames = Object.keys(Headings);

it.each(headingComponentNames)('renders %s', async (name) => {
  const Heading = Headings[name as keyof typeof Headings];
  const { toJSON } = await render(<Heading />);
  expect(toJSON()).toMatchSnapshot();
});

it('leaves scaling by the system font size to React Native', async () => {
  // The React Native jest setup reports a system font scale other than 1.
  expect(PixelRatio.getFontScale()).not.toBe(1);

  const { toJSON } = await render(<Headings.H4 />);
  // An h4 is 1em (16px), the same as a `Text` with `fontSize: 16`, which React Native scales itself.
  expect(StyleSheet.flatten((toJSON() as any).props.style)).toMatchObject({ fontSize: 16 });
});
