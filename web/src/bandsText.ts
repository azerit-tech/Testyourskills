// Les textes des bandes (§18.38), rangés sous `t.bands` dans i18n.ts. Épicène,
// sans accord en « é·e » ; ton polar, sec. Ni tiret long ni point médian.
import type { BandStanding, BandType } from "../../shared/bands";

type Rank = Pick<BandStanding, "type" | "rank" | "missing" | "gap" | "ahead">;

/** Français : le pluriel commence à deux (« 0 étoile », « 1 fiche », « 2 fiches »). */
const n = (k: number, one: string, many: string) => `${k}\u00a0${k > 1 ? many : one}`;
/** Anglais : tout sauf un est pluriel (“0 sheets”, “1 sheet”). */
const nEn = (k: number, one: string, many: string) => `${k}\u00a0${k === 1 ? one : many}`;
const lowerFirst = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

const fr = {
  /** « 3e des écoles, à 6 étoiles de la 2e. » ; « N° 1 des boîtes. » ; « Bande en formation : il manque 2 complices. » Une phrase : elle commence par une majuscule. */
  rank(b: Rank): string {
    if (!b.rank) return `Bande en formation : il manque ${n(b.missing, "complice", "complices")}.`;
    const ord = `${b.rank === 1 ? "N° 1" : `${b.rank}e`} des ${b.type === "ecole" ? "écoles" : "boîtes"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
    return b.gap > 0 ? `${ord}, à ${n(b.gap, "étoile", "étoiles")} de ${ahead}.` : `${ord}, à égalité avec ${ahead}.`;
  },
  dossiers: (k: number) => n(k, "fiche", "fiches"),
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
    shareText: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Viens grossir les rangs :`,
    /** Une boîte au nom libre sans page publique : le lien mène à l'accueil. */
    shareTextNoPage: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Fais ta fiche et tape « ${label} » dessous :`,
    noPage: "Sa page publique s'ouvre à la troisième fiche.",
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    failed: "Ça n'a pas pris. Réessaie.",
  },
  board: {
    title: "Les bandes",
    intro: "Chaque fiche rapporte ses étoiles à son école et à sa boîte. Les vingt meilleures comptent, trois suffisent pour entrer au tableau.",
    tabs: "Tableau",
    empty: "Aucune bande au tableau. Trois fiches suffisent pour en monter une.",
    yours: "Ta bande",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? (rank === 1 ? "n° 1" : `${rank}e`) : "En formation"}, ${label}, ${n(score, "étoile", "étoiles")}, ${n(dossiers, "fiche", "fiches")}`,
    makeTitle: "Fais gagner ta bande",
    make: "Fais ta fiche, puis choisis ton école et ta boîte dessous : tes étoiles comptent pour elles.",
  },
  page: {
    make: (label: string) => `Fais ta fiche pour ${label}`,
    makeNote: "Une fois ta fiche faite, un geste dessous et tes étoiles comptent pour la bande.",
    roster: "Les fiches",
    rosterNone: "Personne pour l'instant. La place est libre.",
    unnamed: "Fiche sans profil",
    more: (k: number) => `Et ${n(k, "autre fiche", "autres fiches")}.`,
    /* On vouvoie qui recrute, comme sous la fiche. */
    recruiter: (label: string) => `Vous recrutez chez ${label} ? Azerit lit le parcours, puis le code.`,
    recruiterLink: "azerit.tech",
    share: "Partager la bande",
    shareText: (label: string, rank: string) => `${label} : ${lowerFirst(rank)} Viens grossir les rangs :`,
    ahead: "Devant\u00a0:",
    all: "Toutes les bandes",
    notFound: "Cette bande n'existe pas. Pas encore.",
  },
  home: {
    title: "Top des bandes",
    /** La phrase des bandes, pour leur section de l'accueil. */
    hook: "Fais ta fiche. Fais gagner ta bande.",
    empty: "Trois fiches font une bande. Aucune n'est encore au tableau.",
    all: "Toutes les bandes",
  },
};

export type BandsDict = typeof fr;

const en: BandsDict = {
  rank(b: Rank): string {
    if (!b.rank) return `Crew forming: ${nEn(b.missing, "more accomplice", "more accomplices")} needed.`;
    const ord = `#${b.rank} among ${b.type === "ecole" ? "schools" : "companies"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "the leader" : `#${b.ahead.rank}`;
    return b.gap > 0 ? `${ord}, ${nEn(b.gap, "star", "stars")} behind ${ahead}.` : `${ord}, level with ${ahead}.`;
  },
  dossiers: (k: number) => nEn(k, "sheet", "sheets"),
  score: (k: number) => nEn(k, "star", "stars"),
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
    line: ["You add", "to"],
    leave: "Leave",
    leaveLabel: (label: string) => `Leave the ${label} crew`,
    share: "Share",
    shareLabel: (label: string) => `Share the ${label} crew`,
    shareText: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Come add your stars:`,
    shareTextNoPage: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Get your rap sheet and type “${label}” below it:`,
    noPage: "Its public page opens at the third sheet.",
    linkedinHint: "Text copied: paste it into your LinkedIn post.",
    failed: "That didn't take. Try again.",
  },
  board: {
    title: "The crews",
    intro: "Every sheet brings its stars to its school and its company. The best twenty count, three are enough to make the board.",
    tabs: "Board",
    empty: "No crew on the board yet. Three sheets are enough to start one.",
    yours: "Your crew",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? `#${rank}` : "Forming"}, ${label}, ${nEn(score, "star", "stars")}, ${nEn(dossiers, "sheet", "sheets")}`,
    makeTitle: "Put your crew on top",
    make: "Get your rap sheet, then pick your school and your company below it: your stars count for them.",
  },
  page: {
    make: (label: string) => `Get your rap sheet for ${label}`,
    makeNote: "Once your sheet is out, one tap below it and your stars count for the crew.",
    roster: "The sheets",
    rosterNone: "Nobody yet. The spot is open.",
    unnamed: "Sheet without a profile",
    more: (k: number) => `And ${nEn(k, "other sheet", "other sheets")}.`,
    recruiter: (label: string) => `Hiring at ${label}? Azerit reads the track record, then the code.`,
    recruiterLink: "azerit.tech",
    share: "Share the crew",
    shareText: (label: string, rank: string) => `${label}: ${rank} Come add your stars:`,
    ahead: "Ahead:",
    all: "All crews",
    notFound: "This crew doesn't exist. Not yet.",
  },
  home: {
    title: "Top crews",
    hook: "Get your rap sheet. Put your crew on top.",
    empty: "Three sheets make a crew. None has made the board yet.",
    all: "All crews",
  },
};

export const BANDS_TEXT = { fr, en };
