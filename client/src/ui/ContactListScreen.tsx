import React from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, View } from 'react-native';
import type { FoafContactsClient } from '../contacts/FoafContactsClient';
import type { FoafLedgerClient } from '../ledger/FoafLedgerClient';
import { ContactBalanceRow } from './ContactBalanceRow';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import { useActiveNetwork } from './hooks/useActiveNetwork';
import { useContacts } from './hooks/useContacts';
import { useTrustlineBalances } from './hooks/useTrustlineBalances';
import { listContentWrapperStyle } from './utils';
import type { FoafContact } from './hooks/types';
import type { FoafUiTheme } from './theme';

export interface ContactListScreenProps {
  contactsClient: FoafContactsClient;
  ledger: FoafLedgerClient;
  viewerAddress: string;
  /** Route-agnostic — the host wires this to its own navigation. */
  onSelectContact: (contact: FoafContact) => void;
  theme?: Partial<FoafUiTheme>;
}

function matchesQuery(contact: FoafContact, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    (contact.display_name ?? '').toLowerCase().includes(needle) ||
    (contact.user_name ?? '').toLowerCase().includes(needle)
  );
}

/**
 * Contact list with per-contact balance pills (FR-3.4). Orchestrates the hooks:
 * resolves the active network first, then (only once it resolves) mounts the
 * balance-loading list body so `useTrustlineBalances` never fetches with an
 * empty network address.
 *
 * Ships all four states (loading / error / empty / populated) and a case-
 * insensitive search filter. Navigation is the host's concern: it exposes
 * `onSelectContact` and imports no router.
 */
export function ContactListScreen({
  contactsClient,
  ledger,
  viewerAddress,
  onSelectContact,
  theme,
}: ContactListScreenProps) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const { network, loading: networkLoading, error: networkError } = useActiveNetwork(ledger);

  return (
    <View style={{ backgroundColor: resolved.colors.background, flex: 1 }}>
      {/* AC-7: constrain the list content so it does not stretch to full
          browser-window width on desktop. */}
      <View style={listContentWrapperStyle}>
        {networkError ? (
          <View style={{ padding: resolved.spacing.md }}>
            <Text style={{ color: resolved.colors.danger }}>{networkError.message}</Text>
          </View>
        ) : networkLoading || !network ? (
          <View style={{ padding: resolved.spacing.md }}>
            <ActivityIndicator accessibilityLabel="Loading contacts" color={resolved.colors.primary} />
          </View>
        ) : (
          <ContactListBody
            contactsClient={contactsClient}
            ledger={ledger}
            viewerAddress={viewerAddress}
            networkAddress={network}
            onSelectContact={onSelectContact}
            theme={theme}
          />
        )}
      </View>
    </View>
  );
}

/** List body — mounted only once the network is resolved, so balances fetch
 *  with a real network address. */
function ContactListBody({
  contactsClient,
  ledger,
  viewerAddress,
  networkAddress,
  onSelectContact,
  theme,
}: {
  contactsClient: FoafContactsClient;
  ledger: FoafLedgerClient;
  viewerAddress: string;
  networkAddress: string;
  onSelectContact: (contact: FoafContact) => void;
  theme?: Partial<FoafUiTheme>;
}) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const [query, setQuery] = React.useState('');
  const { contacts, loading: contactsLoading, error: contactsError } = useContacts(contactsClient);
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
  } = useTrustlineBalances(ledger, viewerAddress, networkAddress);

  const error = contactsError ?? balancesError;
  const loading = contactsLoading || balancesLoading;

  const filtered = React.useMemo(
    () => contacts.filter((contact) => matchesQuery(contact, query)),
    [contacts, query],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: resolved.spacing.md }}>
        <TextInput
          accessibilityLabel="Search contacts"
          placeholder="Search contacts"
          placeholderTextColor={resolved.colors.mutedText}
          value={query}
          onChangeText={setQuery}
          style={{
            backgroundColor: resolved.colors.surface,
            borderColor: resolved.colors.border,
            borderRadius: resolved.radii.md,
            borderWidth: 1,
            color: resolved.colors.text,
            paddingHorizontal: resolved.spacing.md,
            paddingVertical: resolved.spacing.sm,
          }}
        />
      </View>

      {error ? (
        <View style={{ padding: resolved.spacing.md }}>
          <Text style={{ color: resolved.colors.danger }}>{error.message}</Text>
        </View>
      ) : loading ? (
        <View style={{ padding: resolved.spacing.md }}>
          <ActivityIndicator accessibilityLabel="Loading contacts" color={resolved.colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ padding: resolved.spacing.md }}>
          <Text style={{ color: resolved.colors.mutedText }}>No contacts yet</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(contact) => contact.foaf_id}
          contentContainerStyle={{ paddingHorizontal: resolved.spacing.md }}
          renderItem={({ item }) => (
            <ContactBalanceRow
              contact={item}
              trustline={item.foaf_address ? balances.get(item.foaf_address) ?? null : null}
              onPress={() => onSelectContact(item)}
              theme={theme}
            />
          )}
        />
      )}
    </View>
  );
}
