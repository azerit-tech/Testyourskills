// Toutes les chaînes du front, en français et en anglais.
// Les faits ({fr,en}) qui viennent de l'API ne passent pas par ici.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CriterionCode, Lang, Position, StatCode } from "../../shared/types";
import { showsTotal } from "../../shared/week";
import { starsLine } from "../../shared/stars";
import { starsFor } from "../../shared/types";
import { frTypoDeep } from "../../shared/typo";
import { HOME_PROMISE, heroSentence, homeTitle } from "../../shared/promise";
import { BANDS_TEXT } from "./bandsText";
import { PRIMES_TEXT } from "./primesText";
import { PAGES_TEXT } from "./pagesText";

/** L'adresse de contact de la page Confidentialité, aussi le repli d'une demande de retrait. */
export const CONTACT_EMAIL = "hello@azerit.tech";

/* Le français passe par frTypoDeep (shared/typo.ts) : les espaces devant « : ; ! ? », dans les guillemets et entre un nombre et son unité sortent insécables. */
const fr = frTypoDeep({
  meta: {
    /** Le titre de l'accueil vient de shared/promise.ts, sa seule source. */
    title: homeTitle("fr"),
    /** « Léa Martin-Dubois ★★★★★☆ · Azerit » : la note se lit à ses étoiles, le seul nom visible est Azerit (§18.48). */
    titleCard: (name: string, overall: number) => `${name} ${starsLine(starsFor(overall))} · Azerit`,
    /** Fiche scellée (shared/publicView.ts) : le titre de l'onglet ne dit pas la note. */
    titleSealed: (name: string) => `${name} · Azerit`,
    /** Les pages sans fiche : « Vie privée · Azerit ». */
    titlePage: (subject: string) => `${subject} · Azerit`,
  },
  common: {
    by: "par",
    langLabel: "Langue",
    skip: "Passer",
    back: "Retour",
    close: "Fermer",
    loading: "Chargement…",
    demo: "Mode démo : données fictives",
    skipToContent: "Aller au contenu",
  },
  home: {
    /** Le bandeau de saison, dates lues dans data/season.json (web/src/lib/season.ts). */
    season: {
      soon: (n: number, day: string) => `Saison ${n} : dès le ${day}`,
      /** Pendant la saison : ce qu'on gagne (les entretiens des primes ouvertes), puis, au bureau, jusqu'à quand. */
      win: (n: number, k: number) => `Saison ${n} : ${k > 1 ? `${k} entretiens` : k === 1 ? "1 entretien" : "des entretiens"} à gagner`,
      until: (day: string) => `jusqu'au ${day}`,
      over: (n: number) => `Saison ${n} terminée`,
    },
    /** Le titre, deux phrases de deux lignes chacune (shared/promise.ts, sa seule source).
     * Insécables : une seule coupure possible par phrase, jamais un mot seul. */
    titleClaim: heroSentence(HOME_PROMISE.fr.claim),
    titleProof: heroSentence(HOME_PROMISE.fr.proof),
    /** La ligne sous le titre, choisie par web/src/lib/season.ts : l'entretien seulement si une prime est ouverte. */
    hookPrimes: "Le haut du classement décroche un entretien.",
    hookPlay: "De une à six étoiles, en une minute. Sans compte.",
    tabGithub: "Ton GitHub",
    /** Le retour depuis le CV, quand les deux portes existent. */
    tabDoors: "LinkedIn ou GitHub",
    /** Rien à coller (§18.80) : on tape son nom, des personnes sortent sous le champ. */
    loginLabel: "Ton nom ou ton pseudo GitHub",
    loginPlaceholder: "Ton nom ou pseudo",
    /** Les deux portes, quand le serveur lit LinkedIn (§18.24) : LinkedIn d'abord. */
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Ton nom",
    linkedinPlaceholder: "Ton nom",
    /** Sans recherche de profils, le champ dit ce qu'il prend. */
    linkedinLinkPlaceholder: "linkedin.com/in/ton-profil",
    /** L'entrée par défaut (§18.80) : deux boutons, rien à taper. */
    withLinkedin: "Se connecter avec LinkedIn",
    withGithub: "Se connecter avec GitHub",
    /** La petite ligne sous les deux boutons : le CV, ou le champ où coller un lien. */
    orCv: "ou avec ton CV",
    orLink: "ou colle un lien",
    linkLabel: "Lien LinkedIn, lien GitHub ou pseudo GitHub",
    linkPlaceholder: "Lien LinkedIn, GitHub ou pseudo",
    backToLogin: "Se connecter",
    errPick: "Choisis ton compte dans la liste, ou tape ton pseudo GitHub.",
    /** Sous le champ, tant qu'il n'y a pas d'erreur : ce que chaque porte sait lire. */
    linkedinHint: "Profil public seulement.",
    githubHint: "Repos publics seulement.",
    errLinkedin: "Choisis ton profil dans la liste, ou colle son lien LinkedIn.",
    errLinkedinOff: "LinkedIn ne répond pas pour l'instant. Passe par ton GitHub ou ton CV, ou réessaie dans un moment.",
    errLinkedinCv: "Avec un CV, donne ton pseudo GitHub.",
    submit: "Faire ma fiche",
    submitBoth: "Faire ma fiche avec les deux",
    submitting: "On ouvre ton dossier…",
    bothLink: "ou les deux, au même dossier",
    bothActive: "Deux sources au dossier\u00a0: ton CV et ton GitHub",
    bothBack: "une seule source",
    dropTitle: "Glisse ton CV ici",
    /** Au doigt, on ne glisse pas un fichier : on le choisit. */
    dropPick: "Choisis ton CV en PDF",
    dropOr: "ou",
    dropBrowse: "choisis un PDF",
    dropHint: "5 Mo, 10 pages max",
    sizeUnits: { mb: "Mo", kb: "Ko" },
    dropRemove: "Retirer le fichier",
    /* « Sans compte » est déjà dit par la ligne de la promesse, juste au-dessus. */
    reassure: "Ton CV est lu en mémoire, puis jeté.",
    dropAnywhere: "Lâche ton CV, on s'occupe du reste",
    inlineCv: "Plutôt avec ton CV",
    exampleLabel: "Exemple de fiche",
    exampleCaption: "La vraie fiche de Jacques, fondateur d'Azerit",
    /** Après la légende, en texte : d'où vient la preuve (« d'après LinkedIn et GitHub »). */
    exampleFrom: (labels: string) => `d'après ${labels}`,
    /** La flèche sous le héros, sur ordinateur. */
    next: "Voir la suite",
    /** Le dernier formulaire de l'accueil, avant le pied de page (§18.48). */
    lastTitle: "À toi.",
    /** Au-dessus du tableau des bandes : pourquoi une bande. */
    bandsLead: "Fais ta fiche. Fais gagner ta bande.",
    /** L'accueil se souvient (§18.48) : la fiche déjà faite, ou le dossier encore en cours. */
    back: {
      mine: "Ta fiche\u00a0:",
      mineGo: "La revoir",
      pending: "Ton dossier s'ouvre encore.",
      pendingGo: "Y retourner",
      /** Retour arrière en plein film : la note attend la poursuite. */
      owed: "Ta poursuite t'attend.",
      owedGo: "La voir",
      /** Qui a déjà sa fiche (§18.52) : le bouton principal y ramène, le formulaire se replie dessous. */
      see: "Voir ma fiche",
      another: "Faire une autre fiche",
    },
    /* Mur des 13 profils (§18.28) */
    wall: {
      title: "Quel profil es-tu ?",
      you: "Et toi ?",
      cta: "Faire ma fiche",
    },
    /* Top de la semaine (§18.22) */
    top: {
      title: "Top de la semaine",
      /* Le nombre de fiches à partir de 20 seulement (§18.27). */
      meta: (week: number, n: number, left: string) => [`Semaine ${week}`, showsTotal(n) && `${n} fiches`, `fin dans ${left}`].filter(Boolean).join(", "),
      /* Jamais une unité à zéro : « 1 j », « 5 h », « 1 j 4 h ». */
      left: (d: number, h: number, m: number) => (d > 0 ? (h > 0 ? `${d} j ${h} h` : `${d} j`) : h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`),
      cut: "Top 5",
      /* Semaine vide : un seul bloc d'invitation ; top 5 incomplet : une seule ligne pour les places libres (§18.48). */
      emptyTitle: "La place n°\u00a01 est libre",
      emptyText: "La première fiche de la semaine la prend.",
      freeRange: (from: number, to: number) => (from === to ? `Place ${from} libre` : `Places ${from} à ${to} libres`),
      take: (n: number): string => (n === 1 ? "Prends-la" : "Prends-en une"),
      free: "Place libre",
      freeLabel: (rank: number) => `Place ${rank} libre : fais ta fiche`,
      rowLabel: (rank: number, login: string, overall: number) => `Place ${rank} : @${login}, note ${overall}/100`,
      rowLabelAnon: (rank: number, overall: number) => `Place ${rank} : une fiche LinkedIn, note ${overall}/100`,
      anon: "Fiche LinkedIn",
    },
    errLogin: "Ce pseudo ne ressemble pas à un pseudo GitHub.",
    errEmptyLogin: "Donne-nous un pseudo GitHub (ou une URL de profil).",
    errEmptyCv: "Dépose un CV au format PDF.",
    errNotPdf: "Ce fichier n'est pas un PDF.",
    errTooLarge: (mb: string) => `Fichier de ${mb} Mo : la limite est 5 Mo. Un CV, pas une thèse.`,
    errTooManyPages: (n: number) => `${n}\u00a0pages\u00a0: la limite est 10. Un CV tient en une ou deux.`,
    errNetwork: "Le serveur ne répond pas. Réessaie dans un instant.",
    /** Limite atteinte (§18.48) : sous l'erreur, une autre porte que le bouton qui échouerait. */
    meanwhileTop: "En attendant : le top de la semaine",
    meanwhileBands: "En attendant : les bandes",
  },
  stats: {
    TEC: { name: "Technique", what: "La profondeur de ce qui est écrit ou décrit." },
    SHIP: { name: "Livraison", what: "La régularité réelle, semaine après semaine." },
    ARCH: { name: "Rigueur", what: "Tests, CI, outillage." },
    DOC: { name: "Communication", what: "README, messages de commit, clarté du CV." },
    XP: { name: "Expérience", what: "L'ancienneté réelle ou déclarée." },
    BUZZ: { name: "Buzzwords", what: "La densité de vent. Ne compte pas dans la note." },
  } satisfies Record<StatCode, { name: string; what: string }>,
  /* Niveaux de recherche (§18.18) : Bronze couvre ★ à ★★★, on garde le premier. */
  tierCard: (level: string) => `Fiche ${level}`,
  waiting: {
    /** Le titre de l'attente, sous la marque, au-dessus de la photo d'identité. */
    title: "Découvre à quel point ton profil est recherché.",
    /** L'enquête en direct (§18.26) : le numéro de la trouvaille versée au dossier. */
    piece: (n: number) => `Pièce ${String(n).padStart(2, "0")}`,
    /** La plaque de l'attente par la porte CV, tant que le nom n'est pas lu. */
    yourCv: "Ton CV",
    /** Fiche en file d'attente : n fiches passent avant (rang dans la file). */
    queue: (n: number) => (n === 1 ? "1 fiche devant toi au commissariat" : `${n} fiches devant toi au commissariat`),
    /** La fiche est prête, le film pas encore (§18.27). */
    scene: "La poursuite se prépare…",
    /** Réseau coupé pendant la préparation : la fiche continue côté serveur, on relit dès que possible. */
    offline: "Le commissariat ne répond pas.\nOn reprend dès que ton réseau revient.",
    /** Relire l'état de la fiche, sans refaire la demande. */
    retry: "Réessayer",
    /** Sous « Lancer la poursuite » : la fiche est prête, le film attend un toucher. */
    ready: "Ta fiche est prête.",
    progress: {
      lazy_commits: (n?: number) => `Lecture de tes ${n ?? "nombreux"} commits « wip »…`,
      buzzwords: (n?: number) => `Comptage des buzzwords… ${n ?? 0} pour l'instant`,
      tests: () => "Recherche des tests… toujours en cours",
      readme: () => "Vérification que le README dit autre chose que « TODO »…",
      /** Émis quand les deux sources se rejoignent (pipeline.ts, comparaison LinkedIn ou CV avec GitHub). */
      compare: () => "Les deux sources au même dossier\u00a0: parcours et code, critère par critère…",
      profile: () => "Profil trouvé. Il existe, c'est un début.",
      linkedin_wait: () => "Lecture du profil LinkedIn public…",
      linkedin: () => "LinkedIn retrouvé. On recompte tes années, poste par poste.",
      repos: (n?: number) => `${n ?? "Quelques"} repos publics repérés, forks exclus…`,
      calendar: () => "Lecture du calendrier de contributions sur 52 semaines…",
      commits: (n?: number) => `Lecture de ${n ?? 100} messages de commit…`,
      /** Vrai sur la méthode (§18.52) : l'IA donne le niveau du code, la grille calcule la note. */
      code: () => "L'IA lit trois de tes repos et en donne le niveau, de 1 à 5.",
      cv: () => "Lecture du PDF, en mémoire. Il sera oublié juste après.",
      pdf: () => "Extraction du texte du PDF…",
      scoring: () => "Huit critères, une note sur 10 chacun. La note sur 100, c'est la grille qui la calcule.",
      statuses: () => "Choix des statuts dans la liste fermée…",
      render: () => "Impression de la fiche…",
      start: () => "On réunit les premières pièces…",
    } as Record<string, (n?: number) => string>,
    /** Le remplissage, tiré selon les sources de la demande : on ne parle que de ce qu'on lit. */
    fillers: {
      all: ["La grille est écrite en dur dans un fichier JSON. Pas de favoritisme.", "Calibrage du tampon…", "Calcul de la part prouvée. Jamais 100 %, personne ne l'est."],
      /** Le parcours : LinkedIn ou CV. */
      path: [
        "Un stage compte pour moitié. Une asso étudiante, pour zéro.",
        "Sans école de tech, pas de note d'école. Ça ne coûte rien.",
        "Deux postes en même temps ne comptent qu'une fois.",
        "On recompte tes années, poste par poste. Les titres ne comptent pas, les dates si.",
      ],
      github: [
        "On ignore tes forks. Tout le monde a forké un tutoriel.",
        "Recherche d'un commit « final final v2 »…",
        "On ne lit pas tes repos privés. Promis.",
        "Vérification que node_modules n'est pas commité…",
        "Un GitHub vide n'est pas un mauvais code.",
      ],
    },
  },
  reveal: {
    /* titre du dossier à l'écran de la cabine, avant l'ouverture */
    packTitle: "DOSSIER",
    /* la pilule de l'attente, quand le son demande un geste pour démarrer (§18.27) */
    open: "Lancer la poursuite",
    skip: "Passer",
    mute: "Couper le son",
    unmute: "Activer le son",
    /* le film joue une fois (§18.48) : la tête de la fiche le relance, depuis le début */
    replay: "Revoir ma poursuite",
    watch: "Voir la poursuite",
    /** Sa propre poursuite, jamais vue ici (repliée faute de réseau, ou mouvement réduit). */
    watchMine: "Voir ma poursuite",
    revealed: (level: string, overall: number) => `Fiche ${level}, ${overall}/100.`,
    revealedSealed: "Fiche scellée\u00a0: le code reste à prouver.",
    fireworks: "Clique ou Espace : feux d'artifice",
    fireworksTouch: "Touche l'écran : feux d'artifice",
    statusLabel: "Statut",
    /* la montée de l'ascenseur : le statut change à chaque palier de note */
    statuses: [
      { min: 1, label: "Touriste" },
      { min: 15, label: "Hello World" },
      { min: 25, label: "Newb" },
      { min: 35, label: "Ctrl+C Ctrl+V" },
      { min: 45, label: "Padawan" },
      { min: 60, label: "Fait le taf" },
      { min: 67, label: "Confirmé" },
      { min: 75, label: "Crack" },
      { min: 80, label: "Monstre" },
      { min: 85, label: "Machine" },
      { min: 90, label: "Boss final" },
      { min: 95, label: "Cheat code" },
    ],
    /* les révélations avant la carte (SPEC §17.4) : spécialité / arme / dossier / affiliation */
    tells: {
      language: "Arme",
      noLanguage: "Polyglotte",
      league: "Dossier",
      leagueGithub: "GitHub",
      leagueCv: "CV",
      /** Un dossier à deux pièces (§18.36) : la pièce déclarative devant, sans « × ». */
      leagueBoth: "CV · GitHub",
      leagueLinkedin: "LinkedIn",
      leagueBothLinkedin: "LinkedIn · GitHub",
      position: "Spécialité",
      club: "Affiliation",
      freeAgent: "Sans bande",
      idle: "AZERIT · DOSSIER OUVERT",
      graph: "contributions · 52 semaines",
    },
  },
  /* le pari (§18.27) : avant le verdict, combien d'étoiles la personne plaide */
  plea: {
    ask: "Tu plaides combien d'étoiles ?",
    star: (n: number) => (n === 1 ? "Plaider 1 étoile" : `Plaider ${n} étoiles`),
    count: (n: number) => (n === 1 ? "1 étoile sur 6" : `${n} étoiles sur 6`),
    pleading: "Tu plaides",
    /** Sous le pari fait, pendant l'attente : quand tombe le verdict. */
    noted: "C'est noté. Verdict après la poursuite.",
    pleaded: "Tu plaidais",
    verdict: "Verdict",
    gap: { over: "Excès de confiance", exact: "Lucide", under: "Trop modeste" },
    /** Au-dessus de la fiche, après le film, sur téléphone : après le mot du verdict. */
    strip: (pleaded: number, actual: number) => `Tu plaidais ${pleaded === 1 ? "1 étoile" : `${pleaded} étoiles`}, verdict : ${actual}.`,
  },
  positions: {
    FS: "Full-stack",
    BE: "Backend",
    FE: "Frontend",
    MOB: "Mobile",
    DATA: "Data",
    ML: "Machine learning",
    OPS: "DevOps",
    SEC: "Sécurité",
    EMB: "Embarqué",
    PM: "Produit",
    DESIGN: "Design",
    CTO: "CTO",
  } satisfies Record<Position, string>,
  result: {
    /** Un seul libellé pour l'action du visiteur : la barre fixe et le bouton du formulaire disent la même chose. */
    makeYours: "Faire ma fiche",
    /** Dans « À ton tour » au bureau (§18.48) : ce qu'il regarde, en une phrase ; puis, sans fiche à soi, ce que coûte la sienne. */
    lead: (who: string) => `Azerit a dressé la fiche de dev de ${who} comme un recruteur la lirait : l'expérience d'abord, le code comme preuve.`,
    leadYours: "La tienne prend une minute, sans compte.",
    /** Au-dessus de la fiche, sur téléphone : la même chose en deux lignes au plus (`who` : « @pseudo » ou le prénom). */
    leadShort: (who: string) => `La fiche de dev de ${who}.`,
    /** Au-dessus d'une fiche dénoncée, sur téléphone : ce qui arrive, en une ligne. */
    leadDenounced: (who: string, by: string | null) => (by ? `@${by} a dénoncé ${who}.` : `Quelqu'un a dénoncé ${who}.`),
    /** Sans bloc des critères au-dessus (fiche dénoncée sans grille) : la même question, sans « ces huit critères ». */
    yourTurnBare: "Et toi, tu vaux combien d'étoiles\u00a0? Ton LinkedIn ou ton GitHub suffit.",
    /** Sous la fiche d'un dossier à deux sources (§18.36) : d'où vient la preuve, une seule note. */
    pieces: {
      line: (labels: string) => `Sources au dossier\u00a0: ${labels}`,
      /* « LinkedIn et GitHub » : une phrase, pas un point médian. */
      pair: (a: string, b: string) => `${a} et ${b}`,
      unproven: "Code à prouver",
      link: "Lien entre les deux sources\u00a0: à confirmer",
    },
    /* en tête d'une fiche partagée (§18.20) */
    wanted: "Avis de recherche",
    wantedStars: (n: number, level: string) => `${n} ${n > 1 ? "étoiles" : "étoile"} sur 6, ${level}`,
    /** Entre « Avis de recherche » et @login, pour les lecteurs d'écran seulement. */
    wantedSep: "\u00a0: ",
    share: {
      title: "Partage-la",
      linkedin: "Partager sur LinkedIn",
      /** Le formulaire « Licences et certifications » prérempli (§18.75) : une ligne, rien de plus. */
      addProfile: "Ajouter à mon profil LinkedIn",
      copy: "Copier le lien",
      download: "Télécharger l'image",
      /** Les trois liens sous les boutons, sur une ligne à 390 px : libellés courts (le long reste lu). */
      copyShort: "Copier le lien",
      downloadShort: "Image",
      /** La même image en 9:16, pour Instagram et TikTok : une action discrète sous les boutons. */
      story: "Image pour story",
      storyShort: "Story",
      native: "Partager",
      /** La confirmation, après l'appui (§18.76) : sous le bouton du bloc de partage, en message depuis la barre du pouce. */
      copiedShort: "Texte copié : colle-le dans ton post LinkedIn.",
      copiedLink: "Lien copié.",
      downloadDemo: "Image indisponible en mode démo (rendue par le serveur).",
      /** Sous l'image en plein écran, là où rien ne se télécharge (navigateurs intégrés). */
      holdToSave: "Appui long pour enregistrer",
      /** Le presse-papiers refusé (navigateurs intégrés) : le lien ou le texte s'affiche, sélectionné, dans le bloc de partage. */
      holdLink: "Appuie longuement pour copier ton lien.",
      holdText: "Appuie longuement pour copier ton texte, puis colle-le dans ton post LinkedIn.",
      /* hors du partage LinkedIn : le score d'un duel, le message d'une dénonciation */
      holdMessage: "Appuie longuement pour copier ton message.",
      imageAlt: "Ta fiche",
      /** Les morceaux du texte de partage, assemblés et raccourcis par lib/shareText.ts (§18.27). */
      words: {
        /** Deuxième ligne, après la fiche : le pari et son mot, en bas de casse (« Je plaidais ★★★☆☆☆ : trop modeste. »). */
        plea: (pleaded: string, gap: "over" | "exact" | "under") => `Je plaidais ${pleaded} : ${{ over: "excès de confiance", exact: "lucide", under: "trop modeste" }[gap]}.`,
        /** Fiche d'avant la grille : la première ligne, sans « selon la grille ». */
        sheet: (stars: string, level: string, overall: number) => `Ma fiche de dev : ${stars} ${level}, ${overall}/100.`,
        /** Fiche notée par la grille (§18.37) : ce qu'est la note, dès la première ligne. */
        file: (stars: string, level: string, overall: number) => `Ma fiche de dev selon la grille de recrutement d'Azerit : ${stars} ${level}, ${overall}/100.`,
        /** En tête de la ligne suivante : « Profil « Machine à livrer » », puis le rang. */
        profile: (label: string) => `Profil « ${label} »`,
        charge: (status: string) => `Chef d'accusation : « ${status} ».`,
        /** Fiche d'avant la grille : le temps de lecture. */
        ai: (secs: number) => `Fiche dressée par Azerit en ${secs} s.`,
        /** Dossier vide fait par un tiers : la note attend la personne fichée. */
        sealed: "Une fiche ouverte chez Azerit, le code reste à prouver",
        /** Un dossier à deux sources (§18.36) : `src` « LinkedIn » ou « CV ». */
        exhibits: (src: string) => `Deux sources au dossier\u00a0: ${src} et GitHub.`,
        cta: "Fais la tienne :",
      },
    },
    /* Rang de la semaine (§18.22), en tête de l'après-fiche. « n° 1 » plutôt que « 1er » : rien ne s'accorde. */
    week: {
      line: (rank: number, total: number, gap: number) =>
        `${rank}e${showsTotal(total) ? ` sur ${total}` : ""} cette semaine, à ${gap} ${gap > 1 ? "points" : "point"} du top 5`,
    /** L'écart ne se dit que s'il encourage (10 points au plus, trois étoiles au moins) : sinon le rang seul. */
    rank: (rank: number, total: number) => `${rank}e${showsTotal(total) ? ` sur ${total}` : ""} cette semaine`,
      /** Le rang du top 5, écrit comme dans le texte partagé (« n° 1 cette semaine »). */
      top5: (rank: number) => `${rank === 1 ? "N° 1" : `${rank}e`} cette semaine : défends ta place jusqu'à dimanche`,
      closedLine: (rank: number, total: number, week: number) => `${rank}e${showsTotal(total) ? ` sur ${total}` : ""}, semaine ${week}`,
      closedTop5: (week: number) => `Top 5 de la semaine ${week}`,
      share: (rank: number) => `${rank === 1 ? "n° 1" : `${rank}e`} cette semaine`,
    },
    linkedin: {
      btn: "Mettre ma photo LinkedIn",
      noPhoto: "Ta fiche n'a pas encore de photo. Prends celle de ton profil LinkedIn, rien d'autre n'est lu.",
      updated: "Photo mise à jour.",
      error: "LinkedIn n'a pas voulu, réessaie.",
    },
    /* L'enquête en direct (§18.26) : les trois trouvailles les plus fortes, chacune vers sa preuve. */
    dossier: {
      /** Les trouvailles numérotées de l'attente : à ne pas confondre avec les pièces qui justifient une note. */
      title: "Vois les autres pièces",
      proof: "Voir la preuve",
    },
    /* « Le reste » sous la fiche (§18.27) : une ligne repliée par bloc, titrée à l'impératif tutoyé. */
    rest: {
      photo: "Mets ta photo LinkedIn",
      email: "Garde ta fiche au-delà de 90 jours",
      contest: "Fais appel",
    },
    contest: {
      button: "Faire appel",
      again: "Refaire appel",
      title: "Réponse de la défense",
      replies: [
        "Ta défense a relu le dossier. Elle te conseille de plaider coupable.",
        "Ta réclamation a été transmise au service compétent : un fichier TODO.md qui n'existe pas encore.",
        "On a relu ton code une deuxième fois. Il n'a pas changé entre-temps.",
        "Contester est une compétence. Elle n'est malheureusement pas dans la grille.",
        "Le tribunal a consulté la grille. La grille ne se laisse pas attendrir : elle est écrite en JSON.",
        "Demande enregistrée. Délai de traitement estimé : le temps que tu ajoutes des tests.",
        "Le jury s'est réuni. Le jury, c'est une fonction pure. Elle a rendu la même note.",
      ],
      /** Le critère le plus faible de la note (§18.52), avec le nom qu'il porte au dos de la fiche (« Activité »), et sa note sur 10. */
      lowest: (name: string, v: number) => `Indice : ton critère le plus faible est ${name}, à ${v}/10. Un commit vaut mieux qu'un recours.`,
      /* après la blague, les vraies sorties (§18.48) : ajouter une source, supprimer la fiche */
      /** `add` : seulement les sources qui manquent (`realAdd`). */
      real: (add: string) => `Pour de vrai : la note sort de la grille et bouge avec ton dossier. Ajoute ${add} et elle est recalculée.`,
      realAdd: { code: "ton GitHub", career: "ton LinkedIn ou ton CV" },
      realNoSource: "Pour de vrai : la note sort de la grille, avec tout ton dossier. Si elle te gêne, ta fiche se supprime d'ici.",
      addSource: "Ajouter une source",
    },
    addCv: {
      title: "Ajoute ton CV au dossier",
      text: "Ton GitHub porte le code. Ton CV porte le parcours\u00a0: école, expérience et employeurs entrent au dossier.",
      btn: "Ajouter mon CV",
    },
    addGithub: { title: "Ajoute ton GitHub au dossier", text: "Ton CV porte le parcours. Ton GitHub porte le code\u00a0: trois critères s'ouvrent.", btn: "Ajouter mon GitHub" },
    /** Fiche LinkedIn seule (§18.24) : un seul appel, relancé en comparaison. */
    prove: { title: "Ajoute ton GitHub\u00a0: trois critères s'ouvrent", label: "Pseudo GitHub", btn: "Ajouter mon GitHub" },
    /** Sous une fiche GitHub seule, en miroir : LinkedIn porte le parcours. */
    addLinkedin: {
      title: "Ajoute ton LinkedIn au dossier",
      text: "Ton GitHub porte le code. Ton LinkedIn porte le parcours\u00a0: expérience, employeurs et école entrent au dossier.",
      label: "Lien de ton profil LinkedIn",
      btn: "Ajouter mon LinkedIn",
    },
    claim: {
      /** Pour qui vient de faire sa fiche : le bénéfice d'abord (§18.48). */
      kicker: "Verrouille ta fiche",
      kickerLawyer: "Avis de recherche à ton nom ?",
      /** Primes éteintes : ce que « C'est moi » donne vraiment. */
      text: "Prouve que ce compte GitHub est le tien : tu peux alors masquer ta fiche ou la supprimer, depuis n'importe quel appareil. On lit ton pseudo public, rien d'autre, et on ne garde aucun accès.",
      /** Une prime ouverte : la course en plus. */
      textPrimes: "Prouve que ce compte GitHub est le tien : tu peux alors masquer ta fiche, la supprimer et entrer dans la course aux primes. On lit ton pseudo public, rien d'autre, et on ne garde aucun accès.",
      textLawyer: "Ce compte GitHub est le tien ? Prouve-le et reprends la main sur ta fiche.",
      btn: "C'est moi",
      btnLawyer: "C'est moi, je reprends ma fiche",
      owned: "Ta fiche",
      hide: "Masquer",
      unhide: "Rendre visible",
      hiddenDone: "Fiche masquée : visible par toi seulement.",
      shownDone: "Fiche de nouveau visible par tout le monde.",
      hiddenBanner: "Masquée : visible par toi seulement",
      logout: "Se déconnecter",
      loggedOut: "Déconnexion faite. La fiche reste à toi.",
      claimed: (login: string) => `Fiche revendiquée. Bienvenue au commissariat, @${login}.`,
      /** En haut de la fiche reprise par « C'est moi » (§18.52), au-dessus de « Voir ma poursuite ». */
      claimedBanner: (login: string) => `Fiche reprise : elle est à ton nom, @${login}.`,
      mismatch: (login: string) => `Ce n'est pas ta fiche : tu es sur le compte GitHub @${login}.`,
      error: "GitHub n'a pas confirmé. Réessaie dans un instant.",
      limited: "Trop de tentatives aujourd'hui. Reviens demain.",
      failed: "Ça n'a pas marché. Réessaie.",
    },
    withdrawn: {
      title: "Fiche retirée à la demande de la personne",
      text: "Ce dossier a quitté la ville. Plus rien à voir ici.",
      mine: "C'est ta fiche ? Connecte-toi avec GitHub",
    },
    email: {
      label: "Adresse email",
      placeholder: "toi@exemple.dev",
      btn: "Garder ma fiche",
      sending: "Enregistrement…",
      /** Aucun email ne part : ce que l'adresse change à coup sûr. */
      done: "Ta fiche est gardée.",
      invalid: "Cette adresse ne ressemble pas à un email.",
      error: "Ça n'a pas pris. Réessaie.",
      note: "Laisse ton email : ta fiche reste en ligne, et Azerit peut t'écrire pour un poste.",
    },
    /* le bloc recruteur, en fin de page : on vouvoie qui recrute */
    cta: { title: "Vous recrutez ?", text: "Azerit vous présente des devs lus comme ici : l'expérience d'abord, le code comme preuve.", link: "azerit.tech" },
    del: {
      link: "Supprimer ma fiche",
      confirm: "Supprimer définitivement ?",
      yes: "Oui, supprimer",
      no: "Annuler",
      done: "Fiche supprimée",
      doneText: "Elle n'existe plus, ni son image.",
      error: "La suppression a échoué.",
    },
    again: "Faire une autre fiche",
  },
  /* Un seul dossier, deux sources : LinkedIn ou le CV porte le parcours, GitHub porte le code. Jamais « contre ». */
  /* La grille de recrutement (docs/bareme-recrutement.md §3, §4, §6 ; SPEC §18.37) : huit critères,
     une note sur 10 chacun, une moyenne pondérée. Jamais un « +n ». Épicène : « tu », « son », sans accord. */
  /** Sous la fiche, avant le pari (§18.37) : la ligne écrite par gabarit (shared/recruiterLine.ts) et les huit tuiles. */
  read: {
    pending: "Pas encore au dossier",
    /** Plus de deux critères sans note : une ligne, jamais un mur de cases vides (§18.48). */
    /** Les noms en bas de casse au milieu de la phrase (« expérience, parcours, code »). */
    pendingLine: (names: string) => `Pas encore au dossier : ${names.toLowerCase()}.`,
    hint: "Touche un critère\u00a0: sa preuve s'affiche.",
    tile: (name: string, n: number) => `${name}\u00a0: ${n} sur 10`,
    tileNone: (name: string) => `${name}\u00a0: pas encore de note`,
    /** L'école (§18.52) : jamais un chiffre, ni ici ni ailleurs, pour personne. Deux mots : « comptée », « hors moyenne ». */
    tileKept: (name: string) => `${name}\u00a0: hors moyenne`,
    tileCounted: (name: string) => `${name}\u00a0: comptée dans la note`,
    counted: "comptée",
    out: "hors moyenne",
    /** Un dossier à deux sources (§18.36) : la tuile dit où la note a été lue, « Expérience : 7 sur 10, lu sur LinkedIn ». */
    tileFrom: (name: string, n: number, from: string) => `${name}\u00a0: ${n} sur 10, ${from}`,
    /** La provenance sous le nom de la tuile, quand les deux sources ont parlé : « LinkedIn et GitHub ». */
    fromBoth: (src: string) => `${src} et GitHub`,
    /** La place d'une note absente : jamais un tiret long. */
    none: "n. c.",
    short: { XP: "Expérience", EMP: "Parcours", STK: "Stack", CODE: "Code", OWN: "Ownership", ACT: "Activité", EDU: "École", OSS: "Open source" } as Record<CriterionCode, string>,
  },
  grid: {
    /** Le seul pli qui explique la note, fermé par défaut (§18.76). */
    title: "Comment c'est noté",
    /** Le détail replié sous les tuiles, pour tout le monde (§18.48). */
    fold: "Le détail, critère par critère",
    /** Les sources lues : une ligne par source, « pas encore au dossier » pour celle qui manque. */
    method: {
      linkedin: "Ton parcours\u00a0: LinkedIn fait foi.",
      cv: "Ton parcours\u00a0: ton CV fait foi.",
      noCareer: "Ton parcours\u00a0: pas encore au dossier.",
      code: "Ton code\u00a0: GitHub fait foi.",
      noCode: "Ton code\u00a0: pas encore au dossier.",
      check: "On recoupe. Chaque note a sa preuve.",
      piece: "Chaque note a sa preuve.",
    },
    methodThem: {
      linkedin: "Son parcours\u00a0: LinkedIn fait foi.",
      cv: "Son parcours\u00a0: son CV fait foi.",
      noCareer: "Son parcours\u00a0: pas encore au dossier.",
      code: "Son code\u00a0: GitHub fait foi.",
      noCode: "Son code\u00a0: pas encore au dossier.",
      check: "On recoupe. Chaque note a sa preuve.",
      piece: "Chaque note a sa preuve.",
    },
    foot: "C'est la lecture qu'Azerit fait pour les équipes qui recrutent.",
    /** Sous la grille, surtout en vue partagée : un jeu, pas un verdict d'embauche. */
    game: "Un jeu, fait avec une vraie grille. Pas une décision d'embauche\u00a0: aucun poste, aucun entretien, données publiques seulement.",
    /** Une prime ouverte : seules les primes mènent à un entretien. */
    gamePrimes: "Un jeu, fait avec une vraie grille. La note n'est pas une décision d'embauche\u00a0: seules les primes mènent à un entretien, et seulement si tu y entres.",
    criteriaLabel: "Les huit critères",
    names: {
      EDU: "École et sélection",
      XP: "Expérience",
      EMP: "Parcours et employeurs",
      STK: "Stack technique",
      CODE: "Niveau du code",
      ACT: "Activité",
      OWN: "Ownership et production",
      OSS: "Open source",
    },
    coef: (w: string) => `coef. ${w}`,
    /** La jauge en texte : « 7 sur 10 ». */
    gauge: (n: number) => `${n} sur 10`,
    gaugeNone: "Pas de note",
    tags: {
      declared: "déclaré, à confirmer",
      unproven: "à prouver",
      missing: "pas au dossier",
      estimated: "estimée",
      below: "ne compte pas contre toi",
      out: "ne compte pas contre toi",
      private: "gardée pour toi",
    },
    /** Vue par quelqu'un d'autre : rien ne s'adresse à la personne fichée. */
    tagsThem: {
      declared: "déclaré, à confirmer",
      unproven: "à prouver",
      missing: "pas au dossier",
      estimated: "estimée",
      below: "ne fait pas baisser la note",
      out: "ne fait pas baisser la note",
      private: "gardée pour la personne",
    },
    source: { linkedin: "LinkedIn", cv: "CV", github: "GitHub", both: "recoupé" },
    /** L'étiquette de la preuve : « LinkedIn, postes datés », « GitHub, sequence-mail ». */
    sourceWith: (src: string, what: string) => `${src}, ${what}`,
    detailDeclared: {
      EDU: "formation",
      XP: "postes datés",
      EMP: "postes",
      STK: "technos décrites",
      CODE: "profil",
      ACT: "profil",
      OWN: "postes et réalisations",
      OSS: "profil",
    },
    detailGithub: {
      EDU: "repos",
      XP: "contributions par année",
      EMP: "profil",
      STK: "langages",
      CODE: "lecture du code",
      ACT: "calendrier",
      OWN: "repos",
      OSS: "PR fusionnées",
    },
    proof: "Voir la preuve",
    levelsTitle: (name: string) => `Les niveaux : ${name}`,
    reached: "Atteint",
    next: "Pour le suivant",
    levelNo: (n: number) => `${n}/10`,
    /** Les tables de niveaux, du plus haut au plus bas (docs/bareme-recrutement.md §3). */
    levels: {
      EDU: [
        [10, "École parmi les plus sélectives, ou médaille internationale (olympiade, finale mondiale d'un concours de programmation)."],
        [8, "École très sélective, ou sélection prouvée hors école : classement dans un concours de code, prix de hackathon, programme sélectif."],
        [6, "École sélective."],
        [4, "Autre école de tech, ou un hackathon, un concours, sans classement."],
      ],
      XP: [
        [10, "10 ans et plus."],
        [9, "8 ou 9 ans."],
        [8, "6 ou 7 ans."],
        [7, "5 ans."],
        [6, "4 ans."],
        [5, "3 ans."],
        [4, "2 ans."],
        [3, "1 an."],
        [2, "Moins d'un an."],
      ],
      EMP: [
        [10, "Deux ans ou plus chez un employeur très sélectif à l'embauche, et une trajectoire qui monte ou une équipe encadrée."],
        [8, "Deux ans ou plus dans une équipe produit exigeante, ou une entreprise fondée et tenue trois ans."],
        [6, "Un poste tenu deux ans, un an dans une startup de produit, ou une entreprise fondée et tenue un an."],
        [4, "Un vrai poste ou une entreprise fondée, de moins d'un an ; ou deux stages et plus."],
        [2, "Un seul stage, ou une seule expérience de moins de six mois."],
      ],
      STK: [
        [10, "1 000 commits dans le langage principal, pratiqué depuis 3 ans, deux autres familles de langages, du code poussé depuis moins de 6 mois."],
        [8, "500 commits, pratiqué depuis 2 ans, une autre famille de langages, moins de 6 mois."],
        [6, "200 commits, pratiqué depuis 1 an, du code poussé depuis moins d'un an."],
        [4, "50 commits, du code poussé depuis moins de 2 ans."],
        [2, "Du code public, sous ces seuils."],
      ],
      CODE: [
        [10, "Niveau 5 sur 5 lu dans le code : celui d'une bibliothèque de référence."],
        [8, "Niveau 4 : solide, erreurs gérées, tests pertinents."],
        [6, "Niveau 3 : structuré et maintenable."],
        [4, "Niveau 2 : fonctionnel mais brut."],
        [2, "Niveau 1 : tutoriel suivi."],
      ],
      ACT: [
        [10, "48 à 52 semaines actives sur les 52 dernières."],
        [8, "40 à 47 semaines."],
        [6, "26 à 39 semaines."],
        [4, "13 à 25 semaines."],
        [2, "4 à 12 semaines."],
        [0, "0 à 3 semaines."],
      ],
      OWN: [
        [10, "Un projet dont beaucoup se servent : 1\u00a0000\u00a0stars GitHub ou dix comptes externes qui contribuent, et trois releases dans l'année."],
        [8, "Un projet porté plus d'un an, publié, et utilisé par d'autres (100\u00a0stars GitHub ou trois comptes externes qui contribuent)."],
        [6, "Un projet porté 6 mois ou plus, et de quoi mettre en production : Dockerfile, CI ou release."],
        [4, "Un projet porté 6 mois ou plus (50 commits)."],
        [2, "Des repos, aucun porté dans la durée."],
      ],
      OSS: [
        [10, "Maintenir un projet de 1\u00a0000\u00a0stars GitHub, ou vingt PR fusionnées dans de tels projets."],
        [8, "Une PR fusionnée dans un projet de 1\u00a0000\u00a0stars GitHub, 100\u00a0stars GitHub sur ses repos, ou un repo avec dix comptes externes qui contribuent."],
        [6, "Vingt PR ou plus fusionnées chez les autres."],
        [4, "Cinq à dix-neuf PR."],
        [2, "Une à quatre PR."],
        [0, "Aucune PR fusionnée chez les autres."],
      ],
    } as Record<CriterionCode, [number, string][]>,
    /** Déclaré sur LinkedIn ou le CV, sans GitHub pour le prouver : la table s'arrête à 6. */
    declaredLevels: {
      STK: [
        [6, "Cinq technos ou plus rattachées à une réalisation concrète, dont deux dans un poste de moins de 2 ans."],
        [4, "Deux à quatre technos rattachées à une réalisation concrète."],
      ],
      OWN: [
        [6, "Trois résultats datés et chiffrés (mise en ligne, migration, usage)."],
        [4, "Une entreprise fondée, ou un résultat daté et chiffré."],
      ],
    } as Partial<Record<CriterionCode, [number, string][]>>,
    /** Sous la table : comment elle se lit. */
    levelNotes: {
      EDU: "Sans école de tech, pas de note d'école : le critère sort de la moyenne, et apprendre en autodidacte ne coûte rien. Liste française d'abord\u00a0: une école absente de la liste s'arrête à 6/10 pour l'instant. Une école ne fait jamais baisser la note.",
      XP: "Compté poste par poste : stage et alternance pour moitié, association étudiante et bénévolat pour zéro, deux postes en même temps une seule fois. Sans LinkedIn : estimée sur les années actives de GitHub, arrêtée à 8.",
      EMP: "Lu sur LinkedIn ou le CV seulement.",
      STK: "Se lit dans le code public. Sans GitHub au dossier, elle se lit sur LinkedIn et la table s'arrête à 6.",
      CODE: "Trois repos lus : deux fois leur niveau moyen. 9 et 10 demandent des tests dans la moitié des repos actifs ; 7 et plus, un repo de 20\u00a0commits.",
      ACT: "8 et 10 demandent un repo public de 20\u00a0commits.",
      OWN: "Se lit sur LinkedIn comme sur GitHub\u00a0: la lecture la plus favorable est gardée.",
      OSS: "Ne fait jamais baisser la note : la plupart des bons profils n'ont pas d'open source.",
    } as Record<CriterionCode, string>,
    /** Page partagée, vue par quelqu'un d'autre (question 5 de la grille) : ni nom d'école, ni nom d'ancien employeur. */
    shared: {
      school: "École gardée pour la personne fichée.",
      xpNone: "Aucun mois compté sur les postes datés.",
      hidden: "L'école, les noms d'employeurs et les points à confirmer sont gardés pour la personne fichée.",
    },
    /** La fin de la ligne de l'école, la même pour tout le monde, sans chiffre (§18.52). */
    school: {
      counted: "Elle compte dans la note, sans chiffre affiché.",
      out: "Une école ne fait jamais baisser la note.",
    },
    final: {
      title: "La note de la fiche",
      caseTitle: "La note de la fiche",
      how: "Moyenne pondérée des critères notés, × 10.",
      /** « (Code 7 × 2 + Stack 6 × 1,5) ÷ 3,5 » : chaque note sur 10 et son coefficient. */
      term: (name: string, score: number, coef: string) => `${name} ${score} × ${coef}`,
      /** L'école comptée, sans son niveau. */
      termCounted: (name: string, coef: string) => `${name} (comptée) × ${coef}`,
      formula: (terms: string, den: string) => `(${terms}) ÷ ${den}`,
      result: (mean: string) => `= ${mean} sur 10`,
      out: {
        unproven: "Non prouvé, hors moyenne",
        missing: "Non renseigné, hors moyenne",
        below: "Sous la moyenne des autres, hors moyenne",
      },
      outList: (label: string, names: string) => `${label} : ${names}.`,
      belowWhy: "L'open source ne fait jamais baisser la note.",
      /** L'école hors moyenne : sa propre ligne, jamais « sous la moyenne des autres » (§18.52). */
      schoolOut: (name: string) => `Hors moyenne : ${name}. Une école ne fait jamais baisser la note.`,
      capped: "Aucun code prouvé : la note ne peut pas dépasser 85. La sixième étoile se prouve.",
      cappedHit: (raw: number) => `Aucun code prouvé : le calcul donne ${raw}, la note s'arrête à 85.`,
      empty: "Fiche vide : moins d'un quart des coefficients sont notés. Note plancher : 20, une étoile.",
      emptyWhy: "Non prouvé ne veut pas dire mauvais : le jour où le code est public, les critères s'ouvrent.",
      score: (n: number) => `${n}`,
      outOf: "sur 100",
      /** La note du dossier face à un GitHub « dossier vide » : le code n'est pas prouvé, et ce qui changerait la note. */
      caseUnproven: (src: string, opens: string) =>
        `Code non prouvé : ton GitHub public ne montre encore rien de jugeable. La note du dossier se fait sur ton ${src}, sans dépasser 85. Ce qui la changerait : un vrai projet public sur GitHub${opens ? `, qui ouvre ${opens}` : ""}.`,
      caseUnprovenThem: (src: string, opens: string) =>
        `Code non prouvé : son GitHub public ne montre encore rien de jugeable. La note du dossier se fait sur son ${src}, sans dépasser 85. Ce qui la changerait : un vrai projet public sur GitHub${opens ? `, qui ouvre ${opens}` : ""}.`,
      /** « stack technique, niveau du code et activité ». */
      opensList: (names: string[]) => names.map((n) => n.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " et $1"),
    },
    /** Avec les deux sources : trois colonnes, et les recoupements. */
    compare: {
      /** Un dossier à deux sources (§18.36) : la source où la note du critère a été lue. */
      keptFrom: {
        linkedin: "lu sur LinkedIn",
        cv: "lu sur le CV",
        github: "lu sur GitHub",
        both: "lu sur les deux sources",
      },
      none: "n. c.",
    },
  },
  /* « Dénonce un complice » (§18.6) et la page partagée (§18.7). Épicène : « dans le viseur », jamais « recherché ». */
  denounce: {
    title: "Dénonce un complice",
    /** Sous le titre : ce qui va se passer, et ce que l'autre pourra faire. */
    intro: "On dresse sa fiche, tu la lui envoies.",
    label: "Nom ou pseudo GitHub du complice",
    placeholder: "Son nom ou son pseudo",
    /* quand le serveur lit LinkedIn (§18.48, §18.81) : un nom, un pseudo, ou un lien de profil */
    labelBoth: "Nom, pseudo GitHub ou lien LinkedIn du complice",
    placeholderBoth: "Son nom, son pseudo ou un lien",
    invalidBoth: "Choisis quelqu'un dans la liste, ou colle un lien LinkedIn ou un pseudo GitHub.",
    githubOnly: "Pour l'instant, par pseudo GitHub seulement.",
    btn: "Dénoncer",
    suggest: "Tes complices sur GitHub",
    pending: "Interrogatoire en cours…",
    self: "C'est ta propre fiche. Dénonce quelqu'un d'autre.",
    invalid: "Choisis quelqu'un dans la liste, ou tape son pseudo GitHub.",
    inSights: "est dans le viseur",
    charge: (status: string) => `Chef d'accusation : ${status}`,
    /* le seul bouton : à la personne elle-même, pour qu'elle la reprenne (parcours 2 et 25) */
    send: (who: string) => `Envoyer à ${who}`,
    sendText: (who: string, stars: string, tag: string) => `${who}, Azerit a dressé ta fiche de dev : ${stars ? `${stars}, ` : ""}${tag}. C'est toi ? Reprends-la :`,
    sendCopied: (who: string) => `Message copié : envoie-le à ${who}.`,
    see: "Voir sa fiche",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié.",
    again: "Dénoncer quelqu'un d'autre",
    /* à l'arrivée de la cible */
    /* un titre qui vaut pour la personne visée comme pour un tiers ; qui a dénoncé est dit une fois, au-dessus (§18.52) */
    isYou: "C'est toi ?",
    lawyer: "C'est moi, je reprends ma fiche",
    /** Le même geste, dans la barre fixe du téléphone. */
    lawyerShort: "C'est moi",
    lawyerHint: "Connexion GitHub : on lit ton pseudo public, rien d'autre.",
    /** Fiche dénoncée par un lien LinkedIn (pas de GitHub à prouver) : la personne la refait elle-même, la nouvelle est la sienne. */
    lawyerLinkedin: "C'est moi : faire ma fiche moi-même",
    lawyerLinkedinHint: "Reprends-la : refais-la depuis ton LinkedIn, en une minute. La nouvelle fiche est à toi, tu la partages ou tu la supprimes.",
    notMe: "Ce n'est pas moi : faire la mienne",
    andYou: "À ton tour",
    mine: "Ma fiche",
    versus: (me: number, them: number, verdict: string) => `${me}/100 contre ${them}/100 : ${verdict}`,
    starsAhead: (n: number) => (n === 1 ? "une étoile d'avance" : `${n} étoiles d'avance`),
    starsBehind: (n: number) => (n === 1 ? "une étoile de retard" : `${n} étoiles de retard`),
    pointsAhead: (n: number) => (n === 1 ? "1 point d'avance" : `${n} points d'avance`),
    pointsBehind: (n: number) => (n === 1 ? "1 point de retard" : `${n} points de retard`),
    tie: "à égalité",
    /* le duel s'envoie : le score, puis le lien de sa propre fiche */
    sendScore: "Lui envoyer ma note",
    /** Sur sa fiche toute neuve : la fiche par laquelle on est arrivé (le duel, une fois). */
    duelFrom: (who: string) => `Tu viens de la fiche de ${who}`,
    duelText: (me: number, them: number, verdict: string, who: string, rel: "ahead" | "behind" | "tie") =>
      `${me}/100 contre ${them}/100 : ${verdict} ${rel === "tie" ? "avec" : "sur"} ${who}. Verdict d'Azerit :`,
    scoreCopied: "Note copiée : colle-la dans ton message.",
  },
  /* le jury de la page partagée (§18.27) : on vote sur le chef d'accusation, jamais sur la personne */
  jury: {
    title: "Coupable ou relaxe\u00a0?",
    titleCharge: (charge: string) => `Coupable de «\u00a0${charge}\u00a0»\u00a0?`,
    guilty: "Coupable",
    cleared: "Relaxe",
    /* « votes » plutôt que « jurés », qui s'accorde */
    tally: (pct: number, n: number) => `${pct}\u00a0% coupable (${n}\u00a0${n === 1 ? "vote" : "votes"})`,
    owner: (tally: string) => `Jury : ${tally}`,
    /** Pour qui a fait la fiche, avant trois votes : une invitation plutôt qu'un vide ; la ligne garde sa place. */
    ownerNone: "Jury : ton réseau vote coupable ou relaxe dès que tu partages.",
    failed: "Vote non compté. Réessaie.",
    /* après le vote : la suite, vers « À ton tour » */
    judged: (who: string) => `Tu as jugé ${who}.`,
    turn: "À ton tour",
  },
  /* les bandes (§18.38) : bandsText.ts */
  bands: BANDS_TEXT.fr,
  /* les primes (§18.4, §18.5) : primesText.ts */
  primes: PRIMES_TEXT.fr,
  /* les pages autour de la fiche (erreurs, vie privée, retrait) : pagesText.ts */
  pages: PAGES_TEXT.fr,
  errors: {
    title: "Pas de fiche cette fois",
    retry: "Réessayer",
    timeout: "Ça prend trop de temps, on préfère s'arrêter là plutôt que d'inventer. Réessaie.",
    generic: "Quelque chose a cassé de notre côté.",
    closed: "Le commissariat a fermé pour aujourd'hui. Reviens demain.",
  },
  footer: {
    privacy: "Vie privée",
    credits3d: "Crédits",
  },
  /** La barre du haut et le pied de page (Chrome.tsx) : les liens du site. */
  chrome: {
    home: "Azerit, accueil",
    nav: "Le site",
    bands: "Bandes",
    mine: "Ma fiche",
    primes: "Primes",
    rules: "Règlement",
    credits: "Crédits",
    seePrimes: "Voir les primes",
    /** La signature du pied de page : qui fait le site. */
    sign: "Azerit recrute des devs sur preuves : l'expérience d'abord, le code comme preuve.",
  },
  privacy: {
    title: "Vie privée",
  },
  /** Fiche sans pseudo GitHub vue par un tiers (LinkedIn, CV) : la personne fichée demande son retrait. */
  removal: {
    link: "C'est toi sur cette fiche, et tu ne l'as pas faite ? Demander son retrait",
    /* dans le bloc d'une fiche dénoncée : le titre a déjà dit qui l'a faite */
    linkShort: "C'est toi ? Demander le retrait de cette fiche",
    label: "Retrait de cette fiche : ton email, pour te répondre",
    placeholder: "ton@email.fr",
    send: "Envoyer",
    invalid: "Cet email n'a pas l'air valide.",
    fallback: "Écris-nous avec le lien de cette fiche, on la retire après vérification :",
  },
  /** Le titre de l'onglet d'une adresse inconnue (la page : components/ErrorPage.tsx, textes sous `pages.error`). */
  notFound: { title: "Page introuvable" },
  crash: { title: "La page n'a pas chargé", text: "Le réseau a peut-être coupé, ou le site vient d'être mis à jour.", reload: "Recharger" },
});

export type Dict = typeof fr;

const en: Dict = {
  meta: {
    title: homeTitle("en"),
    titleCard: (name, overall) => `${name} ${starsLine(starsFor(overall))} · Azerit`,
    titleSealed: (name) => `${name} · Azerit`,
    titlePage: (subject) => `${subject} · Azerit`,
  },
  common: {
    by: "by",
    langLabel: "Language",
    skip: "Skip",
    back: "Back",
    close: "Close",
    loading: "Loading…",
    demo: "Demo mode: mock data",
    skipToContent: "Skip to content",
  },
  home: {
    season: {
      soon: (n, day) => `Season ${n} starts ${day}`,
      win: (n, k) => `Season ${n}: ${k > 1 ? `${k} interviews` : k === 1 ? "1 interview" : "interviews"} to win`,
      until: (day) => `until ${day}`,
      over: (n) => `Season ${n} is over`,
    },
    titleClaim: heroSentence(HOME_PROMISE.en.claim),
    titleProof: heroSentence(HOME_PROMISE.en.proof),
    hookPrimes: "The top of the board lands an interview.",
    hookPlay: "One to six stars, in one minute. No account.",
    tabGithub: "Your GitHub",
    tabDoors: "LinkedIn or GitHub",
    loginLabel: "Your name or GitHub username",
    loginPlaceholder: "Your name or username",
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Your name",
    linkedinPlaceholder: "Your name",
    linkedinLinkPlaceholder: "linkedin.com/in/your-profile",
    withLinkedin: "Sign in with LinkedIn",
    withGithub: "Sign in with GitHub",
    orCv: "or with your résumé",
    orLink: "or paste a link",
    linkLabel: "LinkedIn link, GitHub link or GitHub username",
    linkPlaceholder: "LinkedIn link, GitHub link or username",
    backToLogin: "Sign in",
    linkedinHint: "Public profile only.",
    githubHint: "Public repos only.",
    errLinkedin: "Pick your profile from the list, or paste its LinkedIn link.",
    errPick: "Pick your account from the list, or type your GitHub username.",
    errLinkedinOff: "LinkedIn isn't answering right now. Use your GitHub or your résumé, or try again in a moment.",
    errLinkedinCv: "With a résumé, give your GitHub username.",
    submit: "Get my rap sheet",
    submitBoth: "Get my rap sheet from both",
    submitting: "Opening your file…",
    bothLink: "or both, in one file",
    bothActive: "Two sources on file: your résumé and your GitHub",
    bothBack: "just one source",
    dropTitle: "Drop your résumé here",
    dropPick: "Pick your résumé as a PDF",
    dropOr: "or",
    dropBrowse: "pick a PDF",
    dropHint: "5 MB, 10 pages max",
    sizeUnits: { mb: "MB", kb: "KB" },
    dropRemove: "Remove file",
    reassure: "Your résumé is read in memory, then thrown away.",
    dropAnywhere: "Let go of your résumé, we'll take it from here",
    inlineCv: "Use your résumé instead",
    exampleLabel: "Example sheet",
    exampleCaption: "The actual rap sheet of Jacques, founder of Azerit",
    exampleFrom: (labels) => `based on ${labels}`,
    next: "See more",
    lastTitle: "Your turn.",
    bandsLead: "Get your rap sheet. Make your crew win.",
    back: {
      mine: "Your sheet:",
      mineGo: "See it again",
      pending: "Your file is still opening.",
      pendingGo: "Go back to it",
      owed: "Your chase is waiting.",
      owedGo: "Watch it",
      see: "See my sheet",
      another: "Make another sheet",
    },
    wall: {
      title: "Which profile are you?",
      you: "And you?",
      cta: "Get my rap sheet",
    },
    top: {
      title: "Top of the week",
      meta: (week, n, left) => [`Week ${week}`, showsTotal(n) && `${n} sheets`, `ends in ${left}`].filter(Boolean).join(", "),
      left: (d, h, m) => (d > 0 ? (h > 0 ? `${d}d ${h}h` : d === 1 ? "1 day" : `${d} days`) : h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`),
      cut: "Top 5",
      emptyTitle: "Spot #1 is open",
      emptyText: "This week's first sheet takes it.",
      freeRange: (from, to) => (from === to ? `Spot ${from} is open` : `Spots ${from} to ${to} are open`),
      take: (n) => (n === 1 ? "Take it" : "Take one"),
      free: "Open spot",
      freeLabel: (rank) => `Spot ${rank} is open: get your rap sheet`,
      rowLabel: (rank, login, overall) => `Spot ${rank}: @${login}, rating ${overall}/100`,
      rowLabelAnon: (rank, overall) => `Spot ${rank}: a LinkedIn rap sheet, rating ${overall}/100`,
      anon: "LinkedIn rap sheet",
    },
    errLogin: "That doesn't look like a GitHub username.",
    errEmptyLogin: "Give us a GitHub username (or profile URL).",
    errEmptyCv: "Drop a résumé as a PDF.",
    errNotPdf: "That file isn't a PDF.",
    errTooLarge: (mb) => `${mb} MB file: the limit is 5 MB. A résumé, not a thesis.`,
    errTooManyPages: (n) => `${n} pages: the limit is 10. A résumé fits on one or two.`,
    errNetwork: "The server isn't answering. Try again in a moment.",
    meanwhileTop: "Meanwhile: this week's top",
    meanwhileBands: "Meanwhile: the crews",
  },
  stats: {
    TEC: { name: "Tech skill", what: "How deep the written or described work goes." },
    SHIP: { name: "Shipping", what: "Real consistency, week after week." },
    ARCH: { name: "Rigor", what: "Tests, CI, tooling." },
    DOC: { name: "Communication", what: "READMEs, commit messages, résumé clarity." },
    XP: { name: "Experience", what: "Real or claimed seniority." },
    BUZZ: { name: "Buzzwords", what: "Hot-air density. Doesn't count toward the rating." },
  },
  tierCard: (level) => `${level} sheet`,
  waiting: {
    title: "See how in-demand your profile is.",
    piece: (n) => `Exhibit ${String(n).padStart(2, "0")}`,
    yourCv: "Your résumé",
    queue: (n) => (n === 1 ? "1 sheet ahead of you at the station" : `${n} sheets ahead of you at the station`),
    scene: "Getting the chase ready…",
    offline: "The station isn't answering.\nWe'll pick up when you're back online.",
    retry: "Try again",
    ready: "Your sheet is ready.",
    progress: {
      lazy_commits: (n) => `Reading your ${n ?? "many"} “wip” commits…`,
      buzzwords: (n) => `Counting buzzwords… ${n ?? 0} so far`,
      tests: () => "Looking for tests… still looking",
      readme: () => "Checking the README says more than “TODO”…",
      compare: () => "Both sources in one file: career and code, criterion by criterion…",
      profile: () => "Profile found. It exists, that's a start.",
      linkedin_wait: () => "Reading the public LinkedIn profile…",
      linkedin: () => "LinkedIn found. Recounting your years, role by role.",
      repos: (n) => `${n ?? "A few"} public repos spotted, forks excluded…`,
      calendar: () => "Reading 52 weeks of contribution calendar…",
      commits: (n) => `Reading ${n ?? 100} commit messages…`,
      code: () => "The AI reads three of your repos and gives their level, from 1 to 5.",
      cv: () => "Reading the PDF, in memory. It'll be forgotten right after.",
      pdf: () => "Extracting text from the PDF…",
      scoring: () => "Eight criteria, each scored out of 10. The scorecard works out the rating out of 100.",
      statuses: () => "Picking statuses from the closed list…",
      render: () => "Printing the sheet…",
      start: () => "Gathering the first exhibits…",
    },
    fillers: {
      all: ["The scorecard is hard-coded in a JSON file. No favoritism.", "Calibrating the stamp…", "Working out how much is proven. Never 100%, nobody is."],
      path: [
        "An internship counts for half. A student club, for zero.",
        "No tech school, no school score. It costs nothing.",
        "Two jobs at once only count once.",
        "Recounting your years, role by role. Titles don't count, dates do.",
      ],
      github: [
        "Ignoring your forks. Everyone forked a tutorial once.",
        "Looking for a “final final v2” commit…",
        "We don't read your private repos. Promise.",
        "Checking node_modules isn't committed…",
        "An empty GitHub is not bad code.",
      ],
    },
  },
  reveal: {
    packTitle: "FILE",
    open: "Start the chase",
    skip: "Skip",
    mute: "Mute",
    unmute: "Unmute",
    replay: "Replay my chase",
    watch: "Watch the chase",
    watchMine: "Watch my chase",
    revealed: (level, overall) => `${level} sheet, rated ${overall}/100.`,
    revealedSealed: "Sealed sheet: code still unproven.",
    fireworks: "Click or Space: fireworks",
    fireworksTouch: "Tap the screen: fireworks",
    statusLabel: "Status",
    statuses: [
      { min: 1, label: "Tourist" },
      { min: 15, label: "Hello World" },
      { min: 25, label: "Newb" },
      { min: 35, label: "Ctrl+C Ctrl+V" },
      { min: 45, label: "Padawan" },
      { min: 60, label: "Gets it done" },
      { min: 67, label: "Seasoned" },
      { min: 75, label: "Cracked" },
      { min: 80, label: "Monster" },
      { min: 85, label: "Machine" },
      { min: 90, label: "Final boss" },
      { min: 95, label: "Cheat code" },
    ],
    tells: {
      language: "Weapon",
      noLanguage: "Polyglot",
      league: "File",
      leagueGithub: "GitHub",
      leagueCv: "Résumé",
      leagueBoth: "Résumé · GitHub",
      leagueLinkedin: "LinkedIn",
      leagueBothLinkedin: "LinkedIn · GitHub",
      position: "Specialty",
      club: "Affiliation",
      freeAgent: "Lone wolf",
      idle: "AZERIT · CASE OPEN",
      graph: "contributions · 52 weeks",
    },
  },
  plea: {
    ask: "How many stars do you plead?",
    star: (n) => (n === 1 ? "Plead 1 star" : `Plead ${n} stars`),
    count: (n) => (n === 1 ? "1 of 6 stars" : `${n} of 6 stars`),
    pleading: "You plead",
    noted: "Plea entered. Verdict after the chase.",
    pleaded: "You pleaded",
    verdict: "Verdict",
    gap: { over: "Overconfidence", exact: "Clear-eyed", under: "Too modest" },
    strip: (pleaded, actual) => `You pleaded ${pleaded === 1 ? "1 star" : `${pleaded} stars`}, verdict: ${actual}.`,
  },
  positions: {
    FS: "Full-stack",
    BE: "Backend",
    FE: "Frontend",
    MOB: "Mobile",
    DATA: "Data",
    ML: "Machine learning",
    OPS: "DevOps",
    SEC: "Security",
    EMB: "Embedded",
    PM: "Product",
    DESIGN: "Design",
    CTO: "CTO",
  },
  result: {
    makeYours: "Get my rap sheet",
    lead: (who) => `Azerit drew up ${who}'s dev rap sheet the way a recruiter would: experience first, code as proof.`,
    leadYours: "Yours takes one minute, no account.",
    leadShort: (who) => `${who}'s dev rap sheet.`,
    leadDenounced: (who, by) => (by ? `@${by} turned in ${who}.` : `Someone turned in ${who}.`),
    yourTurnBare: "What about you, how many stars? Your LinkedIn or your GitHub is all it takes.",
    pieces: {
      line: (labels) => `Sources on file: ${labels}`,
      pair: (a, b) => `${a} and ${b}`,
      unproven: "Code still unproven",
      link: "Link between the two sources: to be confirmed",
    },
    wanted: "Wanted",
    wantedStars: (n, level) => `${n} of 6 stars, ${level}`,
    wantedSep: ": ",
    share: {
      title: "Share it",
      linkedin: "Share on LinkedIn",
      addProfile: "Add to my LinkedIn profile",
      copy: "Copy link",
      download: "Download image",
      copyShort: "Copy link",
      downloadShort: "Image",
      story: "Story image",
      storyShort: "Story",
      native: "Share",
      copiedShort: "Text copied: paste it into your LinkedIn post.",
      copiedLink: "Link copied.",
      downloadDemo: "Image unavailable in demo mode (rendered by the server).",
      holdToSave: "Press and hold to save",
      holdLink: "Press and hold to copy your link.",
      holdText: "Press and hold to copy your text, then paste it into your LinkedIn post.",
      holdMessage: "Press and hold to copy your message.",
      imageAlt: "Your rap sheet",
      words: {
        plea: (pleaded, gap) => `I pleaded ${pleaded}: ${{ over: "overconfident", exact: "clear-eyed", under: "too modest" }[gap]}.`,
        sheet: (stars, level, overall) => `My dev rap sheet: ${stars} ${level}, ${overall}/100.`,
        file: (stars, level, overall) => `My dev rap sheet, scored on Azerit's hiring scorecard: ${stars} ${level}, ${overall}/100.`,
        profile: (label) => `Profile: “${label}”`,
        charge: (status) => `Charge: “${status}”.`,
        ai: (secs) => `Rap sheet drawn up by Azerit in ${secs}s.`,
        sealed: "A rap sheet opened at Azerit, code still unproven",
        exhibits: (src) => `Two sources on file: ${src} and GitHub.`,
        cta: "Get yours:",
      },
    },
    week: {
      line: (rank, total, gap) => `#${rank}${showsTotal(total) ? ` of ${total}` : ""} this week, ${gap} ${gap === 1 ? "point" : "points"} from the top 5`,
      rank: (rank, total) => `#${rank}${showsTotal(total) ? ` of ${total}` : ""} this week`,
      top5: (rank) => `#${rank} this week: hold your spot until Sunday`,
      closedLine: (rank, total, week) => `#${rank}${showsTotal(total) ? ` of ${total}` : ""}, week ${week}`,
      closedTop5: (week) => `Top 5 of week ${week}`,
      share: (rank) => `#${rank} this week`,
    },
    linkedin: {
      btn: "Use my LinkedIn photo",
      noPhoto: "Your sheet has no photo yet. Use your LinkedIn profile picture, nothing else is read.",
      updated: "Photo updated.",
      error: "LinkedIn said no. Try again.",
    },
    dossier: {
      title: "See the other exhibits",
      proof: "See the evidence",
    },
    rest: {
      photo: "Add your LinkedIn photo",
      email: "Keep your sheet past 90 days",
      contest: "Appeal the rating",
    },
    contest: {
      button: "Appeal",
      again: "Appeal again",
      title: "The defense replies",
      replies: [
        "Your lawyer read the file. They advise you to plead guilty.",
        "Your complaint has been forwarded to the relevant department: a TODO.md that doesn't exist yet.",
        "We read your code a second time. It hadn't changed in the meantime.",
        "Disputing is a skill. Sadly, it isn't on the scorecard.",
        "The court checked the scorecard. The scorecard can't be sweet-talked: it's written in JSON.",
        "Request logged. Estimated processing time: however long it takes you to add tests.",
        "The jury met. The jury is a pure function. It returned the same rating.",
      ],
      lowest: (name, v) => `Hint: your weakest criterion is ${name}, at ${v}/10. A commit beats an appeal.`,
      real: (add) => `For real: the rating comes from the scorecard and moves with your file. Add ${add} and it's recalculated.`,
      realAdd: { code: "your GitHub", career: "your LinkedIn or your résumé" },
      realNoSource: "For real: the rating comes from the scorecard, with your whole file. If it bothers you, you can delete your sheet right here.",
      addSource: "Add a source",
    },
    addCv: {
      title: "Add your résumé to the file",
      text: "Your GitHub carries the code. Your résumé carries the career: school, experience and employers go on file.",
      btn: "Add my résumé",
    },
    addGithub: { title: "Add your GitHub to the file", text: "Your résumé carries the career. Your GitHub carries the code: three more criteria open.", btn: "Add my GitHub" },
    prove: { title: "Add your GitHub: three more criteria open", label: "GitHub username", btn: "Add my GitHub" },
    addLinkedin: {
      title: "Add your LinkedIn to the file",
      text: "Your GitHub carries the code. Your LinkedIn carries the career: experience, employers and school go on file.",
      label: "Your LinkedIn profile link",
      btn: "Add my LinkedIn",
    },
    claim: {
      kicker: "Lock your sheet",
      kickerLawyer: "Wanted under your name?",
      text: "Prove this GitHub account is yours: you can then hide or delete your sheet from any device. We read your public username, nothing else, and keep no access.",
      textPrimes: "Prove this GitHub account is yours: you can then hide your sheet, delete it and enter the bounty race. We read your public username, nothing else, and keep no access.",
      textLawyer: "Is this GitHub account yours? Prove it and take your sheet back.",
      btn: "That's me",
      btnLawyer: "That's me, claim my sheet",
      owned: "Your sheet",
      hide: "Hide",
      unhide: "Make visible",
      hiddenDone: "Sheet hidden: only you can see it.",
      shownDone: "Sheet visible to everyone again.",
      hiddenBanner: "Hidden: only you can see it",
      logout: "Sign out",
      loggedOut: "Signed out. The sheet is still yours.",
      claimed: (login) => `Sheet claimed. Welcome to the station, @${login}.`,
      claimedBanner: (login) => `Sheet claimed: it's in your name now, @${login}.`,
      mismatch: (login) => `Not your sheet: you're on the GitHub account @${login}.`,
      error: "GitHub didn't confirm. Try again in a moment.",
      limited: "Too many attempts today. Come back tomorrow.",
      failed: "That didn't work. Try again.",
    },
    withdrawn: {
      title: "Taken down at the person's request",
      text: "This dev has left town. Nothing left to see here.",
      mine: "Your sheet? Sign in with GitHub",
    },
    email: {
      label: "Email address",
      placeholder: "you@example.dev",
      btn: "Keep my sheet",
      sending: "Saving…",
      done: "Your sheet is kept.",
      invalid: "That doesn't look like an email address.",
      error: "That didn't take. Try again.",
      note: "Leave your email: your sheet stays up, and Azerit may reach out about a job.",
    },
    cta: { title: "Hiring?", text: "Azerit introduces you to devs vetted this way: experience first, code as proof.", link: "azerit.tech" },
    del: {
      link: "Delete my sheet",
      confirm: "Delete for good?",
      yes: "Yes, delete",
      no: "Cancel",
      done: "Sheet deleted",
      doneText: "It's gone, image included.",
      error: "Deletion failed.",
    },
    again: "Get another sheet",
  },
  read: {
    pending: "Not on file yet",
    pendingLine: (names: string) => `Not on file yet: ${names}.`,
    hint: "Tap a criterion to see its evidence.",
    tile: (name: string, n: number) => `${name}: ${n} out of 10`,
    tileNone: (name: string) => `${name}: no score yet`,
    tileKept: (name: string) => `${name}: not averaged`,
    tileCounted: (name: string) => `${name}: counted in the rating`,
    counted: "counted",
    out: "not averaged",
    tileFrom: (name: string, n: number, from: string) => `${name}: ${n} out of 10, ${from}`,
    fromBoth: (src: string) => `${src} and GitHub`,
    none: "n/a",
    short: { XP: "Experience", EMP: "Career", STK: "Stack", CODE: "Code", OWN: "Ownership", ACT: "Activity", EDU: "School", OSS: "Open source" },
  },
  grid: {
    title: "How it's scored",
    fold: "The detail, criterion by criterion",
    method: {
      linkedin: "Your career: we go by LinkedIn.",
      cv: "Your career: we go by your résumé.",
      noCareer: "Your career: not on file yet.",
      code: "Your code: we go by GitHub.",
      noCode: "Your code: not on file yet.",
      check: "We cross-check. Every score comes with its evidence.",
      piece: "Every score comes with its evidence.",
    },
    methodThem: {
      linkedin: "Their career: we go by LinkedIn.",
      cv: "Their career: we go by their résumé.",
      noCareer: "Their career: not on file yet.",
      code: "Their code: we go by GitHub.",
      noCode: "Their code: not on file yet.",
      check: "We cross-check. Every score comes with its evidence.",
      piece: "Every score comes with its evidence.",
    },
    foot: "This is how Azerit reads devs for hiring teams.",
    game: "A game built on a real scorecard. Not a hiring decision: no job, no interview, public data only.",
    gamePrimes: "A game built on a real scorecard. The rating isn't a hiring decision: only bounties lead to an interview, and only if you enter.",
    criteriaLabel: "The eight criteria",
    names: {
      EDU: "School and selectivity",
      XP: "Experience",
      EMP: "Career path and employers",
      STK: "Tech stack",
      CODE: "Code level",
      ACT: "Activity",
      OWN: "Ownership and production",
      OSS: "Open source",
    },
    coef: (w: string) => `weight ${w}`,
    gauge: (n: number) => `${n} out of 10`,
    gaugeNone: "No score",
    tags: {
      declared: "declared, to be confirmed",
      unproven: "unproven",
      missing: "not on file",
      estimated: "estimated",
      below: "doesn't count against you",
      out: "doesn't count against you",
      private: "private to you",
    },
    tagsThem: {
      declared: "declared, to be confirmed",
      unproven: "unproven",
      missing: "not on file",
      estimated: "estimated",
      below: "doesn't lower the rating",
      out: "doesn't lower the rating",
      private: "kept private",
    },
    source: { linkedin: "LinkedIn", cv: "résumé", github: "GitHub", both: "cross-checked" },
    sourceWith: (src: string, what: string) => `${src}, ${what}`,
    detailDeclared: {
      EDU: "education",
      XP: "dated roles",
      EMP: "roles",
      STK: "technologies described",
      CODE: "profile",
      ACT: "profile",
      OWN: "roles and achievements",
      OSS: "profile",
    },
    detailGithub: {
      EDU: "repos",
      XP: "contributions per year",
      EMP: "profile",
      STK: "languages",
      CODE: "code reading",
      ACT: "calendar",
      OWN: "repos",
      OSS: "merged PRs",
    },
    proof: "See the evidence",
    levelsTitle: (name: string) => `The levels: ${name}`,
    reached: "Reached",
    next: "Next up",
    levelNo: (n: number) => `${n}/10`,
    levels: {
      EDU: [
        [10, "One of the most selective schools, or an international medal (olympiad, world final of a programming contest)."],
        [8, "A highly selective school, or a proven selection outside school: a ranking in a coding contest, a hackathon prize, a selective program."],
        [6, "A selective school."],
        [4, "Another tech school, or a hackathon or competition, unranked."],
      ],
      XP: [
        [10, "10 years or more."],
        [9, "8 or 9 years."],
        [8, "6 or 7 years."],
        [7, "5 years."],
        [6, "4 years."],
        [5, "3 years."],
        [4, "2 years."],
        [3, "1 year."],
        [2, "Under a year."],
      ],
      EMP: [
        [10, "Two years or more at an employer with a high hiring bar, and a rising path or a team led."],
        [8, "Two years or more in a demanding product team, or a company founded and run for three years."],
        [6, "A role held for two years, a year in a product startup, or a company founded and run for a year."],
        [4, "A real role or a company founded, under a year; or two internships or more."],
        [2, "A single internship, or a single role under six months."],
      ],
      STK: [
        [10, "1,000 commits in the main language, practiced for 3 years, two other language families, code pushed within 6 months."],
        [8, "500 commits, practiced for 2 years, one other language family, within 6 months."],
        [6, "200 commits, practiced for 1 year, code pushed within a year."],
        [4, "50 commits, code pushed within 2 years."],
        [2, "Public code, below these thresholds."],
      ],
      CODE: [
        [10, "Level 5 out of 5 read in the code: library-maintainer level."],
        [8, "Level 4: solid, errors handled, relevant tests."],
        [6, "Level 3: structured and maintainable."],
        [4, "Level 2: works, but rough."],
        [2, "Level 1: tutorial followed."],
      ],
      ACT: [
        [10, "48 to 52 active weeks out of the last 52."],
        [8, "40 to 47 weeks."],
        [6, "26 to 39 weeks."],
        [4, "13 to 25 weeks."],
        [2, "4 to 12 weeks."],
        [0, "0 to 3 weeks."],
      ],
      OWN: [
        [10, "A project many people use: 1,000 GitHub stars or ten outside contributors, and three releases this year."],
        [8, "A project kept alive for over a year, released, and used by others (100 GitHub stars or three outside contributors)."],
        [6, "A project kept alive for 6 months or more, and what it takes to ship: Dockerfile, CI or release."],
        [4, "A project kept alive for 6 months or more (50 commits)."],
        [2, "Repos, none kept alive over time."],
      ],
      OSS: [
        [10, "Maintaining a project with 1,000 GitHub stars, or twenty PRs merged into such projects."],
        [8, "A PR merged into a project with 1,000 GitHub stars, 100 GitHub stars on your own repos, or a repo with ten outside contributors."],
        [6, "Twenty PRs or more merged into other people's repos."],
        [4, "Five to nineteen PRs."],
        [2, "One to four PRs."],
        [0, "No PR merged into other people's repos."],
      ],
    } as Record<CriterionCode, [number, string][]>,
    declaredLevels: {
      STK: [
        [6, "Five technologies or more tied to a concrete achievement, two of them in a role from the last 2 years."],
        [4, "Two to four technologies tied to a concrete achievement."],
      ],
      OWN: [
        [6, "Three dated and quantified outcomes (launch, migration, usage)."],
        [4, "A company founded, or one dated and quantified outcome."],
      ],
    } as Partial<Record<CriterionCode, [number, string][]>>,
    levelNotes: {
      EDU: "No tech school, no school score: the criterion leaves the average, and being self-taught costs nothing. French schools first for now: a school not on the list stops at 6/10. A school never lowers the rating.",
      XP: "Counted role by role: internships and apprenticeships at half, student clubs and volunteering at zero, overlapping roles once. Without LinkedIn: estimated from active years on GitHub, capped at 8.",
      EMP: "Read on LinkedIn or the résumé only.",
      STK: "Read in public code. With no GitHub on file, it is read on LinkedIn and the table stops at 6.",
      CODE: "Three repos read: twice their average level. 9 and 10 need tests in half the active repos; 7 and up, a repo with 20 commits.",
      ACT: "8 and 10 need a public repo with 20 commits.",
      OWN: "Read on LinkedIn and on GitHub alike: the most favorable reading is kept.",
      OSS: "Never lowers the rating: most good devs have no open source.",
    } as Record<CriterionCode, string>,
    shared: {
      school: "School kept for the person on file.",
      xpNone: "No month counted on the dated roles.",
      hidden: "School, employer names and points to confirm are kept for the person on file.",
    },
    school: {
      counted: "It counts toward the rating, no number shown.",
      out: "A school never lowers the rating.",
    },
    final: {
      title: "The sheet's rating",
      caseTitle: "The sheet's rating",
      how: "Weighted average of the scored criteria, × 10.",
      term: (name: string, score: number, coef: string) => `${name} ${score} × ${coef}`,
      termCounted: (name: string, coef: string) => `${name} (counted) × ${coef}`,
      formula: (terms: string, den: string) => `(${terms}) ÷ ${den}`,
      result: (mean: string) => `= ${mean} out of 10`,
      out: {
        unproven: "Not proven, left out of the average",
        missing: "Not on file, left out of the average",
        below: "Below the others' average, left out",
      },
      outList: (label: string, names: string) => `${label}: ${names}.`,
      belowWhy: "Open source never lowers the rating.",
      schoolOut: (name: string) => `Not averaged: ${name}. A school never lowers the rating.`,
      capped: "No code proven: the rating cannot go above 85. The sixth star has to be proven.",
      cappedHit: (raw: number) => `No code proven: the math gives ${raw}, the rating stops at 85.`,
      empty: "Empty sheet: under a quarter of the weights are scored. Floor rating: 20, one star.",
      emptyWhy: "Not proven does not mean bad: the day the code goes public, the criteria open up.",
      score: (n: number) => `${n}`,
      outOf: "out of 100",
      caseUnproven: (src: string, opens: string) =>
        `Code not proven: your public GitHub shows nothing to judge yet. The file's rating rests on your ${src}, capped at 85. What would change it: one real public project on GitHub${opens ? `, which opens ${opens}` : ""}.`,
      caseUnprovenThem: (src: string, opens: string) =>
        `Code not proven: their public GitHub shows nothing to judge yet. The file's rating rests on their ${src}, capped at 85. What would change it: one real public project on GitHub${opens ? `, which opens ${opens}` : ""}.`,
      opensList: (names: string[]) => names.map((n) => n.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1"),
    },
    compare: {
      keptFrom: {
        linkedin: "read on LinkedIn",
        cv: "read on the résumé",
        github: "read on GitHub",
        both: "read on both sources",
      },
      none: "n/a",
    },
  },
  denounce: {
    title: "Turn in an accomplice",
    intro: "We draw up their rap sheet, you send it to them.",
    label: "Accomplice's name or GitHub username",
    placeholder: "Their name or username",
    labelBoth: "Accomplice's name, GitHub username or LinkedIn link",
    placeholderBoth: "Their name, username or a link",
    invalidBoth: "Pick someone from the list, or paste a LinkedIn link or a GitHub username.",
    githubOnly: "For now, GitHub username only.",
    btn: "Turn in",
    suggest: "Your accomplices on GitHub",
    pending: "Interrogation under way…",
    self: "That's your own sheet. Turn in someone else.",
    invalid: "Pick someone from the list, or type their GitHub username.",
    inSights: "is in the crosshairs",
    charge: (status) => `Charge: ${status}`,
    send: (who) => `Send to ${who}`,
    sendText: (who, stars, tag) => `${who}, Azerit drew up your dev rap sheet: ${stars ? `${stars}, ` : ""}${tag}. That's you? Take it back:`,
    sendCopied: (who) => `Message copied: send it to ${who}.`,
    see: "See their sheet",
    copyLink: "Copy link",
    linkCopied: "Link copied.",
    again: "Turn in someone else",
    isYou: "Is this you?",
    lawyer: "That's me, claim my sheet",
    lawyerShort: "That's me",
    lawyerHint: "GitHub sign-in: we read your public username, nothing else.",
    lawyerLinkedin: "That's me: make it myself",
    lawyerLinkedinHint: "Take it back: redo it from your LinkedIn in one minute. The new sheet is yours to share or delete.",
    notMe: "Not me: get mine",
    andYou: "Your turn",
    mine: "My sheet",
    versus: (me, them, verdict) => `${me}/100 vs ${them}/100: ${verdict}`,
    starsAhead: (n) => (n === 1 ? "one star ahead" : `${n} stars ahead`),
    starsBehind: (n) => (n === 1 ? "one star behind" : `${n} stars behind`),
    pointsAhead: (n) => (n === 1 ? "1 point ahead" : `${n} points ahead`),
    pointsBehind: (n) => (n === 1 ? "1 point behind" : `${n} points behind`),
    tie: "dead heat",
    sendScore: "Send them my rating",
    duelFrom: (who) => `You came from ${who}'s sheet`,
    duelText: (me, them, verdict, who, rel) => `${me}/100 vs ${them}/100: ${verdict}${rel === "ahead" ? " of" : rel === "tie" ? " with" : ""} ${who}. Azerit's verdict:`,
    scoreCopied: "Rating copied: paste it into your message.",
  },
  jury: {
    title: "Guilty or cleared?",
    titleCharge: (charge) => `Guilty of “${charge}”?`,
    guilty: "Guilty",
    cleared: "Cleared",
    tally: (pct, n) => `${pct}% guilty (${n}\u00a0${n === 1 ? "vote" : "votes"})`,
    owner: (tally) => `Jury: ${tally}`,
    ownerNone: "Jury: your network votes guilty or cleared once you share.",
    failed: "Vote not counted. Try again.",
    judged: (who) => `You judged ${who}.`,
    turn: "Your turn",
  },
  bands: BANDS_TEXT.en,
  primes: PRIMES_TEXT.en,
  pages: PAGES_TEXT.en,
  errors: {
    title: "No sheet this time",
    retry: "Try again",
    timeout: "It's taking too long. We'd rather stop than make things up. Try again.",
    generic: "Something broke on our side.",
    closed: "The station is closed for the day. Come back tomorrow.",
  },
  footer: {
    privacy: "Privacy",
    credits3d: "Credits",
  },
  chrome: {
    home: "Azerit, home",
    nav: "Site",
    bands: "Crews",
    mine: "My sheet",
    primes: "Bounties",
    rules: "Rules",
    credits: "Credits",
    seePrimes: "See the bounties",
    sign: "Azerit hires devs on evidence: experience first, code as proof.",
  },
  privacy: {
    title: "Privacy",
  },
  removal: {
    link: "On this sheet and didn't make it? Ask us to take it down",
    linkShort: "Is this you? Ask us to take it down",
    label: "Your email, so we can get back to you",
    placeholder: "you@email.com",
    send: "Send",
    invalid: "That email doesn't look valid.",
    fallback: "Write to us with the link to this sheet, we remove it after checking:",
  },
  notFound: { title: "Page not found" },
  crash: { title: "The page didn't load", text: "The network may have dropped, or the site was just updated.", reload: "Reload" },
};

export const DICTS: Record<Lang, Dict> = { fr, en };

const STORAGE_KEY = "tys_lang";

const asLang = (v: string | null | undefined): Lang | null => (v === "fr" || v === "en" ? v : null);

/** Ce que la page sait au démarrage pour choisir sa langue. */
export interface LangFacts {
  /** `?lang=` de l'adresse. */
  query: string | null;
  /** Le choix enregistré dans ce navigateur (FR/EN touché, ou un `?lang=` déjà venu). */
  stored: string | null;
  path: string;
  /** Sur la page d'une fiche servie par le serveur : la langue de la fiche. */
  card: string | null;
  /** `navigator.language`. */
  nav: string;
}

/**
 * La langue du site (§18.52) : `?lang=` d'abord, puis le choix enregistré, puis
 * l'adresse de la vie privée (une par langue), puis sur une fiche la langue de la
 * fiche, puis le navigateur. Un dev au téléphone en anglais qui arrive d'un post
 * en français lit la fiche en français.
 */
export function chooseLang(f: LangFacts): Lang {
  const q = asLang(f.query);
  if (q) return q;
  const s = asLang(f.stored);
  if (s) return s;
  if (f.path.startsWith("/privacy")) return "en";
  if (f.path.startsWith("/confidentialite")) return "fr";
  const c = asLang(f.card);
  if (c) return c;
  return f.nav.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/**
 * La langue de la fiche, écrite par le serveur dans `<html lang>` quand il sert
 * `/c/<id>` d'une fiche qu'il connaît : son image d'aperçu porte alors l'adresse
 * `/og/<id>.png`. Sans elle (fiche inconnue, page servie sans le serveur), rien :
 * la balise ne dit que la langue de la requête.
 */
export function cardLangOf(doc: Pick<Document, "documentElement" | "querySelector">, path: string): string | null {
  const id = /^\/c\/([A-Za-z0-9_-]+)\/?$/.exec(path)?.[1];
  if (!id) return null;
  const image = doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? "";
  if (!image.includes(`/og/${id}.png`)) return null;
  return doc.documentElement.getAttribute("lang");
}

function initialLang(): Lang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible */
  }
  const loc = typeof window !== "undefined" ? window.location : undefined;
  const query = new URLSearchParams(loc?.search ?? "").get("lang");
  const path = loc?.pathname ?? "";
  const card = typeof document !== "undefined" ? cardLangOf(document, path) : null;
  const lang = chooseLang({ query, stored, path, card, nav: typeof navigator !== "undefined" ? navigator.language : "fr" });
  // Un `?lang=` vaut un choix : il est retenu pour la suite de la visite et les suivantes.
  if (asLang(query)) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* stockage bloqué : l'adresse le garde, le routeur recopie la requête */
    }
  }
  return lang;
}

interface LangCtx {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* rien */
    }
    // Le choix touché passe avant le `?lang=` de l'adresse : il quitte l'adresse, un rechargement le garde.
    const params = new URLSearchParams(window.location.search);
    if (params.has("lang")) {
      params.delete("lang");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  return createElement(Ctx.Provider, { value }, children);
}

export function useT(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT hors de LangProvider");
  return v;
}

/** Choisit la langue d'un fait venu de l'API. */
export function pick(f: { fr: string; en: string } | undefined | null, lang: Lang): string {
  if (!f) return "";
  return f[lang] || f.fr || f.en;
}
