// Révélation (SPEC §17.4) : la machine à états autour de la scène 3D (Walkout3D).
// « ready » : la scène se prépare sous l'écran d'attente (§18.27, plus d'écran
// noir) ; dès qu'il se lève, le pack flotte dans la cabine et s'ouvre seul.
// « playing » : la séquence 3D joue (l'ascenseur monte jusqu'au dev). « handoff » : la carte HTML apparaît par-dessus la carte 3D
// posée au même endroit, le canvas s'efface. « done » : la page vit.
// Sautable d'un clic, désactivée en mouvement réduit.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { styleOf } from "../../../shared/types";
import { themeOf } from "../../../shared/card/themes";
import { CardView } from "../card/CardView";
import { isMock } from "../lib/api";

/** Les couleurs du niveau (SPEC §17.2, thème de la fiche), pour la scène 3D et
 * le halo de l'emplacement : les néons du thème, plus les ors du tier. */
export function levelAccent(card: Pick<CardData, "overall" | "special">): { a: string; b: string; ink: string } {
  const th = themeOf(card);
  return { a: th.accent, b: th.accent2, ink: th.ink };
}

export type Phase = "ready" | "playing" | "handoff" | "done";

/** L'attente levée, la cabine se montre ce temps-là, puis le dossier s'ouvre seul. */
const AUTO_OPEN = 700;

/**
 * Machine à états de la révélation, partagée par une carte seule ou une comparaison.
 * `start` : la scène est à l'écran (l'attente s'est levée) ; avant, rien ne part.
 */
export function useReveal(animate: boolean, start = true) {
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
    if (!animate || !start) return;
    // Mode démo : ?freeze=ready reste dans la cabine, pour la mise au point.
    if (isMock() && new URLSearchParams(window.location.search).get("freeze") === "ready") return;
    const id = window.setTimeout(open, AUTO_OPEN);
    return () => window.clearTimeout(id);
  }, [animate, start, open]);

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
  /** La carte seule (pas une des deux d'une comparaison). */
  primary?: boolean;
  /** La carte 3D vient se poser sur cet emplacement. */
  anchor?: boolean;
}

export function RevealCard({ card, lang, phase, idPrefix, primary = true, anchor = primary }: RevealCardProps) {
  const accent = levelAccent(card);
  const style = styleOf(card);
  const showCard = phase === "handoff" || phase === "done";
  const vars = { "--ca": accent.a, "--cb": accent.b, "--ink": accent.ink } as CSSProperties;

  return (
    <div className={`card-slot phase-${phase}${showCard ? " show-front" : ""}`} style={vars} data-style={style} data-scene-anchor={anchor ? "" : undefined}>
      <div className="card-rig">{showCard && <CardView card={card} lang={lang} interactive={phase === "done"} reveal={phase === "handoff"} idPrefix={idPrefix} />}</div>
    </div>
  );
}
