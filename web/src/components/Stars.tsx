// Les étoiles du site (SPEC §18.48) : un seul dessin, partout hors de la fiche,
// des images de partage et du film (qui suivent la même règle chez eux).
// Remplies de gauche à droite. Allumée : crème pleine. Éteinte : la même étoile
// en contour de 1,5 px, sans remplissage. Trois tailles : 14 px (listes), 22 px
// (verdict), 26 px (pari). Le dessin est dans styles.css (.star-shape, .stars).

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

export type StarSize = 14 | 22 | 26;

/** Lesquelles sont allumées : les n premières, de gauche à droite. */
export function litStars(n: number, total = 6): boolean[] {
  const on = Math.max(0, Math.min(total, Math.round(Number.isFinite(n) ? n : 0)));
  return Array.from({ length: total }, (_, i) => i < on);
}

/** Une étoile seule, éteinte ou allumée : la brique de tout le reste. */
export function StarShape({ on = false, className }: { on?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`star-shape${on ? " on" : ""}${className ? ` ${className}` : ""}`} aria-hidden focusable="false">
      <path d={STAR} />
    </svg>
  );
}

/** Une étoile allumée devant un nombre d'étoiles (« ★ 88 »). */
export function StarMark({ className }: { className?: string }) {
  return <StarShape on className={`star-mark${className ? ` ${className}` : ""}`} />;
}

interface StarsProps {
  /** Le nombre d'étoiles allumées. */
  n: number;
  size?: StarSize;
  /** Six par défaut. `total` égal à `n` : seulement les allumées (« Tu rapportes ★★★★ »). */
  total?: number;
  /** Lue à la place du dessin ; sans elle, la rangée est décorative. */
  label?: string;
  className?: string;
}

/** La rangée d'étoiles : allumées à gauche, éteintes à droite. */
export function Stars({ n, size = 14, total = 6, label, className }: StarsProps) {
  const cls = `stars stars-${size}${className ? ` ${className}` : ""}`;
  const shapes = litStars(n, total).map((on, i) => <StarShape key={i} on={on} />);
  return label ? (
    <span className={cls} role="img" aria-label={label}>
      {shapes}
    </span>
  ) : (
    <span className={cls} aria-hidden>
      {shapes}
    </span>
  );
}
