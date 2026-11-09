const STATE_CHANGE_EVENT = 'Expo.nativeUpdatesStateChangeEvent';

function evaluateUpdatesEmitter() {
  jest.isolateModules(() => {
    require('../UpdatesEmitter');
  });
}

it(`doesn't subscribe to the shared module on the server`, () => {
  // Server rendering in development evaluates the whole bundle again for each request, while the
  // module registered with `registerWebModule` lives on `globalThis` and is shared between them.
  evaluateUpdatesEmitter();
  evaluateUpdatesEmitter();
  evaluateUpdatesEmitter();

  const ExpoUpdatesModule = globalThis.expo.modules.ExpoUpdates;
  expect(ExpoUpdatesModule).toBeDefined();
  expect(ExpoUpdatesModule.listenerCount(STATE_CHANGE_EVENT)).toBe(0);
});
