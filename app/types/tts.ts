export interface TtsSentence {
  index: number;
  text: string;
  startOffset?: number;
  endOffset?: number;
}

export interface TtsVoice {
  default?: boolean;
  lang: string;
  name: string;
  voiceURI: string;
}

export type TtsRate = 0.75 | 1.0 | 1.25 | 1.5 | 2.0;

export interface TtsLanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_TTS_LANGUAGES: TtsLanguageOption[] = [
  { code: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
];

export interface TextToSpeechSpeakOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: number;
  category?: string;
}

export interface TextToSpeechPlugin {
  speak(options: TextToSpeechSpeakOptions): Promise<void>;
  stop(): Promise<void>;
  getSupportedVoices(): Promise<{
    voices: Array<{
      default: boolean;
      lang: string;
      name: string;
      voiceURI: string;
    }>;
  }>;
  getSupportedLanguages(): Promise<{
    languages: string[];
  }>;
  isLanguageSupported(options: { lang: string }): Promise<{ supported: boolean }>;
  openInstall(): Promise<void>;
}

export interface TtsState {
  isPlaying: boolean;
  isPaused: boolean;
  sentences: TtsSentence[];
  currentIndex: number;
  rate: number;
  pitch: number;
  selectedVoice: string | null;
  availableVoices: TtsVoice[];
  activeLang: string;
}
