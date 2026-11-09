// Enveloppe React de la scène 3D (web/src/three/walkout.ts) : place le canvas
// plein écran et le HUD (hud.ts), attend les polices et les assets 3D
// (préchargés pendant l'attente), relaie le clic d'ouverture, les feux d'artifice (clic ou
// Espace), la passation à la carte HTML et la fin. Sans WebGL ou sans assets :
// on passe directement au résultat. Pendant l'attente, warmWalkout prépare le
// moteur de rendu avec une scène d'échauffement.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { siGithub } from "simple-icons";
import type { CardData, DeclaredSource, Lang } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { langIcon, langTitle } from "../../../shared/card/languages";
import { pick, useT } from "../i18n";
import { readMuted, unlockAudio, writeMuted } from "../lib/audio";
import { useMediaQuery } from "../lib/util";
import { preloadWalkoutAssets } from "../three/assets";
import { loadCardTexture } from "../three/cardTexture";
import { HUD_TEXTS } from "../three/hudTexts";
import { loadSceneFonts } from "../three/textures";
import * as THREE from "three";
import { createWalkout, type WalkoutCue, type WalkoutHandle } from "../three/walkout";
import { levelAccent, type Phase } from "./Reveal";
import "../three/hud.css";

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
    accent: levelAccent({ overall: 80 }),
    texts: {
      langName: "·",
      langLabel: "·",
      leagueName: "·",
      leagueLabel: "·",
      position: "·",
      positionName: "·",
      positionLabel: "·",
      club: "·",
      clubLabel: "·",
      statusLabel: "·",
      statuses: [{ min: 0, label: "·" }],
      idleTitle: "·",
      idleSubtitle: "·",
      graphLabel: "·",
      levelLabel: "·",
      hud: { specialty: "·", weapon: "·", file: "·", affiliation: "·", ...HUD_TEXTS[lang] },
    },
    logoPath: CODE_PATH,
    leaguePath: siGithub.path,
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

/** Document (CV) en 24 × 24, logo de la ligue CV. */
const DOC_PATH = "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z";
/** Chevrons de code en 24 × 24, quand aucun langage n'est reconnu. */
const CODE_PATH = "M8.7 16.6 4.1 12l4.6-4.6L7.3 6l-6 6 6 6 1.4-1.4zm6.6 0 4.6-4.6-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4z";
/** Au-delà, on renonce à la scène plutôt que de faire attendre. */
const ASSET_TIMEOUT = 12000;
export interface WalkoutControl {
  /** Clic sur la scène pendant la séquence : vrai si la scène l'a utilisé. */
  interact(): boolean;
}

interface Props {
  card: CardData;
  lang: Lang;
  /** Comparaison GitHub × CV : le « double walkout ». */
  double: boolean;
  /** Ce que la fiche déclarative a lu : un CV ou un profil LinkedIn (§18.24). */
  declared?: DeclaredSource;
  phase: Phase;
  /** Élément contenant un [data-scene-anchor] : la carte 3D vient s'y poser. */
  anchorRef: RefObject<HTMLElement | null>;
  controlRef: MutableRefObject<WalkoutControl | null>;
  onHandoff: () => void;
  onDone: () => void;
}

export function Walkout3D({ card, lang, double, declared = "cv", phase, anchorRef, controlRef, onHandoff, onDone }: Props) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const handle = useRef<WalkoutHandle | null>(null);
  const pendingOpen = useRef(false);
  const cb = useRef({ onHandoff, onDone });
  cb.current = { onHandoff, onDone };
  const [cue, setCue] = useState<WalkoutCue>(null);
  // Sur écran tactile, ni clic ni Espace : on touche l'écran.
  const touch = useMediaQuery("(pointer: coarse)");
  const [muted, setMuted] = useState(readMuted);
  const toggleSound = () => {
    const m = !muted;
    setMuted(m);
    writeMuted(m);
    // Remettre le son est un geste : le contexte audio se crée ou se relance ici.
    if (!m) unlockAudio();
    handle.current?.setMuted(m);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    const icon = langIcon(card.mainLanguage);
    const tells = t.reveal.tells;
    const texts = {
      langName: icon ? langTitle(card.mainLanguage) : tells.noLanguage,
      langLabel: tells.language,
      leagueName: double
        ? declared === "linkedin" ? tells.leagueBothLinkedin : tells.leagueBoth
        : card.source === "cv" ? (declared === "linkedin" ? tells.leagueLinkedin : tells.leagueCv) : tells.leagueGithub,
      leagueLabel: tells.league,
      position: card.position,
      positionName: t.positions[card.position],
      positionLabel: tells.position,
      club: card.club ?? tells.freeAgent,
      clubLabel: tells.club,
      statusLabel: t.reveal.statusLabel,
      statuses: t.reveal.statuses,
      idleTitle: t.reveal.packTitle,
      idleSubtitle: tells.idle,
      graphLabel: tells.graph,
      levelLabel: LEVEL_LABELS[starsFor(card.overall)][lang],
      profileLabel: card.profile ? pick(card.profile.label, lang) : undefined,
      hud: { specialty: tells.position, weapon: tells.language, file: tells.league, affiliation: tells.club, ...HUD_TEXTS[lang] },
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
          accent: levelAccent(card),
          texts,
          logoPath: icon?.path ?? CODE_PATH,
          leaguePath: card.source === "cv" && !double ? DOC_PATH : siGithub.path,
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
          hudHost: hudRef.current ?? undefined,
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
          {touch ? t.reveal.fireworksTouch : t.reveal.fireworks}
        </p>
      )}
    </>
  );
}
