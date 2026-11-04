import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import UserProfileMenu from '../../../app/components/auth/UserProfileMenu.vue';
import { useAuthStore } from '../../../app/stores/authStore';
import { GoogleAuthService } from '../../../app/services/auth/GoogleAuthService';
import { mockGoogleAuth } from '../../mocks/capacitor-plugins';

describe('UserProfileMenu Component', () => {
  const originalUseI18n = (globalThis as unknown as { useI18n: unknown }).useI18n;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    await GoogleAuthService.getInstance().signOut();

    (globalThis as unknown as { useI18n: () => { t: (k: string) => string } }).useI18n = () => ({
      t: (key: string) => key,
    });
  });

  afterEach(() => {
    (globalThis as unknown as { useI18n: unknown }).useI18n = originalUseI18n;
  });

  it('renders Google sign-in button when unauthenticated, and shows user profile upon successful sign-in', async () => {
    const wrapper = mount(UserProfileMenu);
    const signInBtn = wrapper.find('[data-testid="google-sign-in-btn"]');
    expect(signInBtn.exists()).toBe(true);

    await signInBtn.trigger('click');
    await flushPromises();

    const authStore = useAuthStore();
    expect(authStore.isAuthenticated).toBe(true);
    expect(wrapper.text()).toContain('Book Reader');
    expect(wrapper.text()).toContain('reader@example.com');
  });

  it('catches sign-in error and displays error message in UI without crashing', async () => {
    mockGoogleAuth.signIn.mockRejectedValueOnce(new Error('Google Play Services unavailable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(UserProfileMenu);
    const signInBtn = wrapper.find('[data-testid="google-sign-in-btn"]');
    await signInBtn.trigger('click');
    await flushPromises();

    const authStore = useAuthStore();
    expect(authStore.isAuthenticated).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Google Play Services unavailable');

    consoleSpy.mockRestore();
  });
});
