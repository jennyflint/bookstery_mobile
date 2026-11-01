import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '../services/tts/TextToSpeechAdapter';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { TtsSentence, TtsVoice } from '../types';
import { segmentIntoSentences, detectLanguage } from '../utils/ttsSegmenter';

export const TTS_RATES = [0.75, 1.0, 1.25, 1.5, 2.0] as const;

export const useTtsStore = defineStore('tts', () => {
  const isPlaying = ref(false);
  const isPaused = ref(false);
  const sentences = ref<TtsSentence[]>([]);
  const currentIndex = ref(0);
  const rate = ref<number>(1.0);
  const pitch = ref<number>(1.0);
  const selectedVoice = ref<string | null>(null);
  const selectedLanguage = ref<string | null>(null);
  const availableVoices = ref<TtsVoice[]>([]);
  const activeLang = ref<string>('uk-UA');

  // Concurrency token to cancel previous playback loops
  let currentSessionToken = 0;
  let activeAudio: HTMLAudioElement | null = null;
  let onPageFinishedCallback: (() => Promise<void> | void) | null = null;
  let onSentenceChangeCallback: ((sentence: TtsSentence) => void) | null = null;

  // Load preferences from localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedRate = localStorage.getItem('bookstery_tts_rate');
      if (savedRate) {
        const parsedRate = parseFloat(savedRate);
        if (TTS_RATES.includes(parsedRate as (typeof TTS_RATES)[number])) {
          rate.value = parsedRate;
        }
      }
      const savedVoice = localStorage.getItem('bookstery_tts_voice');
      if (savedVoice) {
        selectedVoice.value = savedVoice;
      }
      const savedLang = localStorage.getItem('bookstery_tts_language');
      if (savedLang) {
        selectedLanguage.value = savedLang;
        activeLang.value = savedLang;
      }
    } catch {}
  }

  const isActive = computed((): boolean => {
    return isPlaying.value || isPaused.value;
  });

  const currentSentence = computed((): TtsSentence | null => {
    if (currentIndex.value >= 0 && currentIndex.value < sentences.value.length) {
      return sentences.value[currentIndex.value];
    }
    return null;
  });

  const totalSentences = computed((): number => {
    return sentences.value.length;
  });

  const matchingVoices = computed((): TtsVoice[] => {
    const targetPrefix = activeLang.value.split(/[-_]/)[0].toLowerCase();
    return availableVoices.value.filter((v) =>
      v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix),
    );
  });

  const hasVoiceForActiveLang = computed((): boolean => {
    if (availableVoices.value.length === 0) return true;
    const targetPrefix = activeLang.value.split(/[-_]/)[0].toLowerCase();
    return availableVoices.value.some((v) =>
      v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix),
    );
  });

  const loadVoices = async (): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await TextToSpeech.getSupportedVoices();
        if (result && Array.isArray(result.voices)) {
          availableVoices.value = result.voices.map((v) => ({
            default: v.default,
            lang: v.lang,
            name: v.name,
            voiceURI: v.voiceURI,
          }));
        }
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const webVoices = window.speechSynthesis.getVoices();
        availableVoices.value = webVoices.map((v) => ({
          default: v.default,
          lang: v.lang,
          name: v.name,
          voiceURI: v.voiceURI,
        }));

        // Some browsers populate voices asynchronously
        if (availableVoices.value.length === 0 && 'onvoiceschanged' in window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = () => {
            const updated = window.speechSynthesis.getVoices();
            availableVoices.value = updated.map((v) => ({
              default: v.default,
              lang: v.lang,
              name: v.name,
              voiceURI: v.voiceURI,
            }));
          };
        }
      }
    } catch (err) {
      console.warn('[TTS] Failed to load available voices:', err);
    }
  };

  const cancelSpeech = async (): Promise<void> => {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch {}
      activeAudio = null;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch (err) {
      console.warn('[TTS] Speech cancellation warning:', err);
    }
  };

  const speakSentence = async (text: string, token: number): Promise<boolean> => {
    if (token !== currentSessionToken || !isPlaying.value) {
      return false;
    }

    if (activeAudio) {
      try {
        activeAudio.pause();
      } catch {}
      activeAudio = null;
    }

    try {
      const targetPrefix = activeLang.value.split(/[-_]/)[0].toLowerCase();
      const normalizedLang = activeLang.value.toLowerCase().replace('_', '-');

      if (Capacitor.isNativePlatform()) {
        let voiceIndex: number | undefined;

        // Resolve voiceIndex by matching voiceURI in availableVoices
        if (selectedVoice.value) {
          const idx = availableVoices.value.findIndex((v) => v.voiceURI === selectedVoice.value);
          if (idx >= 0) {
            voiceIndex = idx;
          } else {
            const parsed = Number(selectedVoice.value);
            if (!isNaN(parsed)) voiceIndex = parsed;
          }
        }

        // Auto-pick the best matching voice index for the active language
        if (voiceIndex === undefined && availableVoices.value.length > 0) {
          const exactIdx = availableVoices.value.findIndex(
            (v) => v.lang.toLowerCase().replace('_', '-') === normalizedLang,
          );
          if (exactIdx >= 0) {
            voiceIndex = exactIdx;
          } else {
            const prefixIdx = availableVoices.value.findIndex((v) =>
              v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix),
            );
            if (prefixIdx >= 0) {
              voiceIndex = prefixIdx;
            }
          }
        }

        await TextToSpeech.speak({
          text,
          lang: activeLang.value,
          rate: rate.value,
          pitch: pitch.value,
          voice: voiceIndex,
          category: 'playback',
        });
        return token === currentSessionToken && isPlaying.value;
      }

      // Web Speech API / Online audio fallback
      if (typeof window !== 'undefined') {
        const webVoices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
        let chosenVoice: SpeechSynthesisVoice | undefined;

        // 1. If preferred voice was set by user, check if it matches the current language
        if (selectedVoice.value) {
          const userVoice = webVoices.find((v) => v.voiceURI === selectedVoice.value);
          if (userVoice && userVoice.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)) {
            chosenVoice = userVoice;
          }
        }

        // 2. Otherwise auto-resolve best matching voice for activeLang
        if (!chosenVoice) {
          chosenVoice =
            webVoices.find((v) => v.lang.toLowerCase().replace('_', '-') === normalizedLang) ||
            webVoices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));
        }

        // If no matching voice for non-English language (e.g. Ukrainian on Linux/Windows Chrome),
        // use Google TTS audio fallback so Ukrainian text is NOT read with an English voice!
        if (!chosenVoice && !activeLang.value.startsWith('en')) {
          return new Promise<boolean>((resolve) => {
            const langCode = activeLang.value.split(/[-_]/)[0];
            const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&client=tw-ob&q=${encodeURIComponent(text)}`;
            const audio = new Audio(audioUrl);
            activeAudio = audio;
            audio.playbackRate = rate.value;

            audio.onended = () => {
              activeAudio = null;
              resolve(token === currentSessionToken && isPlaying.value);
            };

            audio.onerror = () => {
              activeAudio = null;
              if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = activeLang.value;
                utterance.rate = rate.value;
                utterance.pitch = pitch.value;
                utterance.onend = () => {
                  resolve(token === currentSessionToken && isPlaying.value);
                };
                utterance.onerror = () => {
                  resolve(false);
                };
                window.speechSynthesis.speak(utterance);
              } else {
                resolve(false);
              }
            };

            audio.play().catch(() => {
              activeAudio = null;
              if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = activeLang.value;
                utterance.rate = rate.value;
                utterance.pitch = pitch.value;
                utterance.onend = () => {
                  resolve(token === currentSessionToken && isPlaying.value);
                };
                utterance.onerror = () => {
                  resolve(false);
                };
                window.speechSynthesis.speak(utterance);
              } else {
                resolve(false);
              }
            });
          });
        }

        if ('speechSynthesis' in window) {
          return new Promise<boolean>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = activeLang.value;
            utterance.rate = rate.value;
            utterance.pitch = pitch.value;

            if (chosenVoice) {
              utterance.voice = chosenVoice;
              utterance.lang = chosenVoice.lang || activeLang.value;
            } else if (activeLang.value.startsWith('en')) {
              const def = webVoices.find((v) => v.default);
              if (def) utterance.voice = def;
            }

            utterance.onend = () => {
              resolve(token === currentSessionToken && isPlaying.value);
            };

            utterance.onerror = (e) => {
              // Cancelled utterances should not be treated as fatal errors
              if (e.error === 'canceled' || e.error === 'interrupted') {
                resolve(false);
              } else {
                console.warn('[TTS] Web speech error:', e);
                resolve(false);
              }
            };

            window.speechSynthesis.speak(utterance);
          });
        }
      }

      return false;
    } catch (err) {
      console.warn('[TTS] Sentence speech error:', err);
      return false;
    }
  };

  const runPlaybackLoop = async (token: number): Promise<void> => {
    while (token === currentSessionToken && isPlaying.value && currentIndex.value < sentences.value.length) {
      const sentence = sentences.value[currentIndex.value];
      if (!sentence) {
        break;
      }

      // Live highlighting callback
      onSentenceChangeCallback?.(sentence);

      const completed = await speakSentence(sentence.text, token);
      if (!completed || token !== currentSessionToken || !isPlaying.value) {
        break;
      }

      // Advance to next sentence
      if (currentIndex.value < sentences.value.length - 1) {
        currentIndex.value++;
      } else {
        // Reached end of page sentences without interruption
        const onFinished = onPageFinishedCallback;
        if (onFinished) {
          await onFinished();
        } else {
          await stop();
        }
        break;
      }
    }
  };

  const startPageTts = async (
    rawText: string,
    startIndex: number = 0,
    callbacks?: {
      onPageFinished?: () => Promise<void> | void;
      onSentenceChange?: (sentence: TtsSentence) => void;
    },
  ): Promise<void> => {
    currentSessionToken++;
    const token = currentSessionToken;
    await cancelSpeech();

    onPageFinishedCallback = callbacks?.onPageFinished ?? null;
    onSentenceChangeCallback = callbacks?.onSentenceChange ?? null;

    // Use manual language if selected, otherwise detect automatically
    const targetLang = selectedLanguage.value || detectLanguage(rawText);
    activeLang.value = targetLang;
    const segmented = segmentIntoSentences(rawText, targetLang);

    sentences.value = segmented;
    currentIndex.value = Math.max(0, Math.min(startIndex, Math.max(0, segmented.length - 1)));

    if (segmented.length === 0) {
      isPlaying.value = false;
      isPaused.value = false;
      return;
    }

    isPlaying.value = true;
    isPaused.value = false;

    try {
      await KeepAwake.keepAwake();
    } catch {}

    runPlaybackLoop(token);
  };

  const pause = async (): Promise<void> => {
    if (!isPlaying.value) return;

    currentSessionToken++;
    await cancelSpeech();
    isPlaying.value = false;
    isPaused.value = true;

    try {
      await KeepAwake.allowSleep();
    } catch {}
  };

  const resume = async (): Promise<void> => {
    if (!isPaused.value && !isPlaying.value) {
      return;
    }

    currentSessionToken++;
    const token = currentSessionToken;
    await cancelSpeech();

    isPlaying.value = true;
    isPaused.value = false;

    try {
      await KeepAwake.keepAwake();
    } catch {}

    runPlaybackLoop(token);
  };

  const stop = async (): Promise<void> => {
    currentSessionToken++;
    await cancelSpeech();

    isPlaying.value = false;
    isPaused.value = false;
    sentences.value = [];
    currentIndex.value = 0;
    onPageFinishedCallback = null;

    try {
      await KeepAwake.allowSleep();
    } catch {}
  };

  const nextSentence = async (): Promise<void> => {
    if (currentIndex.value < sentences.value.length - 1) {
      currentSessionToken++;
      const token = currentSessionToken;
      await cancelSpeech();
      currentIndex.value++;

      if (isPlaying.value) {
        runPlaybackLoop(token);
      } else {
        const sentence = sentences.value[currentIndex.value];
        if (sentence) {
          onSentenceChangeCallback?.(sentence);
        }
      }
    } else if (onPageFinishedCallback && isPlaying.value) {
      currentSessionToken++;
      await cancelSpeech();
      await onPageFinishedCallback();
    }
  };

  const prevSentence = async (): Promise<void> => {
    if (currentIndex.value > 0) {
      currentSessionToken++;
      const token = currentSessionToken;
      await cancelSpeech();
      currentIndex.value--;

      if (isPlaying.value) {
        runPlaybackLoop(token);
      } else {
        const sentence = sentences.value[currentIndex.value];
        if (sentence) {
          onSentenceChangeCallback?.(sentence);
        }
      }
    }
  };

  const setRate = async (newRate: number): Promise<void> => {
    rate.value = newRate;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem('bookstery_tts_rate', String(newRate));
      } catch {}
    }

    if (isPlaying.value) {
      currentSessionToken++;
      const token = currentSessionToken;
      await cancelSpeech();
      runPlaybackLoop(token);
    }
  };

  const cycleRate = async (): Promise<void> => {
    const idx = TTS_RATES.indexOf(rate.value as (typeof TTS_RATES)[number]);
    const nextIdx = (idx + 1) % TTS_RATES.length;
    await setRate(TTS_RATES[nextIdx]);
  };

  const setVoice = async (voiceURI: string | null): Promise<void> => {
    selectedVoice.value = voiceURI;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (voiceURI) {
          localStorage.setItem('bookstery_tts_voice', voiceURI);
        } else {
          localStorage.removeItem('bookstery_tts_voice');
        }
      } catch {}
    }

    if (isPlaying.value) {
      currentSessionToken++;
      const token = currentSessionToken;
      await cancelSpeech();
      runPlaybackLoop(token);
    }
  };

  const setLanguage = async (newLang: string | null): Promise<void> => {
    selectedLanguage.value = newLang;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (newLang) {
          localStorage.setItem('bookstery_tts_language', newLang);
        } else {
          localStorage.removeItem('bookstery_tts_language');
        }
      } catch {}
    }

    if (newLang) {
      activeLang.value = newLang;
    } else if (sentences.value.length > 0) {
      const fullText = sentences.value.map((s) => s.text).join(' ');
      activeLang.value = detectLanguage(fullText);
    }

    // Reset voice selection if previous voice does not match new language
    if (selectedVoice.value) {
      const targetPrefix = activeLang.value.split(/[-_]/)[0].toLowerCase();
      const voice = availableVoices.value.find((v) => v.voiceURI === selectedVoice.value);
      if (voice && !voice.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)) {
        selectedVoice.value = null;
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.removeItem('bookstery_tts_voice');
          } catch {}
        }
      }
    }

    if (isPlaying.value) {
      currentSessionToken++;
      const token = currentSessionToken;
      await cancelSpeech();
      runPlaybackLoop(token);
    }
  };

  const openInstall = async (): Promise<void> => {
    try {
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.openInstall();
      }
    } catch (err) {
      console.warn('[TTS] Failed to open TTS settings/install:', err);
    }
  };

  return {
    isPlaying,
    isPaused,
    isActive,
    sentences,
    currentIndex,
    currentSentence,
    totalSentences,
    rate,
    pitch,
    selectedVoice,
    selectedLanguage,
    availableVoices,
    matchingVoices,
    hasVoiceForActiveLang,
    activeLang,
    loadVoices,
    startPageTts,
    play: resume,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    setRate,
    cycleRate,
    setVoice,
    setLanguage,
    openInstall,
  };
});
