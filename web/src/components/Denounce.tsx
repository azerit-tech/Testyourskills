// « Dénonce un complice » (§18.6, §18.48, §18.83), le premier bloc sous le verdict. Rien
// à coller : on tape un nom, des comptes GitHub et des profils LinkedIn sortent sous le
// champ, on touche la personne et la dénonciation part. Un lien LinkedIn collé ou un
// pseudo GitHub tapé en entier marchent toujours. La fiche du complice sort par le moteur
// habituel ; « @x est dans le viseur » s'affiche aussitôt avec sa barre, dans le bloc,
// puis de quoi l'envoyer à la personne, sans regarder la révélation de l'autre.
// Si le serveur ne lit pas LinkedIn, le champ ne prend qu'un nom ou un pseudo GitHub.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { fileOf } from "../../../shared/caseFile";
import { detectEntry, linkedinSlug } from "../../../shared/entry";
import type { Entry } from "../../../shared/entry";
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

type State =
  | { s: "idle"; error?: string }
  /** `who` : « @pseudo », le nom de la personne touchée dans la liste, ou celui du lien LinkedIn. `since` : le départ de la barre. */
  | { s: "pending"; who: string; since: number }
  | { s: "done"; card: CardData };

/** Le chef d'accusation le plus partageable : un écart ou un négatif d'abord. */
function bestStatus(card: CardData, lang: Lang): string | null {
  const order = ["gap", "negative", "special", "positive"];
  const s = [...card.statuses].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone))[0];
  return s ? pick(s.label, lang) : null;
}

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
}

export function Denounce({ cardId, selfLogin, toast, initial }: Props) {
  const { t, lang } = useT();
  const d = t.denounce;
  const uid = useId().replace(/:/g, "");
  const [state, setState] = useState<State>({ s: "idle" });
  const [value, setValue] = useState(initial ?? "");
  /** Les complices connus de la fiche (ses co-auteurs sur GitHub) : un toucher les dénonce. */
  const [known, setKnown] = useState<CaseInfo["accomplices"]>([]);
  const alive = useRef(true);
  const busy = useRef(false);
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

  // La barre de l'interrogatoire avance pendant l'attente.
  const [now, setNow] = useState(() => Date.now());
  const pending = state.s === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [pending]);

  /** La dénonciation part : la fiche se calcule tout de suite, « dans le viseur » s'affiche sans attendre. */
  const send = async (entry: Entry, who: string) => {
    if (busy.current) return;
    if (entry.kind === "linkedin" && !liOn) return setState({ s: "idle", error: d.githubOnly });
    if (entry.kind === "github" && selfLogin && entry.login.toLowerCase() === selfLogin.toLowerCase()) return setState({ s: "idle", error: d.self });
    busy.current = true;
    setNow(Date.now());
    setState({ s: "pending", who, since: Date.now() });
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

  // Les personnes à ce nom, sous le champ (§18.80) : comptes GitHub et profils LinkedIn mêlés.
  const mixed = liOn && liSearch;
  const found = useSuggestions(value, { github: true, linkedin: mixed }, state.s !== "idle");
  // On ne se dénonce pas soi-même : son propre compte ne sort pas dans la liste.
  const people = useMemo(() => found.filter((p) => !(p.kind === "github" && selfLogin && p.login.toLowerCase() === selfLogin.toLowerCase())), [found, selfLogin]);
  /** Une personne touchée dans la liste : la dénonciation part, sans autre geste. */
  const pickOne = (item: Suggestion) => {
    setValue(item.title);
    void send(item.kind === "github" ? { kind: "github", login: item.login } : { kind: "linkedin", url: item.url }, item.kind === "github" ? `@${item.login}` : item.title);
  };
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
    setState({ s: "idle", error: liOn ? d.invalidBoth : d.invalid });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(value);
  };

  if (state.s === "done") return <Wanted card={state.card} toast={toast} onAgain={() => setState({ s: "idle" })} />;

  // « @x est dans le viseur », tout de suite : le titre de la fiche prête, avec sa barre en attendant les étoiles.
  if (state.s === "pending")
    return (
      <section className="after-block denounce is-pending" aria-busy>
        <h2 className="denounce-head">
          <span className="denounce-who-name">{state.who}</span> {d.inSights}
        </h2>
        <div className="denounce-pending" role="status">
          <p>{d.pending}</p>
          <span className="denounce-bar" style={{ "--p": `${pendingPct(now - state.since)}%` } as CSSProperties} aria-hidden />
        </div>
      </section>
    );

  const shown = known.filter((a) => a.login.toLowerCase() !== selfLogin?.toLowerCase());

  return (
    <section className="after-block denounce" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`}>{d.title}</h2>
      <p className="denounce-intro">{d.intro}</p>
      <form className="denounce-form" onSubmit={submit} noValidate>
        <div className="field field-who" ref={fieldRef}>
          <label htmlFor={`${uid}-gh`} className="sr-only">
            {label}
          </label>
          <input
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
            placeholder={liOn ? d.placeholderBoth : d.placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (state.error) setState({ s: "idle" });
            }}
            onKeyDown={(e) => void box.onKeyDown(e)}
            onFocus={box.show}
            onBlur={box.close}
            aria-invalid={!!state.error}
            aria-describedby={state.error ? `${uid}-err` : undefined}
            {...box.inputProps}
          />
          {box.list}
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
 * Ce que le dénonciateur reçoit : la fiche du complice résumée, prête à envoyer. Dénoncer s'adresse à une
 * personne : un seul bouton, qui lui envoie le lien (§18.48), et « Copier le lien ». Aucun partage public :
 * la fiche d'un tiers ne part pas dans un post ; une fois reprise, c'est la personne qui la partage.
 */
export function Wanted({ card, toast, onAgain }: { card: CardData; toast: (m: string) => void; onAgain: () => void }) {
  const { t, lang } = useT();
  const d = t.denounce;
  // La fiche prête prend plus de place que son attente : si son titre est passé au-dessus de l'écran, il y revient.
  // Seulement si le bloc est encore à l'écran : qui est parti lire plus bas n'est pas ramené de force.
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const r = root.current?.getBoundingClientRect();
    const el = root.current;
    if (!el || !r || r.top >= 0 || r.bottom <= 0) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, []);
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
    <section ref={root} className="after-block denounce is-done" aria-live="polite">
      {/* Le titre seul ; les étoiles et le nom du niveau sur leur ligne, jamais mêlés au texte. */}
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
