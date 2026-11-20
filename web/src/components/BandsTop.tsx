// Le classement des écoles et des boîtes sur l'accueil (§18.92, §18.100) : un
// classement par ligue, fait comme le top de la semaine (WeekBoard). Cinq lignes :
// la place, le nom, les fiches, les étoiles ; une seule ligne pour les places
// libres, qui ramène au formulaire. Sa propre bande est mise en évidence ; plus bas
// que la cinquième place, elle vient après un filet. Une ligne touchée s'ouvre sur
// ses fiches (le nom, le visage, les étoiles, le lien vers chacune) : c'est ce que
// montrait la page d'une bande, qui n'existe plus. Le bloc porte l'ancre
// « classement » (« Classement » dans la barre du haut y mène).
import { useEffect, useId, useState } from "react";
import { personLabel } from "../../../shared/boardPerson";
import type { BandMember, BandStanding, BandsTop as Top, BandType } from "../../../shared/bands";
import { BAND_TYPES } from "../../../shared/bands";
import { RANKING_ANCHOR } from "../../../shared/routes";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { bandsApi, myBandIds } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import { Avatar } from "./Avatar";
import { Stars } from "./Stars";
import "./bands.css";

const TOP = 5;
/** Les fiches montrées sous une bande ouverte ; au-delà, leur nombre. */
const PEOPLE = 5;

type Mine = Partial<Record<BandType, string | null>>;

/**
 * `cardId` : la fiche en mémoire ; ses bandes sont lues sur elle (§18.82). Sans fiche,
 * ou si le serveur ne les dit pas : celles que ce navigateur a retenues.
 */
export function BandsTop({ onPlay, cardId }: { onPlay: () => void; cardId?: string }) {
  // `undefined` : pas encore répondu (la place est tenue) ; `null` : le serveur ne répond pas (rien, l'ancre reste).
  const [state, setState] = useState<{ top: Top; mine: Mine } | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const mb = cardId ? await bandsApi.mine(cardId).catch(() => null) : null;
      const mine: Mine = mb ? { ecole: mb.ecole?.id ?? null, boite: mb.boite?.id ?? null } : myBandIds();
      const top = await bandsApi.top(mine);
      if (alive) setState(top ? { top, mine } : null);
    })();
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (state === null) return <div className="leagues is-down" id={RANKING_ANCHOR} />;
  return <BandsTopView top={state?.top ?? null} mine={state?.mine} onPlay={onPlay} />;
}

/** Les fiches d'une bande ouverte, lues à la demande ; `null` : pas de réponse. */
function People({ b, id }: { b: BandStanding; id: string }) {
  const { t } = useT();
  const [list, setList] = useState<BandMember[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    bandsApi
      .page(b.type, b.id)
      .then((p) => alive && setList(p ? p.members : null))
      .catch(() => alive && setList(null));
    return () => {
      alive = false;
    };
  }, [b.type, b.id]);

  if (list === undefined) return <div className="league-people is-wait" id={id} aria-busy="true" />;
  // Les fiches nommées seulement (§18.88) : une fiche anonyme compte dans le nombre du bas.
  const named = (list ?? []).filter((m): m is BandMember & { cardId: string } => !!m.cardId).slice(0, PEOPLE);
  const rest = Math.max(0, b.members - named.length);
  return (
    <ol className="league-people" id={id}>
      {named.map((m) => {
        const href = `/c/${m.cardId}`;
        return (
          <li key={m.cardId}>
            <a className="board-row league-person" href={href} onClick={(e) => onLinkClick(e, href)}>
              <Avatar login={m.login} src={m.avatarUrl ?? ""} initials={m.initials} />
              <span className="board-login">{personLabel(m) || m.initials}</span>
              <Stars n={m.stars} size={14} label={t.bands.score(m.stars)} />
            </a>
          </li>
        );
      })}
      {rest > 0 && <li className="league-rest">{t.bands.others(rest)}</li>}
    </ol>
  );
}

function Row({ place, b, me }: { place: number; b: BandStanding; me: boolean }) {
  const { t } = useT();
  const th = t.bands.home;
  const forming = b.rank === null;
  const [open, setOpen] = useState(false);
  const id = `league-${useId().replace(/:/g, "")}`;
  const toggle = () => {
    if (!open) api.track("band_view", null, { type: b.type, id: b.id });
    setOpen(!open);
  };
  return (
    <li>
      <button
        type="button"
        className={`board-row band-row league-row has-people${me ? " is-me" : ""}${open ? " is-open" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={th.rowLabel(place, b.label, b.score, b.members, forming)}
        aria-current={me ? "true" : undefined}
      >
        <span className="board-rank">{place}</span>
        <span className="band-name">
          <span className="board-login">{b.label}</span>
          {/* en formation : la règle des trois fiches se lit là, sans phrase */}
          <span className="band-count">{forming ? th.forming(b.members) : t.bands.dossiers(b.members)}</span>
        </span>
        {/* l'unité est dans l'en-tête du tableau (« Étoiles ») : la ligne porte le nombre seul */}
        <span className="band-score">{b.score}</span>
        <svg className="league-chev" viewBox="0 0 12 12" aria-hidden focusable="false">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {open && <People b={b} id={id} />}
    </li>
  );
}

/** Les places encore libres, en une seule ligne, comme au top de la semaine : elle ramène au formulaire. */
function Free({ from, onPlay }: { from: number; onPlay: () => void }) {
  const { t } = useT();
  const tt = t.home.top;
  return (
    <li>
      <button type="button" className="board-row band-row league-row is-free" onClick={onPlay}>
        <span className="board-rank" aria-hidden />
        <span className="board-login">{tt.freeRange(from, TOP)}</span>
        <span className="board-take">{tt.take(TOP - from + 1)}</span>
      </button>
    </li>
  );
}

/** Une ligue ; `top` nul : le titre et la place des cinq lignes, pour que rien ne saute dessous. */
function League({ type, top, mine, onPlay }: { type: BandType; top: Top | null; mine: Mine; onPlay: () => void }) {
  const { t } = useT();
  const rows = top ? top[type].slice(0, TOP) : [];
  const own = top?.mine?.[type];
  // Plus bas que les cinq lignes : sa bande, à sa place, après un filet.
  const below = own && own.place > rows.length && !rows.some((b) => b.id === own.band.id) ? own : null;
  const id = `league-${type}-title`;
  return (
    <section className="board league" aria-labelledby={id} aria-busy={top ? undefined : true}>
      <h2 id={id}>{t.bands.league[type]}</h2>
      <div className="board-top">
        <p className="board-tag">{t.home.top.cut}</p>
        <span className="board-scale" aria-hidden>
          {t.bands.scale}
        </span>
        {top ? (
          <ol className="board-list is-top">
            {rows.map((b, i) => (
              <Row key={b.id} place={i + 1} b={b} me={b.id === mine[type]} />
            ))}
            {rows.length < TOP && <Free from={rows.length + 1} onPlay={onPlay} />}
          </ol>
        ) : (
          <div className="board-list is-top board-wait" />
        )}
      </div>
      {below && (
        <ol className="board-list is-rest" start={below.place}>
          <Row place={below.place} b={below.band} me />
        </ol>
      )}
    </section>
  );
}

/** Les deux classements, sans appel au serveur ; `top` nul : leur place, en attendant. */
export function BandsTopView({ top, mine = {}, onPlay }: { top: Top | null; mine?: Mine; onPlay: () => void }) {
  return (
    <div className="leagues" id={RANKING_ANCHOR}>
      {BAND_TYPES.map((type) => (
        <League key={type} type={type} top={top} mine={mine} onPlay={onPlay} />
      ))}
    </div>
  );
}
