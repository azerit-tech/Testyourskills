// Route /c/:id : attente, révélation puis résultat pour une carte fraîche ;
// affichage direct (sans pack) pour un lien partagé.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CardData, Fact, Finding, JobState, ProgressEvent } from "../../../shared/types";
import { declaredOf, LEVEL_LABELS, starsFor } from "../../../shared/types";
import { AddSource, AzeritCta, Claim, Contest, DeleteCard, EmailForm, LinkedInPhoto, ShareBar, Why, useMe, useToast } from "../components/After";
import type { Shareable } from "../components/After";
import { ComparisonStage } from "../components/Comparison";
import { Denounce } from "../components/Denounce";
import { EntryForm } from "../components/EntryForm";
import { Dossier } from "../components/Findings";
import { RevealCard, useReveal } from "../components/Reveal";
import type { WalkoutControl } from "../components/Walkout3D";
import { Waiting } from "../components/Waiting";
import { pick, useT } from "../i18n";
import { api, ApiError, tokens, type CaseInfo } from "../lib/api";
import { isClosed } from "../lib/errors";
import { navigate, onLinkClick } from "../lib/router";
import { freshSince, iDenounced, myCard, prefillFromLast, rememberMine, type MyCard } from "../lib/session";
import { useReducedMotion } from "../lib/util";
import { verdict } from "../lib/versus";

/** La révélation 3D et Three.js, hors du bundle de l'accueil. */
const loadWalkout = () => import("../components/Walkout3D");
const Walkout3D = lazy(() => loadWalkout().then((m) => ({ default: m.Walkout3D })));

const POLL_MS = 600;
const CLIENT_TIMEOUT = 45_000;
/** Un profil LinkedIn en lecture (§18.24) : le serveur se donne jusqu'à 60 s de plus, le front patiente d'autant. */
const CLIENT_TIMEOUT_LINKEDIN = 120_000;
const readingLinkedin = (progress: ProgressEvent[]) => progress.some((e) => e.key === "linkedin_wait" || e.key === "linkedin");

type View =
  | { s: "loading" }
  | { s: "pending"; progress: ProgressEvent[]; queue?: number; findings?: Finding[] }
  | { s: "done"; item: Shareable }
  | { s: "error"; message: Fact | string; notFound?: boolean }
  /** Masquée par son propriétaire revendiqué (§18.1) : 410 de l'API. */
  | { s: "withdrawn" }
  | { s: "deleted" };

function useJob(id: string, nonce: number) {
  const [view, setView] = useState<View>({ s: "loading" });
  const [sawPending, setSawPending] = useState(false);
  const { t } = useT();

  useEffect(() => {
    let alive = true;
    let timer = 0;
    // Le temps passé en file d'attente ne compte pas : le serveur coupe lui-même au bout de 3 min.
    let started = freshSince(id) ?? Date.now();
    const poll = async () => {
      try {
        const job: JobState = await api.getJob(id);
        if (!alive) return;
        if (job.state === "pending") {
          setSawPending(true);
          setView({ s: "pending", progress: job.progress ?? [], queue: job.queue, findings: job.findings });
          if (job.queue) started = Date.now();
          if (Date.now() - started > (readingLinkedin(job.progress ?? []) ? CLIENT_TIMEOUT_LINKEDIN : CLIENT_TIMEOUT)) {
            setView({ s: "error", message: t.errors.timeout });
            return;
          }
          timer = window.setTimeout(poll, POLL_MS);
        } else if (job.state === "done") {
          setView({ s: "done", item: job.kind === "card" ? { kind: "card", card: job.card } : { kind: "comparison", comparison: job.comparison } });
        } else if (isClosed(job.code)) {
          // Commissariat fermé : retour à l'entrée, pseudo prérempli, message affiché.
          prefillFromLast(job.message ?? t.errors.closed);
          navigate("/", { replace: true });
        } else {
          setView({ s: "error", message: job.message });
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setView({ s: "error", message: t.errors.notFound, notFound: true });
        else if (e instanceof ApiError && e.status === 410) setView({ s: "withdrawn" });
        else if (e instanceof ApiError && e.fact) setView({ s: "error", message: e.fact });
        else timer = window.setTimeout(poll, POLL_MS * 3); // réseau capricieux : on retente
      }
    };
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nonce]);

  return { view, setView, sawPending };
}

export function CardPage({ id }: { id: string }) {
  const { t, lang } = useT();
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null);
  const { view, setView, sawPending } = useJob(id, nonce);
  const fresh = freshSince(id) !== null;
  const owner = fresh || tokens.get(id) !== null;
  const reduced = useReducedMotion();
  const [startedAt] = useState(() => freshSince(id) ?? Date.now());
  const [meNonce, setMeNonce] = useState(0);
  const [me, setMe] = useMe(meNonce);

  // Retour de LinkedIn : ?photo=linkedin|error. On prévient, on recharge, on nettoie l'URL.
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const photo = params.get("photo");
      if (!photo) return;
      params.delete("photo");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
      setNotice({ text: photo === "linkedin" ? t.result.linkedin.updated : t.result.linkedin.error, n: Date.now() });
      if (photo === "linkedin") setNonce((n) => n + 1);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retour de GitHub (§18.1) : ?claim=ok|mismatch|error|limited, &as={login}. On prévient, on relit la session, on nettoie l'URL.
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const claim = params.get("claim");
      if (!claim) return;
      const as = (params.get("as") ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 39);
      params.delete("claim");
      params.delete("as");
      const qs = params.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : ""));
      const c = t.result.claim;
      const text =
        claim === "ok" && as ? c.claimed(as) : claim === "mismatch" && as ? c.mismatch(as) : claim === "limited" ? c.limited : c.error;
      setNotice({ text, n: Date.now() });
      if (claim === "ok") {
        setMeNonce((n) => n + 1);
        setNonce((n) => n + 1);
      }
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Titre de l'onglet.
  useEffect(() => {
    if (view.s !== "done") {
      document.title = t.meta.title;
      return;
    }
    const c = view.item.kind === "card" ? view.item.card : view.item.comparison.github;
    document.title = t.meta.titleCard(c.name, c.overall);
  }, [view, t]);

  // La scène 3D (Three.js et ses assets) se charge pendant l'attente du
  // scoring, et s'y prépare : shaders compilés, textures sur le GPU.
  useEffect(() => {
    if (view.s === "pending")
      loadWalkout()
        .then((m) => m.warmWalkout(lang))
        .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.s]);

  // L'enquête en direct (§18.26) : fiche prête avant la fin des trouvailles, on
  // laisse tomber au moins trois pièces avant la révélation (Waiting rend la main).
  const lastPending = useRef<{ progress: ProgressEvent[]; queue?: number; findings?: Finding[] }>({ progress: [] });
  if (view.s === "pending") lastPending.current = view;
  const [released, setReleased] = useState(false);
  const holding = view.s === "done" && sawPending && !released && (lastPending.current.findings?.length ?? 0) > 0;
  // Filet : jamais plus de 12 s de plus, même si l'onglet a dormi.
  useEffect(() => {
    if (!holding) return;
    const t = window.setTimeout(() => setReleased(true), 12_000);
    return () => window.clearTimeout(t);
  }, [holding]);

  if (view.s === "loading") {
    return (
      <main className="page page-card" id="main">
        <div className="stage-slot loading-slot" aria-busy="true">
          <span className="sr-only">{t.common.loading}</span>
        </div>
      </main>
    );
  }

  if (view.s === "pending" || holding) {
    const w = view.s === "pending" ? view : lastPending.current;
    return (
      <main className="page page-card" id="main">
        <Waiting
          progress={w.progress}
          startedAt={startedAt}
          queue={w.queue}
          findings={w.findings}
          ready={holding}
          onRelease={() => setReleased(true)}
        />
      </main>
    );
  }

  if (view.s === "deleted") {
    return (
      <main className="page page-card" id="main">
        <div className="panel-center">
          <p className="deleted-msg" role="status">
            {t.result.del.done}
          </p>
          <a className="btn-primary" href="/" onClick={(e) => onLinkClick(e, "/")}>
            {t.result.again}
          </a>
        </div>
      </main>
    );
  }

  if (view.s === "withdrawn") {
    return (
      <main className="page page-card" id="main">
        <Withdrawn cardId={id} notice={notice?.text ?? null} />
      </main>
    );
  }

  if (view.s === "error") {
    const msg = typeof view.message === "string" ? view.message : pick(view.message, lang);
    return (
      <main className="page page-card" id="main">
        <div className="panel-center error-panel" role="alert">
          <h1>{t.errors.title}</h1>
          <p>{msg}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              prefillFromLast(view.notFound ? null : view.message);
              navigate("/");
            }}
          >
            {view.notFound ? t.result.makeYours : t.errors.retry}
          </button>
        </div>
      </main>
    );
  }

  return (
    <Result
      key={id}
      item={view.item}
      animate={(fresh || sawPending) && !reduced}
      owner={owner}
      fresh={fresh}
      notice={notice}
      me={me}
      onMe={setMe}
      onDeleted={() => setView({ s: "deleted" })}
    />
  );
}

interface ResultProps {
  item: Shareable;
  animate: boolean;
  owner: boolean;
  fresh: boolean;
  notice: { text: string; n: number } | null;
  me: Awaited<ReturnType<typeof api.getMe>>;
  onMe: (me: Awaited<ReturnType<typeof api.getMe>>) => void;
  onDeleted: () => void;
}

function Result({ item, animate, owner, fresh, notice, me, onMe, onDeleted }: ResultProps) {
  const { t, lang } = useT();
  const id = item.kind === "card" ? item.card.id : item.comparison.id;
  const main: CardData = item.kind === "card" ? item.card : item.comparison.github;
  const { phase, open, skip, handoff, finish, animating, settled } = useReveal(animate);
  const toast = useToast();
  const tracked = useRef(false);
  const stageRef = useRef<HTMLElement>(null);
  const walkoutCtl = useRef<WalkoutControl | null>(null);

  useEffect(() => {
    if (fresh && !tracked.current) {
      tracked.current = true;
      api.track("card_generated", id, { kind: item.kind, source: main.source });
    }
  }, [fresh, id, item.kind, main.source]);

  useEffect(() => {
    if (notice) toast.show(notice.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  // Échap saute l'animation.
  useEffect(() => {
    if (!animating) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [animating, skip]);

  const onStageClick = () => {
    if (phase === "ready") open();
    else if (animating && !walkoutCtl.current?.interact()) skip();
  };

  // Revendiquée par la personne connectée (§18.1) : sa fiche, même sans le jeton de cet appareil.
  const cardLogin = main.login;
  const claimed = !!me && !!cardLogin && me.login === cardLogin.toLowerCase();
  const visitor = !owner && !claimed;

  // Dénonciation (§18.6) et page partagée (§18.7).
  const [kase, setKase] = useState<CaseInfo | null>(null);
  const [claimOn, setClaimOn] = useState(false);
  const [mine] = useState<MyCard | null>(() => myCard());
  useEffect(() => {
    let alive = true;
    void api.getCase(id).then((c) => alive && setKase(c));
    void api.getConfig().then((c) => alive && setClaimOn(c.claim));
    return () => {
      alive = false;
    };
  }, [id]);
  // Sa propre fiche, faite ou revendiquée ici : la référence des comparaisons à venir.
  useEffect(() => {
    if (!visitor) rememberMine({ id: main.id, login: main.login ?? null, overall: main.overall });
  }, [visitor, main.id, main.login, main.overall]);
  // « Avis de recherche à ton nom » : pas pour qui a dénoncé cette fiche depuis ce navigateur.
  const wantedYou = visitor && !!kase?.denounced && !iDenounced(id);
  useEffect(() => {
    if (!wantedYou) return;
    const key = `tys_landed_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* stockage bloqué : une fois par page */
    }
    api.track("denounce_landed", id);
  }, [wantedYou, id]);
  const other = mine && mine.id !== id && !(mine.login && main.login && mine.login === main.login.toLowerCase()) ? mine : null;

  return (
    <main className={`page page-card page-result${animating ? " is-animating" : ""}${visitor ? " is-visitor" : ""}`} id="main">
      {claimed && me?.hidden && (
        <p className="hidden-banner" role="status">
          {t.result.claim.hiddenBanner}
        </p>
      )}

      <div className="result-top">
        {/* Lien partagé (§18.7, maquette web/gta-partage.html) : la page personnage de la fiche. */}
        {visitor && (
          <WantedHead
            card={main}
            denounced={wantedYou ? { by: kase?.by ?? null } : null}
            onLawyer={claimOn && cardLogin ? () => api.startClaim(id, cardLogin) : null}
          />
        )}

        {animating && (
          <Suspense fallback={null}>
            <Walkout3D card={main} lang={lang} double={item.kind === "comparison"} declared={declaredOf(item.kind === "comparison" ? item.comparison : item.card)} phase={phase} anchorRef={stageRef} controlRef={walkoutCtl} onHandoff={handoff} onDone={finish} />
          </Suspense>
        )}
        <section ref={stageRef} className="result-stage" onClick={animating ? onStageClick : undefined}>
          {item.kind === "card" ? (
            <div className="single-stage">
              <RevealCard card={item.card} lang={lang} phase={phase} idPrefix="result" />
            </div>
          ) : (
            <ComparisonStage cmp={item.comparison} phase={phase} />
          )}
          {animating && phase !== "ready" && (
            <button
              type="button"
              className="skip-btn"
              onClick={(e) => {
                e.stopPropagation();
                skip();
              }}
            >
              {t.reveal.skip}
            </button>
          )}
          <p className="sr-only" aria-live="polite">
            {settled ? t.reveal.revealed(LEVEL_LABELS[starsFor(main.overall)][lang], main.overall) : ""}
          </p>
        </section>

        {visitor && (
          <section className="you" id="you" aria-labelledby="you-title">
            <h2 id="you-title">{t.denounce.andYou}</h2>
            {other ? (
              <>
                <p className="versus-line">{versusLine(t.denounce, other, main)}</p>
                <a className="pill pill-peach" href={`/c/${other.id}`} onClick={(e) => onLinkClick(e, `/c/${other.id}`)}>
                  {t.denounce.mine}
                </a>
              </>
            ) : (
              <>
                <p>{t.result.yourTurn}</p>
                <EntryForm variant="inline" />
              </>
            )}
          </section>
        )}
      </div>

      <div className={`after${settled ? " is-in" : ""}`} aria-hidden={!settled} inert={!settled ? true : undefined}>
        {/* L'enquête en direct (§18.26) : les trois trouvailles les plus fortes, chacune vers sa preuve. */}
        <Dossier card={main} />
        {/* Fiche masquée : /og/* et /c/:id répondent 404 / 410 à tous, l'image ne se télécharge pas et le lien ne montre rien. */}
        {!visitor && !(claimed && me?.hidden) && <ShareBar item={item} toast={toast.show} />}
        {/* Dénonce un complice (§18.6), juste après le partage. */}
        {!visitor && <Denounce cardId={id} selfLogin={cardLogin} toast={toast.show} />}
        <LinkedInPhoto cardId={id} hasAvatar={item.kind === "card" ? !!item.card.avatarUrl : !!item.comparison.cv.avatarUrl} />
        {/* Fiche dénoncée : « Appeler mon avocat » est déjà en tête de page. */}
        {!(wantedYou && claimOn) && <Claim cardId={id} login={cardLogin} lawyer={!owner} me={me} onMe={onMe} toast={toast.show} />}
        <Why item={item} withSentence={!visitor} />
        {!visitor && <Contest card={main} />}
        {!visitor && item.kind === "card" && <AddSource card={item.card} />}
        {!visitor && <EmailForm cardId={id} />}
        <AzeritCta cardId={id} />
        {!visitor && (
          <div className="after-foot">
            <a className="link-alt" href="/" onClick={(e) => onLinkClick(e, "/")}>
              {t.result.again}
            </a>
            <DeleteCard cardId={id} onDeleted={onDeleted} />
          </div>
        )}
      </div>
      {toast.node}
    </main>
  );
}

/** Six étoiles du HUD : les éteintes à gauche, pleines et sombres ; les allumées à droite, blanches et mates. */
function WantedStars({ n, label }: { n: number; label: string }) {
  return (
    <span className="wanted-stars" role="img" aria-label={label}>
      {Array.from({ length: 6 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className={i >= 6 - n ? "on" : "off"} aria-hidden>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

const STAR = "M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z";

type Dict = ReturnType<typeof useT>["t"];

/** « Toi 78 · @X 71 · une étoile d'avance » (§18.7). */
function versusLine(d: Dict["denounce"], mine: MyCard, card: CardData): string {
  const v = verdict(mine.overall, card.overall);
  const said =
    v.by === "tie" ? d.tie : v.by === "stars" ? (v.ahead ? d.starsAhead(v.n) : d.starsBehind(v.n)) : v.ahead ? d.pointsAhead(v.n) : d.pointsBehind(v.n);
  return d.versus(mine.overall, card.login ? `@${card.login}` : card.name, card.overall, said);
}

interface WantedHeadProps {
  card: CardData;
  /** Fiche dénoncée (§18.6) : bandeau « Avis de recherche à ton nom », dénonciateur nommé s'il a revendiqué sa fiche. */
  denounced: { by: string | null } | null;
  /** Revendication par GitHub ; null si elle est désactivée : le bouton mène alors à « Fais la tienne ». */
  onLawyer: (() => void) | null;
}

/** En tête d'une fiche partagée : qui, « dans le viseur » à quel niveau, quel profil, quelle peine. */
function WantedHead({ card, denounced, onLawyer }: WantedHeadProps) {
  const { t, lang } = useT();
  const d = t.denounce;
  const n = starsFor(card.overall);
  const level = pick(LEVEL_LABELS[n], lang);
  const starsLabel = t.result.wantedStars(n, level);
  const toForm = () => {
    const input = document.querySelector<HTMLInputElement>("#you input");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  };
  return (
    <header className="wanted">
      {denounced ? (
        <div className="denounced" role="note">
          <p className="denounced-title">{d.banner}</p>
          <p className="denounced-by">{denounced.by ? d.by(denounced.by) : d.anonymous}</p>
          <button type="button" className="pill" onClick={onLawyer ?? toForm}>
            {onLawyer ? d.lawyer : t.result.makeYours}
          </button>
        </div>
      ) : (
        <p className="surtitre">{t.result.wanted}</p>
      )}
      <h1 className="wanted-name">{card.login ? `@${card.login}` : card.name}</h1>
      <p className="wanted-line">
        <span className="wanted-verb">{d.inSights}</span>
        {/* Les étoiles et le profil passent à la ligne ensemble, jamais un « · » en tête de ligne. */}
        <span className="wanted-level">
          <WantedStars n={n} label={starsLabel} />
          <strong>
            <span aria-hidden>· </span>
            {card.profile ? pick(card.profile.label, lang) : level}
          </strong>
        </span>
      </p>
      {card.profile && <p className="wanted-hook">{pick(card.profile.tagline, lang)}</p>}
      {card.sentence && (
        <p className="wanted-sentence">
          {pick(card.sentence.label, lang)}
          {card.sentence.bail && <span>{pick(card.sentence.bail, lang)}</span>}
        </p>
      )}
    </header>
  );
}

/** Fiche masquée vue par quelqu'un d'autre ; son propriétaire peut se reconnecter d'ici. */
function Withdrawn({ cardId, notice }: { cardId: string; notice: string | null }) {
  const { t } = useT();
  const w = t.result.withdrawn;
  const [claim, setClaim] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setClaim(c.claim));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="panel-center error-panel withdrawn-panel">
      <h1>{w.title}</h1>
      <p>{w.text}</p>
      {notice && (
        <p className="withdrawn-notice" role="status">
          {notice}
        </p>
      )}
      <a className="btn-primary" href="/" onClick={(e) => onLinkClick(e, "/")}>
        {t.result.makeYours}
      </a>
      {claim && (
        <button type="button" className="link-quiet withdrawn-claim" onClick={() => api.startClaim(cardId)}>
          {w.mine}
        </button>
      )}
    </div>
  );
}
