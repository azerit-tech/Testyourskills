// « Dénonce un complice » (§18.6, §18.48, §18.83, §18.114), le premier bloc sous le verdict.
// Rien à coller : on tape un nom, des comptes GitHub et des profils LinkedIn sortent sous le
// champ, on touche la personne et la dénonciation part. Un lien LinkedIn collé ou un pseudo
// GitHub tapé en entier marchent toujours. Le champ reste là : il se vide et garde le focus,
// prêt pour le suivant ; chaque dénonciation de la séance est une ligne sous le champ, la plus
// récente en haut, avec sa barre d'attente, puis ses étoiles, sa note et de quoi l'envoyer.
// Ni rechargement ni navigation. Si le serveur ne lit pas LinkedIn, le champ ne prend qu'un nom
// ou un pseudo GitHub.
import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { fileOf } from "../../../shared/caseFile";
import { detectEntry, linkedinSlug } from "../../../shared/entry";
import type { Entry } from "../../../shared/entry";
import type { CardData, Lang } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { pick, useT } from "../i18n";
import { api, ApiError, type CaseInfo } from "../lib/api";
import { errorFact } from "../lib/errors";
import { rememberDenounced } from "../lib/session";
import { hasNativeShare } from "../lib/sharing";
import { copyText, isTouch, shareUrl } from "../lib/util";
import { verdict } from "../lib/versus";
import { aimAt, ManualCopy } from "./After";
import { Avatar } from "./Avatar";
import { IconCopy, IconShare, IconWhatsApp } from "./Icons";
import { Stars } from "./Stars";
import { useSuggestBox, useSuggestions } from "./Suggest";
import type { Suggestion } from "./Suggest";
import "./denounce.css";

const POLL_MS = 700;
/** La durée attendue d'une fiche, comme sur la page d'attente (Waiting.tsx). */
const EXPECTED_MS = 20_000;
/** La barre de l'interrogatoire : elle avance sur la durée attendue, puis ralentit, sans jamais toucher le bout avant la fiche. */
export function pendingPct(elapsed: number): number {
  const linear = Math.min(1, Math.max(0, elapsed) / EXPECTED_MS) * 82;
  const tail = 14 * (1 - Math.exp(-Math.max(0, elapsed - EXPECTED_MS) / 6000));
  return Math.round(linear + tail);
}
/** Au-delà, le serveur a déjà coupé (3 min de file, 60 s de calcul et 60 s de rallonge LinkedIn) : on s'arrête aussi. */
const GIVE_UP_MS = 5.5 * 60_000;

/**
 * Une dénonciation de la séance (§18.114) : une ligne sous le champ, la plus récente en haut. `key` : la
 * personne (« gh:pseudo », « li:adresse ») ; la même, dénoncée de nouveau, remonte sans repartir.
 */
export interface Shot {
  key: string;
  /** « @pseudo », le nom touché dans la liste, ou celui du lien LinkedIn ; la fiche prête le remplace. */
  who: string;
  /** Le pseudo GitHub et la photo de la ligne touchée : le visage de la ligne en attendant la fiche. */
  login?: string;
  photo?: string;
  since: number;
  status: "pending" | "done" | "error";
  card?: CardData;
  error?: string;
}

export type ShotAction = { type: "add"; shot: Shot } | { type: "done"; key: string; card: CardData } | { type: "fail"; key: string; error: string };

/** Les lignes de la séance : la nouvelle en haut ; une personne déjà là remonte à sa place. */
export function shotsReducer(lines: Shot[], a: ShotAction): Shot[] {
  if (a.type === "add") return [a.shot, ...lines.filter((l) => l.key !== a.shot.key)];
  return lines.map((l) => (l.key !== a.key ? l : a.type === "done" ? { ...l, status: "done", card: a.card } : { ...l, status: "error", error: a.error }));
}

/** La clé d'une personne : un pseudo sans casse, une adresse LinkedIn telle quelle. */
export const shotKey = (entry: Entry) => (entry.kind === "github" ? `gh:${entry.login.toLowerCase()}` : `li:${entry.url}`);

/**
 * Ce qui suit les étoiles : le nom du niveau (« Haute surveillance »), comme partout ailleurs (§18.48, un mot
 * par chose). Un dossier scellé ne dit pas son niveau : son profil, s'il en a un.
 */
export function tagOf(card: CardData, lang: Lang): string {
  if (card.sealed && card.profile) return pick(card.profile.label, lang);
  return pick(LEVEL_LABELS[starsFor(card.overall)], lang);
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
  /** Le champ déjà rempli (l'accueil ouvert sur /<pseudo> par qui a déjà sa fiche). */
  initial?: string;
  /** La note du dénonciateur : le duel en chiffres dans le message envoyé (§18.94). */
  mine?: number | null;
}

export function Denounce({ cardId, selfLogin, toast, initial, mine }: Props) {
  const { t, lang } = useT();
  const d = t.denounce;
  const uid = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(initial ?? "");
  const [lines, dispatch] = useReducer(shotsReducer, []);
  const input = useRef<HTMLInputElement>(null);
  /** Les complices connus de la fiche (ses co-auteurs sur GitHub) : un toucher les dénonce. */
  const [known, setKnown] = useState<CaseInfo["accomplices"]>([]);
  const alive = useRef(true);
  /** Les personnes en route : un double toucher n'envoie pas deux fois. */
  const inFlight = useRef(new Set<string>());
  // Le serveur lit-il LinkedIn ? Sinon le champ ne prend qu'un nom ou un pseudo GitHub.
  const [liOn, setLiOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);
  // Cherche-t-il des profils LinkedIn par nom (§18.80) ? Sinon la liste ne porte que des comptes GitHub.
  const [liSearch, setLiSearch] = useState(() => !!api.knownConfig()?.linkedinSearch);
  const [touch] = useState(() => isTouch());

  useEffect(() => {
    alive.current = true;
    void api.getConfig().then((c) => {
      if (!alive.current) return;
      setLiOn(c.linkedinEntry);
      setLiSearch(c.linkedinSearch);
    });
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let on = true;
    void api.getCase(cardId).then((c) => on && setKnown(c.accomplices));
    return () => {
      on = false;
    };
  }, [cardId]);

  // Les barres des lignes en attente avancent ensemble.
  const [now, setNow] = useState(() => Date.now());
  const pending = lines.some((l) => l.status === "pending");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [pending]);

  /**
   * La dénonciation part : sa ligne s'ajoute en haut, le champ se vide et garde le focus (dans le geste :
   * le clavier du téléphone reste ouvert), prêt pour le suivant. La fiche se calcule pendant ce temps.
   */
  const send = async (entry: Entry, who: string, photo?: string) => {
    if (entry.kind === "linkedin" && !liOn) return setError(d.githubOnly);
    if (entry.kind === "github" && selfLogin && entry.login.toLowerCase() === selfLogin.toLowerCase()) return setError(d.self);
    const key = shotKey(entry);
    setError(null);
    setValue("");
    input.current?.focus({ preventScroll: true });
    const prev = lines.find((l) => l.key === key);
    // Déjà dénoncée ou en route dans cette séance : sa ligne remonte, rien ne repart (la limite du jour est épargnée).
    if (inFlight.current.has(key) || prev?.status === "done") {
      if (prev) dispatch({ type: "add", shot: prev });
      return;
    }
    inFlight.current.add(key);
    setNow(Date.now());
    dispatch({ type: "add", shot: { key, who, login: entry.kind === "github" ? entry.login : undefined, photo, since: Date.now(), status: "pending" } });
    try {
      const res = await api.createCard({ ...(entry.kind === "github" ? { login: entry.login } : { linkedin: entry.url }), lang, denouncedBy: cardId });
      rememberDenounced(res.id);
      const card = await waitCard(res.id);
      if (alive.current) dispatch({ type: "done", key, card });
    } catch (err) {
      if (!alive.current) return;
      const msg = err instanceof ApiError && err.code === "timeout" && !err.fact ? t.errors.timeout : errorFact(err, t.errors.closed, t.errors.generic);
      dispatch({ type: "fail", key, error: typeof msg === "string" ? msg : pick(msg, lang) });
    } finally {
      inFlight.current.delete(key);
    }
  };

  // Les personnes à ce nom, sous le champ (§18.80) : comptes GitHub et profils LinkedIn mêlés.
  const mixed = liOn && liSearch;
  const found = useSuggestions(value, { github: true, linkedin: mixed }, false);
  // On ne se dénonce pas soi-même : son propre compte ne sort pas dans la liste.
  const people = useMemo(() => found.filter((p) => !(p.kind === "github" && selfLogin && p.login.toLowerCase() === selfLogin.toLowerCase())), [found, selfLogin]);
  /** Une personne touchée dans la liste : la dénonciation part, sans autre geste. */
  const pickOne = (item: Suggestion) =>
    void send(item.kind === "github" ? { kind: "github", login: item.login } : { kind: "linkedin", url: item.url }, item.kind === "github" ? `@${item.login}` : item.title, item.photo);
  const label = liOn ? d.labelBoth : d.label;
  const box = useSuggestBox({ id: `${uid}-sg`, items: people, onPick: pickOne, mixed, label });
  const fieldRef = useRef<HTMLDivElement>(null);
  // Au doigt, le clavier prend la moitié de l'écran : le champ monte, ses lignes restent visibles.
  useEffect(() => {
    if (box.shown && touch) fieldRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [box.shown, touch]);

  /** Ce que le champ contient : un lien de profil LinkedIn ou un pseudo GitHub part tel quel ; un nom passe par la liste. */
  const run = (raw: string) => {
    // Le même analyseur que le formulaire d'entrée.
    const entry = detectEntry(raw);
    if (entry) return void send(entry, entry.kind === "github" ? `@${entry.login}` : (linkedinSlug(entry.url) ?? "LinkedIn"));
    // Un nom : une seule personne proposée, c'est elle ; plusieurs, la liste ; aucune, l'erreur.
    if (people.length === 1) return pickOne(people[0]!);
    if (people.length) return box.show();
    setError(liOn ? d.invalidBoth : d.invalid);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(value);
  };

  const shown = known.filter((a) => a.login.toLowerCase() !== selfLogin?.toLowerCase() && !lines.some((l) => l.key === `gh:${a.login.toLowerCase()}`));
  // Le rose de la séance : l'envoi de la dernière fiche prête (§18.48, un seul rose par écran).
  const lead = lines.find((l) => l.status === "done")?.key;
  const cls = `after-block denounce${pending ? " is-pending" : ""}${lead ? " is-done" : ""}`;

  return (
    <section className={cls} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>{d.title}</h2>
      {lines.length === 0 && <p className="denounce-intro">{d.intro}</p>}
      <form className="denounce-form" onSubmit={submit} noValidate>
        <div className="field field-who" ref={fieldRef}>
          <label htmlFor={`${uid}-gh`} className="sr-only">
            {label}
          </label>
          <input
            ref={input}
            id={`${uid}-gh`}
            className="field-input"
            type="text"
            inputMode="text"
            enterKeyHint="go"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            placeholder={lines.length ? d.placeholderNext : liOn ? d.placeholderBoth : d.placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => void box.onKeyDown(e)}
            onFocus={box.show}
            onBlur={box.close}
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-err` : undefined}
            {...box.inputProps}
          />
          {box.list}
        </div>
        <button type="submit" className="pill">
          {d.btn}
        </button>
      </form>
      {error && (
        <p className="denounce-error" id={`${uid}-err`} role="alert">
          {error}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="denounce-lines" aria-label={d.listLabel} aria-live="polite">
          {lines.map((l) => (
            <ShotLine key={l.key} shot={l} lead={l.key === lead} now={now} byId={cardId} mine={mine} toast={toast} />
          ))}
        </ul>
      )}
      {shown.length > 0 && (
        <div className="denounce-suggest">
          <p className="surtitre">{d.suggest}</p>
          <ul>
            {shown.map((a) => (
              <li key={a.login}>
                <button type="button" className="pill pill-ghost denounce-who" onClick={() => void send({ kind: "github", login: a.login }, `@${a.login}`)}>
                  <WhoFace login={a.login} />
                  <span>@{a.login}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Une ligne de la séance : le visage, le nom, puis la barre de l'interrogatoire, les étoiles et la note, ou
 * l'erreur ; au bout, de quoi l'envoyer à la personne. Dénoncer s'adresse à une personne (§18.48) : aucun
 * partage public. Sur téléphone, « Envoyer » ouvre la feuille du système (texte et lien, sans fichier :
 * la messagerie bâtit elle-même l'aperçu, le duel du §18.94) ; ailleurs, WhatsApp et Copier (le message
 * et le lien). `lead` : la dernière fiche prête, son premier bouton est le rose de l'écran.
 */
export function ShotLine({ shot, lead, now, byId, mine, toast }: { shot: Shot; lead: boolean; now: number; byId: string; mine?: number | null; toast: (m: string) => void }) {
  const { t, lang } = useT();
  const d = t.denounce;
  const card = shot.status === "done" ? shot.card : undefined;
  // « @pseudo », ou le nom d'une fiche tirée d'un LinkedIn.
  const who = card ? (card.login ? `@${card.login}` : card.name) : shot.who;
  const face = card ? <Avatar login={card.login} src={card.avatarUrl ?? ""} initials={card.initials} /> : <Avatar login={shot.login} src={shot.photo ?? (shot.login ? undefined : "")} initials={shot.who.replace(/^@/, "").slice(0, 1)} />;
  return (
    <li className={`denounce-line is-${shot.status}`}>
      {face}
      <div className="denounce-line-who">
        <span className="denounce-line-name">{who}</span>
        {shot.status === "pending" && (
          <span className="denounce-line-wait" role="status">
            <span className="sr-only">{d.pending}</span>
            <span className="denounce-bar" style={{ "--p": `${pendingPct(now - shot.since)}%` } as CSSProperties} aria-hidden />
          </span>
        )}
        {card && <Score card={card} lang={lang} label={t.result.wantedStars} />}
        {shot.status === "error" && <span className="denounce-line-err">{shot.error}</span>}
      </div>
      {card && <Send card={card} who={who} lead={lead} byId={byId} mine={mine} toast={toast} />}
    </li>
  );
}

/** Les étoiles et la note ; un dossier scellé n'a ni l'une ni l'autre : son niveau ou son profil. */
function Score({ card, lang, label }: { card: CardData; lang: Lang; label: (n: number, level: string) => string }) {
  const n = starsFor(card.overall);
  if (card.sealed) return <span className="denounce-line-score denounce-tag">{tagOf(card, lang)}</span>;
  return (
    <span className="denounce-line-score">
      <Stars n={n} size={14} label={label(n, pick(LEVEL_LABELS[n], lang))} />
      <b>{card.overall}</b>
    </span>
  );
}

function Send({ card, who, lead, byId, mine, toast }: { card: CardData; who: string; lead: boolean; byId: string; mine?: number | null; toast: (m: string) => void }) {
  const { t } = useT();
  const d = t.denounce;
  // Presse-papiers refusé : le message s'affiche, sélectionné, pour un appui long.
  const [manual, setManual] = useState<string | null>(null);
  const sealed = !!card.sealed;
  // Le lien porte la fiche du dénonciateur (?r=) : son aperçu est le duel (§18.94).
  const url = shareUrl(card.id, byId);
  const canNative = isTouch() && hasNativeShare();
  const track = (channel: string) => api.track("card_shared", card.id, { channel, kind: "denounce" });
  const me = typeof mine === "number" ? mine : null;
  // Le duel en chiffres, vu par qui envoie : la règle de la page partagée (lib/versus.ts).
  const gap = (() => {
    if (me === null || sealed) return "";
    const v = verdict(me, card.overall);
    if (v.by === "tie") return d.sendTie;
    const g = v.by === "stars" ? d.starsAhead(v.n) : d.pointsAhead(v.n);
    return v.ahead ? d.iLead(g) : d.youLead(g);
  })();
  const text = d.sendText(who, me, sealed ? null : card.overall, gap);
  const message = `${text} ${url}`;

  const onNative = async () => {
    try {
      await navigator.share({ title: "Azerit", text, url });
      track("native");
    } catch {
      /* partage annulé */
    }
  };
  const onCopy = async () => {
    if (await copyText(message)) toast(d.sendCopied(who));
    else setManual(message);
    track("copy");
  };
  // WhatsApp ne prend son adresse que le temps du clic (aimAt) : les bloqueurs masquent les liens de partage.
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const cardHref = `/c/${card.id}`;

  return (
    <>
      <div className="denounce-line-send">
        {canNative ? (
          <button type="button" className={`pill denounce-line-go${lead ? " is-lead" : ""}`} aria-label={d.send(who)} onClick={() => void onNative()}>
            <IconShare />
            <span>{d.sendShort}</span>
          </button>
        ) : (
          <>
            <a
              className={`pill denounce-line-icon${lead ? " is-lead" : ""}`}
              href={cardHref}
              target="_blank"
              rel="noopener"
              aria-label={d.waTo(who)}
              onClick={(e) => {
                aimAt(e.currentTarget, wa, cardHref);
                track("whatsapp");
              }}
            >
              <IconWhatsApp />
            </a>
            <button type="button" className="pill denounce-line-icon" aria-label={d.copyFor(who)} onClick={() => void onCopy()}>
              <IconCopy />
            </button>
          </>
        )}
      </div>
      {manual && <ManualCopy m={{ kind: "message", value: manual }} />}
    </>
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
