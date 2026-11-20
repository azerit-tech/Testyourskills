// Top de la semaine sur l'accueil (§18.22, §18.48) : jusqu'à dix fiches de la
// semaine, une ligne chacune. Semaine vide (le matin du lancement) : un seul bloc
// d'invitation. Top 5 incomplet : les lignes réelles, puis une seule ligne pour
// les places libres, qui ramène au champ. Les places 6 à 10 n'apparaissent
// qu'occupées. Mat, sans dégradé : celui de l'écran est la fiche.
// Le tableau porte l'ancre « semaine » ; la ligne de la fiche en mémoire y est mise en évidence.
import { useEffect, useRef, useState } from "react";
import { personLabel } from "../../../shared/boardPerson";
import { personLinks } from "../../../shared/profileLinks";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { myCard, type MyCard } from "../lib/session";
import { Avatar } from "./Avatar";
import { ProfileLinks } from "./ProfileLinks";
import { Stars } from "./Stars";

const SIZE = 10;
/** L'échelle des notes, dite une fois en tête du tableau (§18.48 : toute note a son échelle). */
export const SCALE = "/100";
const TOP = 5;
/** L'ancre du tableau : le rang de la semaine d'une fiche y mène (« /#semaine »). */
export const WEEK_ANCHOR = "semaine";

/** L'heure, relue chaque minute, pour le compte à rebours. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Ma ligne : la fiche en mémoire, ou une autre fiche du même pseudo. */
const isMine = (e: TopEntry, mine: MyCard | null | undefined) => !!mine && (e.cardId === mine.id || (!!mine.login && e.login?.toLowerCase() === mine.login));

function Row({ e, me }: { e: TopEntry; me: boolean }) {
  const { t } = useT();
  // La vraie personne (§18.88) : le nom de sa fiche, une fiche LinkedIn seule comprise ; sans nom, son @pseudo.
  const who = personLabel(e) || e.initials;
  const href = `/c/${e.cardId}`;
  return (
    <li>
      <a className={`board-row${me ? " is-me" : ""}`} href={href} onClick={(ev) => onLinkClick(ev, href)} aria-label={t.home.top.rowLabel(e.rank, who, e.overall)} aria-current={me ? "true" : undefined}>
        <span className="board-rank">{e.rank}</span>
        {/* sans photo sûre, les initiales de la fiche (Avatar.tsx) */}
        <Avatar login={e.login} src={e.avatarUrl ?? ""} initials={e.initials} />
        <span className="board-login">{who}</span>
        <Stars n={e.stars} size={14} />
        <span className="board-score">{e.overall}</span>
      </a>
      {/* Ses profils LinkedIn et GitHub (§18.108), au bout de la ligne, hors du lien vers sa fiche. */}
      <ProfileLinks links={personLinks(e)} who={who} />
    </li>
  );
}

/** Les places du top 5 encore libres, en une seule ligne : « Places 3 à 5 libres », et l'invitation à en prendre une. */
function Free({ from, onPlay }: { from: number; onPlay: () => void }) {
  const { t } = useT();
  const tt = t.home.top;
  return (
    <li>
      <button type="button" className="board-row is-free" onClick={onPlay}>
        <span className="board-rank" aria-hidden />
        <span className="board-avatar" aria-hidden />
        <span className="board-login">{tt.freeRange(from, TOP)}</span>
        <span className="board-take">{tt.take(TOP - from + 1)}</span>
      </button>
    </li>
  );
}

/** Semaine sans fiche : la première place est à prendre, un seul bloc le dit. */
function Empty({ onPlay }: { onPlay: () => void }) {
  const { t } = useT();
  const tt = t.home.top;
  return (
    <div className="block block-info board-empty">
      <h3 className="t-block">{tt.emptyTitle}</h3>
      <p>{tt.emptyText}</p>
      <button type="button" className="pill" onClick={onPlay}>
        {t.home.submit}
      </button>
    </div>
  );
}

/** Tant que le top n'a pas répondu : le titre et la place du top 5, pour que rien ne saute dessous. */
function Wait() {
  const { t } = useT();
  const tt = t.home.top;
  return (
    <section className="board" id={WEEK_ANCHOR} aria-labelledby="board-title" aria-busy="true">
      <h2 id="board-title">{tt.title}</h2>
      <p className="board-meta" aria-hidden>
        {"\u00a0"}
      </p>
      <div className="board-top">
        <p className="board-tag">{tt.cut}</p>
        <span className="board-scale" aria-hidden>
          {SCALE}
        </span>
        <div className="board-list is-top board-wait" />
      </div>
    </section>
  );
}

export function WeekBoard({ onPlay }: { onPlay: () => void }) {
  // `undefined` : pas encore répondu (la place est tenue) ; `null` : le serveur ne répond pas (rien).
  const [top, setTop] = useState<WeekTop | null | undefined>(undefined);
  const now = useMinute();

  // Chargé à l'ouverture, puis de nouveau quand la semaine tourne.
  const ended = !!top && now >= top.endsAt;
  useEffect(() => {
    let alive = true;
    api
      .getTop()
      .then((t) => alive && setTop(t))
      .catch(() => alive && setTop((cur) => cur ?? null));
    return () => {
      alive = false;
    };
  }, [ended]);

  // La fiche en mémoire, lue une fois : sa ligne est mise en évidence.
  const [mine] = useState(() => myCard());

  if (top === undefined) return <Wait />;
  if (!top) return null;
  return <WeekBoardView top={top} now={now} onPlay={onPlay} mine={mine} />;
}

/** Le tableau d'une semaine connue, sans appel au serveur. */
export function WeekBoardView({ top, now, onPlay, mine }: { top: WeekTop; now: number; onPlay: () => void; mine?: MyCard | null }) {
  const { t } = useT();
  const tt = t.home.top;
  // Venu par l'ancre (« /#semaine », depuis le rang d'une fiche) : le tableau n'existait
  // pas encore quand le navigateur l'a cherchée, on y descend dès qu'il est là.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash.slice(1).split("?")[0] === WEEK_ANCHOR) section.current?.scrollIntoView({ block: "start" });
  }, []);
  const left = Math.max(0, top.endsAt - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  // Le top 5, puis une ligne pour ses places libres ; au-delà, seulement les occupées.
  const first = top.entries.slice(0, TOP);
  const rest = top.entries.slice(TOP, SIZE);

  return (
    <section className="board" id={WEEK_ANCHOR} ref={section} aria-labelledby="board-title">
      <h2 id="board-title">{tt.title}</h2>
      <p className="board-meta">{tt.meta(top.week, top.total, tt.left(d, h, m))}</p>
      {first.length === 0 ? (
        <Empty onPlay={onPlay} />
      ) : (
        <div className="board-top">
          <p className="board-tag">{tt.cut}</p>
          <span className="board-scale" aria-hidden>
            {SCALE}
          </span>
          <ol className="board-list is-top">
            {first.map((e) => (
              <Row key={e.cardId ?? `rang-${e.rank}`} e={e} me={isMine(e, mine)} />
            ))}
            {first.length < TOP && <Free from={first.length + 1} onPlay={onPlay} />}
          </ol>
        </div>
      )}
      {rest.length > 0 && (
        <ol className="board-list is-rest" start={TOP + 1}>
          {rest.map((e) => (
            <Row key={e.cardId ?? `rang-${e.rank}`} e={e} me={isMine(e, mine)} />
          ))}
        </ol>
      )}
    </section>
  );
}
