// Un bouton en cours (SPEC §18.48) : il reste rose plein (classe .is-busy) et son
// libellé est suivi de trois points animés. Le libellé perd ses points de suspension :
// les points animés les remplacent.

/** « Ouverture… » → « Ouverture » : les trois points animés disent la suite. */
export function busyLabel(label: string): string {
  return label.replace(/\s*(…|\.{3})\s*$/, "");
}

/** Trois points animés, à poser après le libellé d'un bouton .is-busy. */
export function BusyDots() {
  return (
    <span className="busy-dots" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
