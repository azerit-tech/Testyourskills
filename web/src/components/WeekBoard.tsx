// Top de la semaine sur l'accueil (§18.22, §18.48) : jusqu'à dix fiches de la
// semaine, une ligne chacune, sous l'étiquette « Top 10 » : ce qu'on voit est ce
// qu'elle dit (Jacques, 20 nov. 2026). Semaine vide : rien. Mat, sans dégradé :
// celui de l'écran est la fiche.
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
/** L'en-tête de la colonne des notes (§18.48 : toute note a son échelle) ; chaque note porte son « % » (§18.122). */
export const SCALE = "Score";

/** Une note du tableau : « 82 % », le signe plus petit et collé, pour tenir dans la colonne à 390 px (§18.122). */
export function BoardScore({ n }: { n: number }) {
  return (
    <span className="board-score">
      {n}
      <span className="board-pct">%</span>
    </span>
  );
}
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
        <BoardScore n={e.overall} />
      </a>
      {/* Ses profils LinkedIn et GitHub (§18.108), au bout de la ligne, hors du lien vers sa fiche. */}
      <ProfileLinks links={personLinks(e)} who={who} />
    </li>
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
        <p className="board-tag">{tt.tag}</p>
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
export function WeekBoardView({ top, now, mine }: { top: WeekTop; now: number; onPlay: () => void; mine?: MyCard | null }) {
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
  // Les dix premières, d'un seul bloc. Semaine sans fiche : rien, le tableau vient avec la première (Jacques, 20 nov.).
  const rows = top.entries.slice(0, SIZE);
  if (rows.length === 0) return null;

  return (
    <section className="board" id={WEEK_ANCHOR} ref={section} aria-labelledby="board-title">
      <h2 id="board-title">{tt.title}</h2>
      <p className="board-meta">{tt.meta(top.week, top.total, tt.left(d, h, m))}</p>
      {(
        <div className="board-top">
          <p className="board-tag">{tt.tag}</p>
          <span className="board-scale" aria-hidden>
            {SCALE}
          </span>
          <ol className="board-list is-top">
            {rows.map((e) => (
              <Row key={e.cardId ?? `rang-${e.rank}`} e={e} me={isMine(e, mine)} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
