// Les textes des bandes (§18.38), rangés sous `t.bands` dans i18n.ts. Épicène,
// sans accord en « é·e » ; ton polar, sec. Ni tiret long ni point médian.
import type { BandStanding, BandType } from "../../shared/bands";

type Rank = Pick<BandStanding, "type" | "rank" | "missing" | "gap" | "ahead">;

/** Français : le pluriel commence à deux (« 0 étoile », « 1 fiche », « 2 fiches »). */
const n = (k: number, one: string, many: string) => `${k}\u00a0${k > 1 ? many : one}`;
/** Anglais : tout sauf un est pluriel (“0 sheets”, “1 sheet”). */
const nEn = (k: number, one: string, many: string) => `${k}\u00a0${k === 1 ? one : many}`;

/** « 3e des écoles, à 6 étoiles de la 2e. » ; « N° 1 des boîtes. » ; « Bande en formation : encore 2 fiches. » Une phrase : elle commence par une majuscule. */
function rankFr(b: Rank): string {
  if (!b.rank) return `Bande en formation : encore ${n(b.missing, "fiche", "fiches")}.`;
  const ord = `${b.rank === 1 ? "N° 1" : `${b.rank}e`} des ${b.type === "ecole" ? "écoles" : "boîtes"}`;
  if (!b.ahead || b.gap === null) return `${ord}.`;
  const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
  return b.gap > 0 ? `${ord}, à ${n(b.gap, "étoile", "étoiles")} de ${ahead}.` : `${ord}, à égalité avec ${ahead}.`;
}

function rankEn(b: Rank): string {
  if (!b.rank) return `Crew forming: ${nEn(b.missing, "more sheet", "more sheets")} needed.`;
  const ord = `#${b.rank} among ${b.type === "ecole" ? "schools" : "companies"}`;
  if (!b.ahead || b.gap === null) return `${ord}.`;
  const ahead = b.ahead.rank === 1 ? "the leader" : `#${b.ahead.rank}`;
  return b.gap > 0 ? `${ord}, ${nEn(b.gap, "star", "stars")} behind ${ahead}.` : `${ord}, level with ${ahead}.`;
}

const fr = {
  rank: rankFr,
  dossiers: (k: number) => n(k, "fiche", "fiches"),
  score: (k: number) => n(k, "étoile", "étoiles"),
  /** L'unité des notes de bande, une fois en tête du classement. */
  scale: "Étoiles",
  /** Sous une bande ouverte au classement : les fiches qu'elle ne nomme pas. */
  others: (k: number) => n(k, "autre fiche", "autres fiches"),
  league: { ecole: "Écoles", boite: "Boîtes" } as Record<BandType, string>,
  pick: {
    title: "Tu roules pour qui ?",
    intro: "Tes étoiles comptent pour l'école et la boîte que tu choisis.",
    /** Déjà dedans (l'entrée d'office, §18.82) : c'est fait, et ça se change. */
    introIn: "Tes étoiles comptent déjà. Tu peux changer.",
    school: "Ton école",
    company: "Ta boîte",
    schoolLabel: "Cherche ton école",
    schoolNone: "Pas dans le fichier. Essaie son nom complet, ou son sigle.",
    companyLabel: "Nom de ta boîte",
    join: "J'en suis",
    /** « Tu rapportes ★★★★ à CentraleSupélec. » : les étoiles et le nom vont entre ces mots. */
    line: ["Tu rapportes", "à"] as [string, string],
    change: "Changer",
    changeLabel: (label: string) => `Changer de bande, à la place de ${label}`,
    cancel: "Annuler",
    leave: "Sortir",
    leaveLabel: (label: string) => `Sortir de la bande ${label}`,
    share: "Partager la bande",
    shareLabel: (label: string) => `Partager la bande ${label}`,
    shareText: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Viens grossir les rangs :`,
    /** Une boîte au nom libre, pas encore au classement public : le texte dit quoi taper. */
    shareTextNoPage: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Fais ta fiche et tape « ${label} » juste sous elle :`,
    noPage: "Elle entre au classement à la troisième fiche.",
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    failed: "Ça n'a pas pris. Réessaie.",
  },
  home: {
    /** Sous le nom d'une bande en formation, au classement de l'accueil (§18.92) : la règle des trois fiches, sans phrase. */
    forming: (k: number) => `${n(k, "fiche", "fiches")}, en formation`,
    /** Une ligne du classement pour un lecteur d'écran : sa place, son nom, ses étoiles, ses fiches. */
    rowLabel: (place: number, label: string, score: number, dossiers: number, forming: boolean) =>
      `Place ${place} : ${label}, ${n(score, "étoile", "étoiles")}, ${n(dossiers, "fiche", "fiches")}${forming ? ", en formation" : ""}`,
  },
};

export type BandsDict = typeof fr;

const en: BandsDict = {
  rank: rankEn,
  dossiers: (k: number) => nEn(k, "sheet", "sheets"),
  score: (k: number) => nEn(k, "star", "stars"),
  scale: "Stars",
  others: (k: number) => nEn(k, "more sheet", "more sheets"),
  league: { ecole: "Schools", boite: "Companies" },
  pick: {
    title: "Who do you ride for?",
    intro: "Your stars count for the school and the company you pick.",
    introIn: "Your stars already count. You can switch.",
    school: "Your school",
    company: "Your company",
    schoolLabel: "Find your school",
    schoolNone: "Not on file. Try its full name, or its acronym.",
    companyLabel: "Your company's name",
    join: "I'm in",
    line: ["You add", "to"],
    change: "Switch",
    changeLabel: (label: string) => `Switch crew, instead of ${label}`,
    cancel: "Cancel",
    leave: "Leave",
    leaveLabel: (label: string) => `Leave the ${label} crew`,
    share: "Share the crew",
    shareLabel: (label: string) => `Share the ${label} crew`,
    shareText: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Come add your stars:`,
    shareTextNoPage: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Get your rap sheet and type “${label}” right under it:`,
    noPage: "It joins the ranking at the third sheet.",
    linkedinHint: "Text copied: paste it into your LinkedIn post.",
    failed: "That didn't take. Try again.",
  },
  home: {
    forming: (k: number) => `${nEn(k, "sheet", "sheets")}, forming`,
    rowLabel: (place: number, label: string, score: number, dossiers: number, forming: boolean) =>
      `Spot ${place}: ${label}, ${nEn(score, "star", "stars")}, ${nEn(dossiers, "sheet", "sheets")}${forming ? ", forming" : ""}`,
  },
};

export const BANDS_TEXT = { fr, en };
