import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { UserAvatar } from './UserAvatar';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import { balancePillFor } from './utils';
import type { FoafContact, ViewerTrustlineBalance } from './hooks/types';
import type { FoafUiTheme } from './theme';

export interface ContactBalanceRowProps {
  contact: FoafContact;
  /** null = no trustline yet → no pill. */
  trustline: ViewerTrustlineBalance | null;
  onPress?: () => void;
  theme?: Partial<FoafUiTheme>;
}

function contactName(contact: FoafContact): string {
  return contact.display_name ?? contact.user_name ?? contact.foaf_id;
}

/**
 * One contact row: avatar, display name, and a viewer-oriented balance pill.
 *
 * The pill sign is derived from `trustline.direction` (see `balancePillFor`),
 * which `useTrustlineBalances` already set from the POST-FLIP viewer balance —
 * 'owe-me' is green/positive, 'i-owe' is red/negative. This component does NOT
 * re-negate or re-derive the sign from a raw balance (AC-8).
 */
export function ContactBalanceRow({ contact, trustline, onPress, theme }: ContactBalanceRowProps) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const name = contactName(contact);
  const pill = balancePillFor(trustline);
  const numericFontVariant = resolved.typography?.numericFontVariant ?? ['tabular-nums'];

  const row = (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: resolved.spacing.sm,
        paddingVertical: resolved.spacing.sm,
      }}
    >
      <UserAvatar name={name} imageUrl={contact.avatar_url} size={44} theme={theme} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: resolved.colors.text }}>
          {name}
        </Text>
      </View>
      {pill ? (
        <View
          accessibilityLabel={`Balance ${pill.sign}${pill.amount}`}
          style={{
            backgroundColor: pill.tone === 'positive' ? resolved.colors.positiveBg : resolved.colors.negativeBg,
            borderRadius: resolved.radii.sm,
            paddingHorizontal: resolved.spacing.sm,
            paddingVertical: resolved.spacing.xs,
          }}
        >
          <Text
            style={{
              color:
                pill.tone === 'positive'
                  ? resolved.colors.balancePositive
                  : resolved.colors.balanceNegative,
              // Viewer-oriented, post-flip figure — no re-negation here (AC-8).
              fontVariant: numericFontVariant as ('tabular-nums')[],
            }}
          >
            {pill.sign}
            {pill.amount}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return row;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
    >
      {row}
    </Pressable>
  );
}
