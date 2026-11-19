// Les bandes sur l'accueil (§18.92) : un classement par ligue, les écoles puis les
// boîtes, fait comme le top de la semaine (WeekBoard). Cinq lignes : la place, le
// nom, les fiches, les étoiles ; une seule ligne pour les places libres, qui ramène
// au formulaire. Sa propre bande est mise en évidence ; plus bas que la cinquième
// place, elle vient après un filet. Dessous, le lien vers /bandes.
import { useEffect, useState } from "react";
import type { BandStanding, BandsTop as Top, BandType } from "../../../shared/bands";
import { BAND_TYPES, bandPath } from "../../../shared/bands";
import { useT } from "../i18n";
import { bandsApi, myBandIds } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import "./bands.css";

const TOP = 5;

type Mine = Partial<Record<BandType, string | null>>;

/**
 * `cardId` : la fiche en mémoire ; ses bandes sont lues sur elle (§18.82). Sans fiche,
 * ou si le serveur ne les dit pas : celles que ce navigateur a retenues.
 */
export function BandsTop({ onPlay, cardId }: { onPlay: () => void; cardId?: string }) {
  const [state, setState] = useState<{ top: Top; mine: Mine } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const mb = cardId ? await bandsApi.mine(cardId).catch(() => null) : null;
      const mine: Mine = mb ? { ecole: mb.ecole?.id ?? null, boite: mb.boite?.id ?? null } : myBandIds();
      const top = await bandsApi.top(mine);
      if (alive && top) setState({ top, mine });
    })();
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (!state) return null;
  return <BandsTopView top={state.top} mine={state.mine} onPlay={onPlay} />;
}

function Row({ place, b, me }: { place: number; b: BandStanding; me: boolean }) {
  const { t } = useT();
  const th = t.bands.home;
  const forming = b.rank === null;
  const href = bandPath(b);
  return (
    <li>
      <a
        className={`board-row band-row league-row${me ? " is-me" : ""}`}
        href={href}
        onClick={(e) => onLinkClick(e, href)}
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
      </a>
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

function League({ type, top, mine, onPlay }: { type: BandType; top: Top; mine: Mine; onPlay: () => void }) {
  const { t } = useT();
  const rows = top[type].slice(0, TOP);
  const own = top.mine?.[type];
  // Plus bas que les cinq lignes : sa bande, à sa place, après un filet.
  const below = own && own.place > rows.length && !rows.some((b) => b.id === own.band.id) ? own : null;
  const id = `league-${type}-title`;
  return (
    <section className="board league" aria-labelledby={id}>
      <h2 id={id}>{t.bands.league[type]}</h2>
      <div className="board-top">
        <p className="board-tag">{t.home.top.cut}</p>
        <span className="board-scale" aria-hidden>
          {t.bands.board.scale}
        </span>
        <ol className="board-list is-top">
          {rows.map((b, i) => (
            <Row key={b.id} place={i + 1} b={b} me={b.id === mine[type]} />
          ))}
          {rows.length < TOP && <Free from={rows.length + 1} onPlay={onPlay} />}
        </ol>
      </div>
      {below && (
        <ol className="board-list is-rest" start={below.place}>
          <Row place={below.place} b={below.band} me />
        </ol>
      )}
    </section>
  );
}

/** Les deux classements connus, sans appel au serveur. */
export function BandsTopView({ top, mine = {}, onPlay }: { top: Top; mine?: Mine; onPlay: () => void }) {
  const { t } = useT();
  return (
    <div className="leagues">
      {BAND_TYPES.map((type) => (
        <League key={type} type={type} top={top} mine={mine} onPlay={onPlay} />
      ))}
      <a className="link-alt bands-top-all" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
        {t.bands.home.all}
      </a>
    </div>
  );
}
