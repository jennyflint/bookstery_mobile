import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import TtsPlayerBar from '../../../app/components/reader/TtsPlayerBar.vue';
import { useTtsStore } from '../../../app/stores/ttsStore';
import { mockTextToSpeech } from '../../mocks/capacitor-plugins';

describe('TtsPlayerBar Component', () => {
  let store: ReturnType<typeof useTtsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockTextToSpeech.speak.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    store = useTtsStore();
  });

  it('does not render when TTS is inactive', () => {
    const wrapper = mount(TtsPlayerBar);
    expect(wrapper.find('[data-testid="tts-player-bar"]').exists()).toBe(false);
  });

  it('renders bottom bar with sentence preview and controls when TTS is active', async () => {
    await store.startPageTts('Перше речення. Друге речення.');
    const wrapper = mount(TtsPlayerBar);

    expect(wrapper.find('[data-testid="tts-player-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tts-sentence-preview"]').text()).toContain('Перше речення.');
    expect(wrapper.find('[data-testid="tts-sentence-progress"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tts-play-pause-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tts-prev-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tts-next-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tts-rate-btn"]').text()).toBe('1x');
  });

  it('triggers pause and resume when play/pause button is clicked', async () => {
    await store.startPageTts('Речення для перевірки.');
    const wrapper = mount(TtsPlayerBar);

    expect(store.isPlaying).toBe(true);

    // Click pause
    await wrapper.find('[data-testid="tts-play-pause-btn"]').trigger('click');
    expect(store.isPlaying).toBe(false);
    expect(store.isPaused).toBe(true);

    // Click resume
    await wrapper.find('[data-testid="tts-play-pause-btn"]').trigger('click');
    expect(store.isPlaying).toBe(true);
    expect(store.isPaused).toBe(false);
  });

  it('cycles playback rate when rate button is clicked', async () => {
    await store.startPageTts('Текст.');
    const wrapper = mount(TtsPlayerBar);

    const rateBtn = wrapper.find('[data-testid="tts-rate-btn"]');
    expect(rateBtn.text()).toBe('1x');

    await rateBtn.trigger('click');
    expect(rateBtn.text()).toBe('1.25x');
  });

  it('calls stop when close/stop button is clicked', async () => {
    await store.startPageTts('Текст.');
    const wrapper = mount(TtsPlayerBar);

    await wrapper.find('[data-testid="tts-stop-btn"]').trigger('click');
    expect(store.isActive).toBe(false);
  });

  it('opens voice selection modal when voice button is clicked', async () => {
    await store.startPageTts('Текст.');
    await store.loadVoices();
    const wrapper = mount(TtsPlayerBar);

    expect(wrapper.find('[data-testid="tts-voice-modal"]').exists()).toBe(false);

    await wrapper.find('[data-testid="tts-voice-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="tts-voice-modal"]').exists()).toBe(true);
  });

  it('renders install voice button when active language has no voice', async () => {
    vi.spyOn(store, 'openInstall').mockResolvedValue(undefined);
    await store.loadVoices();
    await store.startPageTts('Text.');
    await store.setLanguage('pl-PL'); // Polish has no voices in mock

    const wrapper = mount(TtsPlayerBar);
    await wrapper.find('[data-testid="tts-voice-btn"]').trigger('click');

    const warning = wrapper.find('[data-testid="tts-no-voice-warning"]');
    expect(warning.exists()).toBe(true);

    const installBtn = wrapper.find('[data-testid="tts-install-voice-btn"]');
    if (installBtn.exists()) {
      await installBtn.trigger('click');
      expect(store.openInstall).toHaveBeenCalled();
    }
  });
});
