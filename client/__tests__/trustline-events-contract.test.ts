/**
 * Contract test for the trustline-events read path, pinned to the live-prod
 * fixture contracts/trustline-events.json (robin<->alex, captured 2026-08-24).
 * Guards the exact bug class that shipped 2026-08-24: narrowing/rendering
 * written against an invented shape (`id`/`amount`/`created_at`) while the
 * wire serves `type`/`from`/`to`/`value`/`timestamp` — every event silently
 * dropped, history rendered empty.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { narrowTrustlineEvent, type TrustlineEvent } from '../src/ui/hooks/types';
import { transferEventDisplay } from '../src/ui/utils';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../contracts/trustline-events.json'), 'utf8'),
) as {
  viewer: string;
  counterParty: string;
  events: unknown[];
  expected_rendered: Array<{
    sign: string;
    amount: string;
    tone: string;
    description: string | null;
    app: string | null;
    operation: string | null;
    txId: string;
  }>;
};

describe('trustline events wire contract', () => {
  it('narrows every live wire event (none dropped)', () => {
    const narrowed = fixture.events.map(narrowTrustlineEvent);
    expect(narrowed.every((event) => event !== null)).toBe(true);
    expect(narrowed).toHaveLength(fixture.events.length);
  });

  it('renders exactly the Transfer rows, viewer-signed, in wire order', () => {
    const rows = fixture.events
      .map(narrowTrustlineEvent)
      .filter((event): event is TrustlineEvent => event !== null)
      .map((event) => transferEventDisplay(event, fixture.viewer))
      .filter((display): display is NonNullable<typeof display> => display !== null);

    expect(
      rows.map(({ sign, amount, tone, meta, txId }) => ({
        sign,
        amount,
        tone,
        description: meta.description,
        app: meta.app,
        operation: meta.operation,
        txId,
      })),
    ).toEqual(fixture.expected_rendered);
  });

  it('excludes BalanceUpdate bookkeeping rows from rendering', () => {
    const balanceUpdates = fixture.events
      .map(narrowTrustlineEvent)
      .filter((event): event is TrustlineEvent => event !== null && event.type === 'BalanceUpdate');
    expect(balanceUpdates.length).toBeGreaterThan(0); // fixture must contain them
    for (const event of balanceUpdates) {
      expect(transferEventDisplay(event, fixture.viewer)).toBeNull();
    }
  });

  it('signs a transfer TO the viewer as negative (counterparty perspective)', () => {
    const transfer = fixture.events
      .map(narrowTrustlineEvent)
      .find((event): event is TrustlineEvent => event !== null && event.type === 'Transfer')!;
    const display = transferEventDisplay(transfer, fixture.counterParty);
    expect(display).not.toBeNull();
    expect(display!.tone).toBe('negative');
    expect(display!.sign).toBe('−');
  });

  it('derives the row date from the unix timestamp', () => {
    const transfer = fixture.events
      .map(narrowTrustlineEvent)
      .find((event): event is TrustlineEvent => event !== null && event.type === 'Transfer')!;
    const display = transferEventDisplay(transfer, fixture.viewer)!;
    expect(new Date(display.dateIso).getTime()).toBe((transfer.timestamp as number) * 1000);
  });
});
