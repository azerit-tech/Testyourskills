// Toutes les chaînes du front, en français et en anglais.
// Les faits ({fr,en}) qui viennent de l'API ne passent pas par ici.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CardStyle, Lang, Position, StatCode } from "../../shared/types";
import { showsTotal } from "../../shared/week";

const fr = {
  meta: {
    title: "Testyourskills · Ton LinkedIn dit senior. Ton GitHub, on va voir.",
    titleCard: (name: string, overall: number) => `${name} · ${overall} · Testyourskills`,
  },
  common: {
    by: "par",
    langLabel: "Langue",
    skip: "Passer",
    back: "Retour",
    close: "Fermer",
    copied: "Copié",
    loading: "Chargement…",
    demo: "Mode démo · données fictives",
    skipToContent: "Aller au contenu",
  },
  home: {
    /** Fin de la saison 1 (§18.4, dates proposées) : à lire dans data/season.json quand les primes existeront. */
    season: "Saison 1 · jusqu'au 31 décembre",
    /** Le titre, deux phrases, chacune sur ses lignes. Insécables : une seule coupure possible
     * par phrase, « TON LINKEDIN / DIT SENIOR. / TON GITHUB, / ON VA VOIR. », jamais un mot seul. */
    titleClaim: "Ton\u00a0LinkedIn dit\u00a0senior.",
    /** Sans entrée LinkedIn (le serveur ne sait pas le lire). */
    titleClaimCv: "Ton\u00a0CV dit\u00a0senior.",
    titleProof: "Ton\u00a0GitHub, on\u00a0va\u00a0voir.",
    titleB: "Le haut du classement décroche un entretien.",
    tabGithub: "Ton GitHub",
    loginLabel: "Pseudo GitHub ou URL du profil",
    loginPlaceholder: "ton-pseudo",
    /** Les deux portes, quand le serveur lit LinkedIn (§18.24) : LinkedIn d'abord. */
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Lien de ton profil LinkedIn",
    linkedinPlaceholder: "ton-profil",
    errLinkedin: "Colle le lien de ton profil LinkedIn, ou ce qui suit linkedin.com/in/.",
    linkedinWhere: "Où est mon lien ?",
    linkedinHelp: "Dans l'app LinkedIn : ton profil, ⋯, puis copie le lien.",
    errLinkedinOff: "Entrée LinkedIn indisponible, tape ton pseudo GitHub.",
    errLinkedinCv: "Avec un CV, donne ton pseudo GitHub.",
    submit: "Ouvrir mon dossier",
    submitBoth: "Comparer les deux",
    submitting: "Ouverture…",
    bothLink: "ou les deux, pour voir l'écart",
    bothActive: "Mode comparaison : ton CV contre ton GitHub",
    bothBack: "une seule source",
    dropTitle: "Glisse ton CV ici",
    dropOr: "ou",
    dropBrowse: "choisis un PDF",
    dropHint: "PDF · 5 Mo · 10 pages max",
    sizeUnits: { mb: "Mo", kb: "Ko" },
    dropRemove: "Retirer le fichier",
    reassure: "Sans compte. Ton CV est lu en mémoire puis jeté.",
    dropAnywhere: "Lâche ton CV, on s'occupe du reste",
    inlineCv: "ou avec ton CV",
    exampleLabel: "Exemple de fiche",
    exampleCaption: "La vraie fiche de Jacques, fondateur d'Azerit",
    /** Sous la fiche de Jacques, ses deux notes (§18.35), lues en entier. */
    exampleScoresLabel: (linkedin: number, github: number) => `LinkedIn : ${linkedin} sur 100. GitHub : ${github} sur 100.`,
    /* La couverture (§18.31) : les plaques des photos d'identité, en capitales mono. */
    cover: {
      player: (login: string, rank: number) => `@${login}, n° ${rank} de la semaine`,
      playerPlate: (rank: number, week: number) => `N° ${rank} · SEMAINE ${week}`,
      founderPlate: "FONDATEUR D'AZERIT",
      free: "Ta place",
      freeLabel: "Ta place : ouvre ton dossier",
      freePlate: "DOSSIER À OUVRIR",
    },
    /** La flèche sous le héros, sur ordinateur. */
    next: "Voir la suite",
    /* Mur des 13 profils (§18.28) */
    wall: {
      title: "Lequel es-tu ?",
      you: "Et toi ?",
      cta: "Découvre le tien",
    },
    /* Top de la semaine (§18.22) */
    top: {
      title: "Top de la semaine",
      /* Le nombre de dossiers à partir de 20 seulement (§18.27). */
      meta: (week: number, n: number, left: string) => [`Semaine ${week}`, showsTotal(n) && `${n} dossiers`, `fin dans ${left}`].filter(Boolean).join(" · "),
      left: (d: number, h: number, m: number) => (d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`),
      cut: "Top 5",
      free: "Place libre",
      freeLabel: (rank: number) => `Place ${rank} libre : entre ton pseudo GitHub`,
      rowLabel: (rank: number, login: string, overall: number) => `Place ${rank} : @${login}, note ${overall}`,
    },
    errLogin: "Ce pseudo ne ressemble pas à un pseudo GitHub.",
    errEmptyLogin: "Donne-nous un pseudo GitHub (ou une URL de profil).",
    errEmptyCv: "Dépose un CV au format PDF.",
    errNotPdf: "Ce fichier n'est pas un PDF.",
    errTooLarge: (mb: string) => `Fichier de ${mb} Mo : la limite est 5 Mo. Un CV, pas une thèse.`,
    errTooManyPages: (n: number) => `${n} pages : la limite est 10. Les recruteurs s'arrêtent à la première.`,
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
  tiers: {
    bronze: "Petit délit",
    silver: "Haute surveillance",
    gold: "Menace publique",
    icon: "Priorité absolue",
    wonderkid: "Débarque en ville",
    flashback: "Affaire classée",
    totw: "Top 5 de la semaine",
  } satisfies Record<CardStyle, string>,
  tierCard: (level: string) => `Fiche ${level}`,
  waiting: {
    title: "Chargement du dossier",
    elapsed: "écoulé",
    /** L'enquête en direct (§18.26) : le numéro de la trouvaille versée au dossier. */
    piece: (n: number) => `Pièce ${String(n).padStart(2, "0")}`,
    /** Fiche en file d'attente : n fiches passent avant (rang dans la file). */
    queue: (n: number) => (n === 1 ? "1 dossier devant toi au commissariat" : `${n} dossiers devant toi au commissariat`),
    /** La fiche est prête, la scène 3D pas encore (§18.27). */
    scene: "La scène se charge",
    progress: {
      lazy_commits: (n?: number) => `Lecture de tes ${n ?? "nombreux"} commits « wip »…`,
      buzzwords: (n?: number) => `Comptage des buzzwords… ${n ?? 0} pour l'instant`,
      tests: () => "Recherche des tests… toujours en cours",
      readme: () => "Vérification que le README dit autre chose que « TODO »…",
      recruiter: () => "Un recruteur aurait déjà fini. On prend le temps.",
      compare: (n?: number) => `Comparaison avec ${n ? n.toLocaleString("fr-FR") : "des milliers de"} devs sourcés par Azerit…`,
      profile: () => "Profil trouvé. Il existe, c'est un début.",
      linkedin_wait: () => "Lecture du profil LinkedIn public…",
      linkedin: () => "LinkedIn retrouvé. Comparaison des déclarations…",
      repos: (n?: number) => `${n ?? "Quelques"} repos publics repérés, forks exclus…`,
      calendar: () => "Lecture du calendrier de contributions sur 52 semaines…",
      commits: (n?: number) => `Lecture de ${n ?? 100} messages de commit…`,
      code: () => "L'IA lit ton code. Elle ne note pas. Elle prend des notes.",
      cv: () => "Lecture du PDF, en mémoire. Il sera oublié juste après.",
      pdf: () => "Extraction du texte du PDF…",
      scoring: () => "Application du barème. Aucune IA ne touche aux chiffres.",
      statuses: () => "Choix des statuts dans la liste fermée…",
      render: () => "Impression de la fiche…",
      start: () => "Ouverture du dossier. Pas de café, pas de pause.",
    } as Record<string, (n?: number) => string>,
    fillers: [
      "Le barème est écrit en dur dans un fichier JSON. Pas de favoritisme.",
      "On ignore tes forks. Tout le monde a forké un tutoriel.",
      "Recherche d'un commit « final final v2 »…",
      "Calcul de la fiabilité. Jamais 100 %, personne ne l'est.",
      "On ne lit pas tes repos privés. Promis.",
      "Calibrage du tampon…",
      "Vérification que node_modules n'est pas commité…",
    ],
  },
  reveal: {
    /* titre du dossier à l'écran de la cabine, avant l'ouverture */
    packTitle: "DOSSIER",
    /* la pilule de l'attente, quand le son demande un geste pour démarrer (§18.27) */
    open: "Ouvrir mon dossier",
    skip: "Passer l'animation",
    mute: "Couper le son",
    unmute: "Activer le son",
    opening: "Ouverture du dossier",
    revealed: (level: string, overall: number) => `Fiche ${level}, note ${overall}.`,
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
      { min: 67, label: "Senior (sur LinkedIn)" },
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
      leagueBoth: "GitHub × CV",
      leagueLinkedin: "LinkedIn",
      leagueBothLinkedin: "GitHub × LinkedIn",
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
    pleaded: "Tu plaidais",
    verdict: "Verdict :",
    gap: { over: "Excès de confiance", exact: "Lucide", under: "Modestie suspecte" },
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
    CTO: "CTO sur parole",
  } satisfies Record<Position, string>,
  result: {
    makeYours: "Fais la tienne",
    yourTurn: "À toi : ton pseudo suffit.",
    /* en tête d'une fiche partagée (§18.20) */
    wanted: "Avis de recherche",
    wantedStars: (n: number, level: string) => `${n} étoiles sur 6 · ${level}`,
    /** Entre « Avis de recherche » et @login, pour les lecteurs d'écran seulement. */
    wantedSep: "\u00a0: ",
    share: {
      title: "Partage-la",
      linkedin: "LinkedIn",
      x: "X",
      copy: "Copier le lien",
      download: "Télécharger l'image",
      /** La même image en 9:16, pour Instagram et TikTok : une action discrète sous les boutons. */
      story: "Format story",
      native: "Partager",
      /** Le libellé du bouton LinkedIn une fois le texte dans le presse-papier ; `copiedShort` dans la barre du pouce. */
      linkedinCopied: "Texte copié · colle-le dans ton post",
      copiedShort: "Texte copié",
      copiedLink: "Lien copié.",
      downloadDemo: "Image indisponible en mode démo (rendue par le serveur).",
      /** Sous l'image en plein écran, là où rien ne se télécharge (navigateurs intégrés). */
      holdToSave: "Appui long pour enregistrer",
      imageAlt: "Ta fiche",
      /** Les morceaux du texte de partage, assemblés et raccourcis par lib/shareText.ts (§18.27). */
      words: {
        plea: (pleaded: string, verdict: string) => `Je plaidais ${pleaded}. Verdict : ${verdict}.`,
        sheet: (stars: string, overall: number) => `Fiche ${stars}, ${overall}`,
        /** Après la ligne du pari : le verdict porte déjà les étoiles. */
        score: (overall: number) => `Note ${overall}`,
        charge: (status: string) => `Chef d'accusation : « ${status} ».`,
        ai: (secs: number) => `Interrogatoire par une IA : ${secs} s.`,
        /** `src` : « CV » ou « LinkedIn » (§18.24). */
        compare: (src: string, declared: number, github: number, stars: string | null) =>
          `Mon ${src} : ${declared}. Mon GitHub : ${stars ? `${stars}, ` : ""}${github}`,
        cta: "Fais la tienne :",
      },
    },
    /* Rang de la semaine (§18.22), en tête de l'après-fiche. « n° 1 » plutôt que « 1er » : rien ne s'accorde. */
    week: {
      line: (rank: number, total: number, gap: number) =>
        `${rank}e${showsTotal(total) ? ` sur ${total}` : ""} cette semaine · ${gap} ${gap > 1 ? "points" : "point"} du top 5`,
      top5: "Top 5 de la semaine · défends ta place jusqu'à dimanche",
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
      title: "Le dossier",
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
      overallLine: "Note globale = TEC 30 % · SHIP 20 % · ARCH 20 % · DOC 15 % · XP 15 %.",
      tabCv: "Fiche CV",
      tabLinkedin: "Fiche LinkedIn",
      tabGithub: "Fiche GitHub",
    },
    contest: {
      button: "Appeler mon avocat",
      again: "Rappeler mon avocat",
      title: "Réponse de l'avocat",
      replies: [
        "Ton avocat a relu le dossier. Il te conseille de plaider coupable.",
        "Ta réclamation a été transmise au service compétent : un fichier TODO.md qui n'existe pas encore.",
        "On a relu ton code une deuxième fois. Il n'a pas changé entre-temps.",
        "Contester est une compétence. Elle n'est malheureusement pas dans le barème.",
        "Le juge a consulté le barème. Le barème ne se laisse pas attendrir : il est écrit en JSON.",
        "Demande enregistrée. Délai de traitement estimé : le temps que tu ajoutes des tests.",
        "Le jury s'est réuni. Le jury, c'est une fonction pure. Elle a rendu la même note.",
      ],
      lowest: (code: string, v: number) => `Indice : ta stat la plus basse est ${code} à ${v}. Un commit vaut mieux qu'un recours.`,
    },
    addCv: { title: "Ajoute ton CV pour voir l'écart", text: "Ce que ton CV déclare contre ce que ton GitHub prouve. Deux fiches, le butin entre les deux.", btn: "Ajouter mon CV" },
    addGithub: { title: "Ajoute ton GitHub pour voir l'écart", text: "Ton CV a parlé. Voyons si ton code est d'accord.", btn: "Ajouter mon GitHub" },
    /** Fiche LinkedIn seule (§18.24) : un seul appel, relancé en comparaison. */
    prove: { title: "Ajoute ton GitHub pour prouver", label: "Pseudo GitHub", btn: "Prouver" },
    claim: {
      kicker: "C'est ta fiche ?",
      kickerLawyer: "Avis de recherche à ton nom ?",
      text: "Prouve que ce compte GitHub est le tien : on lit ton pseudo public, rien d'autre, et on ne garde aucun accès.",
      textLawyer: "Ce compte GitHub est le tien ? Prouve-le et reprends la main sur ta fiche.",
      btn: "C'est moi",
      btnLawyer: "Appeler mon avocat",
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
      title: "Fiche retirée par son propriétaire",
      text: "Ce dossier a quitté la ville. Plus rien à voir ici.",
      mine: "C'est ta fiche ? Connecte-toi avec GitHub",
    },
    email: {
      label: "Adresse email",
      placeholder: "toi@exemple.dev",
      btn: "Recevoir",
      sending: "Envoi…",
      done: "C'est noté. Ta fiche arrive, avec son lien de suppression.",
      invalid: "Cette adresse ne ressemble pas à un email.",
      error: "L'envoi a échoué. Réessaie plus tard.",
      note: "Optionnel. Garde aussi ta fiche au-delà de 90 jours.",
    },
    /* le bloc recruteur, en fin de page : on vouvoie qui recrute */
    cta: { title: "Vous recrutez ?", text: "Azerit vous présente des devs sur preuves : leur code, pas leur CV.", link: "azerit.tech" },
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
  compare: {
    cvLabel: "Ce que ton CV déclare",
    ghLabel: "Ce que ton GitHub prouve",
    cvShort: "CV",
    ghShort: "GitHub",
    liLabel: "Ce que ton LinkedIn déclare",
    liShort: "LinkedIn",
    loot: "Le butin",
    deltaTitle: "Le butin, stat par stat",
    legendUp: "le code vaut plus",
    legendDown: "le CV a volé",
    legendDownLi: "LinkedIn a volé",
    overall: "Globale",
    buzzHint: "BUZZ : plus bas, c'est mieux",
    switchLabel: "Fiche affichée",
    /* Vu par un visiteur : on parle de @login à la troisième personne, sans accord. Le titre de l'écart est dans shared/compareText.ts. */
    them: {
      cvLabel: "Ce que son CV déclare",
      liLabel: "Ce que son LinkedIn déclare",
      ghLabel: "Ce que son GitHub prouve",
    },
  },
  /* « Dénonce un complice » (§18.6) et la page partagée (§18.7). Épicène : « dans le viseur », jamais « recherché ». */
  denounce: {
    title: "Dénonce un complice",
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
      `${who} est dans le viseur ${stars} · ${tag}.${status ? ` Chef d'accusation : ${status}.` : ""} Droit de faire appel : ${url}`,
    native: "Partager",
    x: "Poster sur X",
    linkedin: "LinkedIn",
    linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
    see: "Voir sa fiche",
    again: "Dénoncer quelqu'un d'autre",
    /* à l'arrivée de la cible */
    banner: "Avis de recherche à ton nom",
    by: (login: string) => `Dénonciation : @${login}`,
    anonymous: "Dénonciation anonyme",
    lawyer: "Appeler mon avocat",
    andYou: "Et toi ?",
    mine: "Ma fiche",
    versus: (me: number, who: string, them: number, verdict: string) => `Toi ${me} · ${who} ${them} · ${verdict}`,
    starsAhead: (n: number) => (n === 1 ? "une étoile d'avance" : `${n} étoiles d'avance`),
    starsBehind: (n: number) => (n === 1 ? "une étoile de retard" : `${n} étoiles de retard`),
    pointsAhead: (n: number) => (n === 1 ? "1 point d'avance" : `${n} points d'avance`),
    pointsBehind: (n: number) => (n === 1 ? "1 point de retard" : `${n} points de retard`),
    tie: "à égalité",
  },
  /* le jury de la page partagée (§18.27) : on vote sur le chef d'accusation, jamais sur la personne */
  jury: {
    title: "Coupable ou relaxe\u00a0?",
    titleCharge: (charge: string) => `Coupable de «\u00a0${charge}\u00a0»\u00a0?`,
    guilty: "Coupable",
    cleared: "Relaxe",
    /* « votes » plutôt que « jurés », qui s'accorde */
    tally: (pct: number, n: number) => `${pct}\u00a0% coupable · ${n}\u00a0${n === 1 ? "vote" : "votes"}`,
    owner: (tally: string) => `Le jury : ${tally}`,
    failed: "Vote non compté. Réessaie.",
  },
  errors: {
    title: "Pas de fiche cette fois",
    retry: "Réessayer",
    notFound: "Cette fiche n'existe pas, ou plus. Elle a peut-être été supprimée.",
    timeout: "Ça prend plus de 30 secondes, on préfère s'arrêter là plutôt que d'inventer. Réessaie.",
    generic: "Quelque chose a cassé de notre côté.",
    closed: "Le commissariat est fermé pour ce soir. Reviens demain.",
  },
  footer: {
    privacy: "Confidentialité",
    credits3d: "Crédits 3D",
  },
  privacy: {
    title: "Confidentialité",
    intro: "Court, parce qu'on stocke peu.",
    sections: [
      {
        h: "Ce qu'on garde",
        p: "Les faits publics tirés de GitHub (déjà calculés), les constats de l'IA, les notes, les statuts. Ton email, seulement si tu le donnes. Si tu viens du lien d'une fiche partagée, l'identifiant de cette fiche. Pour une fiche née d'une dénonciation, l'identifiant de la fiche qui a dénoncé, et son pseudo seulement si elle est revendiquée.",
      },
      {
        h: "Ce qu'on ne garde jamais",
        p: "Ton CV : le fichier est lu en mémoire, les constats sont extraits, le fichier et son texte sont jetés. Les fichiers de code lus par l'IA ne sont pas conservés non plus.",
      },
      {
        h: "Combien de temps",
        p: "90 jours, puis la fiche et ses images sont supprimées automatiquement. Sauf si tu as laissé ton email : la fiche reste tant que tu ne la supprimes pas.",
      },
      {
        h: "Supprimer ta fiche",
        p: "Un lien « Supprimer ma fiche » est affiché sous ta fiche et envoyé dans l'email. Il efface la fiche et ses images immédiatement.",
      },
      {
        h: "La fiche de quelqu'un d'autre",
        p: "On peut générer une fiche sur n'importe quel pseudo public : elle repose sur des données publiques et reste en mode taquin. Le propriétaire du pseudo peut la faire supprimer en prouvant son compte GitHub.",
      },
      {
        h: "Revendiquer ta fiche",
        p: "Si tu te connectes avec GitHub, on lit seulement ton pseudo et ton identifiant publics, sans aucune autorisation sur ton compte, et le jeton d'accès est jeté aussitôt. Un cookie signé, valable 30 jours, retient que tes fiches sont à toi. Une fiche revendiquée reste en ligne jusqu'à ce que tu la supprimes.",
      },
      {
        h: "Photo LinkedIn",
        p: "Seulement si tu connectes LinkedIn toi-même : on récupère ta photo de profil, rangée avec la fiche et supprimée avec elle. Rien d'autre n'est lu par cette connexion.",
      },
      {
        h: "Profil LinkedIn",
        p: "Si tu donnes un lien LinkedIn, ou si ton GitHub en affiche un, un service tiers de collecte de profils publics lit ce profil public. On le garde 30 jours pour ne pas le relire : titre, résumé, postes, formation, compétences. Ni photo, ni lieu, ni contact. La fiche suit la règle des 90 jours. Pour t'y opposer : masque ta fiche (« C'est moi »), supprime-la, le profil gardé part avec elle, ou écris-nous.",
      },
      {
        h: "Le jury",
        p: "Si tu votes sur une fiche partagée, on garde ton vote (coupable ou relaxe) avec une empreinte hachée de ton adresse IP, jamais l'adresse elle-même : c'est ce qui limite à un vote par fiche. Les votes partent avec la fiche.",
      },
      {
        h: "Mesure",
        p: "Neuf événements anonymes, enregistrés par notre serveur : fiche générée, fiche partagée, visite par un lien partagé, email donné, clic vers azerit.tech, dénonciation envoyée, arrivée sur une fiche dénoncée, fiche dénoncée revendiquée, vote du jury. Pas de cookie publicitaire, pas d'outil tiers.",
      },
    ],
    contact: "Une question : hello@azerit.tech",
  },
  notFound: { title: "Page introuvable", text: "Même GitHub renverrait une 404 ici.", home: "Retour à l'accueil" },
  crash: { title: "La page n'a pas chargé", text: "Le réseau a peut-être coupé, ou le site vient d'être mis à jour.", reload: "Recharger" },
};

export type Dict = typeof fr;

const en: Dict = {
  meta: {
    title: "Testyourskills · Your LinkedIn says senior. Your GitHub? We'll see.",
    titleCard: (name, overall) => `${name} · ${overall} · Testyourskills`,
  },
  common: {
    by: "by",
    langLabel: "Language",
    skip: "Skip",
    back: "Back",
    close: "Close",
    copied: "Copied",
    loading: "Loading…",
    demo: "Demo mode · mock data",
    skipToContent: "Skip to content",
  },
  home: {
    season: "Season 1 · until 31 December",
    titleClaim: "Your\u00a0LinkedIn says\u00a0senior.",
    titleClaimCv: "Your\u00a0CV says\u00a0senior.",
    titleProof: "Your\u00a0GitHub? We'll\u00a0see.",
    titleB: "The top of the board lands an interview.",
    tabGithub: "Your GitHub",
    loginLabel: "GitHub username or profile URL",
    loginPlaceholder: "your-username",
    doorsLabel: "Source",
    doorLinkedin: "LinkedIn",
    doorGithub: "GitHub",
    linkedinLabel: "Your LinkedIn profile link",
    linkedinPlaceholder: "your-profile",
    errLinkedin: "Paste your LinkedIn profile link, or what follows linkedin.com/in/.",
    linkedinWhere: "Where's my link?",
    linkedinHelp: "In the LinkedIn app: your profile, ⋯, then copy the link.",
    errLinkedinOff: "LinkedIn entry unavailable, type your GitHub username.",
    errLinkedinCv: "With a CV, give your GitHub username.",
    submit: "Open my file",
    submitBoth: "Compare both",
    submitting: "Opening…",
    bothLink: "or both, to see the gap",
    bothActive: "Comparison mode: your CV against your GitHub",
    bothBack: "just one source",
    dropTitle: "Drop your CV here",
    dropOr: "or",
    dropBrowse: "pick a PDF",
    dropHint: "PDF · 5 MB · 10 pages max",
    sizeUnits: { mb: "MB", kb: "KB" },
    dropRemove: "Remove file",
    reassure: "No account. Your CV is read in memory, then thrown away.",
    dropAnywhere: "Let go of your CV, we'll take it from here",
    inlineCv: "or with your CV",
    exampleLabel: "Example sheet",
    exampleCaption: "The real sheet of Jacques, Azerit's founder",
    exampleScoresLabel: (linkedin, github) => `LinkedIn: ${linkedin} out of 100. GitHub: ${github} out of 100.`,
    cover: {
      player: (login, rank) => `@${login}, #${rank} this week`,
      playerPlate: (rank, week) => `NO. ${rank} · WEEK ${week}`,
      founderPlate: "AZERIT FOUNDER",
      free: "Your spot",
      freeLabel: "Your spot: open your file",
      freePlate: "FILE TO OPEN",
    },
    next: "See more",
    wall: {
      title: "Which one are you?",
      you: "And you?",
      cta: "Find yours",
    },
    top: {
      title: "This week's top",
      meta: (week, n, left) => [`Week ${week}`, showsTotal(n) && `${n} files`, `ends in ${left}`].filter(Boolean).join(" · "),
      left: (d, h, m) => (d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`),
      cut: "Top 5",
      free: "Open spot",
      freeLabel: (rank) => `Spot ${rank} is open: enter your GitHub username`,
      rowLabel: (rank, login, overall) => `Spot ${rank}: @${login}, rating ${overall}`,
    },
    errLogin: "That doesn't look like a GitHub username.",
    errEmptyLogin: "Give us a GitHub username (or profile URL).",
    errEmptyCv: "Drop a CV as a PDF.",
    errNotPdf: "That file isn't a PDF.",
    errTooLarge: (mb) => `${mb} MB file: the limit is 5 MB. A CV, not a thesis.`,
    errTooManyPages: (n) => `${n} pages: the limit is 10. Recruiters stop at page one.`,
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
  tiers: {
    bronze: "Petty crime",
    silver: "High surveillance",
    gold: "Public menace",
    icon: "Top priority",
    wonderkid: "New in town",
    flashback: "Cold case",
    totw: "This week's top 5",
  },
  tierCard: (level) => `${level} sheet`,
  waiting: {
    title: "Loading your file",
    elapsed: "elapsed",
    piece: (n) => `Exhibit ${String(n).padStart(2, "0")}`,
    queue: (n) => (n === 1 ? "1 suspect ahead of you at the station" : `${n} suspects ahead of you at the station`),
    scene: "Loading the scene",
    progress: {
      lazy_commits: (n) => `Reading your ${n ?? "many"} “wip” commits…`,
      buzzwords: (n) => `Counting buzzwords… ${n ?? 0} so far`,
      tests: () => "Looking for tests… still looking",
      readme: () => "Checking the README says more than “TODO”…",
      recruiter: () => "A recruiter would be done by now. We're taking our time.",
      compare: (n) => `Comparing with ${n ? n.toLocaleString("en-US") : "thousands of"} devs sourced by Azerit…`,
      profile: () => "Profile found. It exists, that's a start.",
      linkedin_wait: () => "Reading the public LinkedIn profile…",
      linkedin: () => "LinkedIn found. Comparing the claims…",
      repos: (n) => `${n ?? "A few"} public repos spotted, forks excluded…`,
      calendar: () => "Reading 52 weeks of contribution calendar…",
      commits: (n) => `Reading ${n ?? 100} commit messages…`,
      code: () => "The AI is reading your code. It doesn't score. It takes notes.",
      cv: () => "Reading the PDF, in memory. It'll be forgotten right after.",
      pdf: () => "Extracting text from the PDF…",
      scoring: () => "Applying the rubric. No AI touches the numbers.",
      statuses: () => "Picking statuses from the closed list…",
      render: () => "Printing the sheet…",
      start: () => "Opening the file. No coffee, no break.",
    },
    fillers: [
      "The rubric is hard-coded in a JSON file. No favoritism.",
      "Ignoring your forks. Everyone forked a tutorial once.",
      "Looking for a “final final v2” commit…",
      "Computing reliability. Never 100%, nobody is.",
      "We don't read your private repos. Promise.",
      "Calibrating the stamp…",
      "Checking node_modules isn't committed…",
    ],
  },
  reveal: {
    packTitle: "CASE FILE",
    open: "Open my case file",
    skip: "Skip animation",
    mute: "Mute",
    unmute: "Unmute",
    opening: "Opening the case file",
    revealed: (level, overall) => `${level} sheet, rated ${overall}.`,
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
      { min: 67, label: "Senior (on LinkedIn)" },
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
      leagueBoth: "GitHub × CV",
      leagueLinkedin: "LinkedIn",
      leagueBothLinkedin: "GitHub × LinkedIn",
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
    pleaded: "You pleaded",
    verdict: "Verdict:",
    gap: { over: "Overconfidence", exact: "Clear-eyed", under: "Suspicious modesty" },
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
    CTO: "Self-proclaimed CTO",
  },
  result: {
    makeYours: "Make yours",
    yourTurn: "Your turn: a username is enough.",
    wanted: "Wanted",
    wantedStars: (n, level) => `${n} of 6 stars · ${level}`,
    wantedSep: ": ",
    share: {
      title: "Share it",
      linkedin: "LinkedIn",
      x: "X",
      copy: "Copy link",
      download: "Download image",
      story: "Story format",
      native: "Share",
      linkedinCopied: "Text copied · paste it into your post",
      copiedShort: "Text copied",
      copiedLink: "Link copied.",
      downloadDemo: "Image unavailable in demo mode (rendered by the server).",
      holdToSave: "Press and hold to save",
      imageAlt: "Your sheet",
      words: {
        plea: (pleaded, verdict) => `I pleaded ${pleaded}. Verdict: ${verdict}.`,
        sheet: (stars, overall) => `${stars} sheet, ${overall}`,
        score: (overall) => `Score ${overall}`,
        charge: (status) => `Charge: “${status}”.`,
        ai: (secs) => `Interrogated by an AI for ${secs}s.`,
        compare: (src, declared, github, stars) => `My ${src}: ${declared}. My GitHub: ${stars ? `${stars}, ` : ""}${github}`,
        cta: "Make yours:",
      },
    },
    week: {
      line: (rank, total, gap) => `#${rank}${showsTotal(total) ? ` of ${total}` : ""} this week · ${gap} ${gap === 1 ? "point" : "points"} from the top 5`,
      top5: "This week's top 5 · hold your spot until Sunday",
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
      title: "The file",
      proof: "Proof",
    },
    rest: {
      why: "Why this rating",
      photo: "My LinkedIn photo",
      email: "Get my sheet by email",
      contest: "Contest it",
    },
    why: {
      overallLine: "Overall = TEC 30% · SHIP 20% · ARCH 20% · DOC 15% · XP 15%.",
      tabCv: "CV sheet",
      tabLinkedin: "LinkedIn sheet",
      tabGithub: "GitHub sheet",
    },
    contest: {
      button: "Call my lawyer",
      again: "Call my lawyer (again)",
      title: "Your lawyer says",
      replies: [
        "Your lawyer read the file. They advise you to plead guilty.",
        "Your complaint has been forwarded to the relevant department: a TODO.md that doesn't exist yet.",
        "We read your code a second time. It hadn't changed in the meantime.",
        "Disputing is a skill. Sadly, it isn't in the rubric.",
        "The judge checked the rubric. The rubric can't be sweet-talked: it's written in JSON.",
        "Request logged. Estimated processing time: however long it takes you to add tests.",
        "The jury met. The jury is a pure function. It returned the same rating.",
      ],
      lowest: (code, v) => `Hint: your lowest stat is ${code} at ${v}. A commit beats an appeal.`,
    },
    addCv: { title: "Add your CV to see the gap", text: "What your CV claims against what your GitHub proves. Two sheets, the loot in between.", btn: "Add my CV" },
    addGithub: { title: "Add your GitHub to see the gap", text: "Your CV has spoken. Let's see if your code agrees.", btn: "Add my GitHub" },
    prove: { title: "Add your GitHub to prove it", label: "GitHub username", btn: "Prove it" },
    claim: {
      kicker: "Is this your sheet?",
      kickerLawyer: "Wanted under your name?",
      text: "Prove this GitHub account is yours: we read your public username, nothing else, and keep no access.",
      textLawyer: "Is this GitHub account yours? Prove it and take your sheet back.",
      btn: "That's me",
      btnLawyer: "Call my lawyer",
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
      title: "Sheet withdrawn by its owner",
      text: "This dev has left town. Nothing left to see here.",
      mine: "Your sheet? Sign in with GitHub",
    },
    email: {
      label: "Email address",
      placeholder: "you@example.dev",
      btn: "Send it",
      sending: "Sending…",
      done: "Done. Your sheet is on its way, with its delete link.",
      invalid: "That doesn't look like an email address.",
      error: "Sending failed. Try again later.",
      note: "Optional. Also keeps your sheet beyond 90 days.",
    },
    cta: { title: "Hiring?", text: "Azerit introduces you to devs on evidence: their code, not their CV.", link: "azerit.tech" },
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
  compare: {
    cvLabel: "What your CV claims",
    ghLabel: "What your GitHub proves",
    cvShort: "CV",
    ghShort: "GitHub",
    liLabel: "What your LinkedIn claims",
    liShort: "LinkedIn",
    loot: "The loot",
    deltaTitle: "The loot, stat by stat",
    legendUp: "code is worth more",
    legendDown: "the CV stole",
    legendDownLi: "LinkedIn stole",
    overall: "Overall",
    buzzHint: "BUZZ: lower is better",
    switchLabel: "Sheet shown",
    them: {
      cvLabel: "What their CV claims",
      liLabel: "What their LinkedIn claims",
      ghLabel: "What their GitHub proves",
    },
  },
  denounce: {
    title: "Turn in an accomplice",
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
      `${who} is in the crosshairs ${stars} · ${tag}.${status ? ` Charge: ${status}.` : ""} Right to appeal: ${url}`,
    native: "Share",
    x: "Post on X",
    linkedin: "LinkedIn",
    linkedinHint: "Text copied: paste it into your LinkedIn post.",
    see: "See their sheet",
    again: "Turn in someone else",
    banner: "Wanted: you",
    by: (login) => `Tip-off: @${login}`,
    anonymous: "Anonymous tip-off",
    lawyer: "Call my lawyer",
    andYou: "And you?",
    mine: "My sheet",
    versus: (me, who, them, verdict) => `You ${me} · ${who} ${them} · ${verdict}`,
    starsAhead: (n) => (n === 1 ? "one star ahead" : `${n} stars ahead`),
    starsBehind: (n) => (n === 1 ? "one star behind" : `${n} stars behind`),
    pointsAhead: (n) => (n === 1 ? "1 point ahead" : `${n} points ahead`),
    pointsBehind: (n) => (n === 1 ? "1 point behind" : `${n} points behind`),
    tie: "dead heat",
  },
  jury: {
    title: "Guilty or cleared?",
    titleCharge: (charge) => `Guilty of “${charge}”?`,
    guilty: "Guilty",
    cleared: "Cleared",
    tally: (pct, n) => `${pct}% guilty · ${n}\u00a0${n === 1 ? "vote" : "votes"}`,
    owner: (tally) => `The jury: ${tally}`,
    failed: "Vote not counted. Try again.",
  },
  errors: {
    title: "No sheet this time",
    retry: "Try again",
    notFound: "This sheet doesn't exist, or no longer does. It may have been deleted.",
    timeout: "It's taking over 30 seconds. We'd rather stop than make things up. Try again.",
    generic: "Something broke on our side.",
    closed: "The station is closed for tonight. Come back tomorrow.",
  },
  footer: {
    privacy: "Privacy",
    credits3d: "3D credits",
  },
  privacy: {
    title: "Privacy",
    intro: "Short, because we keep very little.",
    sections: [
      {
        h: "What we keep",
        p: "Public facts derived from GitHub (already computed), the AI's findings, the ratings, the statuses. Your email, only if you give it. If you arrived through a shared sheet's link, that sheet's ID. For a sheet born from a tip-off, the ID of the sheet that turned it in, and its username only if that sheet is claimed.",
      },
      {
        h: "What we never keep",
        p: "Your CV: the file is read in memory, findings are extracted, then the file and its text are thrown away. Code files read by the AI aren't kept either.",
      },
      {
        h: "How long",
        p: "90 days, then the sheet and its images are deleted automatically. Unless you left your email: then the sheet stays until you delete it.",
      },
      {
        h: "Deleting your sheet",
        p: "A “Delete my sheet” link is shown under your sheet and sent in the email. It erases the sheet and its images immediately.",
      },
      {
        h: "Someone else's sheet",
        p: "Anyone can generate a sheet for any public username: it relies on public data and stays in teasing mode. The username's owner can have it deleted by proving the GitHub account is theirs.",
      },
      {
        h: "Claiming your sheet",
        p: "If you sign in with GitHub, we only read your public username and ID, with no permission on your account, and the access token is thrown away at once. A signed cookie, valid for 30 days, remembers that your sheets are yours. A claimed sheet stays online until you delete it.",
      },
      {
        h: "LinkedIn photo",
        p: "Only if you connect LinkedIn yourself: we fetch your profile picture, stored with the sheet and deleted with it. Nothing else is read through this connection.",
      },
      {
        h: "LinkedIn profile",
        p: "If you give a LinkedIn link, or your GitHub shows one, a third-party service that collects public profiles reads that public profile. We keep it 30 days so we don't read it twice: headline, summary, positions, education, skills. No photo, location or contact details. The sheet follows the 90-day rule. To object: hide your sheet (“That's me”), delete it, and the stored profile goes with it, or write to us.",
      },
      {
        h: "The jury",
        p: "If you vote on a shared sheet, we keep your vote (guilty or cleared) with a hash of your IP address, never the address itself: that's what limits it to one vote per sheet. Votes are deleted with the sheet.",
      },
      {
        h: "Measurement",
        p: "Nine anonymous events, recorded by our own server: sheet generated, sheet shared, visit from a shared link, email given, click to azerit.tech, tip-off sent, arrival on a turned-in sheet, turned-in sheet claimed, jury vote. No ad cookies, no third-party tools.",
      },
    ],
    contact: "Questions: hello@azerit.tech",
  },
  notFound: { title: "Page not found", text: "Even GitHub would return a 404 here.", home: "Back to home" },
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
