import { vi } from 'vitest';

export const mockNetworkStatus = {
  connected: true,
  connectionType: 'wifi',
};

export const mockNetwork = {
  getStatus: vi.fn().mockImplementation(async () => mockNetworkStatus),
  addListener: vi
    .fn()
    .mockImplementation((_event: string, callback: (status: typeof mockNetworkStatus) => void) => {
      return {
        remove: vi.fn(),
      };
    }),
};

export const mockFilesystem = {
  Directory: {
    Data: 'DATA',
    Documents: 'DOCUMENTS',
    Cache: 'CACHE',
    External: 'EXTERNAL',
    ExternalStorage: 'EXTERNAL_STORAGE',
  },
  checkPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' }),
  requestPermissions: vi.fn().mockResolvedValue({ publicStorage: 'granted' }),
  readFile: vi.fn().mockResolvedValue({ data: 'mock-file-content' }),
  writeFile: vi.fn().mockResolvedValue({ uri: 'file:///mock/path' }),
  copy: vi.fn().mockResolvedValue({ uri: 'file:///mock/dest' }),
  stat: vi.fn().mockResolvedValue({ size: 1024, mtime: Date.now() }),
  readdir: vi.fn().mockResolvedValue({ files: [] }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
};

export const mockClipboard = {
  read: vi.fn().mockResolvedValue({ value: 'copied text sample' }),
  write: vi.fn().mockResolvedValue(undefined),
};

export const mockKeepAwake = {
  keepAwake: vi.fn().mockResolvedValue(undefined),
  allowSleep: vi.fn().mockResolvedValue(undefined),
  isSupported: vi.fn().mockResolvedValue({ isSupported: true }),
};

export const mockScreenOrientation = {
  lock: vi.fn().mockResolvedValue(undefined),
  unlock: vi.fn().mockResolvedValue(undefined),
  orientation: vi.fn().mockResolvedValue({ type: 'portrait-primary' }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
};

export const ScreenOrientation = mockScreenOrientation;

export const mockTextToSpeech = {
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  getSupportedVoices: vi.fn().mockResolvedValue({
    voices: [
      { default: true, lang: 'uk-UA', name: 'Ukrainian Voice', voiceURI: 'uk-voice-1' },
      { default: false, lang: 'en-US', name: 'English Voice', voiceURI: 'en-voice-1' },
    ],
  }),
  getSupportedLanguages: vi.fn().mockResolvedValue({
    languages: ['uk-UA', 'en-US'],
  }),
  openInstall: vi.fn().mockResolvedValue(undefined),
};

export const mockApp = {
  addListener: vi
    .fn()
    .mockImplementation(async (_event: string, _callback: (...args: any[]) => void) => {
      return {
        remove: vi.fn().mockResolvedValue(undefined),
      };
    }),
  exitApp: vi.fn(),
};

export const mockGoogleAuth = {
  initialize: vi.fn().mockResolvedValue(undefined),
  signIn: vi.fn().mockResolvedValue({
    id: 'google-user-123',
    email: 'reader@example.com',
    name: 'Book Reader',
    imageUrl: 'https://example.com/avatar.png',
    authentication: {
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
    },
  }),
  refresh: vi.fn().mockResolvedValue({
    accessToken: 'mock-refreshed-token',
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
};

export const mockBooksteryGoogleAuth = {
  initialize: vi.fn().mockResolvedValue(undefined),
  signIn: vi.fn().mockResolvedValue({
    id: 'native-google-user-456',
    email: 'native-reader@example.com',
    name: 'Native Book Reader',
    givenName: 'Native',
    familyName: 'Reader',
    imageUrl: 'https://example.com/native-avatar.png',
    accessToken: 'mock-native-access-token',
    authentication: {
      accessToken: 'mock-native-access-token',
      idToken: '',
    },
  }),
  refresh: vi.fn().mockResolvedValue({
    accessToken: 'mock-refreshed-native-token',
    authentication: {
      accessToken: 'mock-refreshed-native-token',
      idToken: '',
    },
  }),
  signOut: vi.fn().mockResolvedValue(undefined),
};

export const mockSqliteConnection = {
  createConnection: vi.fn(),
  closeConnection: vi.fn(),
  isConnection: vi.fn(),
  retrieveConnection: vi.fn(),
};

export const mockShare = {
  share: vi.fn().mockResolvedValue({ activityType: undefined }),
};

export const Share = mockShare;

export const mockFilePicker = {
  pickDirectory: vi.fn().mockResolvedValue({
    path: 'content://com.android.externalstorage.documents/tree/primary%3ABooks',
  }),
  pickFiles: vi.fn().mockResolvedValue({ files: [] }),
};

export const FilePicker = mockFilePicker;

export const mockSqliteDatabase = {
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  execute: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
  run: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
  query: vi.fn().mockResolvedValue({ values: [] }),
  isDBOpen: vi.fn().mockResolvedValue({ result: true }),
};

export const ImpactStyle = {
  Heavy: 'HEAVY',
  Medium: 'MEDIUM',
  Light: 'LIGHT',
};

export const mockVolumeButtons = {
  setVolumeInterception: vi.fn().mockImplementation(async ({ enabled }: { enabled: boolean }) => ({ enabled })),
  isInterceptionEnabled: vi.fn().mockImplementation(async () => ({ enabled: false })),
  addListener: vi
    .fn()
    .mockImplementation(async (_event: string, _callback: (event: { direction: 'up' | 'down' }) => void) => {
      return {
        remove: vi.fn().mockResolvedValue(undefined),
      };
    }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
};

export const VolumeButtons = mockVolumeButtons;

export const mockHaptics = {
  impact: vi.fn().mockResolvedValue(undefined),
  selectionChanged: vi.fn().mockResolvedValue(undefined),
  selectionStart: vi.fn().mockResolvedValue(undefined),
  selectionEnd: vi.fn().mockResolvedValue(undefined),
};

export const Haptics = mockHaptics;
