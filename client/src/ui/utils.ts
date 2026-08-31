import type {
  PaymentModalAction,
  TrustlineDirection,
  TrustlineEvent,
  ViewerTrustlineBalance,
} from './hooks/types';

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

/**
 * Viewer-oriented display for one TRANSFER event (FR-3.7), against the live
 * wire shape (contracts/trustline-events.json). Non-Transfer kinds (e.g.
 * BalanceUpdate bookkeeping rows) return null and are not rendered. Sign:
 * a transfer FROM the viewer settles/extends credit toward the counterparty
 * ('+', positive — matches GrowOperative's activity list), a transfer TO the
 * viewer is '\u2212' negative; a transfer not involving the viewer renders
 * unsigned. Display formatting only — no amount arithmetic.
 */
export interface TransferEventMeta {
  /** App-supplied comment ("Dog food"). */
  description: string | null;
  /** Which FOAF app recorded the operation ("growoperative", "onloan"). */
  app: string | null;
  /** Operation kind ("adjustment" | "payment" | "settlement" | ...). */
  operation: string | null;
}

/**
 * Parses the wire's `extraData` JSON string (app attribution + description +
 * operation kind, as recorded by the originating app). Tolerant: absent or
 * malformed extraData yields all-null meta, never a throw.
 */
export function parseEventExtraData(extraData: unknown): TransferEventMeta {
  const empty: TransferEventMeta = { description: null, app: null, operation: null };
  if (typeof extraData !== 'string' || extraData.length === 0) return empty;
  try {
    const parsed = JSON.parse(extraData) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return empty;
    return {
      description: typeof parsed.description === 'string' && parsed.description ? parsed.description : null,
      app: typeof parsed.app === 'string' && parsed.app ? parsed.app : null,
      operation: typeof parsed.operation === 'string' && parsed.operation ? parsed.operation : null,
    };
  } catch {
    return empty;
  }
}

export function transferEventDisplay(
  event: {
    type: string;
    from: string;
    to: string;
    value?: string | number;
    timestamp: number;
    transactionId?: string | number;
    extraData?: unknown;
  },
  viewerAddress: string,
): (EventAmountDisplay & { dateIso: string; meta: TransferEventMeta; txId: string | null }) | null {
  if (event.type !== 'Transfer') return null;
  const n = Number(event.value);
  if (!Number.isFinite(n)) return null;
  const magnitude = `$${Math.abs(n).toFixed(2)}`;
  const viewer = viewerAddress.toLowerCase();
  const dateIso = new Date(event.timestamp * 1000).toISOString();
  const meta = parseEventExtraData(event.extraData);
  const txId = event.transactionId !== undefined ? String(event.transactionId) : null;
  if (event.from.toLowerCase() === viewer) {
    return { sign: '+', amount: magnitude, tone: 'positive', dateIso, meta, txId };
  }
  if (event.to.toLowerCase() === viewer) {
    return { sign: '\u2212', amount: magnitude, tone: 'negative', dateIso, meta, txId };
  }
  return { sign: '', amount: magnitude, tone: 'neutral', dateIso, meta, txId };
}

export interface RunningBalance {
  /** Viewer-oriented balance BEFORE this transaction (positive = owed to viewer). */
  before: number;
  /** Viewer-oriented balance AFTER this transaction. */
  after: number;
}

const roundCents = (n: number): number => Math.round(n * 100) / 100;

/**
 * Per-event running balance, ANCHORED to the viewer's authoritative trustline
 * balance and walked backward from the newest transfer — never summed from zero.
 *
 * The events feed is capped (FoafLedgerClient fetches only the last N), so a
 * sum-from-zero under-counts by whatever was truncated and re-skews as new
 * activity ages older events off the window. Anchoring the newest row to the
 * current balance and subtracting each delta backward keeps the newest row equal
 * to the balance shown everywhere else and is immune to feed truncation. (Ported
 * from GrowOperative's Foaf::AuditService#events_for_trustline.)
 *
 * `anchorBalance` is viewer-oriented (ViewerTrustlineBalance.balance: positive =
 * counterparty owes the viewer, negative = the viewer owes). A Transfer FROM the
 * viewer moves it by -value (viewer owes more); a Transfer TO the viewer by
 * +value. Returns a Map keyed by event reference (display order is the caller's
 * business); an absent/non-finite anchor yields an empty Map, so callers fall
 * back to a balance-free, delta-only list.
 */
export function runningBalanceByEvent(
  events: TrustlineEvent[],
  viewerAddress: string,
  anchorBalance: string | number | null | undefined,
): Map<TrustlineEvent, RunningBalance> {
  const result = new Map<TrustlineEvent, RunningBalance>();
  const anchor = Number(anchorBalance);
  if (anchorBalance == null || anchorBalance === '' || !Number.isFinite(anchor)) return result;

  const viewer = viewerAddress.toLowerCase();
  // Balance-moving transfers the viewer is party to, in chronological order.
  const chron = events
    .map((event, i) => ({ event, i }))
    .filter(({ event }) => {
      if (event.type !== 'Transfer' || !Number.isFinite(Number(event.value))) return false;
      const from = event.from?.toLowerCase();
      const to = event.to?.toLowerCase();
      return from === viewer || to === viewer;
    })
    .sort((a, b) => {
      const dt = a.event.timestamp - b.event.timestamp;
      if (dt !== 0) return dt;
      const ka = Number(a.event.transactionId ?? a.event.blockNumber ?? a.i);
      const kb = Number(b.event.transactionId ?? b.event.blockNumber ?? b.i);
      if (Number.isFinite(ka) && Number.isFinite(kb) && ka !== kb) return ka - kb;
      return a.i - b.i;
    })
    .map(({ event }) => event);

  // Walk newest -> oldest, pinning the newest 'after' to the anchor balance.
  let after = roundCents(anchor);
  for (let idx = chron.length - 1; idx >= 0; idx--) {
    const event = chron[idx];
    const value = Number(event.value);
    const delta = event.from.toLowerCase() === viewer ? -value : value;
    const before = roundCents(after - delta);
    result.set(event, { before, after });
    after = before;
  }
  return result;
}

/**
 * Formats a viewer-oriented running balance for the history column: absolute
 * magnitude ('$12.00') plus tone (positive = counterparty owes the viewer,
 * negative = the viewer owes, neutral at zero) — same convention as
 * {@link balancePillFor}.
 */
export function runningBalanceDisplay(
  balance: number,
): { amount: string; tone: 'positive' | 'negative' | 'neutral' } {
  const magnitude = Number.isFinite(balance) ? Math.abs(balance) : 0;
  const amount = `$${magnitude.toFixed(2)}`;
  const tone = magnitude < 0.005 ? 'neutral' : balance > 0 ? 'positive' : 'negative';
  return { amount, tone };
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

// ── PaymentModal seams (FR-3.6) ─────────────────────────────────────────────
// The three behaviours the checkpoint pins (AC-9 capacity guard, EC-8 onSubmit
// success/error transition, mode microcopy) are extracted here as pure helpers
// so they are unit-testable without a React renderer — the same precedent as
// shouldShowImage (3a) and balancePillFor/detailViewMode (3b). PaymentModal.tsx
// renders these verbatim.

/**
 * Capacity guard (AC-9 / EC-5). True when a parsed amount exceeds the viewer's
 * available capacity, which DISABLES submit and surfaces the inline
 * over-capacity message. Only guards when `availableCapacity` is a finite
 * number: an absent/blank/non-numeric limit means "no ceiling to enforce" and
 * never blocks (host adapters that don't pass a capacity opt out of the guard).
 * A non-positive/blank amount never exceeds anything.
 */
export function exceedsCapacity(amount: string | number, availableCapacity?: string): boolean {
  if (availableCapacity == null || availableCapacity === '') return false;
  const cap = Number(availableCapacity);
  if (!Number.isFinite(cap)) return false;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  return amt > cap;
}

/** The inline message shown when {@link exceedsCapacity} is true (AC-9). */
export function capacityExceededMessage(availableCapacity: string): string {
  return `Exceeds available capacity of $${availableCapacity}`;
}

/**
 * Per-mode presentation copy (FR-3.6). `title`/`submitLabel` drive the header
 * and primary button; the three status verbs drive the submitting/success/error
 * microcopy. GrowOp-matching: 'i-owe' surfaces "I Owe More" so the mode is
 * unmistakable in both the title and the button (checkpoint seam 3).
 */
export interface PaymentModalCopy {
  title: string;
  submitLabel: string;
  submitting: string;
  success: string;
  error: string;
}

const PAYMENT_MODAL_COPY: Record<PaymentModalAction, PaymentModalCopy> = {
  pay: {
    title: 'Pay',
    submitLabel: 'Pay',
    submitting: 'Sending…',
    success: 'Payment sent',
    error: 'Payment failed',
  },
  float: {
    title: 'Float',
    submitLabel: 'Float',
    submitting: 'Sending…',
    success: 'Payment sent',
    error: 'Payment failed',
  },
  request: {
    title: 'Request',
    submitLabel: 'Request',
    submitting: 'Requesting…',
    success: 'Request sent',
    error: 'Request failed',
  },
  received: {
    title: 'Received',
    submitLabel: 'Record received',
    submitting: 'Recording…',
    success: 'Recorded',
    error: 'Record failed',
  },
  'i-owe': {
    title: 'I Owe More',
    submitLabel: 'Record I Owe More',
    submitting: 'Recording debt…',
    success: 'Debt recorded',
    error: 'Record failed',
  },
};

export function paymentModalCopy(action: PaymentModalAction): PaymentModalCopy {
  return PAYMENT_MODAL_COPY[action];
}

/**
 * Quick-amount chips (FR-3.6). "Full" / "Half" when a positive capacity is known
 * (EC-5), else the fixed $5 / $10 / $25 / $50 ladder. Pure so the branch is
 * assertable without rendering; the modal maps each chip's value into the amount
 * field on tap.
 */
export interface QuickAmountChip {
  label: string;
  value: number;
}

export function quickAmountChips(availableCapacity?: string): QuickAmountChip[] {
  if (availableCapacity != null && availableCapacity !== '') {
    const cap = Number(availableCapacity);
    if (Number.isFinite(cap) && cap > 0) {
      return [
        { label: `Full $${cap.toFixed(2)}`, value: cap },
        { label: `Half $${(cap / 2).toFixed(2)}`, value: cap / 2 },
      ];
    }
  }
  return [
    { label: '$5', value: 5 },
    { label: '$10', value: 10 },
    { label: '$25', value: 25 },
    { label: '$50', value: 50 },
  ];
}

/**
 * Pure submit-state machine for the modal (EC-8). The modal awaits the
 * host-supplied `onSubmit` Promise and drives this reducer from its outcome:
 *   idle --submit--> submitting --resolve--> success
 *                              \--reject---> error
 *   error/success --reset--> idle   (retry / reopen)
 * There is NO submitting→success transition on any event other than an explicit
 * `resolve`, so a rejected Promise can never land in `success` (the silent-
 * success bug EC-8 guards). `error` carries the message for the retry surface.
 */
export type PaymentSubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface PaymentSubmitState {
  status: PaymentSubmitStatus;
  error?: string;
}

export type PaymentSubmitEvent =
  | { type: 'submit' }
  | { type: 'resolve' }
  | { type: 'reject'; message: string }
  | { type: 'reset' };

export const initialPaymentSubmitState: PaymentSubmitState = { status: 'idle' };

export function paymentSubmitReducer(
  state: PaymentSubmitState,
  event: PaymentSubmitEvent,
): PaymentSubmitState {
  switch (event.type) {
    case 'submit':
      // Only start from a resting state; ignore double-taps while in flight.
      if (state.status === 'submitting') return state;
      return { status: 'submitting' };
    case 'resolve':
      // Success is reachable ONLY from an in-flight submit resolving.
      if (state.status !== 'submitting') return state;
      return { status: 'success' };
    case 'reject':
      // A rejection from an in-flight submit lands in error, never success.
      if (state.status !== 'submitting') return state;
      return { status: 'error', error: event.message };
    case 'reset':
      return initialPaymentSubmitState;
    default:
      return state;
  }
}
