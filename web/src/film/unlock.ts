// Les deux balises vidéo du film (§18.36, docs/cinematique-poursuite.md §5.4),
// créées et débloquées dans un geste : l'envoi du formulaire (EntryForm, à côté
// de unlockAudio), sinon la pilule « Ouvrir mon dossier » de l'attente. Un
// navigateur qui refuse la lecture sans geste (iPhone en économie d'énergie)
// garde la permission sur la balise touchée ; le lecteur (player.ts) joue donc
// ces deux-là, jamais d'autres. Quelques lignes, dans le paquet de l'accueil :
// le reste du film se charge à part.

let pair: [HTMLVideoElement, HTMLVideoElement] | null = null;
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

/** La poursuite (A) et la fin (B) : toujours les deux mêmes balises pour la page. */
export function filmVideos(): [HTMLVideoElement, HTMLVideoElement] {
  if (!pair) pair = [make(), make()];
  return pair;
}

/** Dans un geste : chaque balise reçoit un play() suivi d'un pause(). */
export function unlockFilm(): void {
  unlocks++;
  if (typeof document === "undefined") return;
  for (const v of filmVideos()) {
    try {
      const p = v.play();
      v.pause();
      // sans source, ou interrompue par pause() : sans importance, la permission est donnée
      void p?.catch(() => undefined);
    } catch {
      /* navigateur sans vidéo : le film ne jouera pas, la fiche sortira sans révélation */
    }
  }
}

/** Combien de gestes ont débloqué les balises sur cette page (le lecteur simule un refus jusqu'au suivant). */
export function filmUnlocks(): number {
  return unlocks;
}
