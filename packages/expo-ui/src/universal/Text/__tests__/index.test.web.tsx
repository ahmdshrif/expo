/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { StyleSheet } from 'react-native';

import { Text } from '..';
import { Host } from '../../Host';

// react-native-web compiles static styles into atomic classes, and jsdom doesn't resolve CSS
// variables, so read the `color` declared by the element's own classes.
function declaredColor(element: HTMLElement): string | undefined {
  const css: string = (StyleSheet as unknown as { getSheet(): { textContent: string } }).getSheet()
    .textContent;
  for (const className of Array.from(element.classList)) {
    const match = css.match(new RegExp(`\\.${className}\\{color:([^;}]+)`));
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

describe('Text', () => {
  it('uses the Host foreground color so it follows the Host colorScheme', () => {
    render(
      <Host colorScheme="dark">
        <Text>Inside a dark Host</Text>
      </Host>
    );

    expect(declaredColor(screen.getByText('Inside a dark Host'))).toMatch(
      /^var\(--expo-ui-foreground,/
    );
  });

  it('falls back to the system color scheme outside a Host', () => {
    render(<Text>Outside a Host</Text>);

    expect(declaredColor(screen.getByText('Outside a Host'))).toBe(
      'var(--expo-ui-foreground, #000000)'
    );
  });
});
