// Regression tests for the asset registry mock in `jest-expo/src/preset/setup.js`.

describe('asset registry mock', () => {
  it('mocks the AssetRegistry exported from react-native', () => {
    const { AssetRegistry } = require('react-native');
    const assetRegistry = require('react-native/asset-registry');

    expect(AssetRegistry.getAssetByID).toBe(assetRegistry.getAssetByID);
    expect(AssetRegistry.registerAsset).toBe(assetRegistry.registerAsset);
  });

  it('resolves the asset ID that assetFileTransformer compiles assets to', () => {
    const { AssetRegistry } = require('react-native');
    // `assetFileTransformer` compiles every asset to `module.exports = 1;`
    expect(AssetRegistry.getAssetByID(1)).toEqual(expect.objectContaining({ name: 'name' }));
  });
});
