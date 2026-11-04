import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useAndroidBackButton,
  registerBackHandler,
  handleBackButtonPress,
  initBackButtonListener,
  disposeBackButtonListener,
  BACK_PRIORITY,
} from '~/composables/useAndroidBackButton';
import { useHighlightStore } from '~/stores/highlightStore';
import { useAiStore } from '~/stores/aiStore';
import * as NativeBridgeModule from '~/services/NativeReaderBridge';
import * as TextSelectionModule from '~/composables/useTextSelection';
import { mockApp } from '../../mocks/capacitor-plugins';

const mockReplace = vi.fn().mockResolvedValue(undefined);
const mockPush = vi.fn().mockResolvedValue(undefined);
let currentRoutePath = '/';

const mockRouter = {
  currentRoute: {
    value: {
      path: currentRoutePath,
    },
  },
  replace: mockReplace,
  push: mockPush,
};

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => ({ path: currentRoutePath }),
}));

describe('useAndroidBackButton Composable', () => {
  let pinia: ReturnType<typeof createPinia>;
  let mockExitApp: ReturnType<typeof vi.fn>;
  let mockDismissSelection: ReturnType<typeof vi.fn>;
  let mockHasStickySelection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();

    currentRoutePath = '/';
    mockRouter.currentRoute.value.path = '/';

    mockExitApp = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(NativeBridgeModule, 'exitApp').mockImplementation(mockExitApp);
    vi.spyOn(NativeBridgeModule, 'exitNativeApp').mockImplementation(mockExitApp);

    mockDismissSelection = vi.fn();
    mockHasStickySelection = vi.fn().mockReturnValue(false);
    vi.spyOn(TextSelectionModule, 'useTextSelection').mockReturnValue({
      hasStickySelection: mockHasStickySelection,
      dismissSelection: mockDismissSelection,
    } as any);

    initBackButtonListener(mockRouter as any);
  });

  afterEach(async () => {
    await disposeBackButtonListener();
    vi.restoreAllMocks();
  });

  describe('Priority 1: Active Reader Overlays / Selection / Modals', () => {
    it('should dismiss text selection and stop when sticky selection is active', async () => {
      mockHasStickySelection.mockReturnValue(true);

      await handleBackButtonPress();

      expect(mockDismissSelection).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should invoke registered Priority 1 overlay handler and stop if handled', async () => {
      const customOverlayHandler = vi.fn().mockReturnValue(true);
      registerBackHandler(customOverlayHandler, BACK_PRIORITY.OVERLAY);

      await handleBackButtonPress();

      expect(customOverlayHandler).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should close highlightStore note modal when open', async () => {
      const highlightStore = useHighlightStore();
      highlightStore.isNoteModalOpen = true;

      await handleBackButtonPress();

      expect(highlightStore.isNoteModalOpen).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should close highlightStore notes drawer when open', async () => {
      const highlightStore = useHighlightStore();
      highlightStore.isNotesDrawerOpen = true;

      await handleBackButtonPress();

      expect(highlightStore.isNotesDrawerOpen).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should close aiStore chat drawer when open', async () => {
      const aiStore = useAiStore();
      aiStore.isChatDrawerOpen = true;

      await handleBackButtonPress();

      expect(aiStore.isChatDrawerOpen).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should close aiStore dictionary modal when open', async () => {
      const aiStore = useAiStore();
      aiStore.isDictionaryModalOpen = true;

      await handleBackButtonPress();

      expect(aiStore.isDictionaryModalOpen).toBe(false);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });
  });

  describe('Priority 2: Non-Root Routes (Reader, Settings, Dictionary, etc.)', () => {
    it('should navigate directly to "/" using router.replace when route.path !== "/"', async () => {
      currentRoutePath = '/settings';
      mockRouter.currentRoute.value.path = '/settings';

      await handleBackButtonPress();

      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should invoke registered route exit handler before route replace on reader page', async () => {
      currentRoutePath = '/reader/book-123';
      mockRouter.currentRoute.value.path = '/reader/book-123';

      const customRouteHandler = vi.fn().mockReturnValue(true);
      registerBackHandler(customRouteHandler, BACK_PRIORITY.ROUTE);

      await handleBackButtonPress();

      expect(customRouteHandler).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockExitApp).not.toHaveBeenCalled();
    });
  });

  describe('Priority 3: Root Main Menu (route.path === "/")', () => {
    it('should close home-screen modal when a root modal handler returns true', async () => {
      currentRoutePath = '/';
      mockRouter.currentRoute.value.path = '/';

      const scannerModalHandler = vi.fn().mockReturnValue(true);
      registerBackHandler(scannerModalHandler, BACK_PRIORITY.ROOT_MODAL);

      await handleBackButtonPress();

      expect(scannerModalHandler).toHaveBeenCalledTimes(1);
      expect(mockExitApp).not.toHaveBeenCalled();
    });

    it('should cleanly exit the application when on root "/" with no modals open', async () => {
      currentRoutePath = '/';
      mockRouter.currentRoute.value.path = '/';

      await handleBackButtonPress();

      expect(mockExitApp).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('Listener Registration & Handler Lifecycle', () => {
    it('should register Capacitor App backButton listener on initialization', () => {
      expect(mockApp.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    });

    it('should allow unregistering handlers via returned unregister function', async () => {
      currentRoutePath = '/';
      mockRouter.currentRoute.value.path = '/';

      const customHandler = vi.fn().mockReturnValue(true);
      const unregister = registerBackHandler(customHandler, BACK_PRIORITY.ROOT_MODAL);

      unregister();

      await handleBackButtonPress();

      expect(customHandler).not.toHaveBeenCalled();
      expect(mockExitApp).toHaveBeenCalledTimes(1);
    });

    it('should prevent re-entrant/concurrent handling while a back action is executing', async () => {
      currentRoutePath = '/';
      mockRouter.currentRoute.value.path = '/';

      let resolveHandler: (v: boolean) => void = () => {};
      const slowHandler = vi.fn().mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveHandler = resolve;
          }),
      );
      registerBackHandler(slowHandler, BACK_PRIORITY.ROOT_MODAL);

      const firstCall = handleBackButtonPress();
      const secondCall = handleBackButtonPress();

      resolveHandler(true);
      await Promise.all([firstCall, secondCall]);

      expect(slowHandler).toHaveBeenCalledTimes(1);
    });
  });
});
