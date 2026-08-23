import {
  defaultFoafTheme,
  FoafThemeContext,
  resolveTheme,
} from '../src/ui/FoafThemeProvider';
import { shouldShowImage } from '../src/ui/avatarFallback';
import {
  balancePillFor,
  capacityExceededMessage,
  detailViewMode,
  eventAmountDisplay,
  exceedsCapacity,
  formatRelativeDate,
  initialPaymentSubmitState,
  LIST_MAX_WIDTH,
  listContentWrapperStyle,
  paymentModalCopy,
  paymentSubmitReducer,
  quickAmountChips,
} from '../src/ui/utils';
import type { FoafUiTheme } from '../src/ui/theme';
import type { ViewerTrustlineBalance } from '../src/ui/hooks/types';

// testEnvironment is 'node' and the package ships no React renderer (see
// jest.config.cjs + the Phase 2/3a tests). The Phase 3b component seams below
// are each delegated to a pure exported helper (as 3a did with shouldShowImage),
// so they are asserted through that helper rather than a rendered tree:
//   - ContactBalanceRow's pill sign (AC-8) is `balancePillFor`, which the row
//     renders verbatim (green/'+' for 'owe-me', red/'−' for 'i-owe', null pill
//     for 'settled'/no-trustline). No `balance < 0` branch exists.
//   - ContactDetailScreen's EC-1 gate (AC-10) is `detailViewMode(hasWallet)`:
//     'unconfirmed' means the screen mounts neither the pill nor the action
//     buttons and shows the "not linked" message (the LedgerDetail subtree — the
//     only place the trustline hooks and buttons live — is not mounted).
//   - ContactListScreen's web max-width (AC-7) is `listContentWrapperStyle`,
//     the exact style object the screen wraps its content in.

function trustline(
  direction: ViewerTrustlineBalance['direction'],
  balance: string,
): ViewerTrustlineBalance {
  return {
    counterPartyAddress: '0xcp',
    balance,
    received: '100',
    given: '100',
    direction,
    availableCapacity: '100',
  };
}

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

describe('ContactBalanceRow balance pill sign (AC-8)', () => {
  // The hook already flipped the sign into the viewer's frame, so the pill reads
  // trustline.direction as-is — 'owe-me' is green/'+', never re-derived from a
  // raw `balance < 0` comparison.
  it("shows a green '+$X' pill for direction 'owe-me' (counterparty owes viewer)", () => {
    const pill = balancePillFor(trustline('owe-me', '12'));
    expect(pill).not.toBeNull();
    expect(pill?.sign).toBe('+');
    expect(pill?.amount).toBe('$12.00');
    expect(pill?.tone).toBe('positive'); // -> balancePositive / positiveBg (green)
  });

  it("shows a red '−$X' pill for direction 'i-owe' (viewer owes counterparty)", () => {
    // The post-flip balance for 'i-owe' is negative; the pill shows the magnitude
    // with a red minus, from the direction — not from re-negating the number.
    const pill = balancePillFor(trustline('i-owe', '-12'));
    expect(pill).not.toBeNull();
    expect(pill?.sign).toBe('−');
    expect(pill?.amount).toBe('$12.00');
    expect(pill?.tone).toBe('negative'); // -> balanceNegative / negativeBg (red)
  });

  it("renders no pill for direction 'settled'", () => {
    expect(balancePillFor(trustline('settled', '0'))).toBeNull();
  });

  it('renders no pill when there is no trustline yet (null)', () => {
    expect(balancePillFor(null)).toBeNull();
  });

  it('does not re-derive the sign from the raw balance number', () => {
    // Even if a positive-magnitude balance string were paired with 'i-owe', the
    // pill follows the direction (red '−'), proving the sign is not read from the
    // number's own sign. This is the anti-double-flip guard.
    const pill = balancePillFor(trustline('i-owe', '12'));
    expect(pill?.sign).toBe('−');
    expect(pill?.tone).toBe('negative');
  });
});

describe('ContactDetailScreen EC-1 unconfirmed contact (AC-10)', () => {
  it("resolves to 'unconfirmed' when the contact has no wallet", () => {
    // 'unconfirmed' => the screen mounts the "not linked" message and mounts
    // neither the trustline pill nor the Pay/Request/I Owe More buttons (the
    // LedgerDetail subtree that holds them is not rendered), and the events hook
    // never runs. No exception is thrown resolving this.
    expect(detailViewMode(false)).toBe('unconfirmed');
  });

  it("resolves to 'ledger' when the contact has a wallet", () => {
    expect(detailViewMode(true)).toBe('ledger');
  });
});

describe('ContactListScreen web max-width (AC-7)', () => {
  it('constrains list content to a centered 430-wide column', () => {
    // This is the exact style object the screen wraps its content View in.
    expect(LIST_MAX_WIDTH).toBe(430);
    expect(listContentWrapperStyle.maxWidth).toBe(430);
    expect(listContentWrapperStyle.alignSelf).toBe('center');
    expect(listContentWrapperStyle.width).toBe('100%');
  });
});

describe('formatRelativeDate (FR-3.2 utility)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("returns '' for a null date", () => {
    expect(formatRelativeDate(null)).toBe('');
  });

  it("returns '' for an unparseable date", () => {
    expect(formatRelativeDate('not-a-date')).toBe('');
  });

  it("returns 'today' for now", () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe('today');
  });

  it("returns 'yesterday' for ~1 day ago", () => {
    expect(formatRelativeDate(new Date(Date.now() - DAY - 1000).toISOString())).toBe('yesterday');
  });

  it('returns days / weeks / months for the respective ranges', () => {
    expect(formatRelativeDate(new Date(Date.now() - 5 * DAY).toISOString())).toBe('5 days ago');
    expect(formatRelativeDate(new Date(Date.now() - 21 * DAY).toISOString())).toBe('3 weeks ago');
    expect(formatRelativeDate(new Date(Date.now() - 90 * DAY).toISOString())).toBe('3 months ago');
  });
});

describe('eventAmountDisplay (FR-3.7 best-effort sign)', () => {
  it('renders a positive amount as a green +', () => {
    expect(eventAmountDisplay(5)).toEqual({ sign: '+', amount: '$5.00', tone: 'positive' });
  });

  it('renders a negative amount as a red −', () => {
    expect(eventAmountDisplay(-5)).toEqual({ sign: '−', amount: '$5.00', tone: 'negative' });
  });

  it('renders zero and non-numeric amounts unsigned (safe default)', () => {
    expect(eventAmountDisplay(0)).toEqual({ sign: '', amount: '$0.00', tone: 'neutral' });
    expect(eventAmountDisplay('abc')).toEqual({ sign: '', amount: '$0.00', tone: 'neutral' });
  });
});

// testEnvironment is 'node' with no React renderer. The three PaymentModal seams
// the checkpoint pins are each delegated to a pure exported helper (same
// precedent as shouldShowImage / balancePillFor / detailViewMode), so the modal
// renders them verbatim and they are asserted here without a rendered tree:
//   - AC-9 capacity guard  → `exceedsCapacity` gates the disabled submit +
//     `capacityExceededMessage` is the inline text.
//   - EC-8 onSubmit reject → `paymentSubmitReducer`: a rejected submit lands in
//     `error`, and `success` is unreachable from anything but an explicit
//     `resolve` (no silent success).
//   - mode microcopy       → `paymentModalCopy('i-owe')` carries the "I Owe More"
//     label in both title and submit button.

describe('PaymentModal capacity guard (AC-9)', () => {
  // The modal disables submit and shows this inline message exactly when
  // exceedsCapacity is true; amount '15' vs availableCapacity '10.00'.
  it('flags amount 15 over a 10.00 capacity as exceeding, disabling submit', () => {
    expect(exceedsCapacity('15', '10.00')).toBe(true);
    // The modal's submitDisabled = !amountValid || overCapacity || submitting.
    // With a valid amount and no in-flight submit, the guard alone disables it.
    expect(capacityExceededMessage('10.00')).toBe('Exceeds available capacity of $10.00');
  });

  it('does not flag an amount at or under capacity', () => {
    expect(exceedsCapacity('10.00', '10.00')).toBe(false);
    expect(exceedsCapacity('9.99', '10.00')).toBe(false);
  });

  it('never guards when no capacity is supplied (host opted out) or amount is blank/zero', () => {
    expect(exceedsCapacity('15', undefined)).toBe(false);
    expect(exceedsCapacity('15', '')).toBe(false);
    expect(exceedsCapacity('', '10.00')).toBe(false);
    expect(exceedsCapacity('0', '10.00')).toBe(false);
    expect(exceedsCapacity('abc', '10.00')).toBe(false);
  });

  it('offers Full/Half chips when capacity is known, else the fixed ladder', () => {
    expect(quickAmountChips('10.00')).toEqual([
      { label: 'Full $10.00', value: 10 },
      { label: 'Half $5.00', value: 5 },
    ]);
    expect(quickAmountChips(undefined).map((c) => c.label)).toEqual(['$5', '$10', '$25', '$50']);
    // A non-positive capacity falls back to the default ladder rather than
    // offering a $0 "Full" chip.
    expect(quickAmountChips('0').map((c) => c.label)).toEqual(['$5', '$10', '$25', '$50']);
  });
});

describe('PaymentModal onSubmit rejection → error, not silent success (EC-8)', () => {
  it('lands a rejected in-flight submit in the error state with the message', () => {
    const submitting = paymentSubmitReducer(initialPaymentSubmitState, { type: 'submit' });
    expect(submitting.status).toBe('submitting');

    const rejected = paymentSubmitReducer(submitting, { type: 'reject', message: 'boom' });
    expect(rejected.status).toBe('error');
    expect(rejected.status).not.toBe('success'); // the silent-success bug EC-8 guards
    expect(rejected.error).toBe('boom');
  });

  it('reaches success ONLY via resolve from an in-flight submit', () => {
    const submitting = paymentSubmitReducer(initialPaymentSubmitState, { type: 'submit' });
    expect(paymentSubmitReducer(submitting, { type: 'resolve' }).status).toBe('success');

    // resolve/reject are ignored unless a submit is in flight, so a stray
    // resolve can never fabricate a success out of idle/error.
    expect(paymentSubmitReducer(initialPaymentSubmitState, { type: 'resolve' }).status).toBe('idle');
    const errored = paymentSubmitReducer(submitting, { type: 'reject', message: 'x' });
    expect(paymentSubmitReducer(errored, { type: 'resolve' }).status).toBe('error');
  });

  it('reset returns to idle so retry/reopen starts clean', () => {
    const submitting = paymentSubmitReducer(initialPaymentSubmitState, { type: 'submit' });
    const errored = paymentSubmitReducer(submitting, { type: 'reject', message: 'x' });
    expect(paymentSubmitReducer(errored, { type: 'reset' })).toEqual(initialPaymentSubmitState);
  });
});

describe('PaymentModal mode microcopy (checkpoint seam 3)', () => {
  it("surfaces 'I Owe More' in both the title and the submit label for 'i-owe'", () => {
    const copy = paymentModalCopy('i-owe');
    expect(copy.title).toBe('I Owe More');
    expect(copy.submitLabel).toContain('I Owe More');
    expect(copy.submitting).toBe('Recording debt…');
    expect(copy.success).toBe('Debt recorded');
  });

  it('carries GrowOp-matching status verbs per mode', () => {
    expect(paymentModalCopy('pay')).toMatchObject({ submitting: 'Sending…', success: 'Payment sent', error: 'Payment failed' });
    expect(paymentModalCopy('float')).toMatchObject({ submitting: 'Sending…', success: 'Payment sent' });
    expect(paymentModalCopy('request')).toMatchObject({ submitting: 'Requesting…', success: 'Request sent', error: 'Request failed' });
    expect(paymentModalCopy('received')).toMatchObject({ submitting: 'Recording…', success: 'Recorded' });
  });
});
