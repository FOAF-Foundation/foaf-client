import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import { formatRelativeDate, transferEventDisplay } from './utils';
import type { TrustlineEvent } from './hooks/types';
import type { FoafUiTheme } from './theme';

export interface TransactionHistoryProps {
  events: TrustlineEvent[];
  viewerAddress: string;
  loading: boolean;
  error: Error | null;
  theme?: Partial<FoafUiTheme>;
}

/**
 * Trustline activity list (FR-3.7). Renders TRANSFER events in the order the
 * API returned them — no re-sort; BalanceUpdate/other bookkeeping kinds are
 * filtered out (they mirror the same operations). Sign and shape are pinned
 * to the live wire via contracts/trustline-events.json: a transfer FROM the
 * viewer renders '+', a transfer TO the viewer renders '\u2212' (see
 * `transferEventDisplay`).
 */
export function TransactionHistory({
  events,
  viewerAddress,
  loading,
  error,
  theme,
}: TransactionHistoryProps) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const numericFontVariant = resolved.typography?.numericFontVariant ?? ['tabular-nums'];

  if (loading) {
    return (
      <View style={{ paddingVertical: resolved.spacing.md }}>
        <ActivityIndicator accessibilityLabel="Loading transactions" color={resolved.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ paddingVertical: resolved.spacing.md }}>
        <Text style={{ color: resolved.colors.danger }}>{error.message}</Text>
      </View>
    );
  }

  const rows = events
    .map((event) => ({ event, display: transferEventDisplay(event, viewerAddress) }))
    .filter((row): row is { event: (typeof events)[number]; display: NonNullable<ReturnType<typeof transferEventDisplay>> } =>
      row.display !== null,
    );

  if (rows.length === 0) {
    return (
      <View style={{ paddingVertical: resolved.spacing.md }}>
        <Text style={{ color: resolved.colors.mutedText }}>No transactions yet</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: resolved.spacing.xs }}>
      {rows.map(({ event, display }, index) => {
        const color =
          display.tone === 'positive'
            ? resolved.colors.balancePositive
            : display.tone === 'negative'
              ? resolved.colors.balanceNegative
              : resolved.colors.text;
        return (
          <View
            key={`${event.type}-${String(event.transactionId ?? event.blockNumber ?? index)}`}
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: resolved.spacing.sm,
              paddingVertical: resolved.spacing.xs,
            }}
          >
            <Text style={{ color: resolved.colors.mutedText, flex: 1 }}>
              {formatRelativeDate(display.dateIso)}
            </Text>
            <Text style={{ color, fontVariant: numericFontVariant as ('tabular-nums')[] }}>
              {display.sign}
              {display.amount}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
