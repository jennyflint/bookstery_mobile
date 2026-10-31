import { vi } from 'vitest';

export const mockNetworkStatus = {
  connected: true,
  connectionType: 'wifi',
};

export const mockNetwork = {
  getStatus: vi.fn().mockImplementation(async () => mockNetworkStatus),
  addListener: vi.fn().mockImplementation((_event: string, callback: (status: typeof mockNetworkStatus) => void) => {
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
  },
  readFile: vi.fn().mockResolvedValue({ data: 'mock-file-content' }),
  writeFile: vi.fn().mockResolvedValue({ uri: 'file:///mock/path' }),
  copy: vi.fn().mockResolvedValue({ uri: 'file:///mock/dest' }),
  stat: vi.fn().mockResolvedValue({ size: 1024, mtime: Date.now() }),
  readdir: vi.fn().mockResolvedValue({ files: [] }),
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

export const mockApp = {
  addListener: vi.fn().mockImplementation((event: string, callback: (state: { isActive: boolean }) => void) => {
    return {
      remove: vi.fn(),
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

export const mockSqliteDatabase = {
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  execute: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
  run: vi.fn().mockResolvedValue({ changes: { changes: 1 } }),
  query: vi.fn().mockResolvedValue({ values: [] }),
  isDBOpen: vi.fn().mockResolvedValue({ result: true }),
};
