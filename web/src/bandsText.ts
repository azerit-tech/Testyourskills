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
  /** « 3e des écoles, à 6 étoiles de la 2e. » ; « N° 1 des boîtes. » ; « Bande en formation : encore 2 fiches. » Une phrase : elle commence par une majuscule. */
  rank(b: Rank): string {
    if (!b.rank) return `Bande en formation : encore ${n(b.missing, "fiche", "fiches")}.`;
    const ord = `${b.rank === 1 ? "N° 1" : `${b.rank}e`} des ${b.type === "ecole" ? "écoles" : "boîtes"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "la tête" : `la ${b.ahead.rank}e`;
    return b.gap > 0 ? `${ord}, à ${n(b.gap, "étoile", "étoiles")} de ${ahead}.` : `${ord}, à égalité avec ${ahead}.`;
  },
  dossiers: (k: number) => n(k, "fiche", "fiches"),
  score: (k: number) => n(k, "étoile", "étoiles"),
  /** Le mot seul, sous le grand nombre de la page d'une bande. */
  scoreWord: (k: number): string => (k > 1 ? "étoiles" : "étoile"),
  league: { ecole: "Écoles", boite: "Boîtes" } as Record<BandType, string>,
  kicker: { ecole: "Bande d'école", boite: "Bande de boîte" } as Record<BandType, string>,
  forming: "En formation",
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
    share: "Partager",
    shareLabel: (label: string) => `Partager la bande ${label}`,
    shareText: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Viens grossir les rangs :`,
    /** Une boîte au nom libre sans page publique : le lien mène à l'accueil. */
    shareTextNoPage: (stars: string, label: string, rank: string) => `Je rapporte ${stars} à ${label}. ${rank} Fais ta fiche et tape « ${label} » juste sous elle :`,
    noPage: "Sa page publique s'ouvre à la troisième fiche.",
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    failed: "Ça n'a pas pris. Réessaie.",
  },
  board: {
    title: "Les bandes",
    intro: "Chaque fiche peut rapporter ses étoiles à une école et à une boîte, au choix de la personne. Les vingt meilleures fiches d'une bande comptent ; trois suffisent pour entrer au tableau.",
    tabs: "Tableau",
    yours: "Ta bande",
    /** L'unité des notes de bande, une fois en tête du tableau. */
    scale: "Étoiles",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? (rank === 1 ? "n° 1" : `${rank}e`) : "En formation"}, ${label}, ${n(score, "étoile", "étoiles")}, ${n(dossiers, "fiche", "fiches")}`,
    makeTitle: "Fais gagner ta bande",
    make: "Fais ta fiche : ses étoiles comptent pour ton école et ta boîte. Tu peux changer juste sous elle.",
  },
  page: {
    make: (label: string) => `Fais ta fiche pour ${label}`,
    makeNote: "Une fois ta fiche faite, un geste juste sous elle et tes étoiles comptent pour la bande.",
    roster: "Les fiches",
    rosterNone: "Personne pour l'instant. La place est libre.",
    unnamed: "Fiche sans profil",
    more: (k: number) => `Et ${n(k, "autre fiche", "autres fiches")}.`,
    /* On vouvoie qui recrute, comme sous la fiche. */
    recruiter: (label: string) => `Vous recrutez chez ${label} ?`,
    recruiterText: "Azerit vous présente des devs lus comme leurs fiches : l'expérience d'abord, le code comme preuve.",
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
  /* --- clés neuves de la revue du 15 novembre (SPEC §18.48), groupées --- */
  /** La page d'une bande, trois états : sans fiche, avec une fiche, membre. */
  states: {
    /** Sans fiche : la bande choisie ici suit jusqu'à la fiche posée. */
    follow: "Ta fiche posée, tu entres dans cette bande : tes étoiles comptent tout de suite.",
    joinTitle: "Tu as déjà ta fiche",
    joinText: "Un toucher, et ses étoiles comptent pour cette bande.",
    join: "Rejoindre avec ma fiche",
    /** Déjà dans une autre bande de la même ligue : une école, une boîte au plus. */
    moving: (label: string) => `Tu roules pour ${label} : rejoindre ici t'en fait sortir.`,
    /** La fiche n'est plus à portée de ce navigateur (jeton perdu, session finie). */
    lost: "Ta fiche ne répond pas depuis ce navigateur. Ouvre-la, puis choisis ta bande juste sous elle.",
    seeCard: "Voir ma fiche",
    /** /bandes, avec une fiche : le choix se fait sous elle. */
    pickUnder: "Tu as déjà ta fiche : ouvre-la, ton école et ta boîte se choisissent juste sous elle.",
    /** La fiche vient de se poser, sa bande l'attendait (message éphémère sous la fiche). */
    landed: (label: string) => `Tu roules pour ${label}.`,
    /** Les trois emplacements d'une bande en formation, pour un lecteur d'écran. */
    slots: (k: number) => `${k} sur 3`,
    /** Les fiches sans pseudo, en dernière ligne de la liste, derrière une pile de silhouettes. */
    anonymous: (k: number) => n(k, "fiche anonyme", "fiches anonymes"),
    /** Sous la liste, quand aucune fiche n'a de pseudo. */
    claimHint: "Une fiche revendiquée avec « C'est moi » s'affiche ici avec son pseudo.",
    /** La répartition des anonymes, pour un lecteur d'écran : « 2 fiches à 6 étoiles, 5 fiches à 5 étoiles ». */
    spread: (parts: [number, number][]) => parts.map(([s, k]) => `${n(k, "fiche", "fiches")} à ${n(s, "étoile", "étoiles")}`).join(", "),
  },
  /** /bandes sans bande : l'appel à monter la première ; une ligue vide à côté d'une pleine. */
  none: {
    title: "Monte la première bande",
    note: "Trois fiches d'une même école ou d'une même boîte, et elle entre au tableau.",
    league: { ecole: "Aucune école au tableau pour l'instant.", boite: "Aucune boîte au tableau pour l'instant." } as Record<BandType, string>,
  },
};

export type BandsDict = typeof fr;

const en: BandsDict = {
  rank(b: Rank): string {
    if (!b.rank) return `Crew forming: ${nEn(b.missing, "more sheet", "more sheets")} needed.`;
    const ord = `#${b.rank} among ${b.type === "ecole" ? "schools" : "companies"}`;
    if (!b.ahead || b.gap === null) return `${ord}.`;
    const ahead = b.ahead.rank === 1 ? "the leader" : `#${b.ahead.rank}`;
    return b.gap > 0 ? `${ord}, ${nEn(b.gap, "star", "stars")} behind ${ahead}.` : `${ord}, level with ${ahead}.`;
  },
  dossiers: (k: number) => nEn(k, "sheet", "sheets"),
  score: (k: number) => nEn(k, "star", "stars"),
  scoreWord: (k: number) => (k === 1 ? "star" : "stars"),
  league: { ecole: "Schools", boite: "Companies" },
  kicker: { ecole: "School crew", boite: "Company crew" },
  forming: "Forming",
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
    share: "Share",
    shareLabel: (label: string) => `Share the ${label} crew`,
    shareText: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Come add your stars:`,
    shareTextNoPage: (stars: string, label: string, rank: string) => `I'm adding ${stars} to ${label}. ${rank} Get your rap sheet and type “${label}” right under it:`,
    noPage: "Its public page opens at the third sheet.",
    linkedinHint: "Text copied: paste it into your LinkedIn post.",
    failed: "That didn't take. Try again.",
  },
  board: {
    title: "The crews",
    intro: "Every sheet can bring its stars to one school and one company, its owner's choice. A crew's top 20 sheets count; three are enough to make the board.",
    tabs: "Board",
    yours: "Your crew",
    scale: "Stars",
    rowLabel: (rank: number | null, label: string, score: number, dossiers: number) =>
      `${rank ? `#${rank}` : "Forming"}, ${label}, ${nEn(score, "star", "stars")}, ${nEn(dossiers, "sheet", "sheets")}`,
    makeTitle: "Put your crew on top",
    make: "Get your rap sheet: its stars count for your school and your company. You can switch right under it.",
  },
  page: {
    make: (label: string) => `Get your rap sheet for ${label}`,
    makeNote: "Once your sheet is out, one tap right under it and your stars count for the crew.",
    roster: "The sheets",
    rosterNone: "Nobody yet. The spot is open.",
    unnamed: "Sheet without a profile",
    more: (k: number) => `And ${nEn(k, "other sheet", "other sheets")}.`,
    recruiter: (label: string) => `Hiring at ${label}?`,
    recruiterText: "Azerit brings you devs read like their sheets: experience first, code as proof.",
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
  states: {
    follow: "Once your sheet lands, you are in this crew: your stars count right away.",
    joinTitle: "You already have your sheet",
    joinText: "One tap, and its stars count for this crew.",
    join: "Join with my sheet",
    moving: (label: string) => `You ride for ${label}: joining here takes you out of it.`,
    lost: "Your sheet isn't answering from this browser. Open it, then pick your crew right under it.",
    seeCard: "See my sheet",
    pickUnder: "You already have your sheet: open it, your school and your company are picked right under it.",
    landed: (label: string) => `You ride for ${label}.`,
    slots: (k: number) => `${k} of 3`,
    anonymous: (k: number) => nEn(k, "anonymous sheet", "anonymous sheets"),
    claimHint: "A sheet claimed with “That's me” shows here with its username.",
    spread: (parts: [number, number][]) => parts.map(([s, k]) => `${nEn(k, "sheet", "sheets")} at ${nEn(s, "star", "stars")}`).join(", "),
  },
  none: {
    title: "Start the first crew",
    note: "Three sheets from the same school or company, and it makes the board.",
    league: { ecole: "No school on the board yet.", boite: "No company on the board yet." },
  },
};

export const BANDS_TEXT = { fr, en };
