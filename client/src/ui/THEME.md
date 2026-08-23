# Theming the FOAF UI components

Every `ui` component resolves its colours, spacing, radii, and typography from a
`FoafUiTheme`. Override any subset; unset keys fall back to `defaultFoafTheme`
(GrowOperative's palette), so a partial override never blanks a token.

## 1. The override shape

`FoafUiTheme` is deeply partial — pass only what you want to change:

```ts
import type { FoafUiTheme } from '@foaf/client/ui';

const override: Partial<FoafUiTheme> = {
  colors: {
    balancePositive: '#b45309',
    // …other tokens keep their defaults
  },
};
```

Nested objects (`colors`, `spacing`, `radii`, `typography`) merge key-by-key, so
overriding one colour leaves the rest of `colors` intact.

## 2. Which tokens drive which components

| Token | Effect |
|-------|--------|
| `colors.balancePositive` | `ContactBalanceRow` green (`+`) pill text/border |
| `colors.balanceNegative` | `ContactBalanceRow` red (`−`) pill text/border |
| `colors.positiveBg` / `negativeBg` | pill backgrounds |
| `colors.actionPay` | `PaymentModal` Pay / Float / Received button |
| `colors.actionRequest` | `PaymentModal` Request button |
| `colors.actionOwe` | `PaymentModal` "I Owe More" button |
| `identiconPalettes` | `SymmetricPixelAvatar` generated-avatar colours |

(Plus the base tokens: `background`, `surface`, `text`, `mutedText`, `border`,
`primary`, `primaryText`, `danger`, `positive`.)

## 3. Passing the theme

**Option A — provider (a whole subtree):**

```tsx
import { FoafThemeProvider, ContactListScreen } from '@foaf/client/ui';

<FoafThemeProvider theme={override}>
  <ContactListScreen {...props} />
</FoafThemeProvider>
```

**Option B — per-component `theme?` prop** (overrides the provider for that one
component):

```tsx
<PaymentModal theme={override} {...props} />
```

## 4. Worked example — OnLoan's warm-ledger palette

A warm amber/ochre override for OnLoan. Balance pills and action buttons shift
to warm tones; everything else keeps the defaults.

```tsx
import { FoafThemeProvider } from '@foaf/client/ui';
import type { FoafUiTheme } from '@foaf/client/ui';

export const warmLedgerTheme: Partial<FoafUiTheme> = {
  colors: {
    balancePositive: '#b45309', // amber-700 — they-owe-you
    balanceNegative: '#9a3412', // orange-800 — you-owe
    positiveBg: 'rgba(180, 83, 9, 0.12)',
    negativeBg: 'rgba(154, 52, 18, 0.12)',
    actionPay: '#d97706', // amber-600
    actionRequest: '#b45309', // amber-700
    actionOwe: '#92400e', // amber-800
  },
};

<FoafThemeProvider theme={warmLedgerTheme}>
  <ContactListScreen {...props} />
  <PaymentModal {...props} />
</FoafThemeProvider>;
```
