import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import {
  exitNativeApp,
  exitApp,
  NativeReaderBridge,
} from '../../../app/services/NativeReaderBridge';

describe('NativeReaderBridge exitNativeApp and exitApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls App.exitApp when in browser/dev mode', async () => {
    await exitNativeApp();

    expect(App.exitApp).toHaveBeenCalledTimes(1);
  });

  it('aliases exitApp to exitNativeApp', () => {
    expect(exitApp).toBe(exitNativeApp);
  });
});
