// Les primes (§18.4) : /primes, le tableau des primes de la saison ;
// /primes/:id, l'avis de recherche de l'entreprise, son classement (les vingt
// premiers, par pseudo GitHub, avec leur visage), et le bloc de la personne :
// trois étapes numérotées pour entrer dans la course, puis sa place, à partager,
// et les états de fin (classement final, finaliste, prime emportée).
// Même système que les bandes : aplats, titres crème, aucune lueur.
// Serveur muet : « le commissariat ne répond pas » ; prime inconnue : elle le dit.
import { useEffect, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { BoardRow, MyEntry, PrimeMe, PrimePageData, PrimeView } from "../../../shared/primes";
import { cleanProof, MAX_PROOFS } from "../../../shared/primes";
import { starsFor } from "../../../shared/types";
import { Avatar } from "../components/Avatar";
import { BusyDots } from "../components/Busy";
import { EntryForm } from "../components/EntryForm";
import { PrimeNotFound, Unreachable } from "../components/ErrorPage";
import { useToast } from "../components/After";
import { IconLinkedIn, IconShare } from "../components/Icons";
import { PrimeCard, PrimeMark, usePrimeWhen, withSup } from "../components/Primes";
import { Stars } from "../components/Stars";
import { SCALE } from "../components/WeekBoard";
import { pick, useT } from "../i18n";
import { api, ApiError } from "../lib/api";
import { primesApi, type JoinBody } from "../lib/primes";
import { useRemote } from "../lib/remote";
import { navigate, onLinkClick } from "../lib/router";
import { dayLabel, useAppConfig } from "../lib/season";
import { myCard, type MyCard } from "../lib/session";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch } from "../lib/util";
import "../components/primes.css";

/* ---------- /primes ---------- */

export function PrimesList() {
  const { t } = useT();
  const tl = t.primes.list;
  const primes = useRemote<PrimeView[]>(() => primesApi.list(), []);

  useEffect(() => {
    document.title = t.meta.titlePage(tl.title);
  }, [tl.title]);

  // Une saison sans prime n'a pas de page des primes : l'accueil, comme le serveur le fait pour l'adresse.
  const none = primes.s === "ok" && primes.data.length === 0;
  useEffect(() => {
    if (none) navigate("/", { replace: true });
  }, [none]);

  if (primes.s === "down" || primes.s === "none") return <Unreachable />;
  if (primes.s === "wait" || none) return <main className="page page-primes" id="main" aria-busy />;

  const list = primes.data;
  const groups = (
    [
      [tl.open, list.filter((p) => p.phase === "open")],
      [tl.later, list.filter((p) => p.phase === "soon")],
      [tl.done, list.filter((p) => p.phase === "closed")],
    ] as [string, PrimeView[]][]
  ).filter(([, l]) => l.length > 0);

  return (
    <main className="page page-primes" id="main">
      <section className="primes-page">
        <h1>{tl.title}</h1>
        <p className="primes-intro">{tl.intro}</p>
        {groups.map(([title, group]) => (
          <div key={title} className="primes-group">
            <h2>{title}</h2>
            <ul className="primes-grid">
              {group.map((p) => (
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

/** Une ligne du classement : la même grille que le top de la semaine, visage compris. */
function Row({ r, me }: { r: BoardRow; me: boolean }) {
  const { t } = useT();
  const href = `/c/${r.cardId}`;
  return (
    <li>
      <a className={`board-row prime-row${me ? " is-me" : ""}`} href={href} onClick={(e) => onLinkClick(e, href)} aria-label={t.home.top.rowLabel(r.rank, r.login, r.overall)}>
        <span className="board-rank">{r.rank}</span>
        <Avatar login={r.login} />
        <span className="board-login">@{r.login}</span>
        <Stars n={r.stars} size={14} />
        <span className="board-score">{r.overall}</span>
      </a>
    </li>
  );
}

/** Le partage d'une prime ou de sa place : la feuille du téléphone, sinon LinkedIn, le texte au presse-papier (comme une bande). */
function usePrimeShare(toast: (m: string) => void) {
  const { t, lang } = useT();
  const native = hasNativeShare() && isTouch();
  const share = async (p: PrimeView, text: string) => {
    // Partagé depuis le site en anglais, le lien le dit : son aperçu sort en anglais.
    const url = `${window.location.origin}/primes/${p.id}${lang === "en" ? "?lang=en" : ""}`;
    if (native) {
      try {
        await navigator.share({ title: "Azerit", text, url });
      } catch {
        /* partage annulé */
      }
      return;
    }
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank", "noopener");
    // LinkedIn n'accepte pas de texte prérempli : il part dans le presse-papier.
    toast((await copyText(`${text} ${url}`)) ? t.bands.pick.linkedinHint : url);
  };
  return { share, native };
}

interface MineProps {
  prime: PrimeView;
  entry: MyEntry;
  job: string;
  native: boolean;
  onShare: (text: string) => void;
  onWithdraw: () => Promise<void>;
}

/** Le bloc de la personne inscrite : sa place à partager, puis les états de fin. Le retrait se confirme sur place. */
function Mine({ prime, entry, job, native, onShare, onWithdraw }: MineProps) {
  const { t } = useT();
  const tm = t.primes.mine;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const closed = prime.phase === "closed";

  // Une prime terminée ne parle plus au présent : classement final, finaliste, prime emportée.
  const view =
    entry.state === "winner"
      ? { label: tm.over, title: tm.winner, text: tm.winnerText(prime.company), button: tm.share, share: tm.shareWinnerText(job, prime.company) }
      : entry.state === "finalist"
        ? { label: closed ? tm.over : t.primes.race.title, title: tm.finalist, text: tm.finalistText(entry.rank, entry.total, prime.company), button: tm.share, share: tm.shareFinalistText(job, prime.company) }
        : closed
          ? { label: tm.final, title: tm.place(entry.rank, entry.total), text: tm.finalText, button: tm.share, share: tm.shareFinalText(entry.rank, entry.total, job, prime.company) }
          : { label: t.primes.race.title, title: tm.place(entry.rank, entry.total), text: tm.moves, button: tm.sharePlace, share: tm.sharePlaceText(entry.rank, entry.total, job, prime.company) };
  // Finaliste ou prime emportée : le tampon des avis, en crème sur prune, et un titre en grand.
  const stamp = entry.state === "winner" ? tm.stamp.winner : entry.state === "finalist" ? tm.stamp.finalist : null;

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    await onWithdraw();
    setBusy(false);
    setAsking(false);
  };

  return (
    <section className={`block prime-mine is-${entry.state}${closed ? " is-over" : ""}`} aria-labelledby="prime-mine-title">
      <p className="label">{view.label}</p>
      {stamp && (
        <span className="prime-stamp" aria-hidden>
          {stamp}
        </span>
      )}
      <h2 className={stamp ? "prime-mine-big" : "t-block"} id="prime-mine-title">
        {view.title}
      </h2>
      {entry.state === "winner" && <Stars n={starsFor(entry.overall)} size={22} label={t.bands.score(starsFor(entry.overall))} />}
      <p>{view.text}</p>
      <button type="button" className="btn-primary prime-mine-share" onClick={() => onShare(view.share)}>
        {native ? <IconShare /> : <IconLinkedIn />}
        {entry.state === "winner" ? tm.shareWin : view.button}
      </button>
      {/* une prime emportée ne se retire pas d'un toucher : l'adresse de contact est là pour ça */}
      {entry.state === "winner" ? null : asking ? (
        <div className="prime-ask" role="group" aria-labelledby="prime-ask-text">
          <p id="prime-ask-text">{tm.withdrawAsk}</p>
          <div className="prime-ask-actions">
            {/* le choix sans risque reçoit le clavier, en pilule ; le retrait reste un lien */}
            <button type="button" className="pill prime-stay" autoFocus onClick={() => setAsking(false)}>
              {tm.stay}
            </button>
            <button type="button" className={`link-quiet prime-withdraw-yes${busy ? " is-busy" : ""}`} onClick={() => void withdraw()} aria-busy={busy}>
              {t.primes.page.withdraw}
              {busy && <BusyDots />}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="link-quiet prime-withdraw" onClick={() => setAsking(true)}>
          {t.primes.page.withdraw}
        </button>
      )}
    </section>
  );
}

export type StepState = "done" | "now" | "todo";

/**
 * Où en est la personne devant une prime : sa fiche, la preuve par GitHub, l'entrée.
 * `proven` : connectée par GitHub ; `localCard` : une fiche gardée par ce navigateur.
 */
export function stepStates(me: Pick<PrimeMe, "login" | "gate"> | null, localCard: boolean): [StepState, StepState, StepState] {
  const proven = !!me?.login;
  // Connectée : le serveur dit si une fiche lisible porte son pseudo ; sinon, celle de ce navigateur.
  const hasCard = proven ? me!.gate !== "nocard" && me!.gate !== "degraded" : localCard;
  return [hasCard ? "done" : "now", proven ? "done" : hasCard ? "now" : "todo", hasCard && proven ? "now" : "todo"];
}

function Step({ n, state, title, children }: { n: number; state: StepState; title: string; children?: ReactNode }) {
  const { t } = useT();
  return (
    <li className={`prime-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
      <span className="prime-step-n" aria-hidden>
        {state === "done" ? (
          <svg viewBox="0 0 16 16" focusable="false">
            <path d="M3.2 8.4l3.1 3.1 6.5-6.9" />
          </svg>
        ) : (
          n
        )}
      </span>
      <div className="prime-step-body">
        <p className="prime-step-title">
          <span className="sr-only">{n}. </span>
          {title}
          {state === "done" && <span className="sr-only"> ({t.primes.steps.done})</span>}
        </p>
        {children}
      </div>
    </li>
  );
}

interface StepsProps {
  prime: PrimeView;
  me: PrimeMe | null;
  mine: MyCard | null;
  positions: string;
  claimOn: boolean;
  rulesLink: boolean;
  onDone: (m: PrimeMe) => void;
}

/**
 * La porte d'entrée d'une prime : trois étapes numérotées, cochées selon l'état.
 * 1. Ta fiche. 2. Prouver que c'est toi (GitHub). 3. Entrer dans la course.
 * Seule l'étape en cours se déplie : un seul bouton principal à l'écran.
 */
function Steps({ prime, me, mine, positions, claimOn, rulesLink, onDone }: StepsProps) {
  const { t, lang } = useT();
  const ts = t.primes.steps;
  const tg = t.primes.page.gate;
  const gate = me?.gate ?? "claim";
  const [s1, s2, s3] = stepStates(me, !!mine);
  const soon = prime.phase === "soon";
  const cardHref = mine ? `/c/${mine.id}` : null;

  return (
    <section className="block prime-join" id="concourir" aria-labelledby="prime-join-title">
      <h2 className="t-block" id="prime-join-title">
        {ts.title}
      </h2>
      <ol className="prime-steps">
        <Step n={1} state={s1} title={ts.card}>
          {s1 === "now" && (
            <>
              {(gate === "degraded" || gate === "nocard") && <p>{gate === "degraded" ? tg.degraded : tg.nocard}</p>}
              <EntryForm variant="inline" />
            </>
          )}
        </Step>
        <Step n={2} state={s2} title={ts.proof}>
          {s2 !== "done" && <p className="prime-step-why">{ts.why}</p>}
          {s2 === "now" &&
            (mine?.login && claimOn ? (
              <>
                <button type="button" className="btn-primary" onClick={() => api.startClaim(mine.id, mine.login ?? undefined, `/primes/${prime.id}#concourir`)}>
                  {ts.prove}
                </button>
                <p className="prime-note">{ts.proveNote}</p>
              </>
            ) : (
              <>
                <p>{mine && !mine.login ? ts.noGithub : ts.proveOnCard}</p>
                {cardHref && (
                  <a className="btn-primary" href={cardHref} onClick={(e) => onLinkClick(e, cardHref)}>
                    {ts.openCard}
                  </a>
                )}
              </>
            ))}
        </Step>
        <Step n={3} state={s3} title={ts.enter}>
          {soon ? (
            <p>{withSup(t.primes.opens(dayLabel(prime.from, lang)))}</p>
          ) : s3 === "now" && gate === "ok" ? (
            <>
              {me?.wouldBe && <p className="prime-would">{t.primes.page.would(me.wouldBe.rank, me.wouldBe.total)}</p>}
              <JoinForm prime={prime} rulesLink={rulesLink} onDone={onDone} />
            </>
          ) : s3 === "now" && gate === "position" && me?.card ? (
            <>
              <p>{tg.position(t.positions[me.card.position], positions)}</p>
              <a className="link-alt prime-others" href="/primes" onClick={(e) => onLinkClick(e, "/primes")}>
                {t.primes.page.others}
              </a>
            </>
          ) : null}
        </Step>
      </ol>
    </section>
  );
}

export function PrimePage({ id }: { id: string }) {
  const { t, lang } = useT();
  const tp = t.primes.page;
  const toast = useToast();
  const cfg = useAppConfig();
  const when = usePrimeWhen();
  const { share, native } = usePrimeShare(toast.show);
  const [nonce, setNonce] = useState(0);
  const page = useRemote<PrimePageData>(() => primesApi.page(id, nonce > 0), [id, nonce]);
  // La dernière page lue reste à l'écran pendant qu'on la relit (après une inscription, un retrait).
  const [last, setLast] = useState<PrimePageData | null>(null);
  const [me, setMe] = useState<PrimeMe | null>(null);
  const [mine] = useState<MyCard | null>(() => myCard());

  useEffect(() => {
    if (page.s === "ok") setLast(page.data);
  }, [page]);

  useEffect(() => {
    let alive = true;
    void primesApi.me(id).then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, [id]);

  // Retour de GitHub (« Prouver que c'est moi ») : on prévient, on nettoie l'adresse.
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

  const data = page.s === "ok" ? page.data : last;
  const prime = data?.prime;
  useEffect(() => {
    if (!prime) return;
    // Dans la phrase, le contrat perd sa capitale ; un sigle (CDI) garde les siennes.
    const contract = t.primes.contract[prime.contract];
    document.title = t.meta.titlePage(`${prime.company}, ${contract === contract.toUpperCase() ? contract : contract.toLowerCase()}`);
    const key = `tys_prime_seen_${prime.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage bloqué : une fois par page */
    }
    api.track("prime_view", null, { prime: prime.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prime?.id, prime?.company, prime?.contract, t.primes.contract]);

  // Arrivée sur « #concourir » (depuis la fiche, au retour de GitHub) : on descend au bloc une fois la page là.
  const ready = !!prime && !!me;
  useEffect(() => {
    if (!ready || window.location.hash !== "#concourir") return;
    window.setTimeout(() => document.getElementById("concourir")?.scrollIntoView({ block: "start" }), 50);
  }, [ready]);

  if (!data || !prime) {
    if (page.s === "down") return <Unreachable />;
    if (page.s === "none") return <PrimeNotFound listed={!!cfg?.primesListed} />;
    return <main className="page page-prime" id="main" aria-busy />;
  }

  const positions = prime.positions.map((x) => t.positions[x]).join(", ");
  const job = t.primes.job(prime.contract, positions);
  const closed = prime.phase === "closed";
  // Une inscription retirée n'en est plus une.
  const entry = me?.entry && me.entry.state !== "withdrawn" ? me.entry : null;
  // « Ville Démo, télétravail possible » sous l'étiquette « Lieu » : la seconde moitié sans majuscule.
  const remote = t.primes.remote;
  const where = prime.place ? `${prime.place}${prime.remote ? `, ${remote.charAt(0).toLowerCase()}${remote.slice(1)}` : ""}` : prime.remote ? remote : "";
  const shareButton = (
    <button type="button" className="pill prime-share" onClick={() => void share(prime, tp.shareText(prime.company, job))}>
      {native ? <IconShare /> : <IconLinkedIn />}
      {tp.share}
    </button>
  );

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
      <div className="prime-side">
        <section className="prime-head">
          <a className="link-back" href="/primes" onClick={(e) => onLinkClick(e, "/primes")}>
            ← {tp.all}
          </a>
          <p className="label">
            {t.primes.contract[prime.contract]}, {t.primes.interviews(prime.interviews)}
          </p>
          {prime.logo && <PrimeMark p={prime} big />}
          <h1>{prime.company}</h1>
          <p className="prime-pitch">{pick(prime.pitch, lang)}</p>
          {/* deux colonnes : postes et lieu, puis langages et dates */}
          <dl className="prime-facts">
            <div>
              <dt>{tp.positions}</dt>
              <dd>{positions}</dd>
            </div>
            {where && (
              <div>
                <dt>{tp.place}</dt>
                <dd>{where}</dd>
              </div>
            )}
            {prime.languages.length > 0 && (
              <div>
                <dt>{tp.languages}</dt>
                <dd>
                  {prime.languages.join(", ")} <span className="prime-facts-note">({tp.languagesNote})</span>
                </dd>
              </div>
            )}
            <div>
              <dt>{tp.period}</dt>
              <dd>
                {withSup(tp.dates(dayLabel(prime.from, lang), dayLabel(prime.to, lang)))} <span className={`prime-when is-${prime.phase}`}>{withSup(when(prime))}</span>
              </dd>
            </div>
          </dl>
          {/* terminée : plus d'entrée, le partage reste ici */}
          {closed && !entry && shareButton}
        </section>

        {entry ? (
          <Mine prime={prime} entry={entry} job={job} native={native} onShare={(text) => void share(prime, text)} onWithdraw={withdraw} />
        ) : (
          /* Terminée : plus d'entrée, le classement dit tout. */
          !closed && (
            <Steps
              prime={prime}
              me={me}
              mine={mine}
              positions={positions}
              claimOn={!!cfg?.claim}
              rulesLink={!!cfg?.rulesPublished}
              onDone={(m) => {
                setMe(m);
                toast.show(t.primes.form.done);
                setNonce((n) => n + 1);
              }}
            />
          )
        )}
        {/* entrer d'abord, partager ensuite : sous la porte d'entrée (inscrite, son bloc partage sa place) */}
        {!closed && !entry && shareButton}
      </div>

      <div className="prime-main">
        <section className="prime-board" aria-labelledby="prime-board-title">
          <h2 id="prime-board-title">{closed ? t.primes.boardFinal : tp.board}</h2>
          {data.total > 0 && <p className="board-meta">{closed ? tp.totalClosed(data.total) : tp.total(data.total)}</p>}
          {data.board.length === 0 ? (
            <p className="primes-empty">{closed ? tp.boardEmptyClosed : tp.boardEmpty}</p>
          ) : (
            <div className="board-top">
              <span className="board-scale" aria-hidden>
                {SCALE}
              </span>
              <ol className="board-list is-top">
                {data.board.map((r) => (
                  <Row key={r.login} r={r} me={!!me?.login && me.login === r.login.toLowerCase()} />
                ))}
              </ol>
            </div>
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
      </div>
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
  // Une preuve est facultative : un champ, et un lien pour en ajouter (MAX_PROOFS au plus).
  const [proofs, setProofs] = useState<string[]>([""]);
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
      <p className="field-error" id={`${uid}-${f}-err`} role="alert">
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
          aria-describedby={has("email") ? `${uid}-email-err` : `${uid}-email-note`}
        />
        {/* l'erreur prend la place de la ligne d'aide, collée au champ */}
        {has("email") ? (
          err("email")
        ) : (
          <p className="prime-note" id={`${uid}-email-note`}>
            {tf.emailNote}
          </p>
        )}
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
                  aria-invalid={has("place")}
                  onChange={() => {
                    setPlaceOk(v);
                    clear("place");
                  }}
                />
                {v ? tf.yes : tf.no}
              </label>
            ))}
          </div>
          {has("place") ? (
            err("place")
          ) : (
            <p className="prime-note" id={`${uid}-place-note`}>
              {tf.placeNote}
            </p>
          )}
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
        {proofs.length < MAX_PROOFS && (
          <button type="button" className="link-alt prime-add-proof" onClick={() => setProofs((l) => [...l, ""])}>
            + {t.primes.addProof}
          </button>
        )}
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

      <button type="submit" className={`btn-primary${busy ? " is-busy" : ""}`} aria-busy={busy}>
        {tf.submit}
        {busy && <BusyDots />}
      </button>
      {failed && (
        <p className="field-error" role="alert">
          {failed}
        </p>
      )}
    </form>
  );
}
