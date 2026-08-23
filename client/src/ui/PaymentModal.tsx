import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { ActionButton, FieldLabel } from './primitives';
import { resolveTheme, useFoafTheme } from './FoafThemeProvider';
import {
  capacityExceededMessage,
  exceedsCapacity,
  initialPaymentSubmitState,
  paymentModalCopy,
  paymentSubmitReducer,
  quickAmountChips,
} from './utils';
import type { PaymentModalAction, PaymentModalSubmit } from './hooks/types';
import type { FoafUiTheme } from './theme';

export interface PaymentModalProps {
  visible: boolean;
  mode: PaymentModalAction;
  counterPartyName: string;
  /** Passed through into the {@link PaymentModalSubmit} payload verbatim. */
  counterPartyAddress: string;
  /** Passed through into the {@link PaymentModalSubmit} payload verbatim. */
  networkAddress: string;
  /** Viewer's remaining capacity (from ViewerTrustlineBalance). When set it
   *  drives the Full/Half chips and the EC-5/AC-9 over-capacity guard. */
  availableCapacity?: string;
  /**
   * HOST-SUPPLIED adapter. The modal calls it with the minimal payload and
   * awaits the Promise: resolve → success state; reject → error state. The
   * action→FoafLedgerClient mapping lives here, NOT in the modal (Phase 4).
   */
  onSubmit: (submit: PaymentModalSubmit) => Promise<void>;
  onCancel: () => void;
  theme?: Partial<FoafUiTheme>;
}

/**
 * The action → button colour token. Pay/float share the pay token; request has
 * its own; i-owe uses the owe token. Received records an incoming payment, so it
 * reads as a positive/pay action.
 */
function actionColor(mode: PaymentModalAction, theme: FoafUiTheme): string {
  switch (mode) {
    case 'request':
      return theme.colors.actionRequest ?? theme.colors.primary;
    case 'i-owe':
      return theme.colors.actionOwe ?? theme.colors.primary;
    default:
      return theme.colors.actionPay ?? theme.colors.primary;
  }
}

/**
 * PaymentModal (FR-3.6) — GrowOp-parity 5-mode modal, ported session-free and
 * ledger-free. It NEVER touches FoafLedgerClient or a session; it only builds a
 * {@link PaymentModalSubmit} and awaits the host `onSubmit` adapter.
 *
 * Ships its four real states from day one: idle form, submitting (button busy,
 * form non-interactive), success (mode microcopy + close), and error (message +
 * retry). The capacity guard (AC-9) disables submit and shows an inline message
 * when the amount exceeds availableCapacity. EC-8: a rejected onSubmit lands in
 * the error state — never a silent success — because the submit state machine
 * (paymentSubmitReducer) only reaches `success` from an explicit `resolve`.
 */
export function PaymentModal({
  visible,
  mode,
  counterPartyName,
  counterPartyAddress,
  networkAddress,
  availableCapacity,
  onSubmit,
  onCancel,
  theme,
}: PaymentModalProps) {
  const contextTheme = useFoafTheme();
  const resolved = theme ? resolveTheme({ ...contextTheme, ...theme }) : contextTheme;
  const copy = paymentModalCopy(mode);
  const chips = quickAmountChips(availableCapacity);
  const accent = actionColor(mode, resolved);

  const [amount, setAmount] = React.useState('');
  const [memo, setMemo] = React.useState('');
  const [submitState, dispatch] = React.useReducer(paymentSubmitReducer, initialPaymentSubmitState);

  // Reset the form and the submit machine each time the sheet (re)opens or the
  // mode/counterparty changes, so a stale success/error never leaks across opens.
  React.useEffect(() => {
    if (visible) {
      setAmount('');
      setMemo('');
      dispatch({ type: 'reset' });
    }
  }, [visible, mode, counterPartyAddress]);

  const parsed = Number(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const overCapacity = exceedsCapacity(amount, availableCapacity);
  const submitting = submitState.status === 'submitting';
  const succeeded = submitState.status === 'success';
  const failed = submitState.status === 'error';
  const submitDisabled = !amountValid || overCapacity || submitting;

  const handleSubmit = React.useCallback(() => {
    if (!amountValid || overCapacity || submitting) return;
    dispatch({ type: 'submit' });
    // Await the host adapter's Promise. Resolve → success; reject → error.
    // NEVER a silent success: the reducer only reaches `success` on `resolve`.
    onSubmit({
      action: mode,
      amount: parsed,
      memo: memo.trim() ? memo.trim() : undefined,
      counterPartyAddress,
      networkAddress,
    }).then(
      () => dispatch({ type: 'resolve' }),
      (err: unknown) =>
        dispatch({
          type: 'reject',
          message: err instanceof Error ? err.message : copy.error,
        }),
    );
  }, [
    amountValid,
    overCapacity,
    submitting,
    onSubmit,
    mode,
    parsed,
    memo,
    counterPartyAddress,
    networkAddress,
    copy.error,
  ]);

  const submitLabel = submitting ? copy.submitting : copy.submitLabel;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: resolved.colors.background,
          borderTopLeftRadius: resolved.radii.lg,
          borderTopRightRadius: resolved.radii.lg,
          gap: resolved.spacing.md,
          marginTop: 'auto',
          padding: resolved.spacing.lg,
        }}
      >
        {/* Header: verb + counterparty */}
        <View>
          <Text style={{ color: resolved.colors.mutedText }}>{copy.title}</Text>
          <Text
            numberOfLines={1}
            style={{
              color: resolved.colors.text,
              fontSize: resolved.typography?.titleSize ?? 16,
            }}
          >
            {counterPartyName}
          </Text>
        </View>

        {succeeded ? (
          // ── Success state ──
          <View style={{ gap: resolved.spacing.md }}>
            <Text style={{ color: resolved.colors.positive }}>{copy.success}</Text>
            <ActionButton label="Done" onPress={onCancel} theme={resolved} />
          </View>
        ) : (
          // ── Idle / submitting / error state ──
          <>
            <View>
              <FieldLabel theme={resolved}>Amount</FieldLabel>
              <TextInput
                accessibilityLabel="Payment amount"
                editable={!submitting}
                keyboardType="decimal-pad"
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={resolved.colors.mutedText}
                style={{
                  borderColor: overCapacity ? resolved.colors.danger : resolved.colors.border,
                  borderRadius: resolved.radii.md,
                  borderWidth: 1,
                  color: resolved.colors.text,
                  paddingHorizontal: resolved.spacing.md,
                  paddingVertical: resolved.spacing.sm,
                }}
                value={amount}
              />
              {overCapacity && availableCapacity ? (
                <Text
                  style={{ color: resolved.colors.danger, marginTop: resolved.spacing.xs }}
                >
                  {capacityExceededMessage(availableCapacity)}
                </Text>
              ) : null}
            </View>

            {/* Quick-amount chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: resolved.spacing.sm }}>
              {chips.map((chip) => {
                const active = amountValid && Math.abs(parsed - chip.value) < 0.005;
                return (
                  <Pressable
                    accessibilityLabel={chip.label}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: submitting, selected: active }}
                    disabled={submitting}
                    key={chip.label}
                    onPress={() => setAmount(chip.value.toFixed(2))}
                    style={{
                      backgroundColor: active ? resolved.colors.positiveBg ?? resolved.colors.surface : resolved.colors.surface,
                      borderColor: active ? accent : resolved.colors.border,
                      borderRadius: resolved.radii.md,
                      borderWidth: 1,
                      opacity: submitting ? 0.5 : 1,
                      paddingHorizontal: resolved.spacing.md,
                      paddingVertical: resolved.spacing.xs,
                    }}
                  >
                    <Text style={{ color: resolved.colors.text }}>{chip.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View>
              <FieldLabel theme={resolved}>Memo</FieldLabel>
              <TextInput
                accessibilityLabel="Payment memo"
                editable={!submitting}
                onChangeText={setMemo}
                placeholder="Optional"
                placeholderTextColor={resolved.colors.mutedText}
                style={{
                  borderColor: resolved.colors.border,
                  borderRadius: resolved.radii.md,
                  borderWidth: 1,
                  color: resolved.colors.text,
                  paddingHorizontal: resolved.spacing.md,
                  paddingVertical: resolved.spacing.sm,
                }}
                value={memo}
              />
            </View>

            {failed ? (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: resolved.colors.danger }}
              >
                {submitState.error || copy.error}
              </Text>
            ) : null}

            {/* Primary action — themed to the mode's accent token. Busy +
                disabled state carried on the Pressable for a11y. */}
            <Pressable
              accessibilityLabel={failed ? `Retry — ${submitLabel}` : submitLabel}
              accessibilityRole="button"
              accessibilityState={{ busy: submitting, disabled: submitDisabled }}
              disabled={submitDisabled}
              onPress={handleSubmit}
              style={({ pressed }) => ({
                backgroundColor: accent,
                borderRadius: resolved.radii.md,
                opacity: submitDisabled ? 0.45 : pressed ? 0.78 : 1,
                paddingHorizontal: resolved.spacing.md,
                paddingVertical: resolved.spacing.sm,
              })}
            >
              <Text style={{ color: resolved.colors.primaryText, textAlign: 'center' }}>
                {failed ? `Retry — ${submitLabel}` : submitLabel}
              </Text>
            </Pressable>

            <ActionButton
              disabled={submitting}
              label="Cancel"
              onPress={onCancel}
              theme={resolved}
            />
          </>
        )}
      </View>
    </Modal>
  );
}
