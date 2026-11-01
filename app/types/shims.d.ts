declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}

declare module '@capacitor/haptics' {
  export enum ImpactStyle {
    Heavy = 'HEAVY',
    Medium = 'MEDIUM',
    Light = 'LIGHT',
  }
  export interface ImpactOptions {
    style: ImpactStyle;
  }
  export interface HapticsPlugin {
    impact(options?: ImpactOptions): Promise<void>;
    selectionChanged(): Promise<void>;
    selectionStart(): Promise<void>;
    selectionEnd(): Promise<void>;
  }
  export const Haptics: HapticsPlugin;
}
