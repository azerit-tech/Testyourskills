// Le texte de partage (§18.27, §18.48), en fonction pure. Dans le fil LinkedIn, deux
// lignes se lisent avant « voir plus » : la fiche d'abord (« Ma fiche de dev selon la
// grille de recrutement d'Azerit : ★★★★★☆ Menace publique, 79/100. »), puis le profil et le rang quand il flatte,
// le point fort, la trouvaille, et « Fais la tienne : » avec le lien. Des virgules,
// jamais une chaîne de points médians.
// Les mots viennent d'i18n (`result.share.words`) ; rien ici ne lit le navigateur.
import { starsLine } from "../../../shared/stars";
import type { Dict } from "../i18n";

export type ShareWords = Dict["result"]["share"]["words"];

interface Common {
  /** Étoiles du verdict, de 1 à 6. */
  stars: number;
  /** Le nom du niveau, déjà dans la langue (« Menace publique »). */
  level: string;
  /** Profil criminel, déjà dans la langue. */
  profile: string | null;
  /** Dossier vide fait par un tiers, pas encore revendiqué (shared/publicView.ts) : ni note, ni étoiles. */
  sealed?: boolean;
  /** « 7e ce mois-ci », seulement pendant le mois en cours et dans le top 10 (`flatteringRank`). */
  rank: string | null;
}

export interface CardShare extends Common {
  kind: "card";
  overall: number;
  /** La note vient de la grille de recrutement (§18.37) : le texte le dit dès la première ligne. */
  graded?: boolean;
  /** « Point fort : niveau du code, 8/10. » (shared/recruiterLine.ts), ou null. */
  strong?: string | null;
  /** La trouvaille la plus forte (§18.26) : elle prend la place du chef d'accusation. */
  finding: string | null;
  /** Le chef d'accusation, à défaut de trouvaille. */
  status: string | null;
  secs: number;
  /** Un dossier à deux sources (§18.36) : « LinkedIn » ou « CV », pour « Deux sources au dossier : LinkedIn et GitHub. » */
  exhibits?: string;
}

/** Un dossier à deux sources se partage comme une fiche, la sienne (§18.36) : un seul texte. */
export type ShareInput = CardShare;

export { starsLine };

/** Le rang ne s'affiche et ne part dans le texte que s'il flatte : le top 10 du mois (§18.48),
 *  et la première moitié des fiches (§18.52) : « 8e » sur huit, le jeudi du lancement, c'est la dernière place. */
export const SHARE_RANK_MAX = 10;
export const flatteringRank = (rank: number, total: number): boolean => rank >= 1 && rank <= SHARE_RANK_MAX && rank <= total / 2;

/** X plafonne un post à 280 caractères et compte tout lien pour 23. */
export const X_MAX = 280;
export const X_LINK = 23;

/** Ce que X compte pour un seul caractère ; tout le reste (★, ☆, …, l'espace fine insécable) en vaut deux. */
const single = (cp: number) =>
  cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);

/** Un mot qui ressemble à un domaine (« socket.io ») : X en fait un lien, compté 23. */
const LINKISH = /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?/gi;

/** La longueur d'un texte comme X la compte, jamais en dessous. */
export function xLength(text: string): number {
  const s = text.normalize("NFC");
  let n = 0;
  for (const ch of s) n += single(ch.codePointAt(0) ?? 0) ? 1 : 2;
  for (const m of s.match(LINKISH) ?? []) n += Math.max(0, X_LINK - m.length);
  return n;
}

/** Ce qu'on garde quand la place manque : du texte entier (0) au strict minimum. */
type Cut = 0 | 1 | 2 | 3 | 4 | 5;
const CUTS: Cut[] = [0, 1, 2, 3, 4, 5];

function build(w: ShareWords, x: ShareInput, cut: Cut): string {
  if (x.sealed) {
    // La note plancher d'un dossier vide jugerait sans preuve : le texte ne la dit pas.
    return [`${w.sealed}.`, cut < 5 && x.profile ? `${w.profile(x.profile)}.` : null, w.cta].filter(Boolean).join(" ");
  }
  // Première ligne : la fiche, ses étoiles, son niveau et sa note sur 100 (§18.37 : la grille dès qu'elle note).
  const stars = starsLine(x.stars);
  const head = x.graded ? w.file(stars, x.level, x.overall) : w.sheet(stars, x.level, x.overall);
  // Puis le profil et le rang (« Profil « Machine à livrer », 4e ce mois-ci. »).
  const rank = cut < 4 ? x.rank : null;
  const who = cut < 5 && x.profile ? `${w.profile(x.profile)}${rank ? `, ${rank}` : ""}.` : rank ? `${rank}.` : null;
  // La trouvaille part d'abord : remplacée par le chef d'accusation, plus court, puis retirée.
  const detail = cut === 0 ? (x.finding ?? (x.status ? w.charge(x.status) : null)) : cut === 1 && x.finding && x.status ? w.charge(x.status) : null;
  // Les sources du dossier partent en premier quand la place manque.
  const exhibits = cut === 0 && x.exhibits ? w.exhibits(x.exhibits) : null;
  const parts: (string | null)[] = [who, cut < 3 && x.graded ? (x.strong ?? null) : null, exhibits, detail, cut < 3 && !x.graded ? w.ai(x.secs) : null, w.cta];
  return [head, parts.filter(Boolean).join(" ")].filter(Boolean).join("\n");
}

/** Le texte sans le lien, pour qui le reçoit à part (feuille de partage du système). Il finit sur « Fais la tienne : ». */
export function shareLead(w: ShareWords, x: ShareInput): string {
  return build(w, x, 0);
}

/** Le texte entier, lien compris : celui qu'on colle dans un post LinkedIn. */
export function shareText(w: ShareWords, x: ShareInput, url: string): string {
  return `${shareLead(w, x)} ${url}`;
}

/** Pour X : le texte sans le lien, raccourci tant que texte, espace et lien (23) dépassent 280. */
export function shareTextX(w: ShareWords, x: ShareInput): string {
  const room = X_MAX - X_LINK - 1;
  for (const cut of CUTS) {
    const text = build(w, x, cut);
    if (xLength(text) <= room) return text;
  }
  // Un profil ou un titre démesuré : on coupe, le lien passe toujours.
  const chars = [...build(w, x, 5)];
  while (chars.length && xLength(`${chars.join("")}…`) > room) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
