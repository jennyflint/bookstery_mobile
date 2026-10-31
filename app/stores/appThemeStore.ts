import { defineStore } from 'pinia';

const STORAGE_KEY_BUTTON = 'bookstery_app_button_color';
const STORAGE_KEY_BG = 'bookstery_app_bg_color';

export const DEFAULT_APP_BUTTON_COLOR = '#4f46e5';
export const DEFAULT_APP_BG_COLOR = '#fafafa';

export const APP_BUTTON_SWATCHES = [
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'blue', name: 'Ocean Blue', color: '#2563eb' },
  { id: 'emerald', name: 'Emerald', color: '#059669' },
  { id: 'teal', name: 'Teal', color: '#0d9488' },
  { id: 'violet', name: 'Violet', color: '#7c3aed' },
  { id: 'rose', name: 'Rose', color: '#e11d48' },
  { id: 'amber', name: 'Amber', color: '#d97706' },
  { id: 'slate', name: 'Slate', color: '#334155' },
];

export const APP_BG_SWATCHES = [
  { id: 'default', name: 'Light Gray', color: '#fafafa' },
  { id: 'white', name: 'Pure White', color: '#ffffff' },
  { id: 'cream', name: 'Warm Cream', color: '#fbf7ee' },
  { id: 'mint', name: 'Soft Mint', color: '#f0fdf4' },
  { id: 'sky', name: 'Soft Sky', color: '#f0f9ff' },
  { id: 'zinc', name: 'Dark Zinc', color: '#18181b' },
  { id: 'navy', name: 'Dark Navy', color: '#0f172a' },
  { id: 'oled', name: 'OLED Black', color: '#000000' },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  if (c.length !== 6) return null;
  const num = parseInt(c, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function mixColors(color1: string, color2: string, weight: number): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return color1;
  const w = Math.min(Math.max(weight, 0), 1);
  const r = Math.round(rgb1.r * (1 - w) + rgb2.r * w);
  const g = Math.round(rgb1.g * (1 - w) + rgb2.g * w);
  const b = Math.round(rgb1.b * (1 - w) + rgb2.b * w);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function isDarkColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum < 0.5;
}

export function applyAppTheme(buttonColor: string, bgColor: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const btn = buttonColor.startsWith('#') ? buttonColor : `#${buttonColor}`;
  const bg = bgColor.startsWith('#') ? bgColor : `#${bgColor}`;

  // 1. Button and accent palette
  const shade50 = mixColors(btn, '#ffffff', 0.93);
  const shade100 = mixColors(btn, '#ffffff', 0.85);
  const shade200 = mixColors(btn, '#ffffff', 0.68);
  const shade300 = mixColors(btn, '#ffffff', 0.48);
  const shade400 = mixColors(btn, '#ffffff', 0.28);
  const shade500 = mixColors(btn, '#ffffff', 0.12);
  const shade600 = btn;
  const shade700 = mixColors(btn, '#000000', 0.15);
  const shade800 = mixColors(btn, '#000000', 0.3);
  const shade900 = mixColors(btn, '#000000', 0.45);

  const btnDark = isDarkColor(btn);
  const btnText = btnDark ? '#ffffff' : '#18181b';

  root.style.setProperty('--color-app-button', btn);
  root.style.setProperty('--color-app-button-text', btnText);
  root.style.setProperty('--color-app-accent-50', shade50);
  root.style.setProperty('--color-app-accent-100', shade100);
  root.style.setProperty('--color-app-accent-200', shade200);
  root.style.setProperty('--color-app-accent-300', shade300);
  root.style.setProperty('--color-app-accent-400', shade400);
  root.style.setProperty('--color-app-accent-500', shade500);
  root.style.setProperty('--color-app-accent-600', shade600);
  root.style.setProperty('--color-app-accent-700', shade700);
  root.style.setProperty('--color-app-accent-800', shade800);
  root.style.setProperty('--color-app-accent-900', shade900);

  // 2. Application background, surface cards, and text contrast
  const bgDark = isDarkColor(bg);
  root.style.setProperty('--color-app-bg', bg);

  if (bgDark) {
    const surface = mixColors(bg, '#ffffff', 0.07);
    const border = mixColors(bg, '#ffffff', 0.14);
    root.style.setProperty('--color-app-surface', surface);
    root.style.setProperty('--color-app-border', border);
    root.style.setProperty('--color-app-text', '#f4f4f5');
    root.style.setProperty('--color-app-text-muted', '#a1a1aa');
  } else {
    const isPureWhite = bg.toLowerCase() === '#ffffff' || bg.toLowerCase() === '#fff';
    const surface = '#ffffff';
    const border = isPureWhite ? '#e4e4e7' : mixColors(bg, '#000000', 0.1);
    root.style.setProperty('--color-app-surface', surface);
    root.style.setProperty('--color-app-border', border);
    root.style.setProperty('--color-app-text', '#18181b');
    root.style.setProperty('--color-app-text-muted', '#71717a');
  }
}

function getStoredColor(key: string, defaultColor: string): string {
  if (typeof window === 'undefined') {
    return defaultColor;
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw && /^#[0-9a-fA-F]{6}$/i.test(raw)) {
      return raw;
    }
  } catch {
  }
  return defaultColor;
}

export const useAppThemeStore = defineStore('appTheme', {
  state: () => ({
    buttonColor: getStoredColor(STORAGE_KEY_BUTTON, DEFAULT_APP_BUTTON_COLOR),
    backgroundColor: getStoredColor(STORAGE_KEY_BG, DEFAULT_APP_BG_COLOR),
  }),
  actions: {
    setButtonColor(color: string): void {
      this.buttonColor = color;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY_BUTTON, color);
        } catch {
        }
      }
      applyAppTheme(this.buttonColor, this.backgroundColor);
    },
    setBackgroundColor(color: string): void {
      this.backgroundColor = color;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY_BG, color);
        } catch {
        }
      }
      applyAppTheme(this.buttonColor, this.backgroundColor);
    },
    resetAllToDefault(): void {
      this.buttonColor = DEFAULT_APP_BUTTON_COLOR;
      this.backgroundColor = DEFAULT_APP_BG_COLOR;
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEY_BUTTON);
          localStorage.removeItem(STORAGE_KEY_BG);
        } catch {
        }
      }
      applyAppTheme(this.buttonColor, this.backgroundColor);
    },
    initTheme(): void {
      applyAppTheme(this.buttonColor, this.backgroundColor);
    },
  },
});
