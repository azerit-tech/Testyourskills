// La balise vidéo du film (§18.36, docs/cinematique-poursuite.md §5.4 ; une
// seule depuis le film d'un seul tenant, §18.56), créée et débloquée dans un geste : l'envoi du formulaire (EntryForm, à côté
// de unlockAudio), sinon la pilule « Lancer la poursuite » de l'attente. Un
// navigateur qui refuse la lecture sans geste (iPhone en économie d'énergie)
// garde la permission sur la balise touchée ; le lecteur (player.ts) joue donc
// celle-là, jamais une autre. Quelques lignes, dans le paquet de l'accueil :
// le reste du film se charge à part.

let video: HTMLVideoElement | null = null;
let unlocks = 0;

function make(): HTMLVideoElement {
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute("muted", "");
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.setAttribute("disablepictureinpicture", "");
  v.setAttribute("disableremoteplayback", "");
  v.preload = "auto";
  return v;
}

/** Le film (la poursuite et FIN6, un seul fichier) : toujours la même balise pour la page. */
export function filmVideo(): HTMLVideoElement {
  video ??= make();
  return video;
}

/** Dans un geste : la balise reçoit un play() suivi d'un pause(). */
export function unlockFilm(): void {
  unlocks++;
  if (typeof document === "undefined") return;
  const v = filmVideo();
  try {
    const p = v.play();
    v.pause();
    // sans source, ou interrompue par pause() : sans importance, la permission est donnée
    void p?.catch(() => undefined);
  } catch {
    /* navigateur sans vidéo : le film ne jouera pas, la fiche sortira sans révélation */
  }
}

/** Combien de gestes ont débloqué la balise sur cette page (le lecteur simule un refus jusqu'au suivant). */
export function filmUnlocks(): number {
  return unlocks;
}
