import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { useTtsStore } from '../../../app/stores/ttsStore';
import { mockTextToSpeech, mockKeepAwake } from '../../mocks/capacitor-plugins';

describe('useTtsStore', () => {
  let store: ReturnType<typeof useTtsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockTextToSpeech.speak.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    store = useTtsStore();
  });

  it('initializes with default state', () => {
    expect(store.isPlaying).toBe(false);
    expect(store.isPaused).toBe(false);
    expect(store.isActive).toBe(false);
    expect(store.currentIndex).toBe(0);
    expect(store.rate).toBe(1.0);
    expect(store.pitch).toBe(1.0);
    expect(store.sentences).toEqual([]);
    expect(store.currentSentence).toBeNull();
  });

  it('loads available voices from TextToSpeech plugin', async () => {
    await store.loadVoices();
    expect(mockTextToSpeech.getSupportedVoices).toHaveBeenCalled();
    expect(store.availableVoices.length).toBeGreaterThan(0);
    expect(store.availableVoices[0].lang).toBe('uk-UA');
  });

  it('segments text and starts playback with KeepAwake enabled', async () => {
    const rawText = 'Це перше речення. А це друге речення!';
    const onSentenceChange = vi.fn();

    await store.startPageTts(rawText, 0, { onSentenceChange });

    expect(store.sentences.length).toBe(2);
    expect(store.currentIndex).toBe(0);
    expect(store.currentSentence?.text).toBe('Це перше речення.');
    expect(mockKeepAwake.keepAwake).toHaveBeenCalled();
    expect(onSentenceChange).toHaveBeenCalledWith(
      expect.objectContaining({ index: 0, text: 'Це перше речення.' }),
    );
  });

  it('pauses and resumes playback, toggling KeepAwake and speech cancellation', async () => {
    await store.startPageTts('Один. Два. Три.');
    expect(store.isPlaying).toBe(true);

    await store.pause();
    expect(store.isPlaying).toBe(false);
    expect(store.isPaused).toBe(true);
    expect(store.isActive).toBe(true);
    expect(mockTextToSpeech.stop).toHaveBeenCalled();
    expect(mockKeepAwake.allowSleep).toHaveBeenCalled();

    await store.resume();
    expect(store.isPlaying).toBe(true);
    expect(store.isPaused).toBe(false);
    expect(mockKeepAwake.keepAwake).toHaveBeenCalled();
  });

  it('stops playback, resets sentences, and releases wake lock', async () => {
    await store.startPageTts('Один. Два.');
    expect(store.isActive).toBe(true);

    await store.stop();
    expect(store.isPlaying).toBe(false);
    expect(store.isPaused).toBe(false);
    expect(store.isActive).toBe(false);
    expect(store.sentences).toEqual([]);
    expect(store.currentIndex).toBe(0);
    expect(mockKeepAwake.allowSleep).toHaveBeenCalled();
  });

  it('navigates through sentences with nextSentence and prevSentence', async () => {
    const onSentenceChange = vi.fn();
    await store.startPageTts('Речення 1. Речення 2. Речення 3.', 0, { onSentenceChange });
    await store.pause(); // pause loop so we test step navigation

    expect(store.currentIndex).toBe(0);

    await store.nextSentence();
    expect(store.currentIndex).toBe(1);
    expect(onSentenceChange).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: 'Речення 2.' }),
    );

    await store.nextSentence();
    expect(store.currentIndex).toBe(2);

    await store.prevSentence();
    expect(store.currentIndex).toBe(1);
    expect(onSentenceChange).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, text: 'Речення 2.' }),
    );
  });

  it('sets and cycles playback rate, persisting to localStorage', async () => {
    await store.setRate(1.5);
    expect(store.rate).toBe(1.5);
    expect(localStorage.getItem('bookstery_tts_rate')).toBe('1.5');

    await store.cycleRate(); // Next after 1.5 is 2.0
    expect(store.rate).toBe(2.0);
    expect(localStorage.getItem('bookstery_tts_rate')).toBe('2');

    await store.cycleRate(); // Next after 2.0 wraps to 0.75
    expect(store.rate).toBe(0.75);
  });

  it('sets voice and persists selection to localStorage', async () => {
    await store.setVoice('uk-voice-custom');
    expect(store.selectedVoice).toBe('uk-voice-custom');
    expect(localStorage.getItem('bookstery_tts_voice')).toBe('uk-voice-custom');

    await store.setVoice(null);
    expect(store.selectedVoice).toBeNull();
    expect(localStorage.getItem('bookstery_tts_voice')).toBeNull();
  });

  it('invokes onPageFinished callback when advancing past the last sentence', async () => {
    const onPageFinished = vi.fn().mockResolvedValue(undefined);
    await store.startPageTts('Тільки одне речення.', 0, { onPageFinished });
    await store.nextSentence();

    expect(onPageFinished).toHaveBeenCalledTimes(1);
  });

  it('detects Ukrainian language for Cyrillic text and resolves Ukrainian voice', async () => {
    await store.loadVoices();
    await store.startPageTts('Це важливий український текст для озвучення.');

    expect(store.activeLang).toBe('uk-UA');
    expect(store.matchingVoices.length).toBeGreaterThan(0);
    expect(store.matchingVoices[0].lang).toBe('uk-UA');
    expect(store.hasVoiceForActiveLang).toBe(true);
  });

  it('allows manual language override and persists preference to localStorage', async () => {
    await store.setLanguage('de-DE');
    expect(store.selectedLanguage).toBe('de-DE');
    expect(store.activeLang).toBe('de-DE');
    expect(localStorage.getItem('bookstery_tts_language')).toBe('de-DE');

    await store.setLanguage(null); // Return to auto
    expect(store.selectedLanguage).toBeNull();
    expect(localStorage.getItem('bookstery_tts_language')).toBeNull();
  });

  it('calls TextToSpeech.openInstall on native platform', async () => {
    await store.openInstall();
    expect(mockTextToSpeech.openInstall).toHaveBeenCalledTimes(1);
  });
});
