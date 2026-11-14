// Les primes (§18.4) : /primes, le tableau des primes de la saison ;
// /primes/:id, l'avis de recherche de l'entreprise, son classement (les vingt
// premiers, par pseudo GitHub), son rang, et « Concourir ». Même système que
// les bandes : aplats, titres crème, pilules rose poudré, aucune lueur.
// Sans prime dans la saison, ces pages ramènent à l'accueil (App.tsx).
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import type { BoardRow, PrimeMe, PrimePageData, PrimeView } from "../../../shared/primes";
import { cleanProof, MAX_PROOFS } from "../../../shared/primes";
import { EntryForm } from "../components/EntryForm";
import { useToast } from "../components/After";
import { IconLink, IconShare } from "../components/Icons";
import { PrimeCard, PrimeMark, usePrimeWhen } from "../components/Primes";
import { Star } from "../components/BandRow";
import { pick, useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { primesApi, type JoinBody } from "../lib/primes";
import { onLinkClick } from "../lib/router";
import { dayLabel, useAppConfig } from "../lib/season";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch } from "../lib/util";
import "../components/primes.css";

/* ---------- /primes ---------- */

export function PrimesList() {
  const { t } = useT();
  const tl = t.primes.list;
  const [primes, setPrimes] = useState<PrimeView[] | null>(null);

  useEffect(() => {
    document.title = tl.title;
  }, [tl.title]);

  useEffect(() => {
    let alive = true;
    void primesApi.list().then((l) => alive && setPrimes(l));
    return () => {
      alive = false;
    };
  }, []);

  const groups: [string, PrimeView[]][] = primes
    ? ([
        [tl.open, primes.filter((p) => p.phase === "open")],
        [tl.later, primes.filter((p) => p.phase === "soon")],
        [tl.done, primes.filter((p) => p.phase === "closed")],
      ] as [string, PrimeView[]][]).filter(([, l]) => l.length > 0)
    : [];

  return (
    <main className="page page-primes" id="main" aria-busy={primes === null}>
      <section className="primes-page">
        <h1>{tl.title}</h1>
        <p className="primes-intro">{tl.intro}</p>
        {primes && primes.length === 0 && <p className="primes-empty">{tl.empty}</p>}
        {groups.map(([title, list]) => (
          <div key={title} className="primes-group">
            <h2>{title}</h2>
            <ul className="primes-grid">
              {list.map((p) => (
                <li key={p.id}>
                  <PrimeCard p={p} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}

/* ---------- /primes/:id ---------- */

const STARS = 6;

function Row({ r, me }: { r: BoardRow; me: boolean }) {
  const { t } = useT();
  const href = `/c/${r.cardId}`;
  return (
    <li>
      <a className={`board-row prime-row${me ? " is-me" : ""}`} href={href} onClick={(e) => onLinkClick(e, href)} aria-label={t.home.top.rowLabel(r.rank, r.login, r.overall)}>
        <span className="board-rank">{r.rank}</span>
        <span className="board-login">@{r.login}</span>
        <span className="board-stars" aria-hidden>
          {Array.from({ length: STARS }, (_, i) => (
            <Star key={i} className={i >= STARS - r.stars ? "on" : undefined} />
          ))}
        </span>
        <span className="board-score">{r.overall}</span>
      </a>
    </li>
  );
}

function usePrimeShare(toast: (m: string) => void) {
  const { t } = useT();
  const native = hasNativeShare() && isTouch();
  const share = async (p: PrimeView, job: string) => {
    const url = `${window.location.origin}/primes/${p.id}`;
    const text = t.primes.page.shareText(p.company, job);
    if (native) {
      try {
        await navigator.share({ title: "Testyourskills", text, url });
      } catch {
        /* partage annulé */
      }
      return;
    }
    toast((await copyText(`${text} ${url}`)) ? t.primes.page.copied : url);
  };
  return { share, native };
}

export function PrimePage({ id }: { id: string }) {
  const { t, lang } = useT();
  const tp = t.primes.page;
  const toast = useToast();
  const cfg = useAppConfig();
  const when = usePrimeWhen();
  const { share, native } = usePrimeShare(toast.show);
  const [data, setData] = useState<PrimePageData | null | undefined>(undefined);
  const [me, setMe] = useState<PrimeMe | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    primesApi
      .page(id, nonce > 0)
      .then((p) => alive && setData(p))
      .catch(() => alive && setData(null));
    void primesApi.me(id).then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, [id, nonce]);

  // Retour de GitHub (« Concourir » passe par « C'est moi ») : on prévient, on nettoie l'adresse.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claim = params.get("claim");
    if (!claim) return;
    const as = params.get("as") ?? "";
    const c = t.result.claim;
    toast.show(claim === "ok" ? c.claimed(as) : claim === "mismatch" ? c.mismatch(as) : claim === "limited" ? c.limited : c.error);
    params.delete("claim");
    params.delete("as");
    const q = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prime = data?.prime;
  useEffect(() => {
    if (!prime) return;
    document.title = `${prime.company} : ${t.primes.contract[prime.contract]}`;
    const key = `tys_prime_seen_${prime.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage bloqué : une fois par page */
    }
    api.track("prime_view", null, { prime: prime.id });
  }, [prime, t.primes.contract]);

  // « Concourir » depuis la fiche : on descend au formulaire une fois la page là.
  useEffect(() => {
    if (!prime || !me || window.location.hash !== "#concourir") return;
    window.setTimeout(() => document.getElementById("concourir")?.scrollIntoView({ block: "start" }), 50);
  }, [prime, me]);

  if (data === undefined) return <main className="page page-prime" id="main" aria-busy />;
  if (!data || !prime) {
    return (
      <main className="page page-prime" id="main">
        <section className="prime-head">
          <h1>{tp.notFound}</h1>
          <a className="link-alt" href="/primes" onClick={(e) => onLinkClick(e, "/primes")}>
            {tp.all}
          </a>
        </section>
      </main>
    );
  }

  const positions = prime.positions.map((x) => t.positions[x]).join(", ");
  const job = t.primes.job(prime.contract, positions);
  const entry = me?.entry ?? null;
  // « À Ville Démo, télétravail possible » : la seconde moitié sans majuscule.
  const remote = t.primes.remote;
  const where = prime.place ? `${t.primes.onSite(prime.place)}${prime.remote ? `, ${remote.charAt(0).toLowerCase()}${remote.slice(1)}` : ""}` : prime.remote ? remote : "";

  const withdraw = async () => {
    try {
      setMe(await primesApi.withdraw(prime.id));
      toast.show(tp.withdrawn);
      setNonce((n) => n + 1);
    } catch {
      toast.show(t.primes.form.errors.generic);
    }
  };

  return (
    <main className="page page-prime" id="main">
      <section className="prime-head">
        <a className="link-alt prime-back" href="/primes" onClick={(e) => onLinkClick(e, "/primes")}>
          {tp.all}
        </a>
        <p className="surtitre">
          {t.primes.contract[prime.contract]}, {t.primes.interviews(prime.interviews)}
        </p>
        {prime.logo && <PrimeMark p={prime} big />}
        <h1>{prime.company}</h1>
        <p className="prime-pitch">{pick(prime.pitch, lang)}</p>
        <dl className="prime-facts">
          <div>
            <dt>{tp.positions}</dt>
            <dd>{positions}</dd>
          </div>
          {prime.languages.length > 0 && (
            <div>
              <dt>{tp.languages}</dt>
              <dd>
                {prime.languages.join(", ")} <span className="prime-facts-note">({tp.languagesNote})</span>
              </dd>
            </div>
          )}
          {where && (
            <div>
              <dt>{tp.place}</dt>
              <dd>{where}</dd>
            </div>
          )}
          <div>
            <dt>{tp.period}</dt>
            <dd>
              {tp.dates(dayLabel(prime.from, lang), dayLabel(prime.to, lang))} <span className={`prime-when is-${prime.phase}`}>{when(prime)}</span>
            </dd>
          </div>
        </dl>
        <button type="button" className="pill pill-ghost prime-share" onClick={() => void share(prime, job)}>
          {native ? <IconShare /> : <IconLink />}
          {tp.share}
        </button>
      </section>

      {entry && (
        <section className="after-block prime-mine" aria-live="polite">
          <h2>{tp.you(entry.rank, entry.total)}</h2>
          <button type="button" className="link-danger" onClick={() => void withdraw()}>
            {tp.withdraw}
          </button>
        </section>
      )}

      {/* Close : plus de formulaire, le classement dit tout. */}
      {!entry && prime.phase !== "closed" && (
        <section className="after-block prime-join" id="concourir" aria-labelledby="prime-join-title">
          <h2 id="prime-join-title">{t.primes.form.title}</h2>
          {prime.phase === "soon" ? (
            <p>{t.primes.opens(dayLabel(prime.from, lang))}</p>
          ) : me?.gate === "ok" ? (
            <>
              {me.wouldBe && <p className="prime-would">{tp.would(me.wouldBe.rank, me.wouldBe.total)}</p>}
              <JoinForm prime={prime} rulesLink={!!cfg?.rulesPublished} onDone={(m) => {
                setMe(m);
                toast.show(t.primes.form.done);
                setNonce((n) => n + 1);
              }} />
            </>
          ) : me?.gate === "position" && me.card ? (
            <p>{tp.gate.position(t.positions[me.card.position], positions)}</p>
          ) : (
            <>
              <p>{me?.gate === "degraded" ? tp.gate.degraded : me?.gate === "nocard" ? tp.gate.nocard : tp.gate.claim}</p>
              <EntryForm variant="inline" />
            </>
          )}
        </section>
      )}

      <section className="prime-board" aria-labelledby="prime-board-title">
        <h2 id="prime-board-title">{tp.board}</h2>
        <p className="board-meta">{prime.phase === "closed" ? `${tp.frozen} ${tp.totalClosed(data.total)}` : tp.total(data.total)}</p>
        {data.board.length === 0 ? (
          <p className="primes-empty">{tp.boardEmpty}</p>
        ) : (
          <ol className="board-list is-top">
            {data.board.map((r) => (
              <Row key={r.login} r={r} me={!!me?.login && me.login === r.login.toLowerCase()} />
            ))}
          </ol>
        )}
        <div className="prime-rule">
          <h3>{tp.rule}</h3>
          <p>{tp.ruleText}</p>
          {cfg?.rulesPublished && (
            <a className="link-alt" href="/reglement" onClick={(e) => onLinkClick(e, "/reglement")}>
              {tp.rules}
            </a>
          )}
        </div>
      </section>
      {toast.node}
    </main>
  );
}

/* ---------- le formulaire « Concourir » ---------- */

type Field = "email" | "consent" | "adult" | "place" | "proofs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Les erreurs d'un formulaire, avant l'envoi : les mêmes règles que le serveur. */
export function checkJoin(body: JoinBody, needsPlace: boolean): Field[] {
  const errs: Field[] = [];
  if (!EMAIL_RE.test(body.email.trim())) errs.push("email");
  if (needsPlace && body.placeOk === null) errs.push("place");
  if (body.proofs.some((p) => p.trim() && !cleanProof(p))) errs.push("proofs");
  if (!body.consent) errs.push("consent");
  if (!body.adult) errs.push("adult");
  return errs;
}

function JoinForm({ prime, rulesLink, onDone }: { prime: PrimeView; rulesLink: boolean; onDone: (m: PrimeMe) => void }) {
  const { t } = useT();
  const tf = t.primes.form;
  const uid = useId().replace(/:/g, "");
  const [email, setEmail] = useState("");
  const [placeOk, setPlaceOk] = useState<boolean | null>(null);
  const [proofs, setProofs] = useState<string[]>(() => Array.from({ length: MAX_PROOFS }, () => ""));
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [errors, setErrors] = useState<Field[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const needsPlace = !!prime.place;

  const body = (): JoinBody => ({ email: email.trim(), consent, adult, placeOk: needsPlace ? placeOk : null, proofs: proofs.map((p) => p.trim()).filter(Boolean) });
  const has = (f: Field) => errors.includes(f);
  const clear = (f: Field) => setErrors((e) => e.filter((x) => x !== f));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const b = body();
    const errs = checkJoin(b, needsPlace);
    setErrors(errs);
    setFailed(null);
    if (errs.length) {
      document.getElementById(`${uid}-${errs[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      onDone(await primesApi.join(prime.id, b));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (["email", "consent", "adult", "place", "proofs"].includes(code)) setErrors([code as Field]);
      else setFailed(err instanceof ApiError && err.fact ? pick(err.fact, document.documentElement.lang === "en" ? "en" : "fr") : tf.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const err = (f: Field) =>
    has(f) ? (
      <p className="prime-field-error" id={`${uid}-${f}-err`} role="alert">
        {tf.errors[f]}
      </p>
    ) : null;

  return (
    <form className="prime-form" onSubmit={submit} noValidate>
      <div className="prime-field">
        <label htmlFor={`${uid}-email`}>{tf.email}</label>
        <input
          id={`${uid}-email`}
          className="prime-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={tf.placeholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear("email");
          }}
          aria-invalid={has("email")}
          aria-describedby={`${uid}-email-note${has("email") ? ` ${uid}-email-err` : ""}`}
        />
        <p className="prime-note" id={`${uid}-email-note`}>
          {tf.emailNote}
        </p>
        {err("email")}
      </div>

      {needsPlace && (
        <fieldset className="prime-field" aria-describedby={`${uid}-place-note`}>
          <legend>
            {tf.place(prime.place!)}
            {prime.remote ? ` (${tf.placeRemote})` : ""}
          </legend>
          <div className="prime-yesno">
            {([true, false] as const).map((v) => (
              <label key={String(v)} className={`prime-choice${placeOk === v ? " is-on" : ""}`}>
                <input
                  id={v ? `${uid}-place` : undefined}
                  type="radio"
                  name={`${uid}-place`}
                  checked={placeOk === v}
                  onChange={() => {
                    setPlaceOk(v);
                    clear("place");
                  }}
                />
                {v ? tf.yes : tf.no}
              </label>
            ))}
          </div>
          <p className="prime-note" id={`${uid}-place-note`}>
            {tf.placeNote}
          </p>
          {err("place")}
        </fieldset>
      )}

      <fieldset className="prime-field">
        <legend>{tf.proofs}</legend>
        <p className="prime-note">{tf.proofsNote}</p>
        {proofs.map((p, i) => (
          <input
            key={i}
            id={i === 0 ? `${uid}-proofs` : undefined}
            className="prime-input"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={tf.proofLabel(i + 1)}
            placeholder={tf.proofPlaceholder}
            value={p}
            onChange={(e) => {
              const v = e.target.value;
              setProofs((l) => l.map((x, j) => (j === i ? v : x)));
              clear("proofs");
            }}
            aria-invalid={has("proofs") && !!p.trim() && !cleanProof(p)}
          />
        ))}
        {err("proofs")}
      </fieldset>

      <div className="prime-field">
        <label className="prime-check">
          <input
            id={`${uid}-consent`}
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clear("consent");
            }}
            aria-invalid={has("consent")}
          />
          <span>{tf.consent(prime.company)}</span>
        </label>
        {rulesLink && (
          <a className="link-quiet prime-rules-link" href="/reglement" target="_blank" rel="noopener">
            {t.primes.page.rules}
          </a>
        )}
        {err("consent")}
      </div>

      <div className="prime-field">
        <label className="prime-check">
          <input
            id={`${uid}-adult`}
            type="checkbox"
            checked={adult}
            onChange={(e) => {
              setAdult(e.target.checked);
              clear("adult");
            }}
            aria-invalid={has("adult")}
          />
          <span>{tf.adult}</span>
        </label>
        {err("adult")}
      </div>

      <button type="submit" className="pill pill-big" disabled={busy}>
        {busy ? tf.sending : tf.submit}
      </button>
      {failed && (
        <p className="prime-field-error" role="alert">
          {failed}
        </p>
      )}
    </form>
  );
}
