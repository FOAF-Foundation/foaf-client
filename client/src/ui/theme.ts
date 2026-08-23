export interface FoafUiTheme {
  colors: {
    background: string;
    surface: string;
    text: string;
    mutedText: string;
    border: string;
    primary: string;
    primaryText: string;
    danger: string;
    positive: string;
    // --- Ledger-balance + action tokens (all optional; GrowOperative-matching
    // defaults live in defaultFoafTheme). Pre-extension themes that set only the
    // original nine colors still resolve (AC-11). ---
    balancePositive?: string; // green pill — counterparty owes the viewer
    balanceNegative?: string; // red pill — the viewer owes
    balanceSettled?: string; // muted settled indicator (matches mutedText)
    positiveBg?: string; // green pill background
    negativeBg?: string; // red pill background
    actionPay?: string; // Pay button color
    actionRequest?: string; // Request button color
    actionOwe?: string; // "I Owe More" button color
  };
  spacing: { xs: number; sm: number; md: number; lg: number };
  radii: { sm: number; md: number; lg: number };
  typography?: {
    bodySize?: number;
    titleSize?: number;
    numericFontVariant?: string[];
  };
  identiconPalettes?: string[][];
}
