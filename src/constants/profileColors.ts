// Profile colors: the fixed palette a member can tint their profile page with. No color (the
// default) keeps the plain header. Each color has a deeper shade for the light theme and a
// paler one for the dark theme, both readable as text on that theme's background; the page
// mixes them with the background for the soft band behind the header. To add a color, add
// it here; the stored setting takes any key this list allows.
export const PROFILE_COLORS = [
  'rose',
  'coral',
  'amber',
  'olive',
  'sage',
  'teal',
  'sky',
  'indigo',
  'violet',
  'plum',
  'slate',
  'sand',
] as const;

export type ProfileColor = (typeof PROFILE_COLORS)[number];

export const PROFILE_COLOR_SHADES: Record<
  ProfileColor,
  { label: string; light: string; dark: string }
> = {
  rose: {
    label: 'Rose',
    light: '#be3a5f',
    dark: '#f08aa5',
  },
  coral: {
    label: 'Coral',
    light: '#c0503a',
    dark: '#f4a08a',
  },
  amber: {
    label: 'Amber',
    light: '#9a6200',
    dark: '#f2bf5e',
  },
  olive: {
    label: 'Olive',
    light: '#66711c',
    dark: '#c5d07a',
  },
  sage: {
    label: 'Sage',
    light: '#4a7656',
    dark: '#9fcca9',
  },
  teal: {
    label: 'Teal',
    light: '#1c7570',
    dark: '#7fd1c9',
  },
  sky: {
    label: 'Sky',
    light: '#2a74a8',
    dark: '#8cc8f0',
  },
  indigo: {
    label: 'Indigo',
    light: '#4c56b8',
    dark: '#a3abf2',
  },
  violet: {
    label: 'Violet',
    light: '#7548b3',
    dark: '#c3a3f0',
  },
  plum: {
    label: 'Plum',
    light: '#8e3f7e',
    dark: '#e09ad0',
  },
  slate: {
    label: 'Slate',
    light: '#52606d',
    dark: '#aab7c4',
  },
  sand: {
    label: 'Sand',
    light: '#80643f',
    dark: '#d8bf9c',
  },
};

export function isProfileColor(value: unknown): value is ProfileColor {
  return typeof value === 'string' && (PROFILE_COLORS as readonly string[]).includes(value);
}
