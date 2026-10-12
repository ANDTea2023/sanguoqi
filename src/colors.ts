import { COUNTRIES, type Country } from './engine';

export type PieceColors = Record<Country, string>;
export const DEFAULT_PIECE_COLORS: PieceColors = { wei: '#1D4ED8', shu: '#BE123C', wu: '#047857' };
export const ORIGINAL_PIECE_COLORS: PieceColors = { wei: '#455D76', shu: '#B45B4E', wu: '#4B7A62' };

/** Validate custom colors before they are interpolated into SVG or styles. */
export function validPieceColors(value: unknown): value is Partial<PieceColors> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([country, color]) => COUNTRIES.includes(country as Country) && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
}

export function resolvePieceColors(value: unknown): PieceColors {
  return validPieceColors(value) ? { ...DEFAULT_PIECE_COLORS, ...value } : { ...DEFAULT_PIECE_COLORS };
}

/** Choose the more legible black/white text for any user-selected piece face. */
export function pieceTextColor(hex: string): '#FFFFFF' | '#000000' {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return 1.05 / (luminance + .05) >= (luminance + .05) / .05 ? '#FFFFFF' : '#000000';
}
