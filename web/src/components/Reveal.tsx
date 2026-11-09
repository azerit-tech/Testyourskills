// Révélation (SPEC §17.4) : la machine à états autour de la scène 3D (Walkout3D).
// « ready » : le pack flotte dans la cabine, clic ou délai pour l'ouvrir.
// « playing » : la séquence 3D joue (l'ascenseur monte jusqu'au dev). « handoff » : la carte HTML apparaît par-dessus la carte 3D
// posée au même endroit, le canvas s'efface. « done » : la page vit.
// Sautable d'un clic, désactivée en mouvement réduit.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { styleOf } from "../../../shared/types";
import { themeOf } from "../../../shared/card/themes";
import { CardView } from "../card/CardView";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { useMediaQuery } from "../lib/util";

/** Les couleurs du niveau (SPEC §17.2, thème de la fiche), pour la scène 3D et
 * le halo de l'emplacement : les néons du thème, plus les ors du tier. */
export function levelAccent(card: Pick<CardData, "overall" | "special">): { a: string; b: string; ink: string } {
  const th = themeOf(card);
  return { a: th.accent, b: th.accent2, ink: th.ink };
}

export type Phase = "ready" | "playing" | "handoff" | "done";

const AUTO_OPEN = 1600;

/** Machine à états de la révélation, partagée par une carte seule ou une comparaison. */
export function useReveal(animate: boolean) {
  const [phase, setPhase] = useState<Phase>(animate ? "ready" : "done");
  const opened = useRef(false);

  const open = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    setPhase("playing");
  }, []);
  const handoff = useCallback(() => setPhase((p) => (p === "playing" ? "handoff" : p)), []);
  const finish = useCallback(() => setPhase("done"), []);
  const skip = useCallback(() => {
    opened.current = true;
    setPhase("done");
  }, []);

  useEffect(() => {
    if (!animate) return;
    // Mode démo : ?freeze=ready reste dans la cabine, pour la mise au point.
    if (isMock() && new URLSearchParams(window.location.search).get("freeze") === "ready") return;
    const id = window.setTimeout(open, AUTO_OPEN);
    return () => window.clearTimeout(id);
  }, [animate, open]);

  const animating = phase !== "done";
  /** Le contenu sous la carte apparaît une fois la scène éteinte. */
  const settled = phase === "done";
  return { phase, open, skip, handoff, finish, animating, settled };
}

interface RevealCardProps {
  card: CardData;
  lang: Lang;
  phase: Phase;
  idPrefix: string;
  /** Porte l'invite « touche / clique pour ouvrir » (carte seule). */
  primary?: boolean;
  /** La carte 3D vient se poser sur cet emplacement. */
  anchor?: boolean;
}

export function RevealCard({ card, lang, phase, idPrefix, primary = true, anchor = primary }: RevealCardProps) {
  const { t } = useT();
  const accent = levelAccent(card);
  const style = styleOf(card);
  const showCard = phase === "handoff" || phase === "done";
  // Le dossier s'ouvre seul (AUTO_OPEN), mais un toucher ou un clic l'ouvre plus tôt.
  const touch = useMediaQuery("(pointer: coarse)");
  const vars = { "--ca": accent.a, "--cb": accent.b, "--ink": accent.ink } as CSSProperties;

  return (
    <div className={`card-slot phase-${phase}${showCard ? " show-front" : ""}`} style={vars} data-style={style} data-scene-anchor={anchor ? "" : undefined}>
      <div className="card-rig">{showCard && <CardView card={card} lang={lang} interactive={phase === "done"} reveal={phase === "handoff"} idPrefix={idPrefix} />}</div>
      {primary && phase === "ready" && <span className="pack-hint">{touch ? t.reveal.tap : t.reveal.click}</span>}
    </div>
  );
}
