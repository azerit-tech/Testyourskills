// Le texte de partage (§18.27), en fonction pure : six étoiles pleines puis
// vides, le pari s'il existe, le profil, la trouvaille, le rang, le lien.
// Les mots viennent d'i18n (`result.share.words`) ; rien ici ne lit le navigateur.
import type { Dict } from "../i18n";

export type ShareWords = Dict["result"]["share"]["words"];

interface Common {
  /** Étoiles du verdict, de 1 à 6. */
  stars: number;
  /** Profil criminel, déjà dans la langue. */
  profile: string | null;
  /** « 7e cette semaine », seulement pendant la semaine en cours. */
  rank: string | null;
  /** Étoiles plaidées pendant l'attente (lib/plea.ts), ou null. */
  plea: number | null;
}

export interface CardShare extends Common {
  kind: "card";
  overall: number;
  /** La trouvaille la plus forte (§18.26) : elle prend la place du chef d'accusation. */
  finding: string | null;
  /** Le chef d'accusation, à défaut de trouvaille. */
  status: string | null;
  secs: number;
}

export interface ComparisonShare extends Common {
  kind: "comparison";
  /** « CV » ou « LinkedIn » (§18.24). */
  src: string;
  declared: number;
  github: number;
  /** Le titre de l'écart. */
  headline: string;
}

export type ShareInput = CardShare | ComparisonShare;

/** Six étoiles, pleines puis vides : ★★★★☆☆. */
export function starsLine(n: number): string {
  const on = Math.max(0, Math.min(6, Math.round(Number.isFinite(n) ? n : 0)));
  return "★".repeat(on) + "☆".repeat(6 - on);
}

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
  const plea = x.plea ? w.plea(starsLine(x.plea), starsLine(x.stars)) : null;
  // Avec le pari, le verdict porte déjà les étoiles : on ne les répète pas.
  const stars = plea ? null : starsLine(x.stars);
  const parts: (string | null)[] = [];
  if (x.kind === "card") {
    // La trouvaille part d'abord : remplacée par le chef d'accusation, plus court, puis retirée.
    const detail = cut === 0 ? (x.finding ?? (x.status ? w.charge(x.status) : null)) : cut === 1 && x.finding && x.status ? w.charge(x.status) : null;
    const tail = `${cut < 5 && x.profile ? ` · ${x.profile}` : ""}${cut < 4 && x.rank ? ` · ${x.rank}` : ""}.`;
    parts.push((stars ? w.sheet(stars, x.overall) : w.score(x.overall)) + tail, detail, cut < 3 ? w.ai(x.secs) : null);
  } else {
    // Pas de trouvaille dans une comparaison (§18.26) : le rang part d'abord, puis le profil, puis le titre de l'écart.
    const tail = `${cut < 2 && x.profile ? ` · ${x.profile}` : ""}${cut < 1 && x.rank ? ` · ${x.rank}` : ""}.`;
    parts.push(w.compare(x.src, x.declared, x.github, stars) + tail, cut < 3 ? `${x.headline}.` : null);
  }
  parts.push(w.cta);
  const body = parts.filter(Boolean).join(" ");
  return plea ? `${plea}\n${body}` : body;
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
