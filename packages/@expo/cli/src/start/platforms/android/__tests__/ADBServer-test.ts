import spawnAsync from '@expo/spawn-async';
import { execFileSync } from 'child_process';
import { vol } from 'memfs';

import * as Log from '../../../../log';
import { AbortCommandError } from '../../../../utils/errors';
import { installExitHooks } from '../../../../utils/exit';
import { ADBServer } from '../ADBServer';

jest.mock('fs', () => jest.requireActual('memfs').fs);
jest.mock('../../../../log');
jest.mock('../../../../utils/exit', () => ({
  installExitHooks: jest.fn(),
}));

const env = process.env;

/** Mimics an ADB client that connects to a wedged ADB server and never exits. */
function mockUnresponsiveAdb() {
  const child = { kill: jest.fn() };
  const promise = new Promise(() => {}) as any;
  promise.child = child;
  jest.mocked(spawnAsync).mockReturnValueOnce(promise);
  return child;
}

beforeEach(() => {
  delete process.env.ANDROID_HOME;
  delete process.env.EXPO_ADB_TIMEOUT;
});

afterEach(() => {
  vol.reset();
  jest.useRealTimers();
});

afterAll(() => {
  process.env = env;
});

describe('getAdbExecutablePath', () => {
  it(`returns the default adb path`, () => {
    const adbPath = new ADBServer().getAdbExecutablePath();
    expect(adbPath).toEqual('adb');
  });
  it(`returns the user defined adb path`, () => {
    vol.fromJSON({ '/Users/user/android/file': '' });
    process.env.ANDROID_HOME = '/Users/user/android';
    const adbPath = new ADBServer().getAdbExecutablePath();
    expect(adbPath).toEqual('/Users/user/android/platform-tools/adb');
  });
  it('warns if Android SDK is not found', () => {
    process.env.ANDROID_HOME = '/Users/user/android';
    new ADBServer().getAdbExecutablePath();
    expect(Log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve the Android SDK path')
    );
  });
});

describe('resolveAdbPromise', () => {
  it(`passes`, async () => {
    const server = new ADBServer();
    await expect(server.resolveAdbPromise(Promise.resolve('foobar'))).resolves.toBe('foobar');
  });
  it(`asserts abort error`, async () => {
    const server = new ADBServer();
    const rejects = (async () => {
      // eslint-disable-next-line no-throw-literal
      throw { signal: 'SIGINT' };
    })();
    await expect(server.resolveAdbPromise(rejects)).rejects.toThrow(AbortCommandError);
  });
  it(`formats error message`, async () => {
    const server = new ADBServer();
    const rejects = (async () => {
      throw new Error('error: foobar');
    })();
    await expect(server.resolveAdbPromise(rejects)).rejects.toThrow(/^foobar$/);
  });
  it(`formats bad user number error`, async () => {
    const server = new ADBServer();
    const rejects = (async () => {
      // eslint-disable-next-line no-throw-literal
      throw {
        status: 255,
        stdout: 'Error: java.lang.IllegalArgumentException: Bad user number: FUNKY\n',
      };
    })();
    await expect(server.resolveAdbPromise(rejects)).rejects.toThrow(
      /^Invalid ADB user number "FUNKY" set with environment variable EXPO_ADB_USER. Run "adb shell pm list users" to see valid user numbers.$/
    );
  });
});

describe('startAsync', () => {
  it(`starts the ADB server`, async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({
      stderr: '* daemon started successfully',
    } as any);
    const server = new ADBServer();
    await expect(server.startAsync()).resolves.toBe(true);
    expect(server.isRunning).toBe(true);
    expect(installExitHooks).toHaveBeenCalledTimes(1);
    expect(spawnAsync).toHaveBeenCalledTimes(1);
  });
  it(`does not start if the server is already running`, async () => {
    const server = new ADBServer();
    server.isRunning = true;
    await expect(server.startAsync()).resolves.toBe(false);
    expect(server.isRunning).toBe(true);
    expect(installExitHooks).toHaveBeenCalledTimes(0);
    expect(spawnAsync).toHaveBeenCalledTimes(0);
  });
  it(`asserts when the ADB server is unresponsive`, async () => {
    jest.useFakeTimers();
    const child = mockUnresponsiveAdb();
    const server = new ADBServer();

    const assertion = expect(server.startAsync()).rejects.toThrow(
      /^ADB did not respond within 15000ms while running "adb start-server"/
    );
    jest.advanceTimersByTime(15000);

    await assertion;
    expect(server.isRunning).toBe(false);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
describe('spawnWithTimeoutAsync', () => {
  it(`waits indefinitely without a timeout`, async () => {
    jest.useFakeTimers();
    mockUnresponsiveAdb();
    const server = new ADBServer();

    const onSettled = jest.fn();
    server.spawnWithTimeoutAsync('adb', ['install', 'app.apk']).then(onSettled, onSettled);
    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    expect(onSettled).not.toHaveBeenCalled();
  });
  it(`waits indefinitely when the timeout is disabled with EXPO_ADB_TIMEOUT`, async () => {
    jest.useFakeTimers();
    process.env.EXPO_ADB_TIMEOUT = '0';
    mockUnresponsiveAdb();
    const server = new ADBServer();

    const onSettled = jest.fn();
    server.startAsync().then(onSettled, onSettled);
    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    expect(onSettled).not.toHaveBeenCalled();
  });
  it(`asserts with the timeout from EXPO_ADB_TIMEOUT`, async () => {
    jest.useFakeTimers();
    process.env.EXPO_ADB_TIMEOUT = '5000';
    mockUnresponsiveAdb();
    const server = new ADBServer();

    const assertion = expect(server.startAsync()).rejects.toThrow(
      /^ADB did not respond within 5000ms/
    );
    jest.advanceTimersByTime(5000);

    await assertion;
  });
});
describe('runAsync', () => {
  it(`runs an ADB command`, async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({
      output: ['did thing'],
      stderr: 'did thing',
    } as any);
    const server = new ADBServer();
    server.startAsync = jest.fn();
    server.resolveAdbPromise = jest.fn(server.resolveAdbPromise);
    server.getAdbExecutablePath = jest.fn(() => 'adb');
    await expect(server.runAsync(['foo', 'bar'])).resolves.toBe('did thing');
    expect(server.getAdbExecutablePath).toHaveBeenCalledTimes(1);
    expect(server.startAsync).toHaveBeenCalledTimes(1);
    expect(server.resolveAdbPromise).toHaveBeenCalledTimes(1);
    expect(spawnAsync).toHaveBeenCalledTimes(1);
    expect(spawnAsync).toHaveBeenCalledWith('adb', ['foo', 'bar']);
  });
  it(`asserts when a bounded command does not respond`, async () => {
    jest.useFakeTimers();
    const child = mockUnresponsiveAdb();
    const server = new ADBServer();
    server.startAsync = jest.fn();
    server.getAdbExecutablePath = jest.fn(() => 'adb');

    const assertion = expect(
      server.runAsync(['devices', '-l'], { timeout: 15000 })
    ).rejects.toThrow(/^ADB did not respond within 15000ms while running "adb devices -l"/);
    await jest.advanceTimersByTimeAsync(15000);

    await assertion;
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
describe('getFileOutputAsync', () => {
  it(`returns file output from ADB`, async () => {
    jest.mocked(execFileSync).mockReturnValueOnce('foobar');
    const server = new ADBServer();
    server.startAsync = jest.fn();
    server.resolveAdbPromise = jest.fn(server.resolveAdbPromise);
    server.getAdbExecutablePath = jest.fn(() => 'adb');
    await expect(server.getFileOutputAsync(['foo', 'bar'])).resolves.toBe('foobar');
    expect(server.getAdbExecutablePath).toHaveBeenCalledTimes(1);
    expect(server.startAsync).toHaveBeenCalledTimes(1);
    expect(server.resolveAdbPromise).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledWith('adb', ['foo', 'bar'], {
      encoding: 'latin1',
      stdio: 'pipe',
    });
  });
});
describe('stopAsync', () => {
  it(`stops the ADB server when running`, async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({ output: [''] } as any);
    const server = new ADBServer();
    server.isRunning = true;
    await expect(server.stopAsync()).resolves.toBe(true);
    expect(server.isRunning).toBe(false);
    expect(spawnAsync).toHaveBeenCalledTimes(1);
  });
  it(`stops the ADB server when not running`, async () => {
    jest.mocked(spawnAsync).mockResolvedValueOnce({ output: [''] } as any);
    const server = new ADBServer();
    server.isRunning = false;
    await expect(server.stopAsync()).resolves.toBe(false);
    expect(spawnAsync).toHaveBeenCalledTimes(0);
  });

  it(`considers the ADB server stopped if the process fails`, async () => {
    const server = new ADBServer();
    server.isRunning = true;
    server.runAsync = jest.fn(() => {
      throw new Error('foobar');
    });
    await expect(server.stopAsync()).resolves.toBe(false);
    expect(server.isRunning).toBe(false);
    expect(Log.error).toHaveBeenCalled();
  });
});
