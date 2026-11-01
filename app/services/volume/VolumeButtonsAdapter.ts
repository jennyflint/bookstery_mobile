import type { VolumeButtonsPlugin } from '../../types/volume';
import { NativeReaderBridge } from '../NativeReaderBridge';

/**
 * Volume key adapter used by the page-turn composable. The hardware keys are intercepted
 * natively by `NativeReaderBridge` (MainActivity.dispatchKeyEvent); on web/desktop the
 * bridge's web fallback keeps this a harmless no-op.
 */
export const VolumeButtons: VolumeButtonsPlugin = {
  setVolumeInterception: (options) => NativeReaderBridge.setVolumeInterception(options),
  isInterceptionEnabled: () => NativeReaderBridge.isInterceptionEnabled(),
  addListener: (_eventName, listenerFunc) =>
    NativeReaderBridge.addListener('volumeKeyPressed', listenerFunc),
  removeAllListeners: () => NativeReaderBridge.removeAllListeners(),
};
