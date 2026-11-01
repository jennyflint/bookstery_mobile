import { registerPlugin } from '@capacitor/core';
import type { VolumeButtonsPlugin } from '../../types/volume';

/**
 * Native Capacitor bridge adapter for intercepting hardware volume buttons.
 * On Android, intercepts KEYCODE_VOLUME_UP and KEYCODE_VOLUME_DOWN at the Activity level.
 * On web/desktop platforms, provides a fallback implementation.
 */
export const VolumeButtons = registerPlugin<VolumeButtonsPlugin>('VolumeButtons', {
  web: () => ({
    async setVolumeInterception(options: { enabled: boolean }) {
      return { enabled: options.enabled };
    },
    async isInterceptionEnabled() {
      return { enabled: false };
    },
    async addListener() {
      return {
        remove: async () => {},
      };
    },
    async removeAllListeners() {},
  }),
});
