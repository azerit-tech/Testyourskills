// Attente (§17.5) : l'écran de chargement du jeu. Des illustrations défilent en
// fondu plein écran, avec un lent zoom ; en bas, une barre jaune avance sur la
// durée estimée, et les messages du §6.2 passent dessous, nourris par les
// ProgressEvent quand il y en a, sinon par du remplissage. En file d'attente,
// une seule ligne dit combien de fiches passent avant, et la barre attend.
//
// L'enquête en direct (§18.26) : dès que la collecte a parlé, les trouvailles
// tombent une à une, toutes les 2,5 s, comme des pièces versées au dossier ; la
// dernière reste. Les messages de progression passent alors en petit, sous la
// barre. Fiche prête avant la fin : `ready`, et on rend la main (`onRelease`)
// une fois au moins trois pièces versées et lues.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Finding, ProgressEvent } from "../../../shared/types";
import { useT } from "../i18n";
import { FindingText } from "./Findings";
import { PAINTED, SCENES } from "./LoadingScenes";

interface Line {
  uid: number;
  key: string;
  n?: number;
  filler?: number;
}

const MIN_GAP = 950; // un message reste lisible au moins ce temps
const FILL_AFTER = 2300; // silence avant un message de remplissage
const SLIDE_MS = 4600; // une illustration toutes les 4 à 5 s
/** Durée estimée d'une carte : la barre y arrive presque, jamais tout à fait. */
const EXPECTED_MS = 11_000;
/** Une trouvaille toutes les 2,5 s. */
const PIECE_MS = 2500;
/** Fiche prête : on laisse au moins ce nombre de trouvailles tomber avant la révélation. */
const MIN_PIECES = 3;

interface WaitingProps {
  progress: ProgressEvent[];
  startedAt: number;
  queue?: number;
  /** Les trouvailles déjà sorties, dans l'ordre où les montrer (§18.26). */
  findings?: Finding[];
  /** La fiche est prête : rendre la main dès que les trouvailles minimales sont lues. */
  ready?: boolean;
  onRelease?: () => void;
}

const idOf = (f: Finding) => `${f.source}:${f.kind}`;

export function Waiting({ progress, startedAt, queue, findings = [], ready = false, onRelease }: WaitingProps) {
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
      const r = release.current;
      if (r.done) return;
      if (r.ready) {
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
  const current = queueLine ?? lines[lines.length - 1];
  // L'enquête a commencé : la progression passe en une petite ligne, les pièces prennent la place.
  const piece = pieces[pieces.length - 1];
  const previous = queued || piece ? undefined : lines[lines.length - 2];
  const lineText = (l: Line) => (l.key === "queue" ? t.waiting.queue(queue ?? 1) : textOf(l));

  const elapsed = Math.max(0, now - startedAt);
  // La barre reste au départ tant que la fiche est en file, et part quand elle passe.
  const barFrom = useRef(startedAt);
  if (queued) barFrom.current = now;
  const barElapsed = Math.max(0, now - Math.max(startedAt, barFrom.current));
  // La barre avance sur la durée estimée, puis ralentit : elle ne touche jamais 100 avant la fin.
  const pct = useMemo(() => {
    const linear = Math.min(1, barElapsed / EXPECTED_MS) * 82;
    const tail = 14 * (1 - Math.exp(-Math.max(0, barElapsed - EXPECTED_MS) / 6000));
    return Math.round(linear + tail);
  }, [barElapsed]);

  // Les illustrations : les peintes si elles existent, sinon les scènes dessinées.
  const count = PAINTED.length || SCENES.length;
  const offset = useMemo(() => Math.floor(Math.random() * count), [count]);
  const slide = (offset + Math.floor(elapsed / SLIDE_MS)) % count;
  const Scene = PAINTED.length ? null : SCENES[slide];
  const PrevScene = PAINTED.length ? null : SCENES[(slide + count - 1) % count];

  return (
    <section className="loadscreen" aria-labelledby="waiting-title">
      <h1 id="waiting-title" className="sr-only">
        {t.waiting.title}
      </h1>
      <div className="load-slides" aria-hidden>
        {/* deux calques : l'illustration précédente reste sous la nouvelle le temps du fondu */}
        <div className="load-slide is-prev" key={`p${slide}`}>
          {PAINTED.length ? <img src={PAINTED[(slide + count - 1) % count]} alt="" /> : PrevScene && <PrevScene />}
        </div>
        <div className="load-slide is-current" key={`c${slide}`}>
          {PAINTED.length ? <img src={PAINTED[slide]} alt="" /> : Scene && <Scene />}
        </div>
      </div>

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

      <div className={`load-foot${piece ? " is-quiet" : ""}`}>
        <div className="load-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
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
        <p className="load-title" aria-hidden>
          {t.waiting.title}
        </p>
        {/* Une seule annonce à la fois pour les lecteurs d'écran. */}
        <p className="sr-only" aria-live="polite">
          {piece ? `${t.waiting.piece(pieces.length)} : ${piece.text[lang]}` : current ? lineText(current) : ""}
        </p>
      </div>
    </section>
  );
}
