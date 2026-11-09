// Le son de la révélation, débloqué par un geste (§18.27). Un seul AudioContext
// pour la page : les navigateurs de téléphone (Safari, le navigateur intégré de
// LinkedIn) le gardent muet tant qu'il n'a pas été créé ou relancé dans un
// geste. On le fait donc dans le geste qui lance la fiche (l'envoi du
// formulaire), et à défaut à chaque toucher, clic ou touche du clavier. Les
// sons de la scène (three/elevatorSound.ts, three/radioSound.ts) s'y branchent.
// Sans Three.js : ce module vit dans le bundle de l'accueil.

/** Le choix de la personne pour le son, d'une révélation à l'autre. */
const MUTE_KEY = "tys-walkout-muted";
/** Stockage bloqué : le choix vaut pour cette page. */
let memMuted: boolean | null = null;

export function readMuted(): boolean {
  if (memMuted !== null) return memMuted;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): void {
  memMuted = muted;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* navigation privée, webview : la mémoire suffit */
  }
}

type Ctor = typeof AudioContext;
const ctor = (): Ctor | undefined =>
  typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);

let ctx: AudioContext | null = null;
let gestured = false;

/** Le contexte de la page, relancé s'il dort ; null sans Web Audio. */
function wake(): AudioContext | null {
  if (!ctx || ctx.state === "closed") {
    const C = ctor();
    if (!C) return null;
    try {
      ctx = new C();
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  return ctx;
}

/**
 * À appeler dans un geste : crée ou relance le contexte audio. Son coupé par la
 * personne : rien n'est créé (un contexte qui tourne peut interrompre sa
 * musique), le geste est seulement noté.
 */
export function unlockAudio(): void {
  gestured = true;
  if (!readMuted()) wake();
}

/** Pour les sons de la scène : le contexte partagé, jamais fermé par eux. */
export function sharedAudio(): AudioContext | null {
  return wake();
}

/**
 * Vrai si la révélation doit attendre un geste pour avoir du son : aucun geste
 * vu sur cette page (lien direct, page rechargée pendant l'attente), son non
 * coupé, et un navigateur qui sait jouer du son.
 */
export function soundNeedsGesture(): boolean {
  return !gestured && !readMuted() && !!ctor();
}

let watching = false;
/** Une fois pour la page : chaque geste relance le contexte s'il s'est endormi (onglet en veille, appel). */
export function watchGestures(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const on = () => {
    if (!gestured || (ctx && ctx.state !== "running")) unlockAudio();
  };
  // Safari ne compte comme geste que la fin du toucher (pointerup, touchend, click) :
  // le contexte créé au pointerdown y reste endormi, et le geste suivant le relance.
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown", "drop"] as const) {
    window.addEventListener(type, on, { capture: true, passive: true });
  }
}
