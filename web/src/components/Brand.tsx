// Marque Azerit : la mascotte (web/public/logo.png, la même que la landing page et l'app) et le nom.

export function AzeritMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <img
      className={className}
      src="/logo.png"
      width={Math.round((size * 228) / 256)}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      style={{ display: "block" }}
    />
  );
}

/** La mascotte et « AZERIT », en haut à gauche de chaque page : le seul nom visible du site (SPEC §18.48). */
export function Brand() {
  return (
    <span className="brand">
      <AzeritMark size={22} />
      <span className="brand-name">AZERIT</span>
    </span>
  );
}
