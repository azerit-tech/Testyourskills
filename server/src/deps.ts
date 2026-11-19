// Câblage réel des modules du moteur dans le pipeline. Les tests ne passent pas
// par ici : ils injectent leurs propres `Deps`.

import { collectGithub, pickFilesForReading } from "./github/collect";
import { scoreGithub, cvTextCounts, scoreCv, scoreDossier } from "./scoring/index";
import { readCode } from "./ai/readCode";
import { readCv } from "./ai/readCv";
import { aiConfigured } from "./ai/budget";
import { extractPdfText } from "./cv/extract";
import { renderImage } from "./render/index";
import type { Deps } from "./pipeline";

export const realDeps: Deps = {
  collectGithub,
  pickFilesForReading,
  readCode,
  // Clé présente suffit : le plafond et le crédit sont vérifiés à chaque appel,
  // et font échouer la fiche en `closed` plutôt que de la sortir sans lecture.
  aiAvailable: aiConfigured,
  scoreGithub,
  extractPdfText,
  cvTextCounts,
  readCv,
  scoreCv,
  scoreDossier,
  // Le rendu d'une image (à la première demande de /og, hors du délai de la fiche) dit sa durée au journal.
  async renderImage(input) {
    const t0 = performance.now();
    try {
      return await renderImage(input);
    } finally {
      console.log(`[image] ${input.format} ${Math.round(performance.now() - t0)} ms`);
    }
  },
};
