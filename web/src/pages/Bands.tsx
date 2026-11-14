// Les bandes (§18.38) : /bandes, le tableau des écoles et celui des boîtes ;
// /bandes/ecole/:id et /bandes/boite/:id, la page d'une bande. Même système que
// le top de la semaine (WeekBoard) : lignes sur aplat marine, titres crème.
// Jamais un nom de personne, jamais un rang d'école du barème.
import { useEffect, useRef, useState } from "react";
import type { BandBoard, BandMember, BandPage as BandPageData, BandType } from "../../../shared/bands";
import { BAND_TYPES, bandPath } from "../../../shared/bands";
import { useBandShare } from "../components/BandPick";
import { BandRow, Star } from "../components/BandRow";
import { EntryForm } from "../components/EntryForm";
import { useToast } from "../components/After";
import { IconLinkedIn, IconShare } from "../components/Icons";
import { pick, useT } from "../i18n";
import { api } from "../lib/api";
import { bandsApi, myBandIds, rememberBandHint } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import "../components/bands.css";

/* ---------- /bandes ---------- */

export function Bands() {
  const { t } = useT();
  const tb = t.bands.board;
  const [type, setType] = useState<BandType>(() => (new URLSearchParams(window.location.search).get("t") === "boite" ? "boite" : "ecole"));
  const [boards, setBoards] = useState<Partial<Record<BandType, BandBoard | null>>>({});
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    document.title = tb.title;
  }, [tb.title]);

  useEffect(() => {
    if (type in boards) return;
    let alive = true;
    void bandsApi.board(type, myBandIds()[type]).then((b) => alive && setBoards((x) => ({ ...x, [type]: b })));
    return () => {
      alive = false;
    };
  }, [type, boards]);

  const board = boards[type];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = type === "ecole" ? "boite" : "ecole";
    setType(next);
    tabs.current[BAND_TYPES.indexOf(next)]?.focus();
  };

  return (
    <main className="page page-bands" id="main">
      <section className="bands">
        <h1>{tb.title}</h1>
        <p className="bands-intro">{tb.intro}</p>
        <div className="seg bands-tabs" role="tablist" aria-label={tb.tabs} onKeyDown={onKey}>
          <span className="seg-thumb" data-pos={BAND_TYPES.indexOf(type)} aria-hidden />
          {BAND_TYPES.map((k, i) => (
            <button
              key={k}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`bands-tab-${k}`}
              aria-selected={type === k}
              aria-controls="bands-panel"
              tabIndex={type === k ? 0 : -1}
              onClick={() => setType(k)}
            >
              {t.bands.league[k]}
            </button>
          ))}
        </div>
        <div className="bands-panel" id="bands-panel" role="tabpanel" aria-labelledby={`bands-tab-${type}`} aria-busy={board === undefined}>
          {board === undefined ? null : !board || board.entries.length === 0 ? (
            <p className="bands-empty">{tb.empty}</p>
          ) : (
            <ol className="board-list is-top">
              {board.entries.map((b) => (
                <BandRow key={b.id} b={b} />
              ))}
            </ol>
          )}
          {board?.extra && (
            <div className="board-top bands-yours">
              <p className="board-tag">{tb.yours}</p>
              <ol className="board-list is-top">
                <BandRow b={board.extra} />
              </ol>
            </div>
          )}
        </div>
        <p className="bands-make">
          <a className="link-alt" href="/" onClick={(e) => onLinkClick(e, "/")}>
            {tb.make}
          </a>
        </p>
      </section>
    </main>
  );
}

/* ---------- /bandes/:type/:id ---------- */

function Member({ m }: { m: BandMember }) {
  const { t, lang } = useT();
  const profile = m.profile ? pick(m.profile, lang) : t.bands.page.unnamed;
  // Le poste de la fiche à côté du profil : deux dossiers du même profil ne se lisent pas comme un doublon.
  const position = m.position ? t.positions[m.position] : null;
  const href = m.cardId ? `/c/${m.cardId}` : null;
  return (
    <li className="band-member">
      <span className="board-stars" role="img" aria-label={t.bands.score(m.stars)}>
        {Array.from({ length: 6 }, (_, i) => (
          <Star key={i} className={i >= 6 - m.stars ? "on" : undefined} />
        ))}
      </span>
      <span className="band-member-profile">
        {profile}
        {position && <span className="band-member-position">{position}</span>}
      </span>
      {m.login && href && (
        <a className="band-member-login" href={href} onClick={(e) => onLinkClick(e, href)}>
          @{m.login}
        </a>
      )}
    </li>
  );
}

export function BandPage({ type, id }: { type: BandType; id: string }) {
  const { t } = useT();
  const tp = t.bands.page;
  const toast = useToast();
  const { share, native } = useBandShare(toast.show);
  const [data, setData] = useState<BandPageData | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    bandsApi
      .page(type, id)
      .then((p) => alive && setData(p))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [type, id]);

  const band = data?.band;
  useEffect(() => {
    if (!band) return;
    document.title = `${band.label} : ${t.bands.kicker[band.type].toLowerCase()}`;
    // Venir d'ici : sa pastille passe en tête sous la fiche qu'on va faire.
    rememberBandHint(band);
    const key = `tys_band_seen_${band.type}_${band.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage bloqué : une fois par page */
    }
    api.track("band_view", null, { type: band.type, id: band.id });
  }, [band, t.bands.kicker]);

  if (data === undefined) return <main className="page page-band" id="main" aria-busy />;

  if (!data || !band) {
    return (
      <main className="page page-band" id="main">
        <section className="band">
          <h1>{tp.notFound}</h1>
          <a className="link-alt" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
            {tp.all}
          </a>
        </section>
      </main>
    );
  }

  const rank = t.bands.rank(band);
  const aheadHref = band.ahead ? bandPath({ type: band.type, id: band.ahead.id }) : null;
  const shown = data.members.length;

  return (
    <main className="page page-band" id="main">
      <section className="band">
        <a className="link-alt band-back" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
          {tp.all}
        </a>
        <p className="surtitre">{t.bands.kicker[band.type]}</p>
        <h1>{band.label}</h1>
        <p className="band-total">
          <span className="band-total-score" role="img" aria-label={t.bands.score(band.score)}>
            <Star />
            {band.score}
          </span>
          <span className="band-total-count">{t.bands.dossiers(band.members)}</span>
        </p>
        <p className="band-rank">{rank}</p>
        {band.ahead && aheadHref && (
          <p className="band-ahead">
            {tp.ahead}{" "}
            <a href={aheadHref} onClick={(e) => onLinkClick(e, aheadHref)}>
              {band.ahead.label}
            </a>
          </p>
        )}
        <button type="button" className="pill pill-ghost band-share" onClick={() => void share(band, tp.shareText(band.label, rank), null)}>
          {native ? <IconShare /> : <IconLinkedIn />}
          {tp.share}
        </button>
      </section>

      <section className="after-block band-make" aria-labelledby="band-make-title">
        <h2 id="band-make-title">{tp.make(band.label)}</h2>
        <EntryForm note={<p className="band-make-note">{tp.makeNote}</p>} />
      </section>

      <section className="band-roster" aria-labelledby="band-roster-title">
        <h2 id="band-roster-title">{tp.roster}</h2>
        {shown === 0 ? (
          <p className="bands-empty">{tp.rosterNone}</p>
        ) : (
          <ol className="board-list is-top band-members">
            {data.members.map((m, i) => (
              <Member key={i} m={m} />
            ))}
          </ol>
        )}
        {band.members > shown && <p className="band-more">{tp.more(band.members - shown)}</p>}
      </section>

      {band.type === "boite" && (
        <p className="band-recruit">
          {tp.recruiter(band.label)}{" "}
          <a href="https://azerit.tech" target="_blank" rel="noopener" onClick={() => api.track("cta_azerit_clicked", null, { from: "band" })}>
            {tp.recruiterLink}
          </a>
        </p>
      )}
      {toast.node}
    </main>
  );
}
