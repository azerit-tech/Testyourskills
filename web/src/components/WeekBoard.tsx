// Top du mois sur l'accueil (§18.22, §18.48, §18.128) : jusqu'à dix fiches du
// mois, une ligne chacune, sous l'étiquette « Top 10 » : ce qu'on voit est ce
// qu'elle dit (Jacques, 20 nov. 2026). Mois vide : rien. Mat, sans dégradé :
// celui de l'écran est la fiche.
// Le tableau garde l'ancre « semaine » (les liens déjà partagés) ; la ligne de la fiche en mémoire y est mise en évidence.
// Plus de dix classés : « Voir tout le classement (27) » ouvre la suite sur place (§18.126).
import { useEffect, useRef, useState } from "react";
import { personLabel } from "../../../shared/boardPerson";
import type { TopEntry, WeekTop } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { myCard, type MyCard } from "../lib/session";
import { Avatar } from "./Avatar";
import { SeeAllView, useSeeAll } from "./SeeAll";
import { RowSub } from "./RowSub";

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
/** L'ancre du tableau : le rang du mois d'une fiche y mène (« /#semaine »). */
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
  // La vraie personne (§18.88) : son nom court (« Enzo L. », §18.127), une fiche LinkedIn seule comprise ; sans nom, son @pseudo.
  const who = personLabel(e) || e.initials;
  const href = `/c/${e.cardId}`;
  return (
    <li>
      <a className={`board-row${me ? " is-me" : ""}`} href={href} onClick={(ev) => onLinkClick(ev, href)} aria-label={t.home.top.rowLabel(e.rank, who, e.overall)} aria-current={me ? "true" : undefined}>
        <span className="board-rank">{e.rank}</span>
        {/* sans photo sûre, les initiales de la fiche (Avatar.tsx) */}
        <Avatar login={e.login} src={e.avatarUrl ?? ""} initials={e.initials} />
        <span className="board-login">{who}</span>
        {/* Ses étoiles et son niveau ; ni lien ni logo de profil (§18.127) : on passe par sa fiche. */}
        <RowSub stars={e.stars} seniority={e.seniority} />
        <BoardScore n={e.overall} />
      </a>
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

  // Chargé à l'ouverture, puis de nouveau quand le mois tourne.
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

/** La suite du mois, lue à la demande (§18.126). */
const loadTop = (offset: number, limit: number) => api.getTopPage(offset, limit).then((p) => p && { total: p.total, rows: p.entries });

/**
 * Plus de dix classés : « Voir tout le classement (27) », qui ouvre la suite sur place, après un
 * filet, dans les mêmes lignes ; la mienne y est mise en évidence. `initial` : déjà ouvert (tests).
 */
function TopMore({ top, mine, initial }: { top: WeekTop; mine?: MyCard | null; initial?: TopEntry[] }) {
  const all = useSeeAll<TopEntry>(SIZE, top.total, loadTop, initial && { open: true, rows: initial });
  return (
    <SeeAllView state={all}>
      {all.rows.length > 0 && (
        <ol className="board-list is-rest" start={all.rows[0]!.rank}>
          {all.rows.map((e) => (
            <Row key={e.cardId ?? `rang-${e.rank}`} e={e} me={isMine(e, mine)} />
          ))}
        </ol>
      )}
    </SeeAllView>
  );
}

/** Le tableau d'un mois connu, sans appel au serveur tant que la suite n'est pas demandée. */
export function WeekBoardView({ top, now, mine, rest }: { top: WeekTop; now: number; onPlay: () => void; mine?: MyCard | null; rest?: TopEntry[] }) {
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
  // Les dix premières, d'un seul bloc. Mois sans fiche : rien, le tableau vient avec la première (Jacques, 20 nov.).
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
      {/* Un autre mois : la liste ouverte se referme. */}
      {top.total > SIZE && rows.length === SIZE && <TopMore key={top.weekStart} top={top} mine={mine} initial={rest} />}
    </section>
  );
}
