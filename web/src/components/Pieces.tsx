// Sous la fiche d'un dossier à deux pièces (SPEC §18.36) : « Pièces au dossier :
// LinkedIn · GitHub ». Une seule note, celle de la fiche ; les pièces disent d'où
// vient la preuve, jamais l'une contre l'autre. Le code pas encore prouvé (GitHub
// « dossier vide ») et un lien entre les deux pièces que rien ne prouve encore se
// disent sur leur propre ligne.
import { declaredLabel } from "../../../shared/caseFile";
import type { ComparisonData } from "../../../shared/types";
import { useT } from "../i18n";

export function Pieces({ cmp }: { cmp: ComparisonData }) {
  const { t } = useT();
  const p = t.result.pieces;
  const unproven = cmp.github.grid?.rule === "empty_file" || !!cmp.github.sealed;
  return (
    <div className="pieces">
      <p className="pieces-line">{p.line(`${declaredLabel(cmp)} · GitHub`)}</p>
      {unproven && <p className="pieces-note">{p.unproven}</p>}
      {cmp.linkUnproven && <p className="pieces-note">{p.link}</p>}
    </div>
  );
}
