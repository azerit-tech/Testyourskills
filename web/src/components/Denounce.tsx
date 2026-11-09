// « Dénonce un complice » (§18.6), sous les boutons de partage : un pseudo
// GitHub (ou une suggestion), la fiche du complice sort par le moteur habituel,
// et le dénonciateur reçoit aussitôt de quoi la partager, sans regarder la
// révélation de l'autre. L'attente reste dans le bloc.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { api, ApiError, type CaseInfo } from "../lib/api";
import { errorFact } from "../lib/errors";
import { onLinkClick } from "../lib/router";
import { rememberDenounced } from "../lib/session";
import { copyText, isTouch, parseLogin, shareUrl } from "../lib/util";
import { IconLinkedIn, IconShare, IconX } from "./Icons";
import "./denounce.css";

const POLL_MS = 700;
/** Au-delà, le serveur a déjà coupé (30 s de calcul, 3 min de file) : on s'arrête aussi. */
const GIVE_UP_MS = 4 * 60_000;

type State =
  | { s: "idle"; error?: string }
  | { s: "pending"; login: string }
  | { s: "done"; card: CardData; x: string | null };

/** Le chef d'accusation le plus partageable : un écart ou un négatif d'abord. */
function bestStatus(card: CardData, lang: Lang): string | null {
  const order = ["gap", "negative", "special", "positive"];
  const s = [...card.statuses].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))[0];
  return s ? pick(s.label, lang) : null;
}

/** Profil, sinon le niveau (fiches d'avant le barème 0.2.0). */
function tagOf(card: CardData, lang: Lang): string {
  return card.profile ? pick(card.profile.label, lang) : pick(LEVEL_LABELS[starsFor(card.overall)], lang);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend la fiche du complice. Une erreur du moteur remonte en ApiError, avec son message. */
async function waitCard(id: string): Promise<CardData> {
  const end = Date.now() + GIVE_UP_MS;
  while (Date.now() < end) {
    try {
      const job = await api.getJob(id);
      if (job.state === "done") return job.kind === "card" ? job.card : job.comparison.github;
      if (job.state === "error") throw new ApiError(0, job.code, job.message);
    } catch (err) {
      // Réseau capricieux : on retente ; une vraie réponse d'erreur s'arrête là.
      if (!(err instanceof ApiError) || err.status !== 0 || err.code !== "network") throw err;
    }
    await sleep(POLL_MS);
  }
  throw new ApiError(0, "timeout", null);
}

interface Props {
  /** Fiche du dénonciateur. */
  cardId: string;
  /** Son pseudo GitHub : on ne se dénonce pas soi-même. */
  selfLogin?: string;
  toast: (m: string) => void;
}

export function Denounce({ cardId, selfLogin, toast }: Props) {
  const { t, lang } = useT();
  const d = t.denounce;
  const uid = useId().replace(/:/g, "");
  const [state, setState] = useState<State>({ s: "idle" });
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<CaseInfo["accomplices"]>([]);
  const alive = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let on = true;
    void api.getCase(cardId).then((c) => on && setSuggestions(c.accomplices));
    return () => {
      on = false;
    };
  }, [cardId]);

  const run = async (raw: string) => {
    if (busy.current) return;
    const login = parseLogin(raw);
    if (!login) return setState({ s: "idle", error: d.invalid });
    if (selfLogin && login.toLowerCase() === selfLogin.toLowerCase()) return setState({ s: "idle", error: d.self });
    busy.current = true;
    setState({ s: "pending", login });
    try {
      const res = await api.createCard({ login, lang, denouncedBy: cardId });
      rememberDenounced(res.id);
      const card = await waitCard(res.id);
      const info = await api.getCase(card.id);
      if (!alive.current) return;
      setValue("");
      setState({ s: "done", card, x: info.x });
    } catch (err) {
      if (!alive.current) return;
      const msg =
        err instanceof ApiError && err.code === "timeout" && !err.fact ? t.errors.timeout : errorFact(err, t.errors.closed, t.errors.generic);
      setState({ s: "idle", error: typeof msg === "string" ? msg : pick(msg, lang) });
    } finally {
      busy.current = false;
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(value);
  };

  if (state.s === "done") return <Wanted card={state.card} x={state.x} toast={toast} onAgain={() => setState({ s: "idle" })} />;

  const shown = suggestions.filter((a) => a.login.toLowerCase() !== selfLogin?.toLowerCase());

  return (
    <section className="after-block denounce" aria-labelledby={`${uid}-title`} aria-busy={state.s === "pending"}>
      <h2 id={`${uid}-title`}>{d.title}</h2>
      {state.s === "pending" ? (
        <div className="denounce-pending" role="status">
          <p>{d.pending(state.login)}</p>
          <span className="denounce-bar" aria-hidden />
        </div>
      ) : (
        <>
          <p>{d.text}</p>
          <form className="denounce-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor={`${uid}-gh`} className="sr-only">
                {d.label}
              </label>
              <span className="field-prefix" aria-hidden>
                @
              </span>
              <input
                id={`${uid}-gh`}
                className="field-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={d.placeholder}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (state.error) setState({ s: "idle" });
                }}
                aria-invalid={!!state.error}
                aria-describedby={state.error ? `${uid}-err` : undefined}
              />
            </div>
            <button type="submit" className="pill">
              {d.btn}
            </button>
          </form>
          {state.error && (
            <p className="denounce-error" id={`${uid}-err`} role="alert">
              {state.error}
            </p>
          )}
          {shown.length > 0 && (
            <div className="denounce-suggest">
              <p className="surtitre">{d.suggest}</p>
              <ul>
                {shown.map((a) => (
                  <li key={a.login}>
                    <button type="button" className="pill pill-ghost denounce-who" onClick={() => void run(a.login)}>
                      <img
                        src={a.avatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        // Avatar injoignable : un rond vide plutôt qu'une image cassée.
                        onError={(e) => {
                          e.currentTarget.removeAttribute("src");
                        }}
                      />
                      <span>@{a.login}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Ce que le dénonciateur reçoit : la fiche du complice résumée, prête à partager. */
function Wanted({ card, x, toast, onAgain }: { card: CardData; x: string | null; toast: (m: string) => void; onAgain: () => void }) {
  const { t, lang } = useT();
  const d = t.denounce;
  const login = card.login ?? card.name;
  const n = starsFor(card.overall);
  const stars = "★".repeat(n);
  const tag = tagOf(card, lang);
  const status = bestStatus(card, lang);
  const url = shareUrl(card.id);
  // On tague la cible : son compte X s'il est sur son profil GitHub, sinon son pseudo GitHub.
  const who = `@${x ?? login}`;
  const text = (withUrl: string) => d.shareText(who, stars, tag, status, withUrl);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function" && isTouch();
  const track = (channel: string) => api.track("card_shared", card.id, { channel, kind: "denounce" });

  const onMain = async () => {
    if (canNative) {
      try {
        await navigator.share({ title: "Testyourskills", text: text("").trim(), url });
        track("native");
      } catch {
        /* partage annulé */
      }
      return;
    }
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text("").trim())}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
    track("x");
  };

  const onLinkedIn = async () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank", "noopener");
    // LinkedIn n'accepte pas de texte prérempli : il part dans le presse-papier.
    if (await copyText(text(url))) toast(d.linkedinHint);
    track("linkedin");
  };

  return (
    <section className="after-block denounce is-done" aria-live="polite">
      <h2 className="denounce-head">
        <span className="denounce-who-name">@{login}</span> {d.inSights}{" "}
        <span className="denounce-stars" role="img" aria-label={t.result.wantedStars(n, pick(LEVEL_LABELS[n], lang))}>
          {stars}
        </span>{" "}
        · {tag}
      </h2>
      {status && <p>{d.charge(status)}</p>}
      <div className="denounce-actions">
        <button type="button" className="pill pill-big" onClick={onMain}>
          {canNative ? <IconShare /> : <IconX />}
          {canNative ? d.native : d.x}
        </button>
        <button type="button" className="pill pill-big pill-ghost" onClick={onLinkedIn}>
          <IconLinkedIn />
          {d.linkedin}
        </button>
      </div>
      <div className="denounce-links">
        <a className="link-alt" href={`/c/${card.id}`} onClick={(e) => onLinkClick(e, `/c/${card.id}`)}>
          {d.see}
        </a>
        <button type="button" className="link-alt" onClick={onAgain}>
          {d.again}
        </button>
      </div>
    </section>
  );
}
