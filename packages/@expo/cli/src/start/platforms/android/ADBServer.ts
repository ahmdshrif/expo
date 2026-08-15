import spawnAsync from '@expo/spawn-async';
import { execFileSync } from 'child_process';

import { Log } from '../../../log';
import { resolveWithTimeout } from '../../../utils/delay';
import { env } from '../../../utils/env';
import { AbortCommandError, CommandError } from '../../../utils/errors';
import { installExitHooks } from '../../../utils/exit';
import { event } from '../events';
import { assertSdkRoot } from './AndroidSdk';

const BEGINNING_OF_ADB_ERROR_MESSAGE = 'error: ';

// This is a tricky class since it controls a system state (side-effects).
// A more ideal solution would be to implement ADB in JS.
// The main reason this is a class is to control the flow of testing.

export class ADBServer {
  isRunning: boolean = false;
  removeExitHook: () => void = () => {};

  /** Returns the command line reference to ADB. */
  getAdbExecutablePath(): string {
    try {
      const sdkRoot = assertSdkRoot();
      if (sdkRoot) {
        return `${sdkRoot}/platform-tools/adb`;
      }
    } catch (error: any) {
      Log.warn(error.message);
    }

    Log.debug('Failed to resolve the Android SDK path, falling back to global adb executable');
    return 'adb';
  }

  /** Start the ADB server. */
  async startAsync(): Promise<boolean> {
    if (this.isRunning) {
      return false;
    }
    // clean up
    this.removeExitHook = installExitHooks(() => {
      if (this.isRunning) {
        this.stopAsync();
      }
    });
    const adb = this.getAdbExecutablePath();
    const result = await this.resolveAdbPromise(
      this.spawnWithTimeoutAsync(adb, ['start-server'], env.EXPO_ADB_TIMEOUT)
    );
    const lines = result.stderr.trim().split(/\r?\n/);
    const isStarted = lines.includes('* daemon started successfully');
    this.isRunning = isStarted;
    return isStarted;
  }

  /** Kill the ADB server. */
  async stopAsync(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }
    this.removeExitHook();
    try {
      await this.runAsync(['kill-server'], { timeout: env.EXPO_ADB_TIMEOUT });
      return true;
    } catch (error: any) {
      Log.error('Failed to stop ADB server: ' + error.message);
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute an ADB command with given args.
   *
   * Pass a `timeout` for commands that are always expected to return promptly, such as device
   * discovery. Commands that legitimately run for a long time, e.g. `install`, must stay unbounded.
   */
  async runAsync(args: string[], { timeout }: { timeout?: number } = {}): Promise<string> {
    // TODO: Add a global package that installs adb to the path.
    const adb = this.getAdbExecutablePath();

    await this.startAsync();

    event('adb_server_run', { command: [adb, ...args].join(' ') });
    const result = await this.resolveAdbPromise(this.spawnWithTimeoutAsync(adb, args, timeout));
    return result.output.join('\n');
  }

  /**
   * Spawn ADB, rejecting if the process hasn't exited after `timeout` milliseconds.
   *
   * When the resident ADB server is unresponsive — most commonly after a USB device drops off
   * mid-transfer — the ADB client connects to the dead server's socket and blocks forever. Without
   * a timeout the CLI hangs before printing anything, which looks like it silently died.
   * A falsy `timeout` waits indefinitely, preserving the previous behavior.
   */
  spawnWithTimeoutAsync(adb: string, args: string[], timeout?: number) {
    const promise = spawnAsync(adb, args);
    if (!timeout) {
      return promise;
    }
    return resolveWithTimeout(() => promise, {
      timeout,
      errorMessage:
        `ADB did not respond within ${timeout}ms while running "adb ${args.join(' ')}". ` +
        `The ADB server may be unresponsive, this can happen when a device disconnects mid-transfer. ` +
        `Run "adb kill-server" and try again, on Windows you may need to end the "adb.exe" process manually. ` +
        `Use the EXPO_ADB_TIMEOUT environment variable to change this timeout, or set it to 0 to wait indefinitely.`,
    }).catch((error) => {
      if (error instanceof CommandError && error.code === 'TIMEOUT') {
        // Detach from the blocked ADB client, it can never make progress and would keep the
        // process alive after we've given up waiting on it.
        promise.child.kill();
      }
      throw error;
    });
  }

  /** Get ADB file output. Useful for reading device state/settings. */
  async getFileOutputAsync(args: string[]): Promise<string> {
    // TODO: Add a global package that installs adb to the path.
    const adb = this.getAdbExecutablePath();

    await this.startAsync();

    const results = await this.resolveAdbPromise(
      execFileSync(adb, args, {
        encoding: 'latin1',
        stdio: 'pipe',
      })
    );
    event('adb_file_output', { output: results });
    return results;
  }

  /** Formats error info. */
  async resolveAdbPromise<T>(promise: T | Promise<T>): Promise<T> {
    try {
      return await promise;
    } catch (error: any) {
      // User pressed ctrl+c to cancel the process...
      if (error.signal === 'SIGINT') {
        throw new AbortCommandError();
      }
      if (error.status === 255 && error.stdout.includes('Bad user number')) {
        const userNumber = error.stdout.match(/Bad user number: (.+)/)?.[1] ?? env.EXPO_ADB_USER;
        throw new CommandError(
          'EXPO_ADB_USER',
          `Invalid ADB user number "${userNumber}" set with environment variable EXPO_ADB_USER. Run "adb shell pm list users" to see valid user numbers.`
        );
      }
      // TODO: Support heap corruption for adb 29 (process exits with code -1073740940) (windows and linux)
      let errorMessage = (error.stderr || error.stdout || error.message).trim();
      if (errorMessage.startsWith(BEGINNING_OF_ADB_ERROR_MESSAGE)) {
        errorMessage = errorMessage.substring(BEGINNING_OF_ADB_ERROR_MESSAGE.length);
      }

      error.message = errorMessage;
      throw error;
    }
  }
}
