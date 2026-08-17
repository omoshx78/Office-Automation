// Shared design tokens. Import these instead of hardcoding hex values
// so the palette stays consistent and is easy to adjust in one place.

export const colors = {
  navy: "#0A2E4D",
  navyLight: "#153A5B",
  sky: "#4FA8DA",
  skyDark: "#2E86C1",
  skyPale: "#EAF4FB",
  skyPaleAlt: "#D7EAF7",
  gold: "#D9A441",
  slate: "#22303F",
  slateMuted: "#5B6B7C",
  white: "#FFFFFF",
  border: "#D7E4EE",
  danger: "#C0392B",
  dangerBg: "#FDEDEB",
};

export const fonts = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// Reusable style fragments for plain inline-style components (no CSS
// framework in this project — kept intentionally simple).
export const buttonPrimary = {
  background: colors.sky,
  color: colors.white,
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  transition: "background 0.15s ease",
};

export const buttonSecondary = {
  background: "transparent",
  color: colors.navy,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "9px 18px",
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

export const card = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(10, 46, 77, 0.06)",
};

export const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  fontFamily: fonts.body,
  fontSize: 14,
  color: colors.slate,
  boxSizing: "border-box",
};
