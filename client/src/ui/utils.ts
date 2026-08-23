import type { TrustlineDirection, ViewerTrustlineBalance } from './hooks/types';

/**
 * "today" / "yesterday" / "N days ago" / "N weeks ago" / "N months ago", or ''
 * when the date is null. Ported from GrowOperative's ProfileContactPrimitives
 * `formatRelativeDate` (and onloan-app's `contactSinceLabel`), narrowed to the
 * five tiers this SDK needs and returning '' rather than a placeholder for a
 * missing/invalid date. English only (Spec Assumption).
 */
export function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return '';
  const diffDay = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(diffDay) || diffDay < 0) return '';
  if (diffDay === 0) return 'today';
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 14) return `${diffDay} days ago`;
  if (diffDay < 60) return `${Math.floor(diffDay / 7)} weeks ago`;
  return `${Math.floor(diffDay / 30)} months ago`;
}

/**
 * The visual decision for a contact's balance pill (FR-3.2 / AC-8), extracted as
 * a pure function so the sign convention is unit-testable without a renderer.
 *
 * The sign is read straight off `trustline.direction`, which `useTrustlineBalances`
 * ALREADY set from the POST-FLIP viewer balance:
 *   'owe-me'   → counterparty owes the viewer → GREEN, '+$X'
 *   'i-owe'    → the viewer owes counterparty → RED,   '−$X'
 *   'settled'  → no pill
 *   null       → no trustline yet → no pill
 * There is deliberately NO `balance < 0` branch here — re-deriving the sign from a
 * raw balance would double-flip what the hook already flipped.
 */
export interface BalancePill {
  sign: '+' | '−';
  /** Formatted absolute magnitude, e.g. '$12.00'. */
  amount: string;
  tone: 'positive' | 'negative';
}

export function balancePillFor(
  trustline: Pick<ViewerTrustlineBalance, 'balance' | 'direction'> | null,
): BalancePill | null {
  if (!trustline) return null;
  if (trustline.direction === 'settled') return null;
  const magnitude = Math.abs(Number(trustline.balance));
  const amount = `$${(Number.isFinite(magnitude) ? magnitude : 0).toFixed(2)}`;
  if (trustline.direction === 'owe-me') {
    return { sign: '+', amount, tone: 'positive' };
  }
  return { sign: '−', amount, tone: 'negative' };
}

/** Viewer-facing sublabel for the direction ('owes you' / 'you owe' / ''). */
export function directionLabel(direction: TrustlineDirection): string {
  if (direction === 'owe-me') return 'owes you';
  if (direction === 'i-owe') return 'you owe';
  return 'settled';
}

/**
 * ContactDetailScreen view mode (FR-3.5 / EC-1 / EC-2), extracted pure so the
 * unconfirmed-contact gate (AC-10) is testable without a renderer.
 *   'unconfirmed'  → contact.hasWallet === false: no ledger pill, no action
 *                    buttons, show the "not linked" message; do not call the
 *                    trustline-events hook.
 *   'ledger'       → hasWallet true: render the pill (or "No trustline yet" when
 *                    the trustline is null, EC-2) and the action buttons.
 */
export function detailViewMode(hasWallet: boolean): 'unconfirmed' | 'ledger' {
  return hasWallet ? 'ledger' : 'unconfirmed';
}

/**
 * Web layout constraint for the contact list (FR-3.4 / AC-7): the list content
 * must not stretch to the full browser-window width on desktop. A constant +
 * style object so the value is a token, not a literal buried in JSX, and so the
 * seam can be asserted without rendering.
 */
export const LIST_MAX_WIDTH = 430;

export const listContentWrapperStyle = {
  maxWidth: LIST_MAX_WIDTH,
  alignSelf: 'center' as const,
  width: '100%' as const,
};

/**
 * Best-effort viewer-oriented sign for a raw ledger event amount (FR-3.7).
 * A positive number reads as a credit to the viewer (+, green); a negative
 * number as a debit (−, red); anything non-numeric renders unsigned.
 *
 * COVERAGE CAVEAT (AC-8 scope): `TrustlineEvent` amount/direction is NOT
 * contract-pinned, so this is a display heuristic only — the AC-8 sign
 * guarantee is proven for the ContactBalanceRow PILL, not these rows. Unsigned
 * is the SAFE default: when the sign is ambiguous we do not guess a colour.
 */
export interface EventAmountDisplay {
  sign: '+' | '−' | '';
  amount: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export function eventAmountDisplay(amount: string | number): EventAmountDisplay {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) {
    return { sign: '', amount: `$${Number.isFinite(n) ? Math.abs(n).toFixed(2) : '0.00'}`, tone: 'neutral' };
  }
  const magnitude = `$${Math.abs(n).toFixed(2)}`;
  return n > 0
    ? { sign: '+', amount: magnitude, tone: 'positive' }
    : { sign: '−', amount: magnitude, tone: 'negative' };
}
