// Révélation (§17.4) : la machine à états autour de la scène 3D (Walkout3D).
// « ready » : le ciel et le HUD, clic ou délai pour plonger. « playing » : la
// séquence 3D joue. « handoff » : la carte HTML apparaît par-dessus la carte 3D
// posée au même endroit, le canvas s'efface. « done » : la page vit.
// Sautable d'un clic, désactivée en mouvement réduit.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { styleOf } from "../../../shared/types";
import { CardView } from "../card/CardView";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { accentOf } from "../lib/util";

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
    // Mode démo : ?freeze=ready reste dans le ciel, pour la mise au point.
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
  /** Porte l'invite « touche pour ouvrir » (carte seule). */
  primary?: boolean;
  /** La carte 3D vient se poser sur cet emplacement. */
  anchor?: boolean;
}

export function RevealCard({ card, lang, phase, idPrefix, primary = true, anchor = primary }: RevealCardProps) {
  const { t } = useT();
  const accent = accentOf(card);
  const style = styleOf(card);
  const showCard = phase === "handoff" || phase === "done";
  const vars = { "--ca": accent.a, "--cb": accent.b, "--ink": accent.ink } as CSSProperties;

  return (
    <div className={`card-slot phase-${phase}${showCard ? " show-front" : ""}`} style={vars} data-style={style} data-scene-anchor={anchor ? "" : undefined}>
      <div className="slot-halo" aria-hidden />
      <div className="card-rig">{showCard && <CardView card={card} lang={lang} interactive={phase === "done"} reveal={phase === "handoff"} idPrefix={idPrefix} />}</div>
      {primary && phase === "ready" && <span className="pack-hint">{t.reveal.tap}</span>}
    </div>
  );
}
