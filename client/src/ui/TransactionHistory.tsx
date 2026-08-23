import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import { eventAmountDisplay, formatRelativeDate } from './utils';
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
 * Trustline activity list (FR-3.7). Rows render in the order the API returned
 * them — no re-sort. Each row shows a viewer-oriented signed amount (best-effort;
 * unsigned when the event carries no unambiguous sign) and a relative date.
 *
 * COVERAGE CAVEAT (AC-8 scope): `TrustlineEvent`'s sign is not contract-pinned,
 * so this colouring is best-effort and NOT seam-covered by AC-8. The pill in
 * ContactBalanceRow is the seam-covered sign guarantee; here unsigned is the
 * safe default (see `eventAmountDisplay`).
 */
export function TransactionHistory({
  events,
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

  if (events.length === 0) {
    return (
      <View style={{ paddingVertical: resolved.spacing.md }}>
        <Text style={{ color: resolved.colors.mutedText }}>No transactions yet</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: resolved.spacing.xs }}>
      {events.map((event) => {
        const display = eventAmountDisplay(event.amount);
        const color =
          display.tone === 'positive'
            ? resolved.colors.balancePositive
            : display.tone === 'negative'
              ? resolved.colors.balanceNegative
              : resolved.colors.text;
        return (
          <View
            key={String(event.id)}
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: resolved.spacing.sm,
              paddingVertical: resolved.spacing.xs,
            }}
          >
            <Text style={{ color: resolved.colors.mutedText, flex: 1 }}>
              {formatRelativeDate(event.created_at)}
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
