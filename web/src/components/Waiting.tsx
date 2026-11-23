// Attente (§18.27, §18.48) : la photo d'identité. Sur un fond d'encre plat, un
// groupe centré dans la hauteur : la marque et le titre (« Découvre à quel point
// ton profil est recherché. »), le cadre de la fiche (toise et plaque, Mugshot.tsx) avec l'avatar
// du pseudo dès la première seconde, puis la pile des pièces. En bas, à une place fixe, la barre qui
// avance sur la durée estimée et, dessous, une ligne sur deux rangs réservés :
// les messages du §6.2, nourris par les ProgressEvent quand il y en a, sinon par
// du remplissage. En file d'attente, la ligne dit combien de fiches passent
// avant, et la barre attend.
//
// Rien ne bouge d'une étape à l'autre : chaque emplacement (pile, barre, ligne)
// a sa hauteur réservée dès la première image, quel que soit le texte.
//
// L'enquête en direct (§18.26) : dès que la collecte a parlé, les trouvailles
// tombent une à une dans la pile, toutes les 2,5 s, comme des pièces versées au
// dossier ; la dernière reste. Avant la première, une feuille vierge attend à sa
// place. Fiche prête avant la fin : `ready`, et on rend la main (`onRelease`) une
// fois au moins trois pièces versées et lues.
//
// Plus d'écran noir (§18.27) : l'attente reste à l'écran tant que le film n'est
// pas prêt (`scene="loading"`, « La poursuite se prépare »), et porte la pilule
// « Lancer la poursuite » quand le son demande un geste (`scene="tap"`).
//
// Réseau coupé (`offline`) : la barre s'arrête, la ligne dit que le commissariat
// ne répond pas, et « Réessayer » prend la place de la barre. Il ne fait que
// relire l'état de la fiche (`onRetry`), jamais une nouvelle demande.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Finding, Lang, ProgressEvent } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { AzeritMark } from "./Brand";
import { Mugshot } from "./Mugshot";

interface Line {
  uid: number;
  key: string;
  n?: number;
  filler?: number;
}

const MIN_GAP = 950; // un message reste lisible au moins ce temps
const FILL_AFTER = 2300; // silence avant un message de remplissage
/** Durée estimée d'une carte (24 s mesurées, §18.32) : la barre y arrive presque, jamais tout à fait. */
const EXPECTED_MS = 20_000;
/** Une trouvaille toutes les 2,5 s. */
const PIECE_MS = 2500;
/** Fiche prête : on laisse au moins ce nombre de trouvailles tomber avant la révélation. */
const MIN_PIECES = 3;

interface WaitingProps {
  cardId: string;
  progress: ProgressEvent[];
  startedAt: number;
  queue?: number;
  /** Les trouvailles déjà sorties, dans l'ordre où les montrer (§18.26). */
  findings?: Finding[];
  /** Le pseudo GitHub tapé (ou celui de la fiche) : son avatar et sa plaque. Sans lui, une silhouette. */
  login?: string | null;
  /** Une photo déjà connue, à la place de l'avatar du pseudo. */
  avatarUrl?: string | null;
  /** Entrée par LinkedIn : le nom du lien, sur la plaque tant que le nom n'est pas connu. */
  slug?: string | null;
  /** Entrée par CV : « TON CV » sur la plaque tant que le nom n'est pas lu. */
  cv?: boolean;
  /** Fiche prête : son nom et ses initiales, ceux mêmes de la fiche (la plaque et le portrait ne changent plus à la révélation). */
  name?: string | null;
  initials?: string | null;
  /** Le jour de la fiche, dès qu'elle est prête : la plaque de l'attente et celle de la fiche portent la même date. */
  createdAt?: string | null;
  /** La fiche est prête : rendre la main dès que les trouvailles minimales sont lues. */
  ready?: boolean;
  onRelease?: () => void;
  /** La fiche est prête, le film pas encore (« loading »), ou il attend un geste pour le son (« tap »). */
  scene?: "loading" | "tap";
  /** Le geste de la pilule « Lancer la poursuite ». */
  onOpen?: () => void;
  /** L'écran se lève : il s'efface en fondu sur la scène (ou la fiche) déjà dessous. */
  leaving?: boolean;
  /** Le commissariat ne répond plus (réseau coupé) : la barre s'arrête, « Réessayer » s'affiche. */
  offline?: boolean;
  /** « Réessayer » : relire l'état de la fiche tout de suite. Aucune nouvelle demande. */
  onRetry?: () => void;
}

const idOf = (f: Finding) => `${f.source}:${f.kind}`;

/** Un nom de dépôt ou de lien (« todo-app-v3 », « org/repo ») : un seul mot, jamais coupé à son trait d'union. */
const IDENT = /([\p{L}\p{N}]+(?:[-_/.][\p{L}\p{N}]+)+)/u;

/** Les noms d'un morceau de phrase, chacun d'un seul tenant (points de suspension s'il déborde). */
function words(text: string, k: string) {
  return text.split(IDENT).map((part, i) =>
    i % 2 ? (
      <span className="piece-ident" key={`${k}${i}`}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** La phrase d'une pièce, son chiffre clé en avant (comme FindingText), ses noms d'un seul tenant. */
function PieceText({ finding, lang }: { finding: Finding; lang: Lang }) {
  const text = pick(finding.text, lang);
  const key = finding.key ? pick(finding.key, lang) : "";
  const i = key ? text.indexOf(key) : -1;
  if (i < 0) return <>{words(text, "t")}</>;
  return (
    <>
      {words(text.slice(0, i), "a")}
      <strong className="finding-key">{key}</strong>
      {words(text.slice(i + key.length), "b")}
    </>
  );
}

export function Waiting({ cardId, progress, startedAt, queue, findings = [], login, avatarUrl, slug, cv = false, name, initials, createdAt, ready = false, onRelease, scene, onOpen, leaving = false, offline = false, onRetry }: WaitingProps) {
  const { t, lang } = useT();
  // L'attente s'ouvre en haut de la page, avant sa première image : jamais à la hauteur où l'accueil était défilé.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  // Tant qu'elle couvre l'écran, la page dessous (la fiche déjà posée, le film qui se prépare) est
  // inerte : ni focus, ni lecture d'écran, ni annonce de la fiche avant sa révélation. Reposé à
  // chaque rendu, la page dessous changeant d'élément en route (chargement, puis fiche).
  useLayoutEffect(() => {
    const main = document.getElementById("main");
    if (!main || leaving) return;
    main.inert = true;
    return () => {
      main.inert = false;
    };
  });
  // Levée sur une fiche posée sans film (film pas prêt, mouvement réduit), ou sur l'erreur (délai
  // dépassé) : le focus va à son titre, comme après le film. Pendant un film, la page le donnera à la fin.
  useEffect(
    () => () => {
      const head = document.querySelector<HTMLElement>(".page-result:not(.is-animating) .wanted-head, #main .error-panel h1, #main .err h1");
      if (!head || (document.activeElement && document.activeElement !== document.body)) return;
      if (!head.hasAttribute("tabindex")) head.setAttribute("tabindex", "-1");
      head.focus({ preventScroll: true });
    },
    [],
  );
  // La plaque porte dès le début le nom qu'aura la fiche, et n'en change plus en route (§18.52) :
  // le premier nom connu (pseudo tapé, nom du lien LinkedIn, « TON CV », ou celui de la fiche) reste.
  const who = useRef<{ login?: string | null; slug?: string | null; cv: boolean; name?: string | null; initials?: string | null } | null>(null);
  if (!who.current && (login || slug || cv || name)) who.current = { login, slug, cv, name: login || slug || cv ? null : name, initials: login || slug || cv ? null : initials };
  const plate = who.current ?? { login, slug, cv, name, initials };
  const [lines, setLines] = useState<Line[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const consumed = useRef(0);
  const lastAt = useRef(0);
  const uid = useRef(0);
  const usedFillers = useRef<Set<number>>(new Set());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // Les pièces versées, dans l'ordre où elles sont tombées : une source arrivée
  // plus tard (LinkedIn) se range après, sans réordonner ce qui est déjà lu.
  const [pieces, setPieces] = useState<Finding[]>([]);
  const piecesRef = useRef<Finding[]>([]);
  const lastPieceAt = useRef(0);
  const findingsRef = useRef(findings);
  findingsRef.current = findings;
  const release = useRef({ ready, onRelease, done: false });
  release.current = { ...release.current, ready, onRelease };
  const offlineRef = useRef(offline);
  offlineRef.current = offline;

  const known = t.waiting.progress;
  // Le remplissage ne parle que de ce qu'on lit : le parcours (LinkedIn, CV), GitHub, ou les deux.
  const f = t.waiting.fillers;
  const fromGithub = !!login;
  const fromPath = !!slug || cv || !login;
  const fillers = useMemo(() => [...f.all, ...(fromPath ? f.path : []), ...(fromGithub ? f.github : [])], [f, fromPath, fromGithub]);
  const fillersRef = useRef(fillers);
  fillersRef.current = fillers;

  useEffect(() => {
    const tick = () => {
      const ts = Date.now();
      setNow(ts);
      // Fiche prête : au moins trois pièces (ou toutes s'il y en a moins), la dernière lue.
      // Vérifié avant de verser la suivante, sinon elle tomberait au moment même de rendre la main.
      // La main rendue, l'attente peut rester (la scène 3D se charge) : les pièces continuent de tomber.
      const r = release.current;
      if (r.ready && !r.done) {
        const need = Math.min(MIN_PIECES, new Set([...piecesRef.current, ...findingsRef.current].map(idOf)).size);
        if (piecesRef.current.length >= need && (need === 0 || ts - lastPieceAt.current >= PIECE_MS)) {
          r.done = true;
          r.onRelease?.();
          return;
        }
      }
      // Une pièce de plus au dossier, toutes les PIECE_MS.
      if (ts - lastPieceAt.current >= PIECE_MS) {
        const seen = new Set(piecesRef.current.map(idOf));
        const next = findingsRef.current.find((f) => !seen.has(idOf(f)));
        if (next) {
          lastPieceAt.current = ts;
          piecesRef.current = [...piecesRef.current, next];
          setPieces(piecesRef.current);
        }
      }
      // Fiche prête : plus rien à annoncer, la dernière ligne reste. Réseau coupé : rien de neuf non plus.
      if (r.ready || offlineRef.current) return;
      const evts = progressRef.current.filter((e) => known[e.key]);
      if (ts - lastAt.current < MIN_GAP) return;
      if (consumed.current < evts.length) {
        const e = evts[consumed.current++];
        lastAt.current = ts;
        setLines((prev) => {
          const last = prev[prev.length - 1];
          // Même clé qu'à l'instant (ex. compteur de buzzwords) : on met à jour sur place.
          if (last && last.key === e.key && !last.filler) return [...prev.slice(0, -1), { ...last, n: e.n }];
          return [...prev, { uid: uid.current++, key: e.key, n: e.n }].slice(-3);
        });
      } else if (lastAt.current === 0) {
        // Premier message tout de suite, avant même le premier événement.
        lastAt.current = ts;
        setLines([{ uid: uid.current++, key: "start" }]);
      } else if (ts - lastAt.current >= FILL_AFTER) {
        const total = fillersRef.current.length;
        let idx = Math.floor(Math.random() * total);
        for (let i = 0; i < total && usedFillers.current.has(idx); i++) idx = (idx + 1) % total;
        if (usedFillers.current.size >= total) usedFillers.current.clear();
        usedFillers.current.add(idx);
        lastAt.current = ts;
        setLines((prev) => [...prev, { uid: uid.current++, key: "filler", filler: idx }].slice(-3));
      }
    };
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textOf = (l: Line) => (l.filler !== undefined ? fillers[l.filler] ?? "" : known[l.key]?.(l.n) ?? "");
  // En file d'attente, une seule ligne : combien passent avant toi.
  const queued = queue !== undefined && queue > 0;
  const queueLine: Line | undefined = queued ? { uid: -(queue ?? 1), key: "queue" } : undefined;
  // Le film se prépare : c'est la seule chose qui reste à dire, jusqu'au fondu compris. Une fois
  // dite, la ligne ne revient jamais à une étape d'avant (elle ne recule pas avant le film).
  const sceneSaid = useRef(false);
  if (scene === "loading") sceneSaid.current = true;
  const sceneOn = scene === "loading" || sceneSaid.current;
  const sceneLine: Line | undefined = sceneOn ? { uid: -1000, key: "scene" } : undefined;
  // Réseau coupé pendant la préparation : le commissariat ne répond pas.
  const offLine: Line | undefined = offline && !ready ? { uid: -2000, key: "offline" } : undefined;
  // La pilule du geste : la fiche est prête, la ligne le dit (plus de progression périmée dessous).
  const tapLine: Line | undefined = scene === "tap" ? { uid: -3000, key: "ready" } : undefined;
  const current = offLine ?? tapLine ?? sceneLine ?? queueLine ?? lines[lines.length - 1];
  const piece = pieces[pieces.length - 1];
  const lineText = (l: Line) => (l.key === "offline" ? t.waiting.offline : l.key === "ready" ? t.waiting.ready : l.key === "scene" ? t.waiting.scene : l.key === "queue" ? t.waiting.queue(queue ?? 1) : textOf(l));

  // La barre reste au départ tant que la fiche est en file, et part quand elle passe.
  const barFrom = useRef(startedAt);
  if (queued) barFrom.current = now;
  // Réseau coupé : la barre s'arrête là où elle est, et ce temps-là ne compte pas.
  const paused = useRef<{ ms: number; since: number | null }>({ ms: 0, since: null });
  if (offLine && paused.current.since === null) paused.current.since = now;
  if (!offLine && paused.current.since !== null) {
    paused.current.ms += Math.max(0, now - paused.current.since);
    paused.current.since = null;
  }
  const pausedMs = paused.current.ms + (paused.current.since !== null ? Math.max(0, now - paused.current.since) : 0);
  const barElapsed = Math.max(0, now - Math.max(startedAt, barFrom.current) - pausedMs);
  // La barre avance sur la durée estimée, puis ralentit : elle ne touche jamais 100 avant la fiche.
  const pct = useMemo(() => {
    if (ready) return 100;
    const linear = Math.min(1, barElapsed / EXPECTED_MS) * 82;
    const tail = 14 * (1 - Math.exp(-Math.max(0, barElapsed - EXPECTED_MS) / 6000));
    return Math.round(linear + tail);
  }, [barElapsed, ready]);

  // Ce qui tient la place de la barre : la pilule du geste, « Réessayer », ou la barre elle-même.
  const act =
    scene === "tap" ? (
      // Le son demande un geste : une pilule à portée de pouce, jamais un texte gris.
      <button type="button" className="pill pill-big load-act-btn" onClick={onOpen}>
        {t.reveal.open}
      </button>
    ) : offLine ? (
      <button type="button" className="pill pill-big load-act-btn" onClick={onRetry}>
        {t.waiting.retry}
      </button>
    ) : (
      <div className={`load-bar${sceneOn ? " is-busy" : ""}`} aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
    );

  return (
    <section className={`loadscreen${leaving ? " is-leaving" : ""}${offLine ? " is-offline" : ""}`} aria-labelledby="waiting-title" inert={leaving ? true : undefined}>
      <div className="load-main">
        <header className="load-head">
          <p className="load-brand label" aria-hidden>
            <AzeritMark size={14} />
            Azerit
          </p>
          <h1 id="waiting-title" className="load-title">
            {t.waiting.title}
          </h1>
        </header>
        <Mugshot cardId={cardId} login={plate.login} slug={plate.slug} cv={plate.cv} name={plate.name} initials={plate.initials} src={avatarUrl} createdAt={createdAt ?? startedAt} />
        <div className="load-dossier" aria-hidden>
          {/* les pièces d'avant, en pile sous la dernière ; avant la première, une feuille vierge à sa place */}
          <div className="pile">
            {pieces.length > 2 && <span className="pile-sheet is-2" />}
            {pieces.length > 1 && <span className="pile-sheet is-1" />}
            {piece ? (
              <article className="piece" key={idOf(piece)}>
                <p className="piece-no">{t.waiting.piece(pieces.length)}</p>
                <p className="piece-text">
                  <PieceText finding={piece} lang={lang} />
                </p>
              </article>
            ) : (
              // Fiche prête sans pièce (servie du cache) : pas de feuille vierge qui promet une pièce à venir.
              !ready && <article className="piece is-blank">
                <p className="piece-no">{t.waiting.piece(1)}</p>
                <span className="piece-skel" />
                <span className="piece-skel is-short" />
              </article>
            )}
          </div>
        </div>
      </div>

      {/* En bas, à une place fixe : la barre (ou le bouton qui la remplace), puis la ligne sur deux rangs réservés. */}
      <div className="load-foot">
        <div className="load-act">{act}</div>
        <p className={`load-line${offLine ? " is-alert" : ""}`} aria-hidden key={current?.uid}>
          {current ? lineText(current) : ""}
        </p>
        {/* Une seule annonce à la fois pour les lecteurs d'écran. */}
        <p className="sr-only" aria-live="polite">
          {offLine ? t.waiting.offline : sceneLine ? t.waiting.scene : piece ? `${t.waiting.piece(pieces.length)}${lang === "fr" ? "\u00a0: " : ": "}${piece.text[lang]}` : current ? lineText(current) : ""}
        </p>
      </div>
    </section>
  );
}
