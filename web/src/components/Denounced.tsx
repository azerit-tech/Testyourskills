// La fiche d'une personne dénoncée (§18.6, §18.48), vue par tout visiteur sauf qui l'a
// dénoncée : un titre qui vaut pour la personne visée comme pour un tiers, puis les deux
// sorties. « C'est moi, je reprends ma fiche » (connexion GitHub, le seul bouton rose de
// l'écran : la barre « Fais la tienne » s'efface tant que ce bloc est là) et « Ce n'est
// pas moi : faire la mienne ». Sans pseudo GitHub, la demande de retrait est dans le bloc.
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { useReducedMotion } from "../lib/util";
import { toYourTurn } from "./MakeYours";

interface Props {
  /** La personne fichée : « @pseudo », sinon son nom. */
  who: string;
  /** Qui a dénoncé, nommé s'il ou elle a repris sa fiche ; sinon « Dénonciation anonyme ». */
  by: string | null;
  /** La reprise par GitHub ; null sans pseudo GitHub ou si elle est éteinte. */
  onLawyer: (() => void) | null;
  /** Le visiteur n'a pas encore sa fiche : « Ce n'est pas moi : faire la mienne ». */
  notMe: boolean;
  /** La demande de retrait d'une fiche sans pseudo GitHub. */
  children?: ReactNode;
}

export function Denounced({ who, by, onLawyer, notMe, children }: Props) {
  const { t } = useT();
  const d = t.denounce;
  const reduced = useReducedMotion();
  return (
    <section className="denounced" aria-labelledby="denounced-title">
      <h2 className="denounced-title" id="denounced-title">
        {d.banner(who)}
      </h2>
      <p className="denounced-by">{by ? d.by(by) : d.anonymous}</p>
      {onLawyer && (
        <>
          <button type="button" className="pill pill-big" onClick={onLawyer}>
            {d.lawyer}
          </button>
          <p className="denounced-hint">{d.lawyerHint}</p>
        </>
      )}
      {notMe && (
        // Seule sortie du bloc (pas de reprise possible) : elle prend le rose.
        <button type="button" className={onLawyer ? "pill" : "pill pill-big"} onClick={() => toYourTurn(reduced)}>
          {d.notMe}
        </button>
      )}
      {children}
    </section>
  );
}
