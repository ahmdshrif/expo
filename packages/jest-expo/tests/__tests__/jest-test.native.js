it(`native only`, () => {
  const { Platform } = require('expo-modules-core');
  expect(['ios', 'android'].includes(Platform.OS)).toBe(true);
  expect(Platform.OS).toMatchSnapshot();
});

it('mocks the AssetRegistry from react-native', () => {
  const { AssetRegistry } = require('react-native');
  expect(AssetRegistry.getAssetByID(1)).toMatchObject({ name: 'name' });
});

it('returns a removable subscription from addListener of a mocked native module', () => {
  const { requireNativeModule } = require('expo-modules-core');
  const subscription = requireNativeModule('ExpoNotificationsHandlerModule').addListener(
    'onHandleNotification',
    () => {}
  );
  expect(subscription.remove).toEqual(expect.any(Function));
  expect(() => subscription.remove()).not.toThrow();
});
