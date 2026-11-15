// « Dénonce un complice » (§18.6, §18.48), sous les boutons de partage : un lien
// LinkedIn ou un pseudo GitHub (ou une suggestion), la fiche du complice sort par
// le moteur habituel, et le dénonciateur reçoit aussitôt de quoi l'envoyer à la
// personne, sans regarder la révélation de l'autre. L'attente reste dans le bloc.
// Si le serveur ne lit pas LinkedIn, le champ ne prend qu'un pseudo GitHub et le dit.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { fileOf } from "../../../shared/caseFile";
import { detectEntry, linkedinSlug } from "../../../shared/entry";
import { starsLine } from "../../../shared/stars";
import type { CardData, Lang } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { api, ApiError, type CaseInfo } from "../lib/api";
import { errorFact } from "../lib/errors";
import { onLinkClick } from "../lib/router";
import { rememberDenounced } from "../lib/session";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch, shareUrl } from "../lib/util";
import { ManualCopy } from "./After";
import { IconShare } from "./Icons";
import { Stars } from "./Stars";
import "./denounce.css";

const POLL_MS = 700;
/** Au-delà, le serveur a déjà coupé (3 min de file, 60 s de calcul et 60 s de rallonge LinkedIn) : on s'arrête aussi. */
const GIVE_UP_MS = 5.5 * 60_000;

type State =
  | { s: "idle"; error?: string }
  /** `who` : « @pseudo », ou le nom du profil LinkedIn tel qu'il est dans le lien. */
  | { s: "pending"; who: string }
  | { s: "done"; card: CardData };

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
      // Un dossier à deux pièces : sa fiche, son adresse, sa note (§18.36).
      if (job.state === "done") return job.kind === "card" ? job.card : fileOf(job.comparison);
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
  // Le serveur lit-il LinkedIn ? Sinon le champ ne prend qu'un pseudo GitHub.
  const [liOn, setLiOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);

  useEffect(() => {
    alive.current = true;
    void api.getConfig().then((c) => alive.current && setLiOn(c.linkedinEntry));
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
    // Le même analyseur que le formulaire d'entrée : un lien de profil LinkedIn, ou un pseudo GitHub.
    const entry = detectEntry(raw);
    if (!entry) return setState({ s: "idle", error: liOn ? d.invalidBoth : d.invalid });
    if (entry.kind === "linkedin" && !liOn) return setState({ s: "idle", error: d.githubOnly });
    if (entry.kind === "github" && selfLogin && entry.login.toLowerCase() === selfLogin.toLowerCase()) return setState({ s: "idle", error: d.self });
    busy.current = true;
    setState({ s: "pending", who: entry.kind === "github" ? `@${entry.login}` : (linkedinSlug(entry.url) ?? "LinkedIn") });
    try {
      const res = await api.createCard({ ...(entry.kind === "github" ? { login: entry.login } : { linkedin: entry.url }), lang, denouncedBy: cardId });
      rememberDenounced(res.id);
      const card = await waitCard(res.id);
      if (!alive.current) return;
      setValue("");
      setState({ s: "done", card });
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

  if (state.s === "done") return <Wanted card={state.card} toast={toast} onAgain={() => setState({ s: "idle" })} />;

  const shown = suggestions.filter((a) => a.login.toLowerCase() !== selfLogin?.toLowerCase());

  return (
    <section className="after-block denounce" aria-labelledby={`${uid}-title`} aria-busy={state.s === "pending"}>
      <h2 id={`${uid}-title`}>{d.title}</h2>
      {state.s !== "pending" && <p className="denounce-intro">{liOn ? d.introBoth : d.intro}</p>}
      {state.s === "pending" ? (
        <div className="denounce-pending" role="status">
          <p>{d.pending(state.who)}</p>
          <span className="denounce-bar" aria-hidden />
        </div>
      ) : (
        <>
          <form className="denounce-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor={`${uid}-gh`} className="sr-only">
                {liOn ? d.labelBoth : d.label}
              </label>
              {/* « @ » seulement quand le champ ne prend qu'un pseudo : un lien s'y colle sinon. */}
              {!liOn && (
                <span className="field-prefix" aria-hidden>
                  @
                </span>
              )}
              <input
                id={`${uid}-gh`}
                className="field-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={liOn ? d.placeholderBoth : d.placeholder}
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
                      <WhoFace login={a.login} />
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

/**
 * Ce que le dénonciateur reçoit : la fiche du complice résumée, prête à envoyer. Dénoncer s'adresse à une
 * personne : un seul bouton, qui lui envoie le lien (§18.48), et « Copier le lien ». Aucun partage public :
 * la fiche d'un tiers ne part pas dans un post ; une fois reprise, c'est la personne qui la partage.
 */
export function Wanted({ card, toast, onAgain }: { card: CardData; toast: (m: string) => void; onAgain: () => void }) {
  const { t, lang } = useT();
  const d = t.denounce;
  // Presse-papiers refusé : le message ou le texte s'affiche, sélectionné, pour un appui long.
  const [manual, setManual] = useState<{ kind: "message" | "link"; value: string } | null>(null);
  // « @pseudo », ou le nom d'une fiche tirée d'un LinkedIn.
  const who = card.login ? `@${card.login}` : card.name;
  const n = starsFor(card.overall);
  // Dossier vide, pas encore revendiqué (shared/publicView.ts) : ni étoiles ni note, ni ici ni dans le partage.
  const sealed = !!card.sealed;
  // Les six, pleines puis vides (§18.27).
  const stars = sealed ? "" : starsLine(n);
  const tag = tagOf(card, lang);
  const status = bestStatus(card, lang);
  const level = pick(LEVEL_LABELS[n], lang);
  const url = shareUrl(card.id);
  const canNative = isTouch() && hasNativeShare();
  const track = (channel: string) => api.track("card_shared", card.id, { channel, kind: "denounce" });

  /** À la personne : la feuille de partage du téléphone, sinon le message et le lien dans le presse-papiers. */
  const onSend = async () => {
    const lead = d.sendText(who, stars, tag);
    if (canNative) {
      try {
        await navigator.share({ title: "Azerit", text: lead, url });
        track("native");
      } catch {
        /* partage annulé */
      }
      return;
    }
    const message = `${lead} ${url}`;
    if (await copyText(message)) toast(d.sendCopied(who));
    else setManual({ kind: "message", value: message });
    track("copy");
  };

  const onCopy = async () => {
    if (await copyText(url)) toast(d.linkCopied);
    else setManual({ kind: "link", value: url });
    track("copy_link");
  };

  return (
    <section className="after-block denounce is-done" aria-live="polite">
      {/* Le titre seul ; les étoiles et le profil sur leur ligne, jamais mêlés au texte. */}
      <h2 className="denounce-head">
        <span className="denounce-who-name">{who}</span> {d.inSights}
      </h2>
      <p className="denounce-level">
        {!sealed && <Stars n={n} size={22} label={t.result.wantedStars(n, level)} />}
        <span className="denounce-tag">{tag}</span>
      </p>
      {status && <p>{d.charge(status)}</p>}
      <div className="denounce-actions">
        <button type="button" className="pill pill-big" onClick={() => void onSend()}>
          <IconShare />
          <span className="denounce-send">{d.send(who)}</span>
        </button>
      </div>
      {manual && <ManualCopy m={manual} />}
      <div className="denounce-links">
        <button type="button" className="link-alt" onClick={() => void onCopy()}>
          {d.copyLink}
        </button>
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

/** La pastille d'un complice : son initiale, comme le portrait de repli de la fiche ; jamais l'identicône de GitHub. */
function WhoFace({ login }: { login: string }) {
  return (
    <i className="denounce-who-initial" aria-hidden>
      {[...login.replace(/[^\p{L}\p{N}]/gu, "")][0]?.toUpperCase() ?? "?"}
    </i>
  );
}
