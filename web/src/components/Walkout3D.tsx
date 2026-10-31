// Enveloppe React de la scène 3D (web/src/three/walkout.ts, la plongée du
// §17.4) : place le canvas plein écran et l'hôte du HUD, attend les polices et
// les assets 3D (préchargés pendant l'attente), relaie le clic de départ, les
// feux d'artifice (clic ou Espace), la passation à la carte HTML et la fin.
// Sans WebGL ou sans assets : on passe directement au résultat. Pendant
// l'attente, warmWalkout prépare le moteur de rendu avec une scène d'échauffement.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { langIcon, langTitle } from "../../../shared/card/languages";
import { useT } from "../i18n";
import { accentOf } from "../lib/util";
import { preloadWalkoutAssets } from "../three/assets";
import { loadCardTexture } from "../three/cardTexture";
import { loadSceneFonts } from "../three/textures";
import { HUD_TEXTS } from "../three/hudTexts";
import "../three/hud.css";
import * as THREE from "three";
import { STYLE_ACCENT } from "../lib/util";
import { createWalkout, type WalkoutCue, type WalkoutHandle } from "../three/walkout";
import type { Phase } from "./Reveal";

export { preloadWalkoutAssets };

/** Pendant l'attente du scoring : charge tout et construit une scène
 * d'échauffement, jamais affichée, pour que la révélation démarre sans
 * compiler ses shaders ni envoyer ses textures au GPU. Sans danger à rappeler. */
export async function warmWalkout(lang: Lang): Promise<void> {
  const [assets] = await Promise.all([preloadWalkoutAssets(), loadSceneFonts()]);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.colorSpace = THREE.SRGBColorSpace;
  blank.needsUpdate = true;
  const h = createWalkout({
    warm: true,
    lang,
    double: false,
    accent: STYLE_ACCENT.gold,
    texts: {
      specialty: "·",
      weapon: "·",
      file: "·",
      affiliation: "·",
      statuses: [{ min: 0, label: "·" }],
      graphLabel: "·",
      levelLabel: "·",
      hud: HUD_TEXTS[lang],
    },
    login: "dev",
    overall: 1,
    assets,
    cardTexture: Promise.resolve(blank),
    anchor: () => null,
    onHandoff: () => undefined,
    onDone: () => undefined,
    muted: true,
  });
  await h.ready;
}

/** Au-delà, on renonce à la scène plutôt que de faire attendre. */
const ASSET_TIMEOUT = 12000;
/** Le choix du visiteur pour le son, d'une révélation à l'autre. */
const MUTE_KEY = "tys-walkout-muted";
const readMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

export interface WalkoutControl {
  /** Clic sur la scène pendant la séquence : vrai si la scène l'a utilisé. */
  interact(): boolean;
}

interface Props {
  card: CardData;
  lang: Lang;
  /** Comparaison GitHub × CV : deux points sur la mini-carte. */
  double: boolean;
  phase: Phase;
  /** Élément contenant un [data-scene-anchor] : la carte 3D vient s'y poser. */
  anchorRef: RefObject<HTMLElement | null>;
  controlRef: MutableRefObject<WalkoutControl | null>;
  onHandoff: () => void;
  onDone: () => void;
}

export function Walkout3D({ card, lang, double, phase, anchorRef, controlRef, onHandoff, onDone }: Props) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const handle = useRef<WalkoutHandle | null>(null);
  const pendingOpen = useRef(false);
  const cb = useRef({ onHandoff, onDone });
  cb.current = { onHandoff, onDone };
  const [cue, setCue] = useState<WalkoutCue>(null);
  const [muted, setMuted] = useState(readMuted);
  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    handle.current?.setMuted(m);
    try {
      window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // stockage indisponible (navigation privée) : le choix vaut pour cette fois
    }
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    const hud = HUD_TEXTS[lang];
    const texts = {
      specialty: t.positions[card.position],
      weapon: langIcon(card.mainLanguage) ? langTitle(card.mainLanguage) : hud.polyglot,
      file: double ? hud.fileBoth : card.source === "cv" ? hud.fileCv : hud.fileGithub,
      affiliation: card.club ?? hud.loneWolf,
      statuses: t.reveal.statuses,
      graphLabel: t.reveal.tells.graph,
      levelLabel: LEVEL_LABELS[starsFor(card.overall)][lang],
      hud,
    };
    (async () => {
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("assets 3D trop lents")), ASSET_TIMEOUT));
      let assets;
      try {
        [assets] = await Promise.race([Promise.all([preloadWalkoutAssets(), loadSceneFonts()]), timeout]);
      } catch (e) {
        console.warn("[walkout] assets indisponibles, affichage direct", e);
        if (alive) cb.current.onDone();
        return;
      }
      if (!alive) return;
      try {
        const h = createWalkout({
          lang,
          double,
          accent: accentOf(card),
          texts,
          hudHost: hudRef.current ?? undefined,
          langKey: card.mainLanguage,
          login: card.login ?? card.name,
          overall: card.overall,
          assets,
          cardTexture: loadCardTexture(card, lang),
          anchor: () => anchorRef.current?.querySelector<HTMLElement>("[data-scene-anchor]")?.getBoundingClientRect() ?? null,
          onHandoff: () => cb.current.onHandoff(),
          onDone: () => cb.current.onDone(),
          onCue: (c) => alive && setCue(c),
          muted: readMuted(),
        });
        handle.current = h;
        h.canvas.className = "walkout-canvas";
        h.canvas.setAttribute("aria-hidden", "true");
        host.appendChild(h.canvas);
        controlRef.current = { interact: () => h.interact() };
        if (pendingOpen.current) h.open();
      } catch (e) {
        console.warn("[walkout] WebGL indisponible, affichage direct", e);
        cb.current.onDone();
      }
    })();
    return () => {
      alive = false;
      controlRef.current = null;
      handle.current?.dispose();
      handle.current?.canvas.remove();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handle.current?.canvas.classList.toggle("is-fading", phase === "handoff");
    if (phase !== "playing") return;
    if (handle.current) handle.current.open();
    else pendingOpen.current = true;
  }, [phase]);

  // Espace : feux d'artifice, comme L1/R1 dans le jeu
  useEffect(() => {
    if (cue !== "fireworks") return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (handle.current?.interact()) e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [cue]);

  return (
    <>
      {/* le canvas du moteur de rendu partagé y est placé (walkout.ts), et le HUD (hud.ts) */}
      <div ref={hostRef} style={{ display: "contents" }} />
      <div ref={hudRef} style={{ display: "contents" }} />
      {phase === "playing" && (
        <button type="button" className="sound-btn" aria-pressed={!muted} aria-label={muted ? t.reveal.unmute : t.reveal.mute} title={muted ? t.reveal.unmute : t.reveal.mute} onClick={toggleSound}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
            {muted ? (
              <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            ) : (
              <path d="M16 8.5a5 5 0 0 1 0 7m2.5-9.5a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            )}
          </svg>
        </button>
      )}
      {cue && phase === "playing" && (
        <p key={cue} className="walkout-cue" aria-hidden>
          {t.reveal.fireworks}
        </p>
      )}
    </>
  );
}
