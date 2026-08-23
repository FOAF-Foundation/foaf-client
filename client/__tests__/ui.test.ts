import {
  defaultFoafTheme,
  FoafThemeContext,
  resolveTheme,
} from '../src/ui/FoafThemeProvider';
import { shouldShowImage } from '../src/ui/avatarFallback';
import type { FoafUiTheme } from '../src/ui/theme';

// testEnvironment is 'node' and the package ships no React renderer (see
// jest.config.cjs + the Phase 2 hooks tests). These seams are covered through
// their pure/exported surfaces:
//   - resolveTheme (AC-11) is pure — fully covered here.
//   - FoafThemeProvider context delivery (AC-11) is covered via the two pure
//     halves it is built from: the value it computes (resolveTheme) and the
//     value context yields with no provider (FoafThemeContext's default =
//     defaultFoafTheme, which useFoafTheme returns standalone).
//   - UserAvatar.web onError -> identicon swap (FR-3.3 / EC-6) is covered via
//     shouldShowImage, the pure predicate both platform variants use to decide
//     image-vs-identicon; onError sets failed=true, which the predicate reads.

function everyLeafDefined(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(everyLeafDefined);
  if (value && typeof value === 'object') {
    return Object.values(value).every(everyLeafDefined);
  }
  return value !== undefined && !(typeof value === 'number' && Number.isNaN(value));
}

describe('resolveTheme partial-coverage fallback (AC-11)', () => {
  it('fills every missing key from defaultFoafTheme when only one color is set', () => {
    const resolved = resolveTheme({ colors: { background: '#fff' } } as Partial<FoafUiTheme>);

    // The one override sticks...
    expect(resolved.colors.background).toBe('#fff');
    // ...and the untouched new + old keys fall back to the defaults.
    expect(resolved.colors.balancePositive).toBe(defaultFoafTheme.colors.balancePositive);
    expect(resolved.colors.balanceNegative).toBe(defaultFoafTheme.colors.balanceNegative);
    expect(resolved.colors.surface).toBe(defaultFoafTheme.colors.surface);
    expect(resolved.colors.actionPay).toBe(defaultFoafTheme.colors.actionPay);
  });

  it('resolves a pre-extension theme (only the original nine colors) with no undefined/NaN token', () => {
    // A theme authored before Phase 3 sets only the original contract.
    const legacy: Partial<FoafUiTheme> = {
      colors: {
        background: '#101010',
        surface: '#202020',
        text: '#f0f0f0',
        mutedText: '#888888',
        border: '#303030',
        primary: '#5ba85a',
        primaryText: '#ffffff',
        danger: '#dc2626',
        positive: '#5ba85a',
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
      radii: { sm: 4, md: 8, lg: 16 },
    };

    const resolved = resolveTheme(legacy);

    expect(everyLeafDefined(resolved)).toBe(true);
    // New tokens the legacy theme never knew about still resolve from defaults.
    expect(resolved.colors.positiveBg).toBe(defaultFoafTheme.colors.positiveBg);
    expect(resolved.typography?.numericFontVariant).toEqual(['tabular-nums']);
    expect(resolved.identiconPalettes).toEqual(defaultFoafTheme.identiconPalettes);
    expect(resolved.identiconPalettes).toHaveLength(4);
  });

  it('does not blank sibling nested keys when one nested object is partially overridden', () => {
    const resolved = resolveTheme({ spacing: { md: 20 } } as Partial<FoafUiTheme>);

    expect(resolved.spacing.md).toBe(20);
    expect(resolved.spacing.xs).toBe(defaultFoafTheme.spacing.xs);
    expect(resolved.spacing.lg).toBe(defaultFoafTheme.spacing.lg);
  });
});

describe('FoafThemeProvider context delivery (AC-11)', () => {
  it('delivers the provided theme values (resolveTheme output), not the raw defaults', () => {
    // This is exactly what FoafThemeProvider puts on context: resolveTheme(theme).
    const delivered = resolveTheme({ colors: { primary: '#123456' } } as Partial<FoafUiTheme>);

    expect(delivered.colors.primary).toBe('#123456');
    expect(delivered.colors.primary).not.toBe(defaultFoafTheme.colors.primary);
    // Non-overridden keys still resolve, so no consumer reads undefined.
    expect(everyLeafDefined(delivered)).toBe(true);
  });

  it('yields defaultFoafTheme when read with no provider (useFoafTheme fallback)', () => {
    // useFoafTheme() === useContext(FoafThemeContext); with no provider that is
    // the context default. Assert the default value is the full default theme.
    // (React types the default as private; reading it is the documented seam for
    // "outside a provider, tokens are the defaults".)
    const contextDefault = (FoafThemeContext as unknown as { _currentValue: FoafUiTheme })
      ._currentValue;

    expect(contextDefault).toBe(defaultFoafTheme);
    expect(everyLeafDefined(contextDefault)).toBe(true);
  });
});

describe('UserAvatar EC-6 onError -> identicon swap (FR-3.3)', () => {
  it('shows the image while a URL is present and unerrored', () => {
    expect(shouldShowImage(false, 'https://cdn/avatar.png')).toBe(true);
  });

  it('falls back to the identicon after onError flips failed=true', () => {
    // Web variant: showImage ? <Image onError=setFailed(true)/> : <identicon/>.
    // Native variant: identicon base + image overlay hidden when showImage false.
    // Either way, once failed the image must not show and the identicon renders.
    const beforeError = shouldShowImage(false, 'https://cdn/broken.png');
    const afterError = shouldShowImage(true, 'https://cdn/broken.png');

    expect(beforeError).toBe(true);
    expect(afterError).toBe(false); // -> SymmetricPixelAvatar is what renders
  });

  it('shows the identicon when there is no image URL at all', () => {
    expect(shouldShowImage(false, null)).toBe(false);
    expect(shouldShowImage(false, undefined)).toBe(false);
    expect(shouldShowImage(false, '')).toBe(false);
  });
});
