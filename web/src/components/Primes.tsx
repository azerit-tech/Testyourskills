// Les primes à l'écran (§18.4, §18.5), hors de leurs pages : la carte d'une
// prime, la rangée défilante de l'accueil, et « Tu es en course » en tête de
// l'après-fiche avec la question de ligue. Rien ne s'affiche tant qu'aucune
// prime n'est ouverte : la configuration du serveur le dit (primesOpen).
import { useEffect, useState } from "react";
import type { League, PrimeView, Race, RaceLine } from "../../../shared/primes";
import { LEAGUES, primePath } from "../../../shared/primes";
import type { CardData } from "../../../shared/types";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { primesApi, saveLeague, savedLeague } from "../lib/primes";
import { navigate, onLinkClick } from "../lib/router";
import { dayLabel, useAppConfig } from "../lib/season";
import { setPrefill } from "../lib/session";
import "./primes.css";

/* ---------- la carte d'une prime ---------- */

/** Le logo, ou le nom de l'entreprise en lettres. */
export function PrimeMark({ p, big = false }: { p: Pick<PrimeView, "company" | "logo">; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (p.logo && !broken) return <img className={`prime-logo${big ? " is-big" : ""}`} src={`/primes/${p.logo}`} alt={p.company} onError={() => setBroken(true)} />;
  return <span className={`prime-name${big ? " is-big" : ""}`}>{p.company}</span>;
}

/** « J-12 », « Dernier jour », « Close », « Ouvre le 2 décembre ». */
export function usePrimeWhen() {
  const { t, lang } = useT();
  return (p: PrimeView) => (p.phase === "open" ? t.primes.days(p.daysLeft ?? 0) : p.phase === "closed" ? t.primes.closed : t.primes.opens(dayLabel(p.from, lang)));
}

export function PrimeCard({ p }: { p: PrimeView }) {
  const { t } = useT();
  const when = usePrimeWhen();
  const href = primePath(p.id);
  const where = p.remote ? t.primes.remote : p.place ? t.primes.onSite(p.place) : null;
  return (
    <a className={`prime-card is-${p.phase}`} href={href} onClick={(e) => onLinkClick(e, href)}>
      <span className="prime-card-top">
        <PrimeMark p={p} />
        <span className={`prime-when is-${p.phase}`}>{when(p)}</span>
      </span>
      <span className="prime-card-job">
        <span className="prime-tag">{t.primes.contract[p.contract]}</span> {p.positions.map((x) => t.positions[x]).join(", ")}
      </span>
      <span className="prime-card-meta">
        {t.primes.interviews(p.interviews)}
        {where ? `, ${where}` : ""}
      </span>
    </a>
  );
}

/* ---------- l'accueil : les primes ouvertes, en rangée défilante ---------- */

export function PrimesStrip() {
  const { t } = useT();
  const cfg = useAppConfig();
  const [primes, setPrimes] = useState<PrimeView[] | null>(null);
  const open = !!cfg?.primesOpen;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void primesApi.list().then((l) => alive && setPrimes(l.filter((p) => p.phase === "open")));
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open || !primes || primes.length === 0) return null;
  return (
    <section className="primes-strip" aria-labelledby="primes-strip-title">
      <h2 id="primes-strip-title">{t.primes.strip.title}</h2>
      <ul className="primes-row">
        {primes.map((p) => (
          <li key={p.id}>
            <PrimeCard p={p} />
          </li>
        ))}
      </ul>
      <a className="link-alt" href="/primes" onClick={(e) => onLinkClick(e, "/primes")}>
        {t.primes.strip.all}
      </a>
    </section>
  );
}

/* ---------- « Tu es en course » (§18.5), en tête de l'après-fiche ---------- */

interface RaceProps {
  cardId: string;
  card: CardData;
}

export function PrimeRace({ cardId, card }: RaceProps) {
  const { t } = useT();
  const tp = t.primes;
  const cfg = useAppConfig();
  const open = !!cfg?.primesOpen;
  const [league, setLeague] = useState<League | null>(() => savedLeague());
  const [race, setRace] = useState<Race | null | undefined>(undefined);

  useEffect(() => {
    if (!open || !league || league === "fun") return;
    let alive = true;
    setRace(undefined);
    void primesApi.race(cardId, league).then((r) => alive && setRace(r));
    return () => {
      alive = false;
    };
  }, [open, league, cardId]);

  if (!open) return null;

  const choose = (l: League | null) => {
    saveLeague(l);
    setLeague(l);
  };
  const change = (
    <button type="button" className="link-quiet prime-race-change" onClick={() => choose(null)}>
      {tp.league.change}
    </button>
  );

  // La question de ligue : un toucher, jamais avant la fiche.
  if (!league) {
    return (
      <section className="after-block prime-race" aria-labelledby="prime-league-title">
        <h2 id="prime-league-title">{tp.league.title}</h2>
        <p>{tp.league.ask}</p>
        <ul className="prime-leagues">
          {LEAGUES.map((l) => (
            <li key={l}>
              <button type="button" className={`pill ${l === "fun" ? "pill-ghost" : "pill-peach"}`} onClick={() => choose(l)}>
                {tp.league.options[l]}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (league === "fun") {
    return (
      <p className="prime-race-fun">
        {tp.league.fun} {change}
      </p>
    );
  }

  if (race === undefined) return <section className="after-block prime-race is-loading" aria-busy />;
  if (!race || race.degraded) return null;

  // Fiche LinkedIn seule ou CV : l'expérience d'abord, le code en preuve.
  if (race.needsGithub) {
    const addGithub = () => {
      const field = document.querySelector<HTMLInputElement>(".add-source input");
      if (field) {
        field.scrollIntoView({ block: "center", behavior: "smooth" });
        field.focus({ preventScroll: true });
        return;
      }
      setPrefill({ mode: "both", tab: "github" });
      navigate("/");
    };
    return (
      <section className="after-block prime-race" aria-labelledby="prime-race-title">
        <h2 id="prime-race-title">{tp.race.github}</h2>
        <p>{tp.race.githubText}</p>
        <button type="button" className="pill pill-peach" onClick={addGithub}>
          {tp.race.githubBtn}
        </button>
        {change}
      </section>
    );
  }

  const position = t.positions[card.position];
  return (
    <section className="after-block prime-race" aria-labelledby="prime-race-title">
      <h2 id="prime-race-title">{race.lines.length ? tp.race.title : tp.league.title}</h2>
      {race.lines.length === 0 ? (
        <p>{tp.race.none}</p>
      ) : (
        <ul className="prime-race-lines">
          {race.lines.map((l) => (
            <RaceRow key={l.prime.id} line={l} position={position} cardId={cardId} login={card.login} claimOn={!!cfg?.claim} />
          ))}
        </ul>
      )}
      {race.lines.some((l) => !l.entered && l.gate === "claim") && <p className="prime-race-note">{tp.race.claimNote}</p>}
      {change}
    </section>
  );
}

function RaceRow({ line, position, cardId, login, claimOn }: { line: RaceLine; position: string; cardId: string; login?: string; claimOn: boolean }) {
  const { t } = useT();
  const tp = t.primes;
  const when = usePrimeWhen();
  const p = line.prime;
  const href = primePath(p.id);
  const job = tp.job(p.contract, position);
  const text = line.entered ? tp.race.is(line.rank, line.total, job, p.company) : tp.race.would(line.rank, line.total, job, p.company);
  const canClaim = line.gate === "claim" && claimOn && !!login;
  const join = () => {
    if (line.gate === "ok") navigate(`${href}#concourir`);
    else if (canClaim) api.startClaim(cardId, login, `${href}#concourir`);
  };
  return (
    <li className="prime-race-line">
      <span className="prime-when is-open">{when(p)}</span>
      <p className="prime-race-text">{text}</p>
      <span className="prime-race-actions">
        {!line.entered && (line.gate === "ok" || canClaim) && (
          <button type="button" className="pill" onClick={join}>
            {tp.race.join}
          </button>
        )}
        <a className="link-alt" href={href} onClick={(e) => onLinkClick(e, href)}>
          {tp.race.see}
        </a>
      </span>
    </li>
  );
}
