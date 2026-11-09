// Attente (§18.27) : la photo d'identité. Sur un fond d'encre plat, le cadre de
// la fiche (toise et plaque, Mugshot.tsx) avec l'avatar du pseudo dès la
// première seconde ; dessous, le pari (« Tu plaides combien d'étoiles ? »,
// Plea.tsx) ; en bas, la barre qui avance sur la durée estimée et les messages
// du §6.2, nourris par les ProgressEvent quand il y en a, sinon par du
// remplissage. En file d'attente, une seule ligne dit combien de fiches passent
// avant, et la barre attend.
//
// L'enquête en direct (§18.26) : dès que la collecte a parlé, les trouvailles
// tombent une à une sous la photo, toutes les 2,5 s, comme des pièces versées
// au dossier ; la dernière reste. Les messages de progression passent alors en
// petit, sous la barre. Fiche prête avant la fin : `ready`, et on rend la main
// (`onRelease`) une fois au moins trois pièces versées et lues.
//
// Plus d'écran noir (§18.27) : l'attente reste à l'écran tant que la scène 3D
// n'est pas prête (`scene="loading"`, « La scène se charge »), et porte la
// pilule « Ouvrir mon dossier » quand le son demande un geste (`scene="tap"`).
import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, ProgressEvent } from "../../../shared/types";
import { useT } from "../i18n";
import { FindingText } from "./Findings";
import { Mugshot } from "./Mugshot";
import { PleaPrompt } from "./Plea";

interface Line {
  uid: number;
  key: string;
  n?: number;
  filler?: number;
}

const MIN_GAP = 950; // un message reste lisible au moins ce temps
const FILL_AFTER = 2300; // silence avant un message de remplissage
/** Durée estimée d'une carte : la barre y arrive presque, jamais tout à fait. */
const EXPECTED_MS = 11_000;
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
  /** Le pari se propose (une vraie attente, pas une fiche servie du cache). */
  plea?: boolean;
  /** La fiche est prête : rendre la main dès que les trouvailles minimales sont lues. */
  ready?: boolean;
  onRelease?: () => void;
  /** La fiche est prête, la scène 3D pas encore (« loading »), ou elle attend un geste pour le son (« tap »). */
  scene?: "loading" | "tap";
  /** Le geste de la pilule « Ouvrir mon dossier ». */
  onOpen?: () => void;
  /** L'écran se lève : il s'efface en fondu sur la scène (ou la fiche) déjà dessous. */
  leaving?: boolean;
}

const idOf = (f: Finding) => `${f.source}:${f.kind}`;

export function Waiting({ cardId, progress, startedAt, queue, findings = [], login, avatarUrl, plea = false, ready = false, onRelease, scene, onOpen, leaving = false }: WaitingProps) {
  const { t, lang } = useT();
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

  const known = t.waiting.progress;

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
      // Fiche prête : plus rien à annoncer, la dernière ligne reste.
      if (r.ready) return;
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
        const total = t.waiting.fillers.length;
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

  const textOf = (l: Line) => (l.filler !== undefined ? t.waiting.fillers[l.filler] : known[l.key]?.(l.n) ?? "");
  // En file d'attente, une seule ligne : combien passent avant toi.
  const queued = queue !== undefined && queue > 0;
  const queueLine: Line | undefined = queued ? { uid: -(queue ?? 1), key: "queue" } : undefined;
  // La scène 3D se charge : c'est la seule chose qui reste à dire.
  const sceneLine: Line | undefined = scene === "loading" ? { uid: -1000, key: "scene" } : undefined;
  const current = sceneLine ?? queueLine ?? lines[lines.length - 1];
  // L'enquête a commencé : la progression passe en une petite ligne, les pièces prennent la place.
  const piece = pieces[pieces.length - 1];
  const previous = sceneLine || queued || piece ? undefined : lines[lines.length - 2];
  const lineText = (l: Line) => (l.key === "scene" ? t.waiting.scene : l.key === "queue" ? t.waiting.queue(queue ?? 1) : textOf(l));

  // La barre reste au départ tant que la fiche est en file, et part quand elle passe.
  const barFrom = useRef(startedAt);
  if (queued) barFrom.current = now;
  const barElapsed = Math.max(0, now - Math.max(startedAt, barFrom.current));
  // La barre avance sur la durée estimée, puis ralentit : elle ne touche jamais 100 avant la fiche.
  const pct = useMemo(() => {
    if (ready) return 100;
    const linear = Math.min(1, barElapsed / EXPECTED_MS) * 82;
    const tail = 14 * (1 - Math.exp(-Math.max(0, barElapsed - EXPECTED_MS) / 6000));
    return Math.round(linear + tail);
  }, [barElapsed, ready]);

  return (
    <section className={`loadscreen${leaving ? " is-leaving" : ""}`} aria-labelledby="waiting-title" inert={leaving ? true : undefined}>
      <h1 id="waiting-title" className="sr-only">
        {t.waiting.title}
      </h1>

      <div className="load-main">
        <Mugshot cardId={cardId} login={login} src={avatarUrl} />
        {plea && <PleaPrompt cardId={cardId} />}
        {piece && (
          <div className="load-dossier" aria-hidden>
            {/* les pièces d'avant, en pile sous la dernière */}
            <div className="pile">
              {pieces.length > 2 && <span className="pile-sheet is-2" />}
              {pieces.length > 1 && <span className="pile-sheet is-1" />}
              <article className="piece" key={idOf(piece)}>
                <p className="piece-no">{t.waiting.piece(pieces.length)}</p>
                <p className="piece-text">
                  <FindingText finding={piece} lang={lang} />
                </p>
              </article>
            </div>
          </div>
        )}
      </div>

      <div className={`load-foot${piece ? " is-quiet" : ""}`}>
        {scene === "tap" ? (
          // Le son demande un geste : une pilule à portée de pouce, jamais un texte gris.
          <button type="button" className="pill pill-big load-open" onClick={onOpen}>
            {t.reveal.open}
          </button>
        ) : (
          <>
            <div className="load-lines" aria-hidden>
              {previous && (
                <p className="load-line is-prev" key={previous.uid}>
                  {textOf(previous)}
                </p>
              )}
              {current && (
                <p className="load-line is-current" key={current.uid}>
                  {lineText(current)}
                </p>
              )}
            </div>
            <div className={`load-bar${scene === "loading" ? " is-busy" : ""}`} aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        {/* Une seule annonce à la fois pour les lecteurs d'écran. */}
        <p className="sr-only" aria-live="polite">
          {sceneLine ? t.waiting.scene : piece ? `${t.waiting.piece(pieces.length)} : ${piece.text[lang]}` : current ? lineText(current) : ""}
        </p>
      </div>
    </section>
  );
}
