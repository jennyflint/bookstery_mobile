import type { PluginListenerHandle } from '@capacitor/core';

export type VolumeDirection = 'up' | 'down';

export interface VolumeButtonPressedEvent {
  direction: VolumeDirection;
}

export interface VolumeInterceptionOptions {
  enabled: boolean;
}

export interface VolumeInterceptionResult {
  enabled: boolean;
}

export interface VolumeButtonsPlugin {
  setVolumeInterception(options: VolumeInterceptionOptions): Promise<VolumeInterceptionResult>;
  isInterceptionEnabled(): Promise<VolumeInterceptionResult>;
  addListener(
    eventName: 'volumeButtonPressed',
    listenerFunc: (event: VolumeButtonPressedEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
