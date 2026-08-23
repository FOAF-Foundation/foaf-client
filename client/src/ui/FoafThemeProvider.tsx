import React from 'react';
import type { FoafUiTheme } from './theme';

/**
 * GrowOperative-matching defaults for every FoafUiTheme field, including the
 * ledger-balance and identicon tokens added in Phase 3. This is the single
 * fallback every UI component resolves against, so no token can land in a
 * StyleSheet as `undefined` or `NaN` (EC-9 / AC-11). Values mirror
 * growoperative-app/src/ui/theme (colors.ts, spacing.ts, SymmetricPixelAvatar).
 */
export const defaultFoafTheme: FoafUiTheme = {
  colors: {
    background: '#eef1f3',
    surface: '#ffffff',
    text: '#1a1a1a',
    mutedText: 'rgba(0, 0, 0, 0.4)',
    border: '#eaebee',
    primary: '#5ba85a',
    primaryText: '#ffffff',
    danger: '#dc2626',
    positive: '#5ba85a',
    balancePositive: '#5ba85a',
    balanceNegative: '#dc2626',
    balanceSettled: 'rgba(0, 0, 0, 0.4)',
    positiveBg: 'rgba(91, 168, 90, 0.12)',
    negativeBg: 'rgba(220, 38, 38, 0.12)',
    actionPay: '#5ba85a',
    actionRequest: '#3498db',
    actionOwe: '#f59e0b',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  radii: { sm: 4, md: 8, lg: 16 },
  typography: {
    bodySize: 14,
    titleSize: 16,
    numericFontVariant: ['tabular-nums'],
  },
  identiconPalettes: [
    ['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90'],
    ['#FFAD08', '#EDD75A', '#73B06F', '#0C8F8F', '#405059'],
    ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'],
    ['#86A8E7', '#7F7FD5', '#91EAE4', '#86A8E7', '#7F7FD5'],
  ],
};

/**
 * Deep-merges a partial theme onto defaultFoafTheme so every key resolves to a
 * concrete value. Nested objects (colors, spacing, radii, typography) are
 * merged shallow-per-object: the default object is spread first, then the
 * partial's keys spread over it, so a caller who overrides one color keeps the
 * rest of the defaults instead of blanking them (AC-11). identiconPalettes is a
 * whole-array override (falls back to the default set when absent).
 */
export function resolveTheme(partial: Partial<FoafUiTheme>): FoafUiTheme {
  return {
    colors: { ...defaultFoafTheme.colors, ...partial.colors },
    spacing: { ...defaultFoafTheme.spacing, ...partial.spacing },
    radii: { ...defaultFoafTheme.radii, ...partial.radii },
    typography: { ...defaultFoafTheme.typography, ...partial.typography },
    identiconPalettes: partial.identiconPalettes ?? defaultFoafTheme.identiconPalettes,
  };
}

export const FoafThemeContext = React.createContext<FoafUiTheme>(defaultFoafTheme);

export function FoafThemeProvider({
  theme,
  children,
}: {
  theme?: Partial<FoafUiTheme>;
  children: React.ReactNode;
}) {
  const resolved = React.useMemo(() => resolveTheme(theme ?? {}), [theme]);
  return <FoafThemeContext.Provider value={resolved}>{children}</FoafThemeContext.Provider>;
}

/**
 * Reads the resolved theme from context. Outside a provider it returns
 * defaultFoafTheme (createContext's default value), so a component never
 * crashes or reads undefined tokens when used standalone.
 */
export function useFoafTheme(): FoafUiTheme {
  return React.useContext(FoafThemeContext);
}
