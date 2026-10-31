import { vi } from 'vitest';
import {
  mockApp,
  mockClipboard,
  mockFilesystem,
  mockGoogleAuth,
  mockKeepAwake,
  mockNetwork,
} from './mocks/capacitor-plugins';

vi.mock('@capacitor/app', () => ({
  App: mockApp,
}));

vi.mock('@capacitor/network', () => ({
  Network: mockNetwork,
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: mockFilesystem,
  Directory: mockFilesystem.Directory,
}));

vi.mock('@capacitor/clipboard', () => ({
  Clipboard: mockClipboard,
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: mockKeepAwake,
}));

vi.mock('@codetrix-studio/capacitor-google-auth', () => ({
  GoogleAuth: mockGoogleAuth,
}));

if (typeof window !== 'undefined') {
  const dummyContext = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Array(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    quadraticCurveTo: vi.fn(),
    clip: vi.fn(),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(dummyContext);
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,mockCanvasData');

  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  if (!window.IntersectionObserver) {
    class MockIntersectionObserver {
      callback?: IntersectionObserverCallback;
      observe = vi.fn((elem: HTMLElement) => {
        if (this.callback) {
          this.callback(
            [{ isIntersecting: true, target: elem } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
      });
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(callback?: IntersectionObserverCallback) {
        this.callback = callback;
      }
    }
    window.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  }

  (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
    t: (key: string) => key,
  });
}
