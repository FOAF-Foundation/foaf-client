import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { FoafLedgerClient } from '../ledger/FoafLedgerClient';
import { UserAvatar } from './UserAvatar';
import { ActionButton } from './primitives';
import { TransactionHistory } from './TransactionHistory';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import { useTrustlineEvents } from './hooks/useTrustlineEvents';
import { useViewerTrustline } from './hooks/useViewerTrustline';
import { balancePillFor, detailViewMode, directionLabel, formatRelativeDate } from './utils';
import type { FoafContact } from './hooks/types';
import type { FoafUiTheme } from './theme';

export interface ContactDetailScreenProps {
  contact: FoafContact;
  ledger: FoafLedgerClient;
  viewerAddress: string;
  /** Resolved by the host via useActiveNetwork. */
  networkAddress: string;
  onPayPress?: () => void;
  onRequestPress?: () => void;
  onIOwMorePress?: () => void;
  theme?: Partial<FoafUiTheme>;
}

function contactName(contact: FoafContact): string {
  return contact.display_name ?? contact.user_name ?? contact.foaf_id;
}

/**
 * Contact profile + ledger detail (FR-3.5).
 *
 * EC-1 (unconfirmed contact, hasWallet === false): the ledger section is not
 * mounted at all, so `useTrustlineEvents`/`useViewerTrustline` never run; the
 * pill and all three action buttons are replaced by a single "not linked"
 * message. No error is thrown.
 */
export function ContactDetailScreen({
  contact,
  ledger,
  viewerAddress,
  networkAddress,
  onPayPress,
  onRequestPress,
  onIOwMorePress,
  theme,
}: ContactDetailScreenProps) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const name = contactName(contact);
  const mode = detailViewMode(contact.hasWallet);
  const since = formatRelativeDate(contact.created_at);

  return (
    <ScrollView
      style={{ backgroundColor: resolved.colors.background }}
      contentContainerStyle={{ gap: resolved.spacing.md, padding: resolved.spacing.md }}
    >
      <View style={{ alignItems: 'center', gap: resolved.spacing.sm }}>
        <UserAvatar name={name} imageUrl={contact.avatar_url} size={72} theme={theme} />
        <Text style={{ color: resolved.colors.text, fontSize: resolved.typography?.titleSize ?? 16 }}>
          {name}
        </Text>
        {contact.user_name ? (
          <Text style={{ color: resolved.colors.mutedText }}>@{contact.user_name}</Text>
        ) : null}
        {since ? (
          <Text style={{ color: resolved.colors.mutedText }}>Contact since: {since}</Text>
        ) : null}
      </View>

      {mode === 'unconfirmed' ? (
        <View
          style={{
            backgroundColor: resolved.colors.surface,
            borderColor: resolved.colors.border,
            borderRadius: resolved.radii.lg,
            borderWidth: 1,
            padding: resolved.spacing.md,
          }}
        >
          <Text style={{ color: resolved.colors.mutedText, textAlign: 'center' }}>
            FOAF address not linked — ledger unavailable
          </Text>
        </View>
      ) : (
        <LedgerDetail
          contact={contact}
          ledger={ledger}
          viewerAddress={viewerAddress}
          networkAddress={networkAddress}
          onPayPress={onPayPress}
          onRequestPress={onRequestPress}
          onIOwMorePress={onIOwMorePress}
          theme={theme}
        />
      )}
    </ScrollView>
  );
}

/**
 * Ledger half of the detail screen — only mounted for confirmed contacts, so
 * the trustline hooks here never run in the EC-1 (unconfirmed) case. EC-2 (a
 * confirmed contact with no trustline yet) shows "No trustline yet" and leaves
 * the action buttons enabled so the host can initiate a trustline.
 */
function LedgerDetail({
  contact,
  ledger,
  viewerAddress,
  networkAddress,
  onPayPress,
  onRequestPress,
  onIOwMorePress,
  theme,
}: {
  contact: FoafContact;
  ledger: FoafLedgerClient;
  viewerAddress: string;
  networkAddress: string;
  onPayPress?: () => void;
  onRequestPress?: () => void;
  onIOwMorePress?: () => void;
  theme?: Partial<FoafUiTheme>;
}) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  // hasWallet is true here, so foaf_address is non-null (see projectContact).
  const counterParty = contact.foaf_address as string;
  const { trustline } = useViewerTrustline(ledger, viewerAddress, counterParty, networkAddress);
  const {
    events,
    loading: eventsLoading,
    error: eventsError,
  } = useTrustlineEvents(ledger, viewerAddress, counterParty, networkAddress);
  const [showHistory, setShowHistory] = React.useState(true);

  const pill = balancePillFor(trustline);

  return (
    <View style={{ gap: resolved.spacing.md }}>
      {/* Trustline pill + history toggle */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: resolved.colors.surface,
          borderColor: resolved.colors.border,
          borderRadius: resolved.radii.lg,
          borderWidth: 1,
          flexDirection: 'row',
          gap: resolved.spacing.sm,
          padding: resolved.spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          {trustline && pill ? (
            <Text
              style={{
                color: pill.tone === 'positive' ? resolved.colors.balancePositive : resolved.colors.balanceNegative,
                fontVariant: (resolved.typography?.numericFontVariant ?? ['tabular-nums']) as ('tabular-nums')[],
              }}
            >
              {pill.sign}
              {pill.amount} · {directionLabel(trustline.direction)}
            </Text>
          ) : trustline ? (
            <Text style={{ color: resolved.colors.mutedText }}>Settled</Text>
          ) : (
            <Text style={{ color: resolved.colors.mutedText }}>No trustline yet</Text>
          )}
        </View>
        <ActionButton
          label={showHistory ? 'Hide history' : 'History'}
          onPress={() => setShowHistory((prev) => !prev)}
          theme={resolved}
        />
      </View>

      {/* Action buttons — always present (EC-8). Enabled; pressing calls the
          host callback when Phase 4 wires it, otherwise is a no-op. */}
      <View style={{ flexDirection: 'row', gap: resolved.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ActionButton label="Pay" onPress={() => onPayPress?.()} theme={resolved} />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton label="Request" onPress={() => onRequestPress?.()} theme={resolved} />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton label="I Owe More" onPress={() => onIOwMorePress?.()} theme={resolved} />
        </View>
      </View>

      {showHistory ? (
        <View>
          <Text style={{ color: resolved.colors.mutedText, marginBottom: resolved.spacing.xs }}>
            Recent activity
          </Text>
          <TransactionHistory
            events={events}
            viewerAddress={viewerAddress}
            loading={eventsLoading}
            error={eventsError}
            theme={theme}
          />
        </View>
      ) : null}
    </View>
  );
}
