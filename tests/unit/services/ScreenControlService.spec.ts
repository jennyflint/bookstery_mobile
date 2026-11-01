import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { ScreenControlService } from '~/services/ScreenControlService';
import { mockKeepAwake, mockScreenOrientation } from '../../mocks/capacitor-plugins';

describe('ScreenControlService', () => {
  let service: ScreenControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ScreenControlService.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setKeepAwake', () => {
    it('should call KeepAwake.keepAwake when enabled is true and isSupported returns true', async () => {
      mockKeepAwake.isSupported.mockResolvedValueOnce({ isSupported: true });

      await service.setKeepAwake(true);

      expect(mockKeepAwake.isSupported).toHaveBeenCalled();
      expect(mockKeepAwake.keepAwake).toHaveBeenCalled();
      expect(mockKeepAwake.allowSleep).not.toHaveBeenCalled();
    });

    it('should not call KeepAwake.keepAwake if isSupported returns false', async () => {
      mockKeepAwake.isSupported.mockResolvedValueOnce({ isSupported: false });

      await service.setKeepAwake(true);

      expect(mockKeepAwake.isSupported).toHaveBeenCalled();
      expect(mockKeepAwake.keepAwake).not.toHaveBeenCalled();
    });

    it('should call KeepAwake.allowSleep when enabled is false', async () => {
      await service.setKeepAwake(false);

      expect(mockKeepAwake.allowSleep).toHaveBeenCalled();
      expect(mockKeepAwake.keepAwake).not.toHaveBeenCalled();
    });

    it('should catch errors gracefully without throwing', async () => {
      mockKeepAwake.isSupported.mockRejectedValueOnce(new Error('Hardware unsupported'));
      mockKeepAwake.keepAwake.mockRejectedValueOnce(new Error('Wake lock failed'));

      await expect(service.setKeepAwake(true)).resolves.not.toThrow();
    });
  });

  describe('applyOrientation (Native)', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    });

    it('should call ScreenOrientation.unlock when mode is auto', async () => {
      await service.applyOrientation('auto');

      expect(mockScreenOrientation.unlock).toHaveBeenCalled();
      expect(mockScreenOrientation.lock).not.toHaveBeenCalled();
    });

    it('should call ScreenOrientation.lock with portrait when mode is portrait', async () => {
      await service.applyOrientation('portrait');

      expect(mockScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'portrait' });
    });

    it('should call ScreenOrientation.lock with landscape when mode is landscape', async () => {
      await service.applyOrientation('landscape');

      expect(mockScreenOrientation.lock).toHaveBeenCalledWith({ orientation: 'landscape' });
    });

    it('should catch plugin errors gracefully', async () => {
      mockScreenOrientation.lock.mockRejectedValueOnce(new Error('Native lock failed'));

      await expect(service.applyOrientation('portrait')).resolves.not.toThrow();
    });
  });

  describe('applyOrientation (Web Fallback)', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    });

    it('should call window.screen.orientation.unlock when mode is auto', async () => {
      const mockWebUnlock = vi.fn();
      vi.stubGlobal('screen', {
        orientation: {
          unlock: mockWebUnlock,
          lock: vi.fn(),
        },
      });

      await service.applyOrientation('auto');

      expect(mockWebUnlock).toHaveBeenCalled();
    });

    it('should call window.screen.orientation.lock when mode is portrait or landscape', async () => {
      const mockWebLock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('screen', {
        orientation: {
          unlock: vi.fn(),
          lock: mockWebLock,
        },
      });

      await service.applyOrientation('portrait');
      expect(mockWebLock).toHaveBeenCalledWith('portrait');

      await service.applyOrientation('landscape');
      expect(mockWebLock).toHaveBeenCalledWith('landscape');
    });

    it('should catch web orientation lock rejection gracefully', async () => {
      const mockWebLock = vi.fn().mockRejectedValue(new Error('Not allowed'));
      vi.stubGlobal('screen', {
        orientation: {
          unlock: vi.fn(),
          lock: mockWebLock,
        },
      });

      await expect(service.applyOrientation('portrait')).resolves.not.toThrow();
    });
  });
});
