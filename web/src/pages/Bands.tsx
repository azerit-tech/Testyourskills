// Les bandes (§18.38) : /bandes, le tableau des écoles et celui des boîtes ;
// /bandes/ecole/:id et /bandes/boite/:id, la page d'une bande. Même système que
// le top de la semaine (WeekBoard) : lignes sur aplat marine, titres crème.
// Jamais un nom de personne, jamais un rang d'école du barème.
//
// La page d'une bande a trois états (SPEC §18.48) : sans fiche (le formulaire,
// et la bande suit jusqu'à la fiche posée), avec une fiche (« Rejoindre avec ma
// fiche »), membre (son apport, « Partager la bande » en bouton principal).
// Serveur muet : « le commissariat ne répond pas », jamais « introuvable ».
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { BandBoard, BandMember, BandPage as BandPageData, BandStanding, BandType, MyBands } from "../../../shared/bands";
import { BAND_MIN_MEMBERS, BAND_TYPES, bandPath } from "../../../shared/bands";
import { Avatar } from "../components/Avatar";
import { useBandShare } from "../components/BandPick";
import { BandRow } from "../components/BandRow";
import { BusyDots } from "../components/Busy";
import { BandNotFound, Unreachable } from "../components/ErrorPage";
import { StarMark, Stars } from "../components/Stars";
import { withSup } from "../components/Sup";
import { EntryForm } from "../components/EntryForm";
import { useToast } from "../components/After";
import { IconLinkedIn, IconShare } from "../components/Icons";
import { pick, useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { bandsApi, myBandIds, rememberBandHint, rememberBandJoin } from "../lib/bands";
import { useRemote } from "../lib/remote";
import { onLinkClick } from "../lib/router";
import { myCard, type MyCard } from "../lib/session";
import "../components/bands.css";

/* ---------- /bandes ---------- */

/** Le tableau d'une ligue : ses lignes, ou une phrase si elle est vide ; puis sa propre bande, plus bas. */
function BoardPanel({ board, type, on }: { board: BandBoard; type: BandType; on: boolean }) {
  const { t } = useT();
  const tb = t.bands.board;
  return (
    <section className={`bands-panel${on ? " is-on" : ""}`} id={`bands-panel-${type}`} role="tabpanel" aria-labelledby={`bands-tab-${type}`}>
      <div className="board-top">
        <p className="board-tag bands-panel-tag">{t.bands.league[type]}</p>
        {board.entries.length > 0 && (
          <span className="board-scale" aria-hidden>
            {tb.scale}
          </span>
        )}
        {board.entries.length === 0 ? (
          <p className="bands-empty">{t.bands.none.league[type]}</p>
        ) : (
          <ol className="board-list is-top">
            {board.entries.map((b) => (
              <BandRow key={b.id} b={b} />
            ))}
          </ol>
        )}
      </div>
      {board.extra && (
        <div className="board-top bands-yours">
          <p className="board-tag">{tb.yours}</p>
          <span className="board-scale" aria-hidden>
            {tb.scale}
          </span>
          <ol className="board-list is-top">
            <BandRow b={board.extra} />
          </ol>
        </div>
      )}
    </section>
  );
}

export function Bands() {
  const { t } = useT();
  const tb = t.bands.board;
  const [type, setType] = useState<BandType>(() => (new URLSearchParams(window.location.search).get("t") === "boite" ? "boite" : "ecole"));
  const [mine] = useState<MyCard | null>(() => myCard());
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    document.title = t.meta.titlePage(tb.title);
  }, [tb.title]);

  // Les deux ligues d'un coup : côte à côte au bureau, sous deux onglets au téléphone.
  const boards = useRemote(async () => {
    const mineIds = myBandIds();
    const [ecole, boite] = await Promise.all(BAND_TYPES.map((k) => bandsApi.board(k, mineIds[k])));
    return { ecole, boite } as Record<BandType, BandBoard>;
  }, []);

  if (boards.s === "down" || boards.s === "none") return <Unreachable />;
  if (boards.s === "wait") return <main className="page page-bands" id="main" aria-busy />;

  const data = boards.data;
  const empty = BAND_TYPES.every((k) => data[k].entries.length === 0 && !data[k].extra);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = type === "ecole" ? "boite" : "ecole";
    setType(next);
    tabs.current[BAND_TYPES.indexOf(next)]?.focus();
  };
  const mineHref = mine ? `/c/${mine.id}` : null;

  return (
    <main className={`page page-bands${empty ? " is-empty" : ""}`} id="main">
      <section className="bands">
        <h1>{tb.title}</h1>
        <p className="bands-intro">{tb.intro}</p>
        {!empty && (
          <>
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
                  aria-controls={`bands-panel-${k}`}
                  tabIndex={type === k ? 0 : -1}
                  onClick={() => setType(k)}
                >
                  {t.bands.league[k]}
                </button>
              ))}
            </div>
            <div className="bands-cols">
              {BAND_TYPES.map((k) => (
                <BoardPanel key={k} board={data[k]} type={k} on={type === k} />
              ))}
            </div>
          </>
        )}
      </section>
      {/* L'appel : le champ de l'accueil, ou sa fiche si elle existe. Sans bande au tableau, il prend la place du tableau. */}
      <section className="after-block band-make bands-make" aria-labelledby="bands-make-title">
        <h2 id="bands-make-title">{empty ? t.bands.none.title : tb.makeTitle}</h2>
        {/* la phrase suit le titre : au bureau, les deux à gauche, le champ seul à droite */}
        <p className="band-make-note">{mineHref ? t.bands.states.pickUnder : empty ? t.bands.none.note : tb.make}</p>
        {mineHref ? (
          <a className="btn-primary" href={mineHref} onClick={(e) => onLinkClick(e, mineHref)}>
            {t.bands.states.seeCard}
          </a>
        ) : (
          <EntryForm />
        )}
      </section>
    </main>
  );
}

/* ---------- /bandes/:type/:id ---------- */

/** Le nombre de signes du plus long mot d'un nom : « CentraleSupélec » → 15. */
export function longestWord(label: string): number {
  return Math.max(1, ...label.split(/[\s-]+/).map((w) => [...w].length));
}

/** Une fiche revendiquée : son visage, son pseudo, son profil, ses étoiles ; la ligne mène à la fiche. */
function Member({ m }: { m: BandMember & { login: string; cardId: string } }) {
  const { t, lang } = useT();
  // Le poste à côté du profil : deux fiches du même profil ne se lisent pas comme un doublon.
  const about = [m.profile ? pick(m.profile, lang) : null, m.position ? t.positions[m.position] : null].filter(Boolean).join(", ");
  const href = `/c/${m.cardId}`;
  return (
    <li>
      <a className="board-row band-member" href={href} onClick={(e) => onLinkClick(e, href)}>
        <Avatar login={m.login} />
        <span className="band-name">
          <span className="board-login">@{m.login}</span>
          {about && <span className="band-count">{about}</span>}
        </span>
        <Stars n={m.stars} size={14} label={t.bands.score(m.stars)} />
      </a>
    </li>
  );
}

/** Le nombre d'anonymes par nombre d'étoiles, du plus étoilé au moins étoilé : [[6, 2], [5, 5]]. */
export function starSpread(members: BandMember[]): [number, number][] {
  const count = new Map<number, number>();
  for (const m of members) count.set(m.stars, (count.get(m.stars) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[0] - a[0]);
}

/**
 * Les fiches sans pseudo, en dernière ligne de la liste : une pile de silhouettes (huit au
 * plus), leur nombre, et leur répartition en étoiles quand la page les a toutes reçues.
 */
function Anonymous({ count, spread }: { count: number; spread: [number, number][] | null }) {
  const { t } = useT();
  const ts = t.bands.states;
  return (
    <li className="band-anon">
      <span className="band-anon-faces" aria-hidden>
        {Array.from({ length: Math.min(8, count) }, (_, i) => (
          <span key={i} className="band-anon-face">
            <svg viewBox="0 0 100 100" focusable="false">
              <circle cx="50" cy="40" r="19" />
              <path d="M12 100c0-25 17-41 38-41s38 16 38 41z" />
            </svg>
          </span>
        ))}
      </span>
      <span className="band-anon-text">
        <span className="band-anon-count">{ts.anonymous(count)}</span>
        {spread && spread.length > 0 && (
          <span className="band-anon-spread" role="img" aria-label={ts.spread(spread)}>
            {/* « 6★ × 2 » : le nombre d'étoiles, puis combien de fiches ; rien à compter à l'œil */}
            {spread.map(([s, k]) => (
              <span key={s}>
                {s}
                <StarMark />
                <span className="band-anon-times">× {k}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

/** Moins de trois fiches : trois emplacements à remplir, pas un « ★ 0 ». */
function Slots({ members }: { members: number }) {
  const { t } = useT();
  return (
    <p className="band-slots" role="img" aria-label={t.bands.states.slots(members)}>
      {Array.from({ length: BAND_MIN_MEMBERS }, (_, i) => (
        <span key={i} className={`band-slot${i < members ? " is-on" : ""}`}>
          {i < members && <StarMark />}
        </span>
      ))}
    </p>
  );
}

interface CallProps {
  band: BandStanding;
  mine: MyCard | null;
  /** Les bandes de sa fiche ; undefined : pas encore lues ; null : pas de fiche à portée. */
  mb: MyBands | null | undefined;
  onJoined: (mb: MyBands) => void;
  onShare: () => void;
  native: boolean;
}

/** Le bloc d'appel de la page d'une bande, selon l'état de la personne. */
function BandCall({ band, mine, mb, onJoined, onShare, native }: CallProps) {
  const { t, lang } = useT();
  const tp = t.bands.page;
  const ts = t.bands.states;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);

  if (mine && mb === undefined) return <section className="block band-call is-loading" aria-busy />;

  // Sans fiche à portée : le formulaire ; la bande choisie ici suit jusqu'à la fiche posée.
  if (!mine || !mb) {
    return (
      <section className="after-block band-call band-make" aria-labelledby="band-make-title">
        <h2 id="band-make-title">{tp.make(band.label)}</h2>
        <EntryForm note={<p className="band-make-note">{ts.follow}</p>} onCreated={(cardId) => rememberBandJoin(cardId, band)} />
      </section>
    );
  }

  const cardHref = `/c/${mine.id}`;
  const cardLink = (
    <a className="link-alt" href={cardHref} onClick={(e) => onLinkClick(e, cardHref)}>
      {ts.seeCard}
    </a>
  );

  // Membre : son apport, et le partage en bouton principal.
  if (mb[band.type]?.id === band.id) {
    return (
      <section className="block band-call band-mine" aria-labelledby="band-mine-title">
        <p className="label">{t.bands.board.yours}</p>
        <h2 className="t-block" id="band-mine-title">
          {t.bands.pick.line[0]} <Stars n={mb.stars} size={22} label={t.bands.score(mb.stars)} /> {t.bands.pick.line[1]} {band.label}
        </h2>
        <button type="button" className="btn-primary band-share" onClick={onShare}>
          {native ? <IconShare /> : <IconLinkedIn />}
          {tp.share}
        </button>
        {cardLink}
      </section>
    );
  }

  // Une fiche, pas membre : un toucher pour entrer.
  const other = mb[band.type];
  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onJoined(await bandsApi.join(mine.id, band.type, { id: band.id, name: band.label }));
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      // La fiche n'est plus à portée de ce navigateur : on l'envoie la rouvrir.
      const gone = status === 401 || status === 403 || status === 404;
      setLost(gone);
      setError(gone ? ts.lost : err instanceof ApiError && err.fact ? pick(err.fact, lang) : t.bands.pick.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="block band-call" aria-labelledby="band-join-title">
      <h2 className="t-block" id="band-join-title">
        {ts.joinTitle}
      </h2>
      <p>{ts.joinText}</p>
      {other && <p className="band-call-note">{ts.moving(other.label)}</p>}
      <button type="button" className={`btn-primary band-join${busy ? " is-busy" : ""}`} onClick={() => void join()} aria-busy={busy}>
        {ts.join}
        {busy && <BusyDots />}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {lost && cardLink}
    </section>
  );
}

export function BandPage({ type, id }: { type: BandType; id: string }) {
  const { t } = useT();
  const tp = t.bands.page;
  const toast = useToast();
  const { share, native } = useBandShare(toast.show);
  const page = useRemote<BandPageData>(() => bandsApi.page(type, id), [type, id]);
  const [mine] = useState<MyCard | null>(() => myCard());
  const [mb, setMb] = useState<MyBands | null | undefined>(undefined);

  useEffect(() => {
    if (!mine) return;
    let alive = true;
    void bandsApi.mine(mine.id).then((v) => alive && setMb(v));
    return () => {
      alive = false;
    };
  }, [mine]);

  const data = page.s === "ok" ? page.data : null;
  // Une fois dedans, le rang et le total viennent de sa propre réponse, plus fraîche que la page.
  const joined = data && mb?.[type]?.id === data.band.id ? mb[type] : null;
  const band = joined ?? data?.band ?? null;

  useEffect(() => {
    if (!band) return;
    document.title = t.meta.titlePage(`${band.label}, ${t.bands.kicker[band.type].toLowerCase()}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band?.type, band?.id, band?.label, t.bands.kicker]);

  if (page.s === "wait") return <main className="page page-band" id="main" aria-busy />;
  if (page.s === "down") return <Unreachable />;
  if (!data || !band) return <BandNotFound />;

  const rank = t.bands.rank(band);
  const aheadHref = band.ahead ? bandPath({ type: band.type, id: band.ahead.id }) : null;
  const named = data.members.filter((m): m is BandMember & { login: string; cardId: string } => !!m.login && !!m.cardId);
  const anonymous = Math.max(0, band.members - named.length);
  // La répartition seulement si la page a reçu toutes les fiches anonymes (le serveur en envoie 50 au plus).
  const anonList = data.members.filter((m) => !m.login || !m.cardId);
  const spread = anonList.length === anonymous ? starSpread(anonList) : null;
  const shareBand = () => void share(band, tp.shareText(band.label, rank), mine?.id ?? null);

  return (
    <main className="page page-band" id="main">
      <div className="band-side">
        <section className="band">
          <a className="link-back" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
            ← {tp.all}
          </a>
          <p className="label">{t.bands.kicker[band.type]}</p>
          {/* un nom d'école ne se coupe jamais au milieu d'un mot : son corps suit le mot le plus long (bands.css) */}
          <h1 style={{ "--len": longestWord(band.label) } as CSSProperties}>{band.label}</h1>
          {band.rank ? (
            <p className="band-total">
              {/* « 88 étoiles », les mots de l'image de la bande, puis « 23 fiches » */}
              <span className="band-total-score">
                {band.score}
                <span className="band-total-unit">{t.bands.scoreWord(band.score)}</span>
              </span>
              <span className="band-total-count">{t.bands.dossiers(band.members)}</span>
            </p>
          ) : (
            <Slots members={band.members} />
          )}
          <p className="band-rank">{withSup(rank)}</p>
          {band.ahead && aheadHref && (
            <p className="band-ahead">
              {tp.ahead}{" "}
              <a href={aheadHref} onClick={(e) => onLinkClick(e, aheadHref)}>
                {band.ahead.label}
              </a>
            </p>
          )}
          {/* membre : le partage est le bouton principal du bloc d'appel, pas un second ici */}
          {!joined && (
            <button type="button" className="pill band-share" onClick={shareBand}>
              {native ? <IconShare /> : <IconLinkedIn />}
              {tp.share}
            </button>
          )}
        </section>
        <BandCall band={band} mine={mine} mb={mine ? mb : null} onJoined={setMb} onShare={shareBand} native={native} />
      </div>

      <div className="band-main">
        <section className="band-roster" aria-labelledby="band-roster-title">
          <h2 id="band-roster-title">{tp.roster}</h2>
          {band.members > 0 && (
            <ol className="board-list is-top band-members">
              {named.map((m) => (
                <Member key={m.cardId} m={m} />
              ))}
              {/* les fiches sans pseudo : dans le même bloc, en dernière ligne, comptées et réparties */}
              {anonymous > 0 && <Anonymous count={anonymous} spread={spread} />}
            </ol>
          )}
          {anonymous > 0 && named.length === 0 && <p className="band-more">{t.bands.states.claimHint}</p>}
          {band.members === 0 && <p className="bands-empty">{tp.rosterNone}</p>}
        </section>
        {/* une bande de boîte : le bloc recruteur de la page d'une fiche, au nom de la boîte */}
        {band.type === "boite" && (
          <section className="after-block hire band-hire" aria-labelledby="band-hire-title">
            <h2 id="band-hire-title">{tp.recruiter(band.label)}</h2>
            <p>{tp.recruiterText}</p>
            <a className="pill pill-ghost" href="https://azerit.tech" target="_blank" rel="noopener" onClick={() => api.track("cta_azerit_clicked", null, { from: "band" })}>
              {tp.recruiterLink}
              <span aria-hidden>↗</span>
            </a>
          </section>
        )}
      </div>
      {toast.node}
    </main>
  );
}
