// Les textes des bandes (§18.38), rangés sous `t.bands` dans i18n.ts. Épicène,
// sans accord en « é·e » ; ton polar, sec. Ni tiret long ni point médian.
import type { BandStanding, BandType } from "../../shared/bands";

type Rank = Pick<BandStanding, "type" | "rank" | "missing" | "gap" | "ahead">;

const n = (k: number, one: string, many: string) => `${k} ${k > 1 ? many : one}`;

const fr = {
  /** « 3e des écoles, à 6 étoiles de la 2e. » ; « Bande en formation : il manque 2 complices. » */
  rank(b: Rank): string {
    if (!b.rank) return `Bande en formation : il manque ${n(b.missing, "complice", "complices")}.`;
    const ord = `${b.rank === 1 ? "n° 1" : `${b.rank}e`} des ${b.type === "ecole" ? "écoles" : "boîtes"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
    return b.gap > 0 ? `${ord}, à ${n(b.gap, "étoile", "étoiles")} de ${ahead}.` : `${ord}, à égalité avec ${ahead}.`;
  },
  dossiers: (k: number) => n(k, "dossier", "dossiers"),
  score: (k: number) => n(k, "étoile", "étoiles"),
  league: { ecole: "Écoles", boite: "Boîtes" } as Record<BandType, string>,
  kicker: { ecole: "Bande d'école", boite: "Bande de boîte" } as Record<BandType, string>,
  forming: "En formation",
  pick: {
    title: "Tu roules pour qui ?",
    intro: "Tes étoiles comptent pour l'école et la boîte que tu choisis. Personne ne t'y inscrit à ta place.",
    school: "Ton école",
    company: "Ta boîte",
    schoolLabel: "Cherche ton école",
    schoolPlaceholder: "Epitech, INSA Lyon, 42…",
    schoolNone: "Pas dans le fichier. Essaie son nom complet, ou son sigle.",
    companyLabel: "Nom de ta boîte",
    companyPlaceholder: "Doctolib, Qonto…",
    join: "J'en suis",
    /** « Tu rapportes ★★★★ à CentraleSupélec. » : les étoiles et le nom vont entre ces mots. */
    line: ["Tu rapportes", "à"] as [string, string],
    leave: "Sortir",
    leaveLabel: (label: string) => `Sortir de la bande ${label}`,
    share: "Partager",
    shareLabel: (label: string) => `Partager la bande ${label}`,
    shareText: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Viens gonfler la bande :`,
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    failed: "Ça n'a pas pris. Réessaie.",
  },
  board: {
    title: "Les bandes",
    intro: "Chaque dossier rapporte ses étoiles à son école et à sa boîte. Les vingt meilleurs comptent, trois suffisent pour entrer au tableau.",
    tabs: "Ligue",
    empty: "Aucune bande au tableau. Trois dossiers suffisent pour en monter une.",
    yours: "Ta bande",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? `${rank}e` : "En formation"}, ${label}, ${score} étoiles, ${dossiers} ${dossiers > 1 ? "dossiers" : "dossier"}`,
    make: "Fais ta fiche, puis choisis ta bande dessous.",
  },
  page: {
    make: (label: string) => `Fais ta fiche pour ${label}`,
    makeNote: "Ta fiche faite, un toucher dessous et tes étoiles comptent pour la bande.",
    roster: "Les dossiers",
    rosterNone: "Personne pour l'instant. La place est libre.",
    unnamed: "Dossier sans profil",
    more: (k: number) => `Et ${n(k, "autre dossier", "autres dossiers")}.`,
    recruiter: (label: string) => `Tu recrutes chez ${label} ? Azerit lit le parcours, puis le code.`,
    recruiterLink: "azerit.tech",
    share: "Partager la bande",
    shareText: (label: string, rank: string) => `${label} : ${rank} Viens gonfler la bande :`,
    ahead: "Devant\u00a0:",
    all: "Toutes les bandes",
    notFound: "Cette bande n'existe pas. Pas encore.",
  },
  home: {
    title: "Top des bandes",
    empty: "Trois dossiers font une bande. Aucune n'est encore au tableau.",
    all: "Toutes les bandes",
  },
};

export type BandsDict = typeof fr;

const en: BandsDict = {
  rank(b: Rank): string {
    if (!b.rank) return `Crew forming: ${n(b.missing, "more accomplice", "more accomplices")} needed.`;
    const ord = `#${b.rank} among ${b.type === "ecole" ? "schools" : "companies"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "the leader" : `#${b.ahead.rank}`;
    return b.gap > 0 ? `${ord}, ${n(b.gap, "star", "stars")} behind ${ahead}.` : `${ord}, level with ${ahead}.`;
  },
  dossiers: (k: number) => n(k, "file", "files"),
  score: (k: number) => n(k, "star", "stars"),
  league: { ecole: "Schools", boite: "Companies" },
  kicker: { ecole: "School crew", boite: "Company crew" },
  forming: "Forming",
  pick: {
    title: "Who do you ride for?",
    intro: "Your stars count for the school and the company you pick. Nobody signs you up but you.",
    school: "Your school",
    company: "Your company",
    schoolLabel: "Find your school",
    schoolPlaceholder: "Epitech, INSA Lyon, 42…",
    schoolNone: "Not on file. Try its full name, or its acronym.",
    companyLabel: "Your company's name",
    companyPlaceholder: "Doctolib, Qonto…",
    join: "I'm in",
    line: ["You bring", "to"],
    leave: "Leave",
    leaveLabel: (label: string) => `Leave the ${label} crew`,
    share: "Share",
    shareLabel: (label: string) => `Share the ${label} crew`,
    shareText: (stars: string, label: string, rank: string) => `I bring ${stars} to ${label}. ${rank} Come pump up the crew:`,
    linkedinHint: "Text copied: paste it in your LinkedIn post.",
    failed: "That didn't take. Try again.",
  },
  board: {
    title: "The crews",
    intro: "Every file brings its stars to its school and its company. The best twenty count, three are enough to make the board.",
    tabs: "League",
    empty: "No crew on the board yet. Three files are enough to start one.",
    yours: "Your crew",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? `#${rank}` : "Forming"}, ${label}, ${score} stars, ${dossiers} ${dossiers > 1 ? "files" : "file"}`,
    make: "Make your file, then pick your crew below it.",
  },
  page: {
    make: (label: string) => `Make your file for ${label}`,
    makeNote: "Once your file is out, one tap below it and your stars count for the crew.",
    roster: "The files",
    rosterNone: "Nobody yet. The spot is open.",
    unnamed: "File without a profile",
    more: (k: number) => `And ${n(k, "other file", "other files")}.`,
    recruiter: (label: string) => `Hiring at ${label}? Azerit reads the track record, then the code.`,
    recruiterLink: "azerit.tech",
    share: "Share the crew",
    shareText: (label: string, rank: string) => `${label}: ${rank} Come pump up the crew:`,
    ahead: "Ahead:",
    all: "All crews",
    notFound: "This crew doesn't exist. Not yet.",
  },
  home: {
    title: "Top crews",
    empty: "Three files make a crew. None has made the board yet.",
    all: "All crews",
  },
};

export const BANDS_TEXT = { fr, en };
