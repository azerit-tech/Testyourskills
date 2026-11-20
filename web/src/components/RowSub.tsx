// Sous le nom d'une ligne de classement (§18.127) : les étoiles, puis le niveau d'expérience
// en un mot mat (« Junior »). Le top de la semaine, sa suite, et les fiches d'une bande ouverte.
import { SENIORITY_TAG } from "../../../shared/gridText";
import type { SeniorityCode } from "../../../shared/types";
import { useT } from "../i18n";
import { Stars } from "./Stars";

export function RowSub({ stars, seniority, label }: { stars: number; seniority?: SeniorityCode; label?: string }) {
  const { lang } = useT();
  return (
    <span className="board-sub">
      <Stars n={stars} size={14} label={label} />
      {seniority && <span className="board-level">{SENIORITY_TAG[seniority][lang]}</span>}
    </span>
  );
}
