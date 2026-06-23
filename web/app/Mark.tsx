/**
 * The Episteme mark — a faceted diamond, the "claim node" that runs through the
 * graph. Single source of truth for the inline wordmark; kept in visual sync
 * with app/icon.svg (the favicon) and app/apple-icon.tsx (the touch icon).
 */
export function Mark({ size = "1em" }: { size?: string | number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.12em" }}
    >
      <path d="M12 1.6 22.4 12 1.6 12 Z" fill="#1f6b46" />
      <path d="M1.6 12 22.4 12 12 22.4 Z" fill="#16543a" />
      <line x1="2.4" y1="12" x2="21.6" y2="12" stroke="#fbfaf6" strokeWidth="0.8" />
    </svg>
  );
}
