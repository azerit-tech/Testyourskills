// Top de la semaine sur l'accueil (§18.22) : jusqu'à dix dossiers de la semaine,
// une ligne chacun. Les cinq places du top 5 sont toujours là, les vides
// appellent à jouer (un toucher ramène au champ du pseudo) ; les places 6 à 10
// n'apparaissent qu'occupées. Mat, sans dégradé : celui de l'écran est la fiche.
import { useEffect, useState } from "react";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";

const SIZE = 10;
const TOP = 5;
const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

/** Six étoiles comme sur la fiche : les allumées à droite, blanches et mates. */
function Stars({ n }: { n: number }) {
  return (
    <span className="board-stars" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i >= 6 - n ? "on" : undefined}>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

/** L'heure, relue chaque minute, pour le compte à rebours. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Row({ e }: { e: TopEntry }) {
  const { t } = useT();
  const href = `/c/${e.cardId}`;
  // Avatar introuvable : l'initiale, jamais l'icône d'image cassée.
  const [broken, setBroken] = useState(false);
  return (
    <li>
      <a className="board-row" href={href} onClick={(ev) => onLinkClick(ev, href)} aria-label={t.home.top.rowLabel(e.rank, e.login, e.overall)}>
        <span className="board-rank">{e.rank}</span>
        <span className="board-avatar">
          {e.avatarUrl && !broken ? (
            <img src={e.avatarUrl} alt="" width={32} height={32} loading="lazy" onError={() => setBroken(true)} />
          ) : (
            e.login.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="board-login">@{e.login}</span>
        <Stars n={e.stars} />
        <span className="board-score">{e.overall}</span>
      </a>
    </li>
  );
}

function Free({ rank, onPlay }: { rank: number; onPlay: () => void }) {
  const { t } = useT();
  return (
    <li>
      <button type="button" className="board-row is-free" onClick={onPlay} aria-label={t.home.top.freeLabel(rank)}>
        <span className="board-rank">{rank}</span>
        <span className="board-avatar" />
        <span className="board-login">{t.home.top.free}</span>
      </button>
    </li>
  );
}

export function WeekBoard({ onPlay }: { onPlay: () => void }) {
  const { t } = useT();
  const tt = t.home.top;
  const [top, setTop] = useState<WeekTop | null>(null);
  const now = useMinute();

  // Chargé à l'ouverture, puis de nouveau quand la semaine tourne.
  const ended = top !== null && now >= top.endsAt;
  useEffect(() => {
    let alive = true;
    void api.getTop().then((t) => alive && setTop(t));
    return () => {
      alive = false;
    };
  }, [ended]);

  if (!top) return null;

  const left = Math.max(0, top.endsAt - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  // Le top 5 en entier, places libres comprises ; au-delà, seulement les occupées.
  const rest = top.entries.slice(TOP, SIZE);

  return (
    <section className="board" aria-labelledby="board-title">
      <h2 id="board-title">{tt.title}</h2>
      <p className="board-meta">{tt.meta(top.week, top.total, tt.left(d, h, m))}</p>
      <div className="board-top">
        {rest.length > 0 && <p className="board-tag">{tt.cut}</p>}
        <ol className="board-list is-top">
          {Array.from({ length: TOP }, (_, i) => {
            const e = top.entries[i];
            return e ? <Row key={e.cardId} e={e} /> : <Free key={`free-${i}`} rank={i + 1} onPlay={onPlay} />;
          })}
        </ol>
      </div>
      {rest.length > 0 && (
        <ol className="board-list is-rest" start={TOP + 1}>
          {rest.map((e) => (
            <Row key={e.cardId} e={e} />
          ))}
        </ol>
      )}
    </section>
  );
}
