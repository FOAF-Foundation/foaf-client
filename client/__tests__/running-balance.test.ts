import { runningBalanceByEvent, runningBalanceDisplay } from '../src/ui/utils';
import type { TrustlineEvent } from '../src/ui/hooks/types';

const VIEWER = '0x' + 'aa'.repeat(20);
const OTHER = '0x' + 'bb'.repeat(20);

function transfer(
  value: number,
  from: string,
  to: string,
  ts: number,
  txId: number,
): TrustlineEvent {
  return { type: 'Transfer', from, to, value, timestamp: ts, transactionId: txId };
}

describe('runningBalanceByEvent', () => {
  // Viewer owes the counterparty (negative, viewer-oriented). Two transfers
  // FROM the viewer (each raises what the viewer owes). Ending balance -178.80.
  const events: TrustlineEvent[] = [
    transfer(6, VIEWER, OTHER, 1002, 78), // newest: +6 owed  -> -178.80
    transfer(55, VIEWER, OTHER, 1001, 76), // older:  +55 owed -> -172.80
  ];

  it('anchors the newest row to the balance and walks backward', () => {
    const map = runningBalanceByEvent(events, VIEWER, '-178.80');
    expect(map.get(events[0])).toEqual({ before: -172.8, after: -178.8 });
    expect(map.get(events[1])).toEqual({ before: -117.8, after: -172.8 });
  });

  it('stays anchored to the balance when older events are truncated off the feed', () => {
    // Only the newest transfer survives the feed; the balance still says -178.80.
    // A sum-from-zero would render -6; anchoring must render the real -178.80.
    const truncated = [events[0]];
    const map = runningBalanceByEvent(truncated, VIEWER, '-178.80');
    expect(map.get(truncated[0])).toEqual({ before: -172.8, after: -178.8 });
  });

  it('is order-independent (keys by event, not by delivery order)', () => {
    const reversed = [events[1], events[0]]; // oldest-first delivery
    const map = runningBalanceByEvent(reversed, VIEWER, '-178.80');
    expect(map.get(events[0])?.after).toBe(-178.8);
    expect(map.get(events[1])?.after).toBe(-172.8);
  });

  it('handles transfers TO the viewer (a receipt lowers what the viewer owes)', () => {
    const recv = [transfer(20, OTHER, VIEWER, 1003, 80)]; // to viewer: +20 to balance
    const map = runningBalanceByEvent(recv, VIEWER, '0');
    expect(map.get(recv[0])).toEqual({ before: -20, after: 0 });
  });

  it('returns an empty map (delta-only fallback) when no balance is available', () => {
    expect(runningBalanceByEvent(events, VIEWER, null).size).toBe(0);
    expect(runningBalanceByEvent(events, VIEWER, undefined).size).toBe(0);
    expect(runningBalanceByEvent(events, VIEWER, '').size).toBe(0);
    expect(runningBalanceByEvent(events, VIEWER, 'not-a-number').size).toBe(0);
  });

  it('ignores non-Transfer and third-party events', () => {
    const mixed: TrustlineEvent[] = [
      transfer(6, VIEWER, OTHER, 1002, 78),
      { type: 'BalanceUpdate', from: VIEWER, to: OTHER, timestamp: 1002, balance: -178.8 },
      transfer(9, OTHER, '0x' + 'cc'.repeat(20), 1002, 79), // not the viewer's edge
    ];
    const map = runningBalanceByEvent(mixed, VIEWER, '-178.80');
    expect(map.size).toBe(1);
    expect(map.get(mixed[0])).toEqual({ before: -172.8, after: -178.8 });
  });
});

describe('runningBalanceDisplay', () => {
  it('formats absolute magnitude with viewer-oriented tone', () => {
    expect(runningBalanceDisplay(-178.8)).toEqual({ amount: '$178.80', tone: 'negative' });
    expect(runningBalanceDisplay(42)).toEqual({ amount: '$42.00', tone: 'positive' });
    expect(runningBalanceDisplay(0)).toEqual({ amount: '$0.00', tone: 'neutral' });
  });
});
