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

/* ---------- les crédits (/credits) : le contenu de web/public/credits.txt, en lignes lisibles ---------- */

/** Une ligne des crédits : ce que c'est, puis ses auteurs, chacun un lien vers son modèle (l'adresse ne s'affiche pas). */
export interface CreditLine {
  what: string;
  by: { name: string; href: string }[];
}
export interface CreditGroup {
  h: string;
  lines: CreditLine[];
}

type Two = [fr: string, en: string];
type Line = [Two, [name: string, href: string][]];
const SK = "https://sketchfab.com/3d-models/";
/** Les modèles du film, CC BY 4.0 : un groupe par décor, une ligne par élément (tools/film3d/CREDITS.md). */
const FILM_MODELS: { h: Two; lines: Line[] }[] = [
  {
    h: ["Les voitures", "The cars"],
    lines: [
      [["Coupé", "Coupe"], [["MMC Works", `${SK}generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882`]]],
      [["Berline des années 60", "1960s sedan"], [["Elements Creative Studio", `${SK}b1bb1e82fe394153932ba1c2a341dded`]]],
      [["Coupé des années 70", "1970s coupe"], [["Iv4sHka", `${SK}79612cb9ee714df9967c6d6c4fc967b1`]]],
      [["Rétroviseur intérieur", "Rear-view mirror"], [["movemama", `${SK}rear-view-mirror-72f3ac9e3ff5423f823841b3c801d0c1`]]],
      [["Breaks garés", "Parked station wagons"], [["Martin Trafas", `${SK}2b734bf738dc405998c2074953965cc6`]]],
    ],
  },
  {
    h: ["Les poursuivants", "The pursuers"],
    lines: [
      [
        ["Patrouilles", "Patrol cars"],
        [
          ["Mateusz Woliński", `${SK}police-car-9166b13b6ae341f4bfc093edb71d74f4`],
          ["L95XP", `${SK}ford-crown-victoria-free-b1615ed43a5443a2876c8020a734cf6e`],
          ["Daniel Zhabotinsky", `${SK}fairheaven-lt-80-cop-cruiser-low-poly-model-61766c1e6e1e4b2b803c174f33433a74`],
        ],
      ],
      [["Fourgon", "Van"], [["bunny", `${SK}gmc-vandura1976-van-40cf97bc0f7d4bdb8135c4e9d2264923`]]],
      [["Hélicoptère", "Helicopter"], [["solid3DDD", `${SK}eurocopter-ec135-politia-high-poly-02373bff3f7f48bf8649805455fe4260`]]],
      [["Avion de chasse", "Jet"], [["Gabriel", `${SK}concept-jet-69012312f3ab4f13b637b6a188aa3d4c`]]],
      [
        ["Avions de chasse, de près", "Jets, up close"],
        [
          ["Tim Samedov", `${SK}7a13c91f07e042a685b4d265644fdc06`],
          ["Tim Samedov", `${SK}b9e7a67cf726485da1493545fccce557`],
        ],
      ],
    ],
  },
  {
    h: ["Les personnes", "The people"],
    lines: [
      [["Conducteur", "Driver"], [["Jules Winnfield", `${SK}low-poly-character-0e95ddfd01ed4d23aeb1d9b7fe79ea26`]]],
      [["Capuche", "Hood"], [["Tijerín Art Studio", `${SK}balaclava-scarf-as-a-hood-3d-scan-5c037f1a66634c5ea25ad8e87a4c3923`]]],
      [
        ["Agents", "Officers"],
        [
          ["SPP Animation Studio", `${SK}policeman-d47bb1f61fa340588b5801cdb63812c8`],
          ["TUZZY--", `${SK}police-character-fuse-made-98f6136cc24f41f1bb1b1f3262bde2ff`],
        ],
      ],
      [["Casquette", "Cap"], [["Aramuor", `${SK}officer-police-captain-pilot-hat-cap-whatever-9697ef10105a4e02a6074bc9bca464bd`]]],
      [["Arme inventée", "Fictional handgun"], [["4d_Bob", `${SK}t77-handgun-7e6a5ffc9deb4994a4092ccdba85c965`]]],
    ],
  },
  {
    h: ["Le barrage", "The roadblock"],
    lines: [
      [["Barrière", "Fence barricade"], [["Rocz3D", `${SK}fence-barricade-03-2a09091d4e7b4539abe03f6a50762409`]]],
      [["Cône", "Traffic cone"], [["Kuutti Siitonen", `${SK}worn-traffic-cone-1cbffb4169684e5a84ba186882bd55d7`]]],
      [["Cônes, balises, panneaux", "Cones, beacons, boards"], [["NotAnotherApocalypticCo.", `${SK}e03b1d2dfdc0416bb8324d15573ea60c`]]],
      [["Barrière de foule", "Crowd barrier"], [["Gianluca Gatto", `${SK}438c36d48ab04ec4b5178c6989d3ab3b`]]],
      [["Herse", "Spike strip"], [["Eric", `${SK}spike-strip-2c8370fccfbf4a7f9b9d9729112b8e61`]]],
      [["Mât d'éclairage", "Light tower"], [["krambulini", `${SK}light-tower-9addea6a4129438b83a1fc3ed4a784ec`]]],
    ],
  },
  {
    h: ["La rue", "The street"],
    lines: [
      [["Cocotiers", "Coconut palms"], [["Next Spring", `${SK}realistic-palm-tree-2-free-d05c8ffb6ec64a7184c4b673e21f7224`]]],
      [["Palmiers royaux", "Royal palms"], [["PlantCatalog", `${SK}realistic-hd-royal-palm-325-3113aadb615e432f934ec5d3407d11ce`]]],
      [
        ["Lampadaires", "Street lights"],
        [
          ["KMB3D", `${SK}various-low-poly-street-lights-1173b0c4d9b0400bbeaafbee0e94ca59`],
          ["Mercuri-sodyum", `${SK}e72cababe3094faa93544727b77ff2cf`],
          ["Mercuri-sodyum", `${SK}c4471f470a56422d804b279cfddb4b27`],
          ["StratoArt", `${SK}d0f6ca0318c044d6a99ac5e376b8ceca`],
        ],
      ],
      [["Feux de circulation", "Traffic light"], [["evgenymur", `${SK}nyc-80s-traffic-light-bad8aa4988474919be8f48920dde7e3d`]]],
      [["Panneaux", "Road signs"], [["FrodoUndead", `${SK}c39bf97110494b5db3de84165211f592`]]],
      [["Glissière", "Guardrail"], [["xplanepilot", `${SK}693dee3dc6a1495f90ab0ba1f8237cb4`]]],
      [["Réservoirs de toit", "Rooftop water tanks"], [["Username.blend", `${SK}water-tank-aff4e9fd3f7042d5855fade7411df4df`]]],
      [["Lettres néon", "Neon letters"], [["danny_p3d", `${SK}a88035b37ba4498b8d7fe9cfbc0dccc8`]]],
      [
        ["Enseignes", "Signs"],
        [
          ["Black vizual", `${SK}794708f56b4e454caec677701781bca0`],
          ["plaggy", `${SK}9a924db296cf4a1eb12991702ab48da5`],
          ["plaggy", `${SK}ba11464601794316a2351d150774f10d`],
        ],
      ],
      [["Store", "Awning"], [["plaggy", `${SK}47e5fd8a6b194b48aad20425869d15ba`]]],
      [["Intérieurs de boutique", "Storefront interiors"], [["99.Miles", `${SK}348da01c195d46eca29e478e98aab16c`]]],
      [["Fenêtres", "Windows"], [["hnanw", `${SK}e8a3914fb654483790abc0cd72fb7099`]]],
      [["Portes vitrées", "Glass doors"], [["carlcapu9", `${SK}e0ff1a543cb34979999d2fd87843203e`]]],
      [["Climatiseurs", "Air conditioners"], [["Khoa Nguyen", `${SK}3b930497c77f47269847e75b9ee85b20`]]],
      [["Garde-corps", "Railings"], [["Owen.Barden", `${SK}b5b629702e814263816769db0ee660cc`]]],
      [["Parcmètre", "Parking meter"], [["sixonetwo", `${SK}c0f5e3e1c8a64ab3b64d4b077bd09210`]]],
      [["Distributeur de journaux", "Newspaper box"], [["chrisg4919", `${SK}29cca5a8e99e438c8fb644d1aea3587e`]]],
      [["Mobilier de rue", "Street furniture"], [["Dominik Biały", `${SK}9752f598cc5541acb3de07150d1a4ae4`]]],
    ],
  },
  {
    h: ["Le port et la marina", "The harbor and the marina"],
    lines: [
      [
        ["Conteneurs", "Containers"],
        [
          ["Invictus fulgur", `${SK}ac9356745e9a43d6b5cb7d53d8f26008`],
          ["Aidan Callaghan", `${SK}f555ce5532d84cac8ad963dec5833934`],
          ["Sebastian Webster", `${SK}772f4be391a245f699c54e6cf157c58d`],
        ],
      ],
      [
        ["Grues", "Cranes"],
        [
          ["jhervianto", `${SK}ae2b1da54f6a4e28ba5f7daa1c6dc5b8`],
          ["MisterH", `${SK}d4d582ebd707426f93f1f5a9cdd0ce03`],
          ["Randonavt", `${SK}965188af6132410189a2eb1210f9095c`],
        ],
      ],
      [
        ["Navires", "Ships"],
        [
          ["RM02", `${SK}aaa41cca946b4a08bc08cf692b7757be`],
          ["hungry_drifter", `${SK}b7c97df584824ca682d26daabf401f87`],
          ["Moon Moon", `${SK}fd28c35b76754c9386b32aa281a0e238`],
        ],
      ],
      [["Chariot élévateur", "Forklift"], [["louis-muir", `${SK}060f3f8bc7de4e6ca2f348d414702e9d`]]],
      [["Bitte d'amarrage", "Bollard"], [["henkei", `${SK}d62977f75f2d49688fd0094fbf5b1d41`]]],
      [["Palettes", "Pallets"], [["Anna Denisova", `${SK}18fbfb830f294b44aa8dff530cc2ea12`]]],
      [
        ["Bateaux de plaisance", "Pleasure boats"],
        [
          ["Taldinc", `${SK}d59913994a44444b8d054f4de5f519bc`],
          ["Miguelangelo Rosario", `${SK}09a9fc4a0061464fba1bc3ba76848869`],
          ["BoatUS Foundation", `${SK}14564c5ec6ee4f11a3ea8e213b981cb1`],
          ["Sergei", `${SK}0dd451f295d049cea20c17d3ffa87ee3`],
        ],
      ],
    ],
  },
];

/** Le reste : textures et ciel (CC0), icônes, polices. */
const OTHER_LINES: Line[] = [
  [["Ciel, textures, petits objets de rue (CC0)", "Sky, textures, small street props (CC0)"], [["Poly Haven", "https://polyhaven.com/license"]]],
  [["Textures de murs et de sols (CC0)", "Wall and ground textures (CC0)"], [["ambientCG", "https://ambientcg.com"]]],
  [["Icônes des langages (CC0)", "Language icons (CC0)"], [["Simple Icons", "https://simpleicons.org"]]],
  [
    ["Polices (SIL Open Font License 1.1)", "Fonts (SIL Open Font License 1.1)"],
    [
      ["Outfit", "https://github.com/Outfitio/Outfit-Fonts"],
      ["Barlow Condensed", "https://github.com/jpt/barlow"],
      ["JetBrains Mono", "https://github.com/JetBrains/JetBrainsMono"],
    ],
  ],
];

const toLines = (lines: Line[], i: 0 | 1): CreditLine[] => lines.map(([what, by]) => ({ what: what[i], by: by.map(([name, href]) => ({ name, href })) }));
/** Les crédits dans une langue : les groupes de modèles du film, puis le reste. */
const creditLines = (i: 0 | 1): { groups: CreditGroup[]; rest: CreditLine[] } => ({ groups: FILM_MODELS.map((g) => ({ h: g.h[i], lines: toLines(g.lines, i) })), rest: toLines(OTHER_LINES, i) });

const fr = {
  /** Une seule mise en page d'erreur (components/ErrorPage.tsx) : la toise, le tampon, une sortie utile. */
  error: {
    /** Le tampon incliné sur la toise. */
    stamp: { none: "Introuvable", down: "Injoignable", crash: "Interrompu" },
    /** La plaque de la toise, sous la silhouette. */
    plate: { none: "Inconnu", down: "Hors ligne", crash: "Hors ligne" },
    plateSub: "N° ?????? · ??.??.??",
    /** Le titre de l'onglet, propre à chaque page d'erreur. */
    tab: { card: "Fiche introuvable", band: "Bande introuvable", prime: "Prime introuvable", down: "Commissariat injoignable", crash: "Page interrompue" },
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
      action: "Faire ma fiche",
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
      action: "Faire ma fiche",
      alt: "Voir les primes",
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
      "Tu supprimes ta fiche quand tu veux. Pour celle qu'on a faite sur toi : « C'est moi », ou « Demander son retrait » sous la fiche.",
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
            `Ton email, seulement si tu le laisses : il garde ta fiche en ligne au-delà de 90 jours et rejoint les contacts d'Azerit, qui peut alors t'écrire pour un poste. Pour le retirer : « Supprimer ma fiche », sous ta fiche, ou un email à ${email}.`,
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
          "Deux exceptions : si tu as laissé ton email sous ta fiche, ou si tu l'as revendiquée avec « C'est moi », elle reste en ligne jusqu'à ce que tu la supprimes.",
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
        h: "Entrer sans rien coller",
        blocks: [
          "« Se connecter avec LinkedIn » : LinkedIn nous donne ton nom, ta photo et ton email vérifié. Le nom et la photo servent à retrouver ton profil public ; l'email, à retrouver ton GitHub par la recherche publique de GitHub. Ton email est gardé avec ta fiche, comme si tu l'avais laissé dessous : il rejoint les contacts d'Azerit et part avec la fiche. Aucun jeton de connexion n'est gardé.",
          "La recherche par nom passe par un service tiers de collecte de profils publics (nom, titre, photo) et par la recherche publique de GitHub ; ses résultats sont gardés 24 heures.",
          "« Se connecter avec GitHub » : GitHub nous donne ton pseudo, rien d'autre.",
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
  /** /credits : un résumé, puis les modèles du film par décor, puis le reste ; chaque auteur en lien vers son modèle. */
  credits: {
    title: "Crédits",
    summaryTitle: "En deux lignes",
    summary: [
      "Le film, la fiche et leurs images s'appuient sur des modèles 3D, des textures, des polices et des icônes d'autres auteurs, sous licence CC0 ou CC BY 4.0.",
      "Les modèles CC BY ont été modifiés pour le film : échelle, peinture, marques et inscriptions retirées, éclairage.",
    ],
    film: "Le film de la poursuite",
    filmText: "Rendu dans Blender pour Azerit. La ville, les immeubles, la route et l'éclairage sont écrits en code, sans aucun lieu réel.",
    filmLicense: "Les modèles 3D qui suivent sont sous licence",
    restTitle: "La fiche, les images, le reste",
    restText: "Les illustrations des profils et des personnages sont faites pour Azerit.",
    former: "L'ancienne révélation en 3D",
    formerText: "La scène de l'ascenseur ne fait plus partie du parcours. Ses modèles, ses textures et les données OpenStreetMap (© OpenStreetMap contributors, ODbL) restent crédités dans",
    raw: "Le même contenu, en texte brut :",
    ...creditLines(0),
  },
};

export type PagesDict = typeof fr;

const en: PagesDict = {
  error: {
    stamp: { none: "Not found", down: "No answer", crash: "Cut off" },
    plate: { none: "Unknown", down: "Offline", crash: "Offline" },
    plateSub: "No. ?????? · ??.??.??",
    tab: { card: "Sheet not found", band: "Crew not found", prime: "Bounty not found", down: "Station not answering", crash: "Page cut off" },
    down: {
      title: "The station is not answering",
      text: "Nothing is lost. Try again in a moment.",
      retry: "Try again",
      home: "Back to home",
    },
    page: {
      title: "This page is not on file",
      text: "This address isn't in any file.",
      action: "Get my rap sheet",
    },
    card: {
      title: "This sheet doesn't exist, or no longer does",
      text: "It may have been deleted.",
      action: "Get my rap sheet",
    },
    band: {
      title: "This crew is not on the board",
      text: "Three sheets from the same school or company are enough to start it.",
      action: "Get my rap sheet",
      alt: "All crews",
    },
    prime: {
      title: "This bounty doesn't exist",
      text: "It may have been removed, or the address was copied wrong.",
      action: "Get my rap sheet",
      alt: "See the bounties",
    },
  },
  removal: {
    doneTitle: "Request received",
    doneText: "We'll check, take the sheet down and reply by email.",
  },
  privacy: {
    summaryTitle: "In four lines",
    summary: [
      "We read what is public: your LinkedIn profile, your GitHub, or the résumé you give us.",
      "We keep your sheet for 90 days by default, never your résumé.",
      "No contact details are shown, no data is sold, no ad cookies, no third-party tracking tools.",
      "You can delete your sheet any time. For a sheet someone made about you: “That's me”, or “Ask us to take it down” under the sheet.",
    ],
    contact: "Questions?",
    sections: (email) => [
      {
        h: "What we read",
        blocks: [
          [
            "Your public LinkedIn profile, if you give its link or your GitHub shows it: headline, summary, positions, education, skills. No photo, location or contact details. A third-party service that collects public profiles reads it for us.",
            "Your public GitHub: your repositories, your activity, and a few code files read by the AI.",
            "Your résumé, if you give it: read in memory, then thrown away.",
          ],
        ],
      },
      {
        h: "What we keep",
        blocks: [
          [
            "The facts drawn from your sources, the AI's findings, the sheet's ratings.",
            "The LinkedIn profile we read, for 30 days, so we don't read it twice.",
            `Your email, only if you leave it: it keeps your sheet up past 90 days and joins Azerit's contacts, so Azerit may reach out about a job. To remove it: “Delete my sheet”, under your sheet, or an email to ${email}.`,
            "If you arrived through a shared sheet's link, that sheet's ID.",
            "For a sheet born from a tip-off, the ID of the sheet that turned it in, and its username only if that sheet is claimed.",
          ],
        ],
      },
      {
        h: "What we never keep",
        blocks: [["Your résumé: the file and its text are thrown away as soon as the findings are drawn from it.", "The code files read by the AI."]],
      },
      {
        h: "How long",
        blocks: [
          "90 days, then the sheet and its images are deleted automatically.",
          "Two exceptions: if you left your email under your sheet, or claimed it with “That's me”, it stays online until you delete it.",
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
            `It comes from your LinkedIn or your résumé, with no GitHub username: “Ask us to take it down” under the sheet, or an email to ${email} with its link. We remove it after checking; your email is only used to reply.`,
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
        h: "Getting in without pasting",
        blocks: [
          "“Sign in with LinkedIn”: LinkedIn gives us your name, picture and verified email. The name and picture are used to find your public profile; the email, to find your GitHub through GitHub's public search. Your email is kept with your sheet, as if you had left it underneath: it joins Azerit's contacts and is deleted with the sheet. No sign-in token is kept.",
          "The name search goes through a third-party service that collects public profiles (name, headline, picture) and through GitHub's public search; its results are kept for 24 hours.",
          "“Sign in with GitHub”: GitHub gives us your username, nothing else.",
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
  credits: {
    title: "Credits",
    summaryTitle: "In two lines",
    summary: [
      "The film, the sheet and their images rely on 3D models, textures, fonts and icons by other authors, under CC0 or CC BY 4.0.",
      "The CC BY models were modified for the film: scale, paint, badges and lettering removed, lighting.",
    ],
    film: "The chase film",
    filmText: "Rendered in Blender for Azerit. The city, buildings, road and lighting are written in code, with no real place.",
    filmLicense: "The 3D models below are under",
    restTitle: "The sheet, the images, the rest",
    restText: "The profile and character illustrations are made for Azerit.",
    former: "The former 3D reveal",
    formerText: "The elevator scene is no longer part of the flow. Its models, textures and OpenStreetMap data (© OpenStreetMap contributors, ODbL) stay credited in",
    raw: "The same content, as plain text:",
    ...creditLines(1),
  },
};

export const PAGES_TEXT = { fr, en };
