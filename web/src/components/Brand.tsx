// Marque Azerit : la gemme en facettes plates (§18.18) et le nom.

export function AzeritMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={Math.round(size * 1.15)} viewBox="0 0 104 120" fill="none" aria-hidden style={{ display: "block" }}>
      <path d="M52 8 L14 50 L37 102 Z" fill="#c9d67c" stroke="#c9d67c" strokeWidth="9" strokeLinejoin="round" />
      <path d="M63 10 L92 42 L85 80 L47 112 Z" fill="#6fb2a8" stroke="#6fb2a8" strokeWidth="9" strokeLinejoin="round" />
    </svg>
  );
}

/** La gemme et « AZERIT », en haut à gauche de chaque page (maquette web/gta-accueil.html). */
export function Brand() {
  return (
    <span className="brand">
      <AzeritMark size={13} />
      AZERIT
    </span>
  );
}
