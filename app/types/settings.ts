export type ScreenOrientationMode = 'auto' | 'portrait' | 'landscape';

export interface ScreenControlSettings {
  keepScreenAwake: boolean;
  orientationLock: ScreenOrientationMode;
  applyOrientationOnlyInReader: boolean;
}
