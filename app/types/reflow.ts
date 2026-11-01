export type ReflowBlockType = 'h2' | 'h3' | 'p';

export interface ReflowBlock {
  type: ReflowBlockType;
  text: string;
  pageNumber: number;
  id?: string;
}

export type ReflowFontFamily = 'sans' | 'serif' | 'mono';

export type ReflowTheme = 'light' | 'sepia' | 'dark';

export interface ReflowTypographySettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: ReflowFontFamily;
  theme: ReflowTheme;
}
