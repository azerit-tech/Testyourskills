// Les textes des pages autour de la fiche (revue du 15 novembre, SPEC §18.48),
// rangés sous `t.pages` dans i18n.ts : la mise en page d'erreur commune, la
// vie privée en sections lisibles, le succès d'une demande de retrait.
// Épicène, sans tiret long ni point médian. Un mot par chose : fiche, bande,
// prime, « C'est moi ».

/** Un bloc d'une section : un paragraphe (texte), ou une liste (tableau de lignes). */
export type ProseBlock = string | string[];

export interface ProseSection {
  h: string;
  blocks: ProseBlock[];
}

const fr = {
  /** Une seule mise en page d'erreur (components/ErrorPage.tsx) : la toise, le tampon, une sortie utile. */
  error: {
    /** Le tampon incliné sur la toise. */
    stamp: { none: "Introuvable", down: "Injoignable", crash: "Interrompu" },
    /** La plaque de la toise, sous la silhouette. */
    plate: { none: "Inconnu", down: "Hors ligne", crash: "Hors ligne" },
    plateSub: "N° ?????? · ??.??.??",
    /** Le serveur ne répond pas : jamais « introuvable », toujours « Réessayer ». */
    down: {
      title: "Le commissariat ne répond pas",
      text: "Rien n'est perdu. Réessaie dans un instant.",
      retry: "Réessayer",
      home: "Retour à l'accueil",
    },
    page: {
      title: "Cette page n'est pas au fichier",
      text: "Cette adresse n'est dans aucun dossier.",
      action: "Faire ma fiche",
    },
    card: {
      title: "Cette fiche n'existe pas, ou plus",
      text: "Elle a peut-être été supprimée.",
      action: "Faire la mienne",
    },
    band: {
      title: "Cette bande n'est pas au tableau",
      text: "Trois fiches d'une même école ou d'une même boîte suffisent pour la monter.",
      action: "Faire ma fiche",
      alt: "Toutes les bandes",
    },
    prime: {
      title: "Cette prime n'existe pas",
      text: "Elle a pu être retirée, ou l'adresse est mal copiée.",
      action: "Voir les primes",
      alt: "Retour à l'accueil",
    },
  },
  /** Une demande de retrait partie : un accusé qui a une forme. */
  removal: {
    doneTitle: "Demande reçue",
    doneText: "On vérifie, on retire la fiche et on te répond par email.",
  },
  /** La vie privée : un résumé en tête, puis des sections courtes (paragraphes et listes). */
  privacy: {
    summaryTitle: "En quatre lignes",
    summary: [
      "On lit ce qui est public : ton profil LinkedIn, ton GitHub, ou le CV que tu donnes.",
      "On garde ta fiche 90 jours par défaut, jamais ton CV.",
      "Aucun contact n'est affiché, aucune donnée n'est vendue, aucun cookie publicitaire, aucun outil tiers de mesure.",
      "Tu supprimes ta fiche quand tu veux. Pour celle qu'on a faite sur toi : « C'est moi », ou la demande de retrait.",
    ],
    contact: "Une question ?",
    sections: (email: string): ProseSection[] => [
      {
        h: "Ce qu'on lit",
        blocks: [
          [
            "Ton profil LinkedIn public, si tu donnes son lien ou si ton GitHub l'affiche : titre, résumé, postes, formation, compétences. Ni photo, ni lieu, ni contact. Un service tiers de collecte de profils publics le lit pour nous.",
            "Ton GitHub public : tes repos, ton activité, et quelques fichiers de code lus par l'IA.",
            "Ton CV, si tu le donnes : lu en mémoire, puis jeté.",
          ],
        ],
      },
      {
        h: "Ce qu'on garde",
        blocks: [
          [
            "Les faits tirés de tes sources, les constats de l'IA, les notes de la fiche.",
            "Le profil LinkedIn lu, 30 jours, pour ne pas le relire.",
            "Ton email, seulement si tu le donnes.",
            "Si tu viens du lien d'une fiche partagée, l'identifiant de cette fiche.",
            "Pour une fiche née d'une dénonciation, l'identifiant de la fiche qui a dénoncé, et son pseudo seulement si elle est revendiquée.",
          ],
        ],
      },
      {
        h: "Ce qu'on ne garde jamais",
        blocks: [["Ton CV : le fichier et son texte sont jetés dès que les constats en sont tirés.", "Les fichiers de code lus par l'IA."]],
      },
      {
        h: "Combien de temps",
        blocks: [
          "90 jours, puis la fiche et ses images sont supprimées automatiquement.",
          "Deux exceptions : si tu as laissé ton email sous ta fiche, ou si tu l'as revendiquée avec « C'est moi », elle reste en ligne jusqu'à ce que tu la supprimes. Ton email est seulement enregistré.",
        ],
      },
      {
        h: "Supprimer ta fiche",
        blocks: [
          "« Supprimer ma fiche », sous ta fiche, l'efface tout de suite, avec ses images.",
          "Depuis un autre appareil : « C'est moi » prouve que le compte GitHub est le tien, puis tu la masques ou tu la supprimes.",
        ],
      },
      {
        h: "La fiche qu'on a faite sur toi",
        blocks: [
          "On peut faire une fiche sur n'importe quel profil public : elle repose sur des données publiques et reste sur le ton de la plaisanterie.",
          [
            "Elle porte ton pseudo GitHub : « C'est moi » prouve ton compte, puis tu la masques ou tu la supprimes.",
            `Elle vient de ton LinkedIn ou de ton CV, sans pseudo GitHub : « Demander son retrait » sous la fiche, ou un email à ${email} avec son lien. On la retire après vérification ; ton email sert seulement à te répondre.`,
          ],
        ],
      },
      {
        h: "« C'est moi »",
        blocks: [
          [
            "Si tu te connectes avec GitHub, on lit seulement ton pseudo et ton identifiant publics, sans aucune autorisation sur ton compte. Le jeton d'accès est jeté aussitôt.",
            "Un cookie signé, valable 30 jours, retient que tes fiches sont à toi.",
          ],
        ],
      },
      {
        h: "Ta photo LinkedIn",
        blocks: ["Seulement si tu connectes LinkedIn toi-même : on récupère ta photo de profil, rangée avec la fiche et supprimée avec elle. Rien d'autre n'est lu par cette connexion."],
      },
      {
        h: "Ton navigateur",
        blocks: [
          "Ton navigateur garde un identifiant tiré au hasard. Il ne dit rien de toi : il sert seulement à compter les fiches faites depuis ce navigateur dans la journée. Notre serveur n'en garde qu'une empreinte, avec le compteur du jour, comme pour ton adresse IP.",
          "Il retient aussi, d'une visite à l'autre, ta langue, ta dernière fiche, et tes choix de bande et de ligue.",
        ],
      },
      {
        h: "Le jury",
        blocks: ["Si tu votes sur une fiche partagée, on garde ton vote (coupable ou relaxe) avec une empreinte de ton adresse IP, jamais l'adresse elle-même : c'est ce qui limite à un vote par fiche. Les votes partent avec la fiche."],
      },
      {
        h: "Les bandes",
        blocks: [
          [
            "Rien n'y entre sans ton accord : tu choisis une école et une boîte au plus, sous ta fiche ou sur la page d'une bande. Une fiche faite depuis la page d'une bande y entre dès qu'elle est posée, comme la page l'annonce.",
            "On garde ce choix avec l'identifiant de la fiche et ses étoiles.",
            "L'école lue sur ton profil reste privée tant que tu ne la choisis pas.",
            "La page d'une bande ne montre jamais un nom : ton pseudo GitHub seulement si ta fiche est revendiquée, les autres fiches sont comptées sans être montrées.",
            "Pour en sortir : « Sortir », sous ta fiche. Supprimer ta fiche t'en retire aussi, la masquer la retire du compte.",
          ],
        ],
      },
      {
        h: "Les primes",
        blocks: [
          [
            "Rien n'est gardé tant que tu n'entres pas dans la course.",
            "Ensuite, on garde ton pseudo GitHub, la prime, ta fiche, ta ligue, ton email, tes liens de preuves, la date de ton accord, tes réponses sur l'âge et sur le lieu, ta note et l'état de ta candidature.",
            "Le classement public montre ton pseudo, ta note et ton rang. Ton email et tes preuves ne sont jamais publics.",
            "L'entreprise de la prime ne reçoit ton profil (pseudo, email, lien de la fiche, preuves) que si tu es finaliste, comme tu l'as accepté.",
            "« Me retirer », sur la page de la prime, efface l'inscription tout de suite. Supprimer ou masquer ta fiche aussi.",
            "Sans victoire, tout est effacé 30 jours après la fin de la saison.",
          ],
        ],
      },
      {
        h: "Mesure",
        blocks: [
          "Notre serveur compte des événements anonymes, par famille :",
          [
            "les fiches faites et partagées, les visites par un lien partagé ;",
            "les emails laissés et les clics vers azerit.tech ;",
            "les dénonciations envoyées, les visites d'une fiche dénoncée, les fiches dénoncées revendiquées ;",
            "les votes du jury, les plaidoyers ;",
            "le déroulement du film ;",
            "les entrées et sorties de bande, les pages de bande vues et partagées ;",
            "les pages de prime vues, les inscriptions et retraits de prime.",
          ],
          "Gardés 180 jours, puis effacés. Une fiche supprimée n'y est plus nommée. Pas de cookie publicitaire, pas d'outil tiers.",
        ],
      },
    ],
  },
};

export type PagesDict = typeof fr;

const en: PagesDict = {
  error: {
    stamp: { none: "Not found", down: "No answer", crash: "Cut off" },
    plate: { none: "Unknown", down: "Offline", crash: "Offline" },
    plateSub: "No. ?????? · ??.??.??",
    down: {
      title: "The station is not answering",
      text: "Nothing is lost. Try again in a moment.",
      retry: "Try again",
      home: "Back to home",
    },
    page: {
      title: "This page is not on file",
      text: "This address isn't in any file.",
      action: "Make my sheet",
    },
    card: {
      title: "This sheet doesn't exist, or no longer does",
      text: "It may have been deleted.",
      action: "Make mine",
    },
    band: {
      title: "This crew is not on the board",
      text: "Three sheets from the same school or company are enough to start it.",
      action: "Make my sheet",
      alt: "All crews",
    },
    prime: {
      title: "This bounty doesn't exist",
      text: "It may have been removed, or the address was copied wrong.",
      action: "See the bounties",
      alt: "Back to home",
    },
  },
  removal: {
    doneTitle: "Request received",
    doneText: "We check, remove the sheet and reply by email.",
  },
  privacy: {
    summaryTitle: "In four lines",
    summary: [
      "We read what is public: your LinkedIn profile, your GitHub, or the CV you give us.",
      "We keep your sheet for 90 days by default, never your CV.",
      "No contact details are shown, no data is sold, no ad cookies, no third-party tracking tools.",
      "You can delete your sheet any time. For a sheet someone made about you: “That's me”, or a removal request.",
    ],
    contact: "Questions?",
    sections: (email) => [
      {
        h: "What we read",
        blocks: [
          [
            "Your public LinkedIn profile, if you give its link or your GitHub shows it: headline, summary, positions, education, skills. No photo, location or contact details. A third-party service that collects public profiles reads it for us.",
            "Your public GitHub: your repositories, your activity, and a few code files read by the AI.",
            "Your CV, if you give it: read in memory, then thrown away.",
          ],
        ],
      },
      {
        h: "What we keep",
        blocks: [
          [
            "The facts drawn from your sources, the AI's findings, the sheet's scores.",
            "The LinkedIn profile we read, for 30 days, so we don't read it twice.",
            "Your email, only if you give it.",
            "If you arrived through a shared sheet's link, that sheet's ID.",
            "For a sheet born from a tip-off, the ID of the sheet that turned it in, and its username only if that sheet is claimed.",
          ],
        ],
      },
      {
        h: "What we never keep",
        blocks: [["Your CV: the file and its text are thrown away as soon as the findings are drawn from it.", "The code files read by the AI."]],
      },
      {
        h: "How long",
        blocks: [
          "90 days, then the sheet and its images are deleted automatically.",
          "Two exceptions: if you left your email under your sheet, or claimed it with “That's me”, it stays online until you delete it. Your email is only stored.",
        ],
      },
      {
        h: "Deleting your sheet",
        blocks: [
          "“Delete my sheet”, under your sheet, erases it at once, with its images.",
          "From another device: “That's me” proves the GitHub account is yours, then you hide it or delete it.",
        ],
      },
      {
        h: "A sheet someone made about you",
        blocks: [
          "Anyone can make a sheet from any public profile: it relies on public data and stays a light-hearted tease.",
          [
            "It carries your GitHub username: “That's me” proves your account, then you hide it or delete it.",
            `It comes from your LinkedIn or your CV, with no GitHub username: “Ask for its removal” under the sheet, or an email to ${email} with its link. We remove it after checking; your email is only used to reply.`,
          ],
        ],
      },
      {
        h: "“That's me”",
        blocks: [
          [
            "If you sign in with GitHub, we only read your public username and ID, with no permission on your account. The access token is thrown away at once.",
            "A signed cookie, valid for 30 days, remembers that your sheets are yours.",
          ],
        ],
      },
      {
        h: "Your LinkedIn photo",
        blocks: ["Only if you connect LinkedIn yourself: we fetch your profile picture, stored with the sheet and deleted with it. Nothing else is read through this connection."],
      },
      {
        h: "Your browser",
        blocks: [
          "Your browser keeps a randomly drawn identifier. It says nothing about you: it only counts the sheets made from this browser during the day. Our server keeps only a hash of it, with the day's counter, as it does for your IP address.",
          "It also remembers, from one visit to the next, your language, your last sheet, and your crew and league choices.",
        ],
      },
      {
        h: "The jury",
        blocks: ["If you vote on a shared sheet, we keep your vote (guilty or cleared) with a hash of your IP address, never the address itself: that's what limits it to one vote per sheet. Votes are deleted with the sheet."],
      },
      {
        h: "Crews",
        blocks: [
          [
            "Nothing goes in without your say-so: you pick one school and one company at most, under your sheet or on a crew's page. A sheet made from a crew's page joins it as soon as it lands, as the page says.",
            "We keep that choice with the sheet's ID and its stars.",
            "The school read from your profile stays private until you pick it.",
            "A crew's page never shows a name: your GitHub username only if your sheet is claimed, the other sheets are counted without being shown.",
            "To leave: “Leave”, under your sheet. Deleting your sheet removes you too, hiding it takes it out of the count.",
          ],
        ],
      },
      {
        h: "Bounties",
        blocks: [
          [
            "Nothing is kept until you enter the race.",
            "After that, we keep your GitHub username, the bounty, your sheet, your league, your email, your supporting links, the date of your agreement, your answers on age and location, your rating and your entry's status.",
            "The public board shows your username, rating and rank. Your email and supporting links are never public.",
            "The bounty's company only receives your profile (username, email, sheet link, supporting links) if you're a finalist, as you agreed.",
            "“Withdraw”, on the bounty's page, erases the entry at once. Deleting or hiding your sheet does too.",
            "Without a win, everything is erased 30 days after the season ends.",
          ],
        ],
      },
      {
        h: "Measurement",
        blocks: [
          "Our own server counts anonymous events, by family:",
          [
            "sheets made and shared, visits from a shared link;",
            "emails left and clicks to azerit.tech;",
            "tip-offs sent, visits to a tipped-off sheet, tipped-off sheets claimed;",
            "jury votes, pleas;",
            "how the film played;",
            "crews joined and left, crew pages viewed and shared;",
            "bounty pages viewed, bounties entered and withdrawn.",
          ],
          "Kept 180 days, then erased. A deleted sheet is no longer named in them. No ad cookies, no third-party tools.",
        ],
      },
    ],
  },
};

export const PAGES_TEXT = { fr, en };
