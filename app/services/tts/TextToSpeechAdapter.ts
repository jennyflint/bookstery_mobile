import { registerPlugin } from '@capacitor/core';
import type { TextToSpeechPlugin } from '../../types/tts';

/**
 * TextToSpeech adapter providing a unified bridge to the native Capacitor TextToSpeech plugin.
 * Uses Capacitor core's registerPlugin so that the module is always resolved cleanly across
 * all environments (Nuxt SSR, Vite dev server, and native Capacitor) without package import errors.
 */
export const TextToSpeech = registerPlugin<TextToSpeechPlugin>('TextToSpeech');

export type { TextToSpeechPlugin };
