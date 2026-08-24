/**
 * REFERENCE IMPLEMENTATION — not shipped as live app code.
 * Shows how a FOAFledger shell (or any host) wires PaymentModal.onSubmit
 * to FoafLedgerClient via createSessionSignatureProvider.
 *
 * The host closes over:
 *   - viewerFoafAddress: the viewer's own foaf_address from the session JWT
 *   - currentTrustline: the ViewerTrustlineBalance for the counterparty pair
 *
 * The action → FoafLedgerClient method mapping follows FR-3.6:
 *   pay / float        → createPendingTransfer (viewer sends to counterparty)
 *   request / received → createPendingTransfer (counterparty sends to viewer)
 *   i-owe              → updateTrustline (viewer admits a new debt)
 *
 * The adapter passes NO foaf_id and NO signer-selection params to the server. It
 * just calls FoafLedgerClient methods normally; the session provider signs the
 * viewer's own key transparently (FR-4.2). FoafLedgerClient's method signatures
 * take a single params object with `networkAddress` inside it — this reference
 * is written against those real signatures.
 *
 * SIGN-INVERSION CAUTION (AC-8): currentTrustline.given and .received are
 * VIEWER-ORIENTED (the hook already flipped them via viewerBalance). The
 * protocol's updateTrustline expects CREDITOR-ORIENTED fields keyed to
 * creditorAddress (= counterparty here). Mapping:
 *   creditlineGiven (credit the creditor/counterparty extends to viewer) =
 *     currentTrustline.given + amount (the extra debt the viewer admits)
 *   creditlineReceived = currentTrustline.received (unchanged)
 */

import type { FoafLedgerClient } from '../../ledger/FoafLedgerClient';
import { createSessionSignatureProvider } from '../../ledger/signer';
import type { PaymentModalSubmit, ViewerTrustlineBalance } from '../hooks/types';

/**
 * Creates a PaymentModal onSubmit adapter that routes each action to the
 * appropriate FoafLedgerClient method using session-authed signing.
 *
 * @param ledger - FoafLedgerClient configured with createSessionSignatureProvider
 * @param viewerFoafAddress - The viewer's own foaf_address (from session JWT)
 * @param currentTrustline - Current ViewerTrustlineBalance for the counterparty pair
 */
export function createFoafLedgerOnSubmitAdapter(
  ledger: FoafLedgerClient,
  viewerFoafAddress: string,
  currentTrustline: ViewerTrustlineBalance,
): (submit: PaymentModalSubmit) => Promise<void> {
  return async (submit: PaymentModalSubmit): Promise<void> => {
    const { action, amount, counterPartyAddress, networkAddress } = submit;

    switch (action) {
      case 'pay':
      case 'float':
        // Viewer sends to counterparty.
        await ledger.createPendingTransfer({
          networkAddress,
          fromAddress: viewerFoafAddress,
          toAddress: counterPartyAddress,
          value: String(amount),
        });
        break;

      case 'request':
      case 'received':
        // Counterparty sends to viewer.
        await ledger.createPendingTransfer({
          networkAddress,
          fromAddress: counterPartyAddress,
          toAddress: viewerFoafAddress,
          value: String(amount),
        });
        break;

      case 'i-owe':
        // Viewer records a new debt to counterparty.
        // SIGN-INVERSION: currentTrustline.given is viewer-oriented AFTER the flip.
        // For updateTrustline: creditlineGiven = the credit the creditor (counterparty)
        // extends to the debtor (viewer) = currentTrustline.given + amount.
        // creditlineReceived = currentTrustline.received (unchanged).
        await ledger.updateTrustline({
          networkAddress,
          creditorAddress: counterPartyAddress,
          debtorAddress: viewerFoafAddress,
          creditlineGiven: String(Number(currentTrustline.given) + amount),
          creditlineReceived: currentTrustline.received,
        });
        break;

      default:
        throw new Error(`Unknown action: ${action as string}`);
    }
  };
}

/**
 * Example of how to configure a FoafLedgerClient with session-authed signing
 * for a UI-only app (no backend, no service token in the browser).
 *
 * @param foafApiBaseUrl - e.g. 'https://api.foaf.io'
 * @param authBaseUrl - e.g. 'https://auth.foaf.io'
 * @param getSessionToken - function that returns the current RS256 session Bearer token
 */
export function exampleCreateLedgerWithSessionSigning(
  _foafApiBaseUrl: string,
  _authBaseUrl: string,
  _getSessionToken: () => Promise<string | null>,
): FoafLedgerClient {
  // REFERENCE ONLY — wire it like this in the real host:
  //
  //   import { FoafLedgerClient, createSessionSignatureProvider } from '@foaf/client/ledger';
  //
  //   const ledger = new FoafLedgerClient({
  //     baseUrl: _foafApiBaseUrl,          // e.g. https://api.foaf.io
  //     signatureProvider: createSessionSignatureProvider(
  //       globalThis.fetch,
  //       _authBaseUrl,                    // e.g. https://auth.foaf.io
  //       _getSessionToken,
  //     ),
  //   });
  //   return ledger;
  //
  // `createSessionSignatureProvider` is imported above so this reference stays
  // in sync with the real export name.
  void createSessionSignatureProvider;
  throw new Error('This is a reference example — replace with real FoafLedgerClient import');
}
