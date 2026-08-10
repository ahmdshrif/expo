import {
  createMetroServerAndBundleRequestAsync,
  exportEmbedAssetsAsync,
} from 'expo/internal/unstable-expo-updates-cli-exports';
import fs from 'fs';

import { createManifestForBuildAsync } from '../createManifestForBuildAsync';

jest.mock('expo/config/paths', () => ({
  resolveEntryPoint: jest.fn(() => 'index.js'),
}));

jest.mock('expo/internal/unstable-expo-updates-cli-exports', () => ({
  drawableFileTypes: new Set(['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'psd', 'svg', 'xml']),
  createMetroServerAndBundleRequestAsync: jest.fn(),
  exportEmbedAssetsAsync: jest.fn(),
}));

jest.mock('fs');

const server = { end: jest.fn() };

function readWrittenManifest() {
  const call = jest.mocked(fs.writeFileSync).mock.calls[0];
  expect(call).toBeDefined();
  return JSON.parse(call![1] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(createMetroServerAndBundleRequestAsync)
    .mockResolvedValue({ server, bundleRequest: {} } as any);
});

describe(createManifestForBuildAsync, () => {
  it('keeps each iOS asset entry paired with the hash of its own scale', async () => {
    jest.mocked(exportEmbedAssetsAsync).mockResolvedValue([
      {
        name: 'checkSmall',
        type: 'png',
        httpServerLocation: '/assets/node_modules/react-native-ui-lib/src/assets',
        scales: [1, 1.5, 2, 3, 4],
        fileHashes: ['hash-1x', 'hash-1.5x', 'hash-2x', 'hash-3x', 'hash-4x'],
      },
    ] as any);

    await createManifestForBuildAsync('ios', process.cwd(), '/tmp/destination');

    // iOS only supports @1x/@2x/@3x, but `fileHashes` is parallel to the full,
    // unfiltered `scales` list, so the scales that survive filtering have to
    // keep their original hash.
    expect(readWrittenManifest().assets).toEqual([
      expect.objectContaining({ scale: 1, packagerHash: 'hash-1x' }),
      expect.objectContaining({ scale: 2, packagerHash: 'hash-2x' }),
      expect.objectContaining({ scale: 3, packagerHash: 'hash-3x' }),
    ]);
  });

  it('keeps the hash of the fallback scale when no iOS scale matches', async () => {
    jest.mocked(exportEmbedAssetsAsync).mockResolvedValue([
      {
        name: 'oversized',
        type: 'png',
        httpServerLocation: '/assets/images',
        scales: [1.5, 4],
        fileHashes: ['hash-1.5x', 'hash-4x'],
      },
    ] as any);

    await createManifestForBuildAsync('ios', process.cwd(), '/tmp/destination');

    expect(readWrittenManifest().assets).toEqual([
      expect.objectContaining({ scale: 4, packagerHash: 'hash-4x' }),
    ]);
  });

  it('keeps every scale and hash on Android', async () => {
    jest.mocked(exportEmbedAssetsAsync).mockResolvedValue([
      {
        name: 'checkSmall',
        type: 'png',
        httpServerLocation: '/assets/images',
        scales: [1, 1.5, 2, 3, 4],
        fileHashes: ['hash-1x', 'hash-1.5x', 'hash-2x', 'hash-3x', 'hash-4x'],
      },
    ] as any);

    await createManifestForBuildAsync('android', process.cwd(), '/tmp/destination');

    expect(readWrittenManifest().assets).toEqual([
      expect.objectContaining({ scale: 1, packagerHash: 'hash-1x' }),
      expect.objectContaining({ scale: 1.5, packagerHash: 'hash-1.5x' }),
      expect.objectContaining({ scale: 2, packagerHash: 'hash-2x' }),
      expect.objectContaining({ scale: 3, packagerHash: 'hash-3x' }),
      expect.objectContaining({ scale: 4, packagerHash: 'hash-4x' }),
    ]);
  });
});
