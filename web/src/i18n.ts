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
    /** Dossier scellé (shared/publicView.ts) : le titre de l'onglet ne dit pas la note. */
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
      on: (n: number, day: string) => `Saison ${n} : jusqu'au ${day}`,
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
    loginLabel: "Pseudo GitHub ou URL du profil",
    loginPlaceholder: "ton-pseudo",
    /** Les deux portes, quand le serveur lit LinkedIn (§18.24) : LinkedIn d'abord. */
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Lien de ton profil LinkedIn",
    linkedinPlaceholder: "ton-profil",
    /** Sous le champ, tant qu'il n'y a pas d'erreur : ce que chaque porte sait lire. */
    linkedinHint: "Profil public seulement.",
    githubHint: "Repos publics seulement.",
    errLinkedin: "Colle le lien de ton profil LinkedIn, ou ce qui suit linkedin.com/in/.",
    linkedinWhere: "Où est mon lien ?",
    linkedinHelp: "Dans l'app LinkedIn : ton profil, ⋯, puis copie le lien.",
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
    inlineCv: "ou avec ton CV",
    exampleLabel: "Exemple de fiche",
    exampleCaption: "La vraie fiche de Jacques, fondateur d'Azerit",
    /* La couverture (§18.31) : les plaques des photos d'identité, en capitales mono. */
    cover: {
      player: (login: string, rank: number) => `@${login}, n° ${rank} de la semaine`,
      playerPlate: (rank: number, week: number) => `N° ${rank} · SEMAINE ${week}`,
      founderPlate: "FONDATEUR D'AZERIT",
      free: "Ta place",
      freeLabel: "Ta place : fais ta fiche",
      freePlate: "TA FICHE ICI",
      /** Un portrait peint : le rôle, jamais un genre, un âge ou une origine. */
      suspect: (profile: string) => `Portrait peint du profil ${profile}`,
      /** La case « Ta place », quand une fiche est en mémoire : sa vignette. */
      mine: "Ta fiche",
      mineLabel: (overall: number) => `Ta fiche, ${overall}/100 : la revoir`,
    },
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
    },
    /* Mur des 13 profils (§18.28) */
    wall: {
      title: "Quel profil es-tu ?",
      you: "Et toi ?",
      cta: "Découvre ton profil",
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
    },
    errLogin: "Ce pseudo ne ressemble pas à un pseudo GitHub.",
    errEmptyLogin: "Donne-nous un pseudo GitHub (ou une URL de profil).",
    errEmptyCv: "Dépose un CV au format PDF.",
    errNotPdf: "Ce fichier n'est pas un PDF.",
    errTooLarge: (mb: string) => `Fichier de ${mb} Mo : la limite est 5 Mo. Un CV, pas une thèse.`,
    errTooManyPages: (n: number) => `${n}\u00a0pages\u00a0: la limite est 10. Un CV tient en une ou deux.`,
    errNetwork: "Le serveur ne répond pas. Réessaie dans un instant.",
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
    title: "Un dossier s'ouvre. Le tien.",
    /** L'enquête en direct (§18.26) : le numéro de la trouvaille versée au dossier. */
    piece: (n: number) => `Pièce ${String(n).padStart(2, "0")}`,
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
      recruiter: () => "Une lecture pressée prend 30 secondes. Ici, on lit tout.",
      /** Émis quand les deux sources se rejoignent (pipeline.ts, comparaison LinkedIn ou CV avec GitHub). */
      compare: () => "Les deux sources au même dossier\u00a0: parcours et code, critère par critère…",
      profile: () => "Profil trouvé. Il existe, c'est un début.",
      linkedin_wait: () => "Lecture du profil LinkedIn public…",
      linkedin: () => "LinkedIn retrouvé. On recompte tes années, poste par poste.",
      repos: (n?: number) => `${n ?? "Quelques"} repos publics repérés, forks exclus…`,
      calendar: () => "Lecture du calendrier de contributions sur 52 semaines…",
      commits: (n?: number) => `Lecture de ${n ?? 100} messages de commit…`,
      code: () => "L'IA lit ton code. Elle ne note pas. Elle prend des notes.",
      cv: () => "Lecture du PDF, en mémoire. Il sera oublié juste après.",
      pdf: () => "Extraction du texte du PDF…",
      scoring: () => "Huit critères, une note sur 10 chacun. Aucune IA ne touche aux chiffres.",
      statuses: () => "Choix des statuts dans la liste fermée…",
      render: () => "Impression de la fiche…",
      start: () => "On réunit les premières pièces…",
    } as Record<string, (n?: number) => string>,
    fillers: [
      "La grille est écrite en dur dans un fichier JSON. Pas de favoritisme.",
      "On ignore tes forks. Tout le monde a forké un tutoriel.",
      "Recherche d'un commit « final final v2 »…",
      "Calcul de la fiabilité. Jamais 100 %, personne ne l'est.",
      "On ne lit pas tes repos privés. Promis.",
      "Calibrage du tampon…",
      "Vérification que node_modules n'est pas commité…",
      "Un stage compte pour moitié. Une asso étudiante, pour zéro.",
      "Sans école de tech, pas de note d'école. Ça ne coûte rien.",
      "Un GitHub vide n'est pas un mauvais code.",
    ],
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
    revealed: (level: string, overall: number) => `Fiche ${level}, ${overall}/100.`,
    revealedSealed: "Dossier scellé\u00a0: le code reste à prouver.",
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
    noted: "Pari noté. Verdict après la poursuite.",
    pleaded: "Tu plaidais",
    verdict: "Verdict :",
    gap: { over: "Excès de confiance", exact: "Lucide", under: "Trop modeste" },
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
    PM: "Product",
    DESIGN: "Design",
    CTO: "CTO",
  } satisfies Record<Position, string>,
  result: {
    makeYours: "Fais la tienne",
    /** Sous la fiche vue par un visiteur (§18.48) : ce qu'il regarde, en une phrase ; puis, sans fiche à soi, ce que coûte la sienne. */
    lead: (who: string) => `Azerit a dressé la fiche de dev de ${who} comme en recrutement : l'expérience d'abord, le code en preuve.`,
    leadYours: "La tienne prend une minute, sans compte.",
    yourTurn: "Sur ces huit critères, tu vaux combien d'étoiles\u00a0? Ton LinkedIn ou ton GitHub suffit.",
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
      copy: "Copier le lien",
      download: "Télécharger l'image",
      /** La même image en 9:16, pour Instagram et TikTok : une action discrète sous les boutons. */
      story: "Image pour story",
      native: "Partager",
      /** La ligne d'aide sous le bouton LinkedIn, en permanence : vraie avant comme après l'appui. */
      linkedinCopied: "Ton texte part dans le presse-papiers : colle-le dans ton post LinkedIn.",
      /** La confirmation, après l'appui, là où la ligne d'aide n'a pas sa place (barre du pouce) : la même partout. */
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
      /** La durée de vie du lien, dite là où on le partage (§18.48). */
      keep: "Ton lien reste en ligne 90 jours.",
      imageAlt: "Ta fiche",
      /** Les morceaux du texte de partage, assemblés et raccourcis par lib/shareText.ts (§18.27). */
      words: {
        plea: (pleaded: string, verdict: string) => `Je plaidais ${pleaded}. Verdict : ${verdict}.`,
        sheet: (stars: string, overall: number) => `Fiche ${stars}, ${overall}/100`,
        /** Après la ligne du pari : le verdict porte déjà les étoiles. */
        score: (overall: number) => `Note : ${overall}/100`,
        /** Fiche notée par la grille (§18.37) : ce qu'est la note, dès la première ligne. `stars` null après le pari. */
        file: (stars: string | null, overall: number) => `Ma fiche de dev, passée à la grille de recrutement d'Azerit\u00a0: ${stars ? `${stars}, ` : ""}${overall}/100`,
        /** Dans la première ligne, après la note : « , profil « Machine à livrer » ». */
        profile: (label: string) => `profil « ${label} »`,
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
      top5: "Top 5 de la semaine : défends ta place jusqu'à dimanche",
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
      /** « Aussi au dossier » : à ne pas confondre avec les pièces qui justifient une note. */
      title: "Aussi au dossier",
      proof: "Preuve",
    },
    /* « Le reste » sous la fiche (§18.27) : une ligne repliée par bloc. */
    rest: {
      why: "Pourquoi cette note",
      photo: "Ma photo LinkedIn",
      email: "Recevoir ma fiche par email",
      contest: "Contester",
    },
    why: {
      overallLine: "Note globale = TEC 30 %, SHIP 20 %, ARCH 20 %, DOC 15 %, XP 15 %.",
      /** Fiche notée par la grille de recrutement (§18.37) : la note vient des huit critères, pas des barres. */
      gridLine: "La note est la moyenne pondérée des huit critères de la grille, détaillés sur cette page. Les six barres de la fiche sont ses traits : elles font le portrait, pas la note.",
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
      /** `trait` : le nom du trait en clair (« Communication »), jamais son code. */
      lowest: (trait: string, v: number) => `Indice : ton trait le plus bas est ${trait}, à ${v}/100. Un commit vaut mieux qu'un recours.`,
    },
    addCv: {
      title: "Ajoute ton CV au dossier",
      text: "Ton GitHub porte le code. Ton CV porte le parcours\u00a0: école, expérience et employeurs entrent au dossier.",
      btn: "Ajouter mon CV",
    },
    addGithub: { title: "Ajoute ton GitHub au dossier", text: "Ton CV porte le parcours. Ton GitHub porte le code\u00a0: trois critères s'ouvrent.", btn: "Ajouter mon GitHub" },
    /** Fiche LinkedIn seule (§18.24) : un seul appel, relancé en comparaison. */
    prove: { title: "Ajoute ton GitHub\u00a0: trois critères s'ouvrent", label: "Pseudo GitHub", btn: "Ajouter à ma fiche" },
    /** Sous une fiche GitHub seule, en miroir : LinkedIn porte le parcours. */
    addLinkedin: {
      title: "Ajoute ton LinkedIn au dossier",
      text: "Ton GitHub porte le code. Ton LinkedIn porte le parcours\u00a0: expérience, employeurs et école entrent au dossier.",
      label: "Lien de ton profil LinkedIn",
      btn: "Ajouter à ma fiche",
    },
    claim: {
      /** Pour qui vient de faire sa fiche : le bénéfice d'abord (§18.48). */
      kicker: "Verrouille ta fiche",
      kickerLawyer: "Avis de recherche à ton nom ?",
      text: "Prouve que ce compte GitHub est le tien : tu peux alors masquer ta fiche, la supprimer et entrer dans la course aux primes. On lit ton pseudo public, rien d'autre, et on ne garde aucun accès.",
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
      btn: "Recevoir",
      sending: "Envoi…",
      /** Vrai que l'email parte ou non : ce que l'adresse change à coup sûr. */
      done: "C'est noté. Ta fiche est gardée au-delà de 90 jours.",
      invalid: "Cette adresse ne ressemble pas à un email.",
      error: "L'envoi a échoué. Réessaie plus tard.",
      note: "Facultatif. Ta fiche est alors conservée au-delà de 90 jours.",
    },
    /* le bloc recruteur, en fin de page : on vouvoie qui recrute */
    cta: { title: "Vous recrutez ?", text: "Azerit vous présente des devs lus comme ici : l'expérience d'abord, le code en preuve.", link: "azerit.tech" },
    del: {
      link: "Supprimer ma fiche",
      confirm: "Supprimer définitivement ?",
      yes: "Oui, supprimer",
      no: "Annuler",
      done: "Fiche supprimée. Elle n'existe plus, ni son image.",
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
    pendingLine: (names: string) => `Pas encore au dossier : ${names}.`,
    hint: "Touche un critère\u00a0: sa preuve s'affiche.",
    tile: (name: string, n: number) => `${name}\u00a0: ${n} sur 10`,
    tileNone: (name: string) => `${name}\u00a0: pas encore de note`,
    tileKept: (name: string) => `${name}\u00a0: gardée pour la personne`,
    /** Un dossier à deux sources (§18.36) : la tuile dit où la note a été lue, « Expérience : 7 sur 10, lu sur LinkedIn ». */
    tileFrom: (name: string, n: number, from: string) => `${name}\u00a0: ${n} sur 10, ${from}`,
    /** La provenance sous le nom de la tuile, quand les deux sources ont parlé : « LinkedIn et GitHub ». */
    fromBoth: (src: string) => `${src} et GitHub`,
    /** La place d'une note absente : jamais un tiret long. */
    none: "n. c.",
    short: { XP: "Expérience", EMP: "Parcours", STK: "Stack", CODE: "Code", OWN: "Ownership", ACT: "Activité", EDU: "École", OSS: "Open source" } as Record<CriterionCode, string>,
  },
  grid: {
    title: "Voici comment Azerit te lit",
    /** Le détail replié sous les tuiles, pour tout le monde (§18.48). */
    fold: "Le détail, critère par critère",
    titleThem: (who: string) => `Voici comment Azerit lit ${who}`,
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
      EDU: "Sans école de tech, pas de note d'école : le critère sort de la moyenne, et apprendre en autodidacte ne coûte rien. Liste française d'abord\u00a0: une école absente s'arrête à B pour l'instant. Une école ne fait jamais baisser la note.",
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
    final: {
      title: "La note sur 100",
      caseTitle: "La note du dossier",
      how: "Moyenne pondérée des critères notés, × 10.",
      /** « (Code 7 × 2 + Stack 6 × 1,5) ÷ 3,5 » : chaque note sur 10 et son coefficient. */
      term: (name: string, score: number, coef: string) => `${name} ${score} × ${coef}`,
      formula: (terms: string, den: string) => `(${terms}) ÷ ${den}`,
      result: (mean: string) => `= ${mean} sur 10`,
      out: {
        unproven: "Non prouvé, hors moyenne",
        missing: "Non renseigné, hors moyenne",
        below: "Sous la moyenne des autres, hors moyenne",
      },
      outList: (label: string, names: string) => `${label} : ${names}.`,
      belowWhy: "L'école et l'open source ne font jamais baisser la note.",
      capped: "Aucun code prouvé : la note ne peut pas dépasser 85. La sixième étoile se prouve.",
      cappedHit: (raw: number) => `Aucun code prouvé : le calcul donne ${raw}, la note s'arrête à 85.`,
      empty: "Dossier vide : moins d'un quart des coefficients sont notés. Note plancher : 20, une étoile.",
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
    intro: "Donne son pseudo GitHub : on dresse sa fiche, tu la lui envoies. La personne peut la reprendre ou la supprimer.",
    label: "Pseudo GitHub du complice",
    placeholder: "pseudo",
    btn: "Dénoncer",
    suggest: "Tes complices sur GitHub",
    pending: (login: string) => `Interrogatoire de @${login}…`,
    self: "C'est ta propre fiche. Dénonce quelqu'un d'autre.",
    invalid: "Ce pseudo GitHub n'a pas l'air valide.",
    inSights: "est dans le viseur",
    charge: (status: string) => `Chef d'accusation : ${status}`,
    shareText: (who: string, stars: string, tag: string, status: string | null, url: string) =>
      `${who} est dans le viseur${stars ? ` ${stars}` : ""}, ${tag}.${status ? ` Chef d'accusation : ${status}.` : ""} Droit de faire appel : ${url}`,
    native: "Partager",
    x: "Poster sur X",
    linkedin: "Partager sur LinkedIn",
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    see: "Voir sa fiche",
    again: "Dénoncer quelqu'un d'autre",
    /* à l'arrivée de la cible */
    banner: "Avis de recherche à ton nom",
    by: (login: string) => `Dénonciation : @${login}`,
    anonymous: "Dénonciation anonyme",
    lawyer: "C'est moi, je reprends ma fiche",
    andYou: "À ton tour",
    mine: "Ma fiche",
    versus: (me: number, who: string, them: number, verdict: string) => `Toi ${me}/100, ${who} ${them}/100 : ${verdict}`,
    starsAhead: (n: number) => (n === 1 ? "une étoile d'avance" : `${n} étoiles d'avance`),
    starsBehind: (n: number) => (n === 1 ? "une étoile de retard" : `${n} étoiles de retard`),
    pointsAhead: (n: number) => (n === 1 ? "1 point d'avance" : `${n} points d'avance`),
    pointsBehind: (n: number) => (n === 1 ? "1 point de retard" : `${n} points de retard`),
    tie: "à égalité",
    /* le duel s'envoie : le score, puis le lien de sa propre fiche */
    sendScore: "Lui envoyer le score",
    duelText: (me: number, them: number, verdict: string, who: string, rel: "ahead" | "behind" | "tie") =>
      `${me}/100 contre ${them}/100 : ${verdict} ${rel === "tie" ? "avec" : "sur"} ${who}. Verdict d'Azerit :`,
    scoreCopied: "Score copié : colle-le dans ton message.",
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
    closed: "Le commissariat est fermé pour ce soir. Reviens demain.",
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
  },
  privacy: {
    title: "Vie privée",
  },
  /** Fiche sans pseudo GitHub vue par un tiers (LinkedIn, CV) : la personne fichée demande son retrait. */
  removal: {
    link: "Ce n'est pas toi qui as fait cette fiche ? Demander son retrait",
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
      on: (n, day) => `Season ${n} runs until ${day}`,
      over: (n) => `Season ${n} is over`,
    },
    titleClaim: heroSentence(HOME_PROMISE.en.claim),
    titleProof: heroSentence(HOME_PROMISE.en.proof),
    hookPrimes: "The top of the board lands an interview.",
    hookPlay: "One to six stars, in one minute. No account.",
    tabGithub: "Your GitHub",
    tabDoors: "LinkedIn or GitHub",
    loginLabel: "GitHub username or profile URL",
    loginPlaceholder: "your-username",
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Your LinkedIn profile link",
    linkedinPlaceholder: "your-profile",
    linkedinHint: "Public profile only.",
    githubHint: "Public repos only.",
    errLinkedin: "Paste your LinkedIn profile link, or what follows linkedin.com/in/.",
    linkedinWhere: "Where's my link?",
    linkedinHelp: "In the LinkedIn app: your profile, ⋯, then copy the link.",
    errLinkedinOff: "LinkedIn isn't answering right now. Use your GitHub or your CV, or try again in a moment.",
    errLinkedinCv: "With a CV, give your GitHub username.",
    submit: "Get my rap sheet",
    submitBoth: "Get my rap sheet from both",
    submitting: "Opening your file…",
    bothLink: "or both, in one file",
    bothActive: "Two sources on file: your CV and your GitHub",
    bothBack: "just one source",
    dropTitle: "Drop your CV here",
    dropPick: "Pick your CV as a PDF",
    dropOr: "or",
    dropBrowse: "pick a PDF",
    dropHint: "5 MB, 10 pages max",
    sizeUnits: { mb: "MB", kb: "KB" },
    dropRemove: "Remove file",
    reassure: "Your CV is read in memory, then thrown away.",
    dropAnywhere: "Let go of your CV, we'll take it from here",
    inlineCv: "or with your CV",
    exampleLabel: "Example sheet",
    exampleCaption: "The actual rap sheet of Jacques, founder of Azerit",
    cover: {
      player: (login, rank) => `@${login}, #${rank} this week`,
      playerPlate: (rank, week) => `NO. ${rank} · WEEK ${week}`,
      founderPlate: "AZERIT FOUNDER",
      free: "Your spot",
      freeLabel: "Your spot: get your rap sheet",
      freePlate: "YOUR SHEET HERE",
      suspect: (profile) => `Painted portrait of the ${profile} profile`,
      mine: "Your sheet",
      mineLabel: (overall) => `Your sheet, ${overall}/100: see it again`,
    },
    next: "See more",
    lastTitle: "Your turn.",
    bandsLead: "Get your rap sheet. Make your crew win.",
    back: {
      mine: "Your sheet:",
      mineGo: "See it again",
      pending: "Your file is still opening.",
      pendingGo: "Go back to it",
    },
    wall: {
      title: "Which profile are you?",
      you: "And you?",
      cta: "Find your profile",
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
    },
    errLogin: "That doesn't look like a GitHub username.",
    errEmptyLogin: "Give us a GitHub username (or profile URL).",
    errEmptyCv: "Drop a CV as a PDF.",
    errNotPdf: "That file isn't a PDF.",
    errTooLarge: (mb) => `${mb} MB file: the limit is 5 MB. A CV, not a thesis.`,
    errTooManyPages: (n) => `${n} pages: the limit is 10. A CV fits on one or two.`,
    errNetwork: "The server isn't answering. Try again in a moment.",
  },
  stats: {
    TEC: { name: "Technique", what: "How deep the written or described work goes." },
    SHIP: { name: "Shipping", what: "Real consistency, week after week." },
    ARCH: { name: "Rigor", what: "Tests, CI, tooling." },
    DOC: { name: "Communication", what: "READMEs, commit messages, CV clarity." },
    XP: { name: "Experience", what: "Real or claimed seniority." },
    BUZZ: { name: "Buzzwords", what: "Hot-air density. Doesn't count toward the rating." },
  },
  tierCard: (level) => `${level} sheet`,
  waiting: {
    title: "A file just opened. Yours.",
    piece: (n) => `Exhibit ${String(n).padStart(2, "0")}`,
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
      recruiter: () => "A rushed read takes 30 seconds. We read everything.",
      compare: () => "Both sources in one file: career and code, criterion by criterion…",
      profile: () => "Profile found. It exists, that's a start.",
      linkedin_wait: () => "Reading the public LinkedIn profile…",
      linkedin: () => "LinkedIn found. Recounting your years, role by role.",
      repos: (n) => `${n ?? "A few"} public repos spotted, forks excluded…`,
      calendar: () => "Reading 52 weeks of contribution calendar…",
      commits: (n) => `Reading ${n ?? 100} commit messages…`,
      code: () => "The AI is reading your code. It doesn't score. It takes notes.",
      cv: () => "Reading the PDF, in memory. It'll be forgotten right after.",
      pdf: () => "Extracting text from the PDF…",
      scoring: () => "Eight criteria, one score out of 10 each. No AI touches the numbers.",
      statuses: () => "Picking statuses from the closed list…",
      render: () => "Printing the sheet…",
      start: () => "Gathering the first exhibits…",
    },
    fillers: [
      "The scorecard is hard-coded in a JSON file. No favoritism.",
      "Ignoring your forks. Everyone forked a tutorial once.",
      "Looking for a “final final v2” commit…",
      "Computing reliability. Never 100%, nobody is.",
      "We don't read your private repos. Promise.",
      "Calibrating the stamp…",
      "Checking node_modules isn't committed…",
      "An internship counts for half. A student club, for zero.",
      "No tech school, no school score. It costs nothing.",
      "An empty GitHub is not bad code.",
    ],
  },
  reveal: {
    packTitle: "FILE",
    open: "Start the chase",
    skip: "Skip",
    mute: "Mute",
    unmute: "Unmute",
    replay: "Replay my chase",
    watch: "Watch the chase",
    revealed: (level, overall) => `${level} sheet, rated ${overall}/100.`,
    revealedSealed: "Sealed file: code still unproven.",
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
      leagueCv: "CV",
      leagueBoth: "CV · GitHub",
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
    noted: "Bet placed. Verdict after the chase.",
    pleaded: "You pleaded",
    verdict: "Verdict:",
    gap: { over: "Overconfidence", exact: "Clear-eyed", under: "Too modest" },
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
    makeYours: "Get yours",
    lead: (who) => `Azerit drew up ${who}'s dev rap sheet the way a recruiter would: experience first, code as proof.`,
    leadYours: "Yours takes one minute, no account.",
    yourTurn: "On these eight criteria, how many stars are you? Your LinkedIn or your GitHub is all it takes.",
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
      copy: "Copy link",
      download: "Download image",
      story: "Story image",
      native: "Share",
      linkedinCopied: "Your text goes to the clipboard: paste it into your LinkedIn post.",
      copiedShort: "Text copied: paste it into your LinkedIn post.",
      copiedLink: "Link copied.",
      downloadDemo: "Image unavailable in demo mode (rendered by the server).",
      holdToSave: "Press and hold to save",
      holdLink: "Press and hold to copy your link.",
      holdText: "Press and hold to copy your text, then paste it into your LinkedIn post.",
      holdMessage: "Press and hold to copy your message.",
      keep: "Your link stays up for 90 days.",
      imageAlt: "Your rap sheet",
      words: {
        plea: (pleaded, verdict) => `I pleaded ${pleaded}. Verdict: ${verdict}.`,
        sheet: (stars, overall) => `${stars} rap sheet, ${overall}/100`,
        score: (overall) => `Rating: ${overall}/100`,
        file: (stars, overall) => `My dev rap sheet, run through Azerit's hiring scorecard: ${stars ? `${stars}, ` : ""}${overall}/100`,
        profile: (label) => `profile “${label}”`,
        charge: (status) => `Charge: “${status}”.`,
        ai: (secs) => `Rap sheet drawn up by Azerit in ${secs}s.`,
        sealed: "A rap sheet opened at Azerit, code still unproven",
        exhibits: (src) => `Two sources on file: ${src} and GitHub.`,
        cta: "Get yours:",
      },
    },
    week: {
      line: (rank, total, gap) => `#${rank}${showsTotal(total) ? ` of ${total}` : ""} this week, ${gap} ${gap === 1 ? "point" : "points"} from the top 5`,
      top5: "This week's top 5: hold your spot until Sunday",
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
      title: "Also on file",
      proof: "Evidence",
    },
    rest: {
      why: "Why this rating",
      photo: "My LinkedIn photo",
      email: "Get my sheet by email",
      contest: "Contest it",
    },
    why: {
      overallLine: "Overall = TEC 30%, SHIP 20%, ARCH 20%, DOC 15%, XP 15%.",
      gridLine: "The rating is the weighted average of the eight criteria on the scorecard, detailed on this page. The six bars on the sheet are its traits: they paint the portrait, not the rating.",
    },
    contest: {
      button: "Call my lawyer",
      again: "Call my lawyer again",
      title: "Your lawyer says",
      replies: [
        "Your lawyer read the file. They advise you to plead guilty.",
        "Your complaint has been forwarded to the relevant department: a TODO.md that doesn't exist yet.",
        "We read your code a second time. It hadn't changed in the meantime.",
        "Disputing is a skill. Sadly, it isn't on the scorecard.",
        "The court checked the scorecard. The scorecard can't be sweet-talked: it's written in JSON.",
        "Request logged. Estimated processing time: however long it takes you to add tests.",
        "The jury met. The jury is a pure function. It returned the same rating.",
      ],
      lowest: (trait, v) => `Hint: your lowest trait is ${trait}, at ${v}/100. A commit beats an appeal.`,
    },
    addCv: {
      title: "Add your CV to the file",
      text: "Your GitHub carries the code. Your CV carries the career: school, experience and employers go on file.",
      btn: "Add my CV",
    },
    addGithub: { title: "Add your GitHub to the file", text: "Your CV carries the career. Your GitHub carries the code: three more criteria open.", btn: "Add my GitHub" },
    prove: { title: "Add your GitHub: three more criteria open", label: "GitHub username", btn: "Add to my sheet" },
    addLinkedin: {
      title: "Add your LinkedIn to your file",
      text: "Your GitHub carries the code. Your LinkedIn carries the career: experience, employers and school go on file.",
      label: "Your LinkedIn profile link",
      btn: "Add to my sheet",
    },
    claim: {
      kicker: "Lock your rap sheet",
      kickerLawyer: "Wanted under your name?",
      text: "Prove this GitHub account is yours: you can then hide your sheet, delete it and enter the bounty race. We read your public username, nothing else, and keep no access.",
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
      btn: "Send it",
      sending: "Sending…",
      done: "Done. Your rap sheet is kept beyond 90 days.",
      invalid: "That doesn't look like an email address.",
      error: "Sending failed. Try again later.",
      note: "Optional. Your sheet is then kept beyond 90 days.",
    },
    cta: { title: "Hiring?", text: "Azerit introduces you to devs vetted this way: experience first, code as proof.", link: "azerit.tech" },
    del: {
      link: "Delete my sheet",
      confirm: "Delete for good?",
      yes: "Yes, delete",
      no: "Cancel",
      done: "Sheet deleted. It's gone, image included.",
      error: "Deletion failed.",
    },
    again: "Make another sheet",
  },
  read: {
    pending: "Not on file yet",
    pendingLine: (names: string) => `Not on file yet: ${names}.`,
    hint: "Tap a criterion to see its evidence.",
    tile: (name: string, n: number) => `${name}: ${n} out of 10`,
    tileNone: (name: string) => `${name}: no score yet`,
    tileKept: (name: string) => `${name}: kept on the person's side`,
    tileFrom: (name: string, n: number, from: string) => `${name}: ${n} out of 10, ${from}`,
    fromBoth: (src: string) => `${src} and GitHub`,
    none: "n/a",
    short: { XP: "Experience", EMP: "Career", STK: "Stack", CODE: "Code", OWN: "Ownership", ACT: "Activity", EDU: "School", OSS: "Open source" },
  },
  grid: {
    title: "How Azerit reads you",
    fold: "The detail, criterion by criterion",
    titleThem: (who: string) => `How Azerit reads ${who}`,
    method: {
      linkedin: "Your career: we go by LinkedIn.",
      cv: "Your career: we go by your CV.",
      noCareer: "Your career: not on file yet.",
      code: "Your code: we go by GitHub.",
      noCode: "Your code: not on file yet.",
      check: "We cross-check. Every score comes with its evidence.",
      piece: "Every score comes with its evidence.",
    },
    methodThem: {
      linkedin: "Their career: we go by LinkedIn.",
      cv: "Their career: we go by their CV.",
      noCareer: "Their career: not on file yet.",
      code: "Their code: we go by GitHub.",
      noCode: "Their code: not on file yet.",
      check: "We cross-check. Every score comes with its evidence.",
      piece: "Every score comes with its evidence.",
    },
    foot: "This is how Azerit reads devs for hiring teams.",
    game: "A game built on a real scorecard. Not a hiring decision: no job, no interview, public data only.",
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
      private: "kept for you",
    },
    tagsThem: {
      declared: "declared, to be confirmed",
      unproven: "unproven",
      missing: "not on file",
      estimated: "estimated",
      below: "doesn't lower the rating",
      out: "doesn't lower the rating",
      private: "kept on the person's side",
    },
    source: { linkedin: "LinkedIn", cv: "CV", github: "GitHub", both: "cross-checked" },
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
      EDU: "No tech school, no school score: the criterion leaves the average, and being self-taught costs nothing. French schools first for now: a school missing from the list stops at B. A school never lowers the rating.",
      XP: "Counted role by role: internships and work-study at half, student associations and volunteering at zero, overlapping roles once. Without LinkedIn: estimated from active years on GitHub, capped at 8.",
      EMP: "Read on LinkedIn or the CV only.",
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
    final: {
      title: "The rating out of 100",
      caseTitle: "The file's rating",
      how: "Weighted average of the scored criteria, × 10.",
      term: (name: string, score: number, coef: string) => `${name} ${score} × ${coef}`,
      formula: (terms: string, den: string) => `(${terms}) ÷ ${den}`,
      result: (mean: string) => `= ${mean} out of 10`,
      out: {
        unproven: "Not proven, left out of the average",
        missing: "Not on file, left out of the average",
        below: "Below the others' average, left out",
      },
      outList: (label: string, names: string) => `${label}: ${names}.`,
      belowWhy: "School and open source never lower the rating.",
      capped: "No code proven: the rating cannot go above 85. The sixth star has to be proven.",
      cappedHit: (raw: number) => `No code proven: the math gives ${raw}, the rating stops at 85.`,
      empty: "Empty file: under a quarter of the weights are scored. Floor rating: 20, one star.",
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
        cv: "read on the CV",
        github: "read on GitHub",
        both: "read on both sources",
      },
      none: "n/a",
    },
  },
  denounce: {
    title: "Turn in an accomplice",
    intro: "Give us their GitHub username: we draw up their rap sheet, you send it to them. They can claim it or delete it.",
    label: "Accomplice's GitHub username",
    placeholder: "username",
    btn: "Turn in",
    suggest: "Your accomplices on GitHub",
    pending: (login) => `Interrogating @${login}…`,
    self: "That's your own sheet. Turn in someone else.",
    invalid: "That doesn't look like a GitHub username.",
    inSights: "is in the crosshairs",
    charge: (status) => `Charge: ${status}`,
    shareText: (who, stars, tag, status, url) =>
      `${who} is in the crosshairs${stars ? ` ${stars}` : ""}, ${tag}.${status ? ` Charge: ${status}.` : ""} Right to appeal: ${url}`,
    native: "Share",
    x: "Post on X",
    linkedin: "Share on LinkedIn",
    linkedinHint: "Text copied: paste it into your LinkedIn post.",
    see: "See their sheet",
    again: "Turn in someone else",
    banner: "Wanted: you",
    by: (login) => `Tip-off: @${login}`,
    anonymous: "Anonymous tip-off",
    lawyer: "That's me, claim my sheet",
    andYou: "Your turn",
    mine: "My sheet",
    versus: (me, who, them, verdict) => `You ${me}/100, ${who} ${them}/100: ${verdict}`,
    starsAhead: (n) => (n === 1 ? "one star ahead" : `${n} stars ahead`),
    starsBehind: (n) => (n === 1 ? "one star behind" : `${n} stars behind`),
    pointsAhead: (n) => (n === 1 ? "1 point ahead" : `${n} points ahead`),
    pointsBehind: (n) => (n === 1 ? "1 point behind" : `${n} points behind`),
    tie: "dead heat",
    sendScore: "Send them the score",
    duelText: (me, them, verdict, who, rel) => `${me}/100 vs ${them}/100: ${verdict}${rel === "ahead" ? " of" : rel === "tie" ? " with" : ""} ${who}. Azerit's verdict:`,
    scoreCopied: "Score copied: paste it into your message.",
  },
  jury: {
    title: "Guilty or cleared?",
    titleCharge: (charge) => `Guilty of “${charge}”?`,
    guilty: "Guilty",
    cleared: "Cleared",
    tally: (pct, n) => `${pct}% guilty (${n}\u00a0${n === 1 ? "vote" : "votes"})`,
    owner: (tally) => `Jury: ${tally}`,
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
    closed: "The station is closed for tonight. Come back tomorrow.",
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
  },
  privacy: {
    title: "Privacy",
  },
  removal: {
    link: "Didn't make this sheet yourself? Ask for its removal",
    label: "Removing this sheet: your email, so we can reply",
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

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* stockage indisponible */
  }
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path.startsWith("/privacy")) return "en";
  if (path.startsWith("/confidentialite")) return "fr";
  const nav = typeof navigator !== "undefined" ? navigator.language : "fr";
  return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
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
