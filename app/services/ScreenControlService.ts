import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import type { ScreenOrientationMode } from '../types';

/**
 * Service managing hardware screen behavior including wake lock
 * and screen orientation locking across native Capacitor and web platforms.
 */
export class ScreenControlService {
  private static instance: ScreenControlService | null = null;

  static getInstance(): ScreenControlService {
    if (!ScreenControlService.instance) {
      ScreenControlService.instance = new ScreenControlService();
    }
    return ScreenControlService.instance;
  }

  static async setKeepAwake(enabled: boolean): Promise<void> {
    return ScreenControlService.getInstance().setKeepAwake(enabled);
  }

  static async applyOrientation(mode: ScreenOrientationMode): Promise<void> {
    return ScreenControlService.getInstance().applyOrientation(mode);
  }

  /**
   * Toggles the device screen awake lock.
   * Prevents device from dimming or sleeping while enabled.
   */
  async setKeepAwake(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        let isSupported = true;
        try {
          const supportedResult = await KeepAwake.isSupported();
          if (supportedResult && typeof supportedResult.isSupported === 'boolean') {
            isSupported = supportedResult.isSupported;
          }
        } catch {
          // If isSupported check fails or is unavailable on this platform, proceed safely
        }

        if (isSupported) {
          await KeepAwake.keepAwake();
        }
      } else {
        await KeepAwake.allowSleep();
      }
    } catch (error) {
      console.warn('[ScreenControlService] setKeepAwake failed:', error);
    }
  }

  /**
   * Applies the desired orientation lock.
   * Supports 'auto' (unlocked), 'portrait', and 'landscape'.
   */
  async applyOrientation(mode: ScreenOrientationMode): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        if (mode === 'auto') {
          await ScreenOrientation.unlock();
        } else if (mode === 'portrait') {
          await ScreenOrientation.lock({ orientation: 'portrait' });
        } else if (mode === 'landscape') {
          await ScreenOrientation.lock({ orientation: 'landscape' });
        }
      } else {
        // Web fallback using standard Screen Orientation API
        if (typeof window !== 'undefined' && 'screen' in window && window.screen?.orientation) {
          const webOrientation = window.screen.orientation as ScreenOrientation & {
            lock?: (orientation: string) => Promise<void>;
            unlock?: () => void;
          };

          if (mode === 'auto') {
            try {
              webOrientation.unlock?.();
            } catch {
              // Silently ignore if unlock is unsupported
            }
          } else if (mode === 'portrait' || mode === 'landscape') {
            try {
              await webOrientation.lock?.(mode);
            } catch {
              // Silently catch browsers rejecting orientation lock (e.g., non-fullscreen desktop)
            }
          }
        }
      }
    } catch (error) {
      console.warn('[ScreenControlService] applyOrientation failed:', error);
    }
  }
}
