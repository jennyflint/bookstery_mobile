import { vi } from 'vitest';

export const mockRenderTask = {
  promise: Promise.resolve(),
  cancel: vi.fn(),
};

export const mockPdfPage = {
  getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
  render: vi.fn().mockReturnValue(mockRenderTask),
  getTextContent: vi.fn().mockResolvedValue({
    items: [
      { str: 'Sample page content', transform: [1, 0, 0, 1, 0, 0], width: 100, height: 20 },
    ],
  }),
  cleanup: vi.fn(),
};

export const mockPdfDocument = {
  numPages: 10,
  getPage: vi.fn().mockResolvedValue(mockPdfPage),
  destroy: vi.fn().mockResolvedValue(undefined),
};

export const mockEpubRendition = {
  display: vi.fn().mockResolvedValue(undefined),
  next: vi.fn().mockResolvedValue(undefined),
  prev: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
  on: vi.fn(),
  themes: {
    default: vi.fn(),
    fontSize: vi.fn(),
  },
  currentLocation: vi.fn().mockReturnValue({
    start: {
      cfi: 'epubcfi(/6/4[chap01]!/4/2/1:0)',
      percentage: 0.25,
      displayed: { page: 1, total: 4 },
    },
  }),
};

export const mockEpubBook = {
  ready: Promise.resolve(),
  renderTo: vi.fn().mockReturnValue(mockEpubRendition),
  locations: {
    generate: vi.fn().mockResolvedValue([]),
    percentageFromCfi: vi.fn().mockReturnValue(0.25),
    cfiFromPercentage: vi.fn().mockReturnValue('epubcfi(/6/4[chap01]!/4/2/1:0)'),
  },
  destroy: vi.fn(),
};
