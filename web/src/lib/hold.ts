// Plus d'écran noir (§18.27). La fiche est prête : l'écran d'attente reste
// par-dessus la page tant que les pièces du dossier ne sont pas lues (§18.26)
// et que la scène 3D n'a pas rendu sa première image. Il se lève alors et la
// révélation part seule ; si le son demande encore un geste, il montre d'abord
// la pilule « Ouvrir mon dossier ». Au bout de 20 s sans scène, la fiche sort
// sans révélation.
import { useCallback, useEffect, useRef, useState } from "react";
import { soundNeedsGesture, unlockAudio } from "./audio";

/** Fiche prête : au plus ce temps sur l'attente, lecture des pièces et chargement de la scène compris. */
export const SCENE_WAIT_MS = 20_000;
/** Le fondu de l'écran d'attente qui se lève (styles.css, .loadscreen.is-leaving). */
const LEAVE_MS = 260;

/** La scène 3D : en chargement, première image rendue, ou abandonnée (pas de WebGL, assets en échec, animation passée). */
export type SceneState = "loading" | "ready" | "off";
export type HoldStep = "wait" | "tap" | "lift";

export interface HoldFacts {
  /** Une révélation est prévue (fiche fraîche, mouvement non réduit). */
  animate: boolean;
  /** Les pièces minimales du dossier sont lues. */
  released: boolean;
  scene: SceneState;
  /** Aucun geste vu sur la page et son non coupé : la révélation serait muette. */
  needsGesture: boolean;
}

/** Ce que fait l'écran d'attente, fiche prête : rester, demander un geste, ou se lever. */
export function holdStep(f: HoldFacts): HoldStep {
  if (!f.released) return "wait";
  if (!f.animate || f.scene === "off") return "lift";
  if (f.scene === "loading") return "wait";
  return f.needsGesture ? "tap" : "lift";
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/**
 * L'écran d'attente d'une fiche prête. `active` : il y a quelque chose à
 * attendre (des pièces à lire, une scène à charger). Onglet caché : rien ne
 * bouge, ni la levée ni le délai, pour que la révélation ne joue pas dans le dos
 * de la personne.
 */
export function useHold({ active, animate }: { active: boolean; animate: boolean }) {
  const [released, setReleased] = useState(false);
  const [scene, setScene] = useState<SceneState>("loading");
  const [stage, setStage] = useState<"wait" | "tap" | "leaving" | "gone">("wait");
  const [abort, setAbort] = useState(false);
  const visible = usePageVisible();
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const lift = useCallback(() => setStage((s) => (s === "wait" || s === "tap" ? "leaving" : s)), []);

  useEffect(() => {
    if (!active || stage !== "wait" || !visible) return;
    const step = holdStep({ animate, released, scene, needsGesture: soundNeedsGesture() });
    if (step === "lift") lift();
    else if (step === "tap") setStage("tap");
  }, [active, animate, stage, visible, released, scene, lift]);

  // Le filet : la scène n'est pas prête à temps, la fiche sort sans révélation.
  useEffect(() => {
    if (!active || stage !== "wait" || !visible) return;
    const t = window.setTimeout(() => {
      if (sceneRef.current !== "ready") setAbort(true);
      lift();
    }, SCENE_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [active, stage, visible, lift]);

  useEffect(() => {
    if (stage !== "leaving") return;
    const t = window.setTimeout(() => setStage("gone"), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  const onRelease = useCallback(() => setReleased(true), []);
  const onScene = useCallback((s: SceneState) => setScene(s), []);
  /** Le geste de la pilule : il débloque le son, puis l'écran se lève. */
  const onOpen = useCallback(() => {
    unlockAudio();
    lift();
  }, [lift]);

  const lifted = stage === "leaving" || stage === "gone";
  return {
    /** L'écran d'attente est encore monté. */
    show: active && stage !== "gone",
    leaving: stage === "leaving",
    /** Ce que l'attente affiche en bas : la scène se charge, ou la pilule du geste. */
    line: (stage === "tap" ? "tap" : animate && scene === "loading" && !lifted ? "loading" : undefined) as "tap" | "loading" | undefined,
    /** La révélation peut partir : rien à attendre, ou l'écran s'est levé. */
    start: !active || lifted,
    /** Délai dépassé sans scène : la page passe l'animation. */
    abort,
    onRelease,
    onScene,
    onOpen,
  };
}
