// Route /c/:id : attente, révélation puis résultat pour une carte fraîche ;
// affichage direct (sans pack) pour un lien partagé.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData, Fact, JobState, ProgressEvent } from "../../../shared/types";
import { LEVEL_LABELS, starsFor } from "../../../shared/types";
import { AddSource, AzeritCta, Claim, Contest, DeleteCard, EmailForm, LinkedInPhoto, Roast, ShareBar, Why, useMe, useToast } from "../components/After";
import type { Shareable } from "../components/After";
import { ComparisonStage } from "../components/Comparison";
import { EntryForm } from "../components/EntryForm";
import { IconArrow } from "../components/Icons";
import { RevealCard, useReveal } from "../components/Reveal";
import type { WalkoutControl } from "../components/Walkout3D";
import { Waiting } from "../components/Waiting";
import { pick, useT } from "../i18n";
import { api, ApiError, tokens } from "../lib/api";
import { isClosed } from "../lib/errors";
import { navigate, onLinkClick } from "../lib/router";
import { freshSince, prefillFromLast } from "../lib/session";
import { accentOf, useReducedMotion } from "../lib/util";

/** La révélation 3D et Three.js, hors du bundle de l'accueil. */
const loadWalkout = () => import("../components/Walkout3D");
const Walkout3D = lazy(() => loadWalkout().then((m) => ({ default: m.Walkout3D })));

const POLL_MS = 600;
const CLIENT_TIMEOUT = 45_000;

type View =
  | { s: "loading" }
  | { s: "pending"; progress: ProgressEvent[]; queue?: number }
  | { s: "done"; item: Shareable }
  | { s: "error"; message: Fact | string; notFound?: boolean }
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
          setView({ s: "pending", progress: job.progress ?? [], queue: job.queue });
          if (job.queue) started = Date.now();
          if (Date.now() - started > CLIENT_TIMEOUT) {
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

  if (view.s === "loading") {
    return (
      <main className="page page-card" id="main">
        <div className="stage-slot loading-slot" aria-busy="true">
          <span className="sr-only">{t.common.loading}</span>
        </div>
      </main>
    );
  }

  if (view.s === "pending") {
    return (
      <main className="page page-card" id="main">
        <Waiting progress={view.progress} startedAt={startedAt} queue={view.queue} />
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

  if (view.s === "error") {
    const msg = typeof view.message === "string" ? view.message : pick(view.message, lang);
    return (
      <main className="page page-card" id="main">
        <div className="panel-center error-panel" role="alert">
          <span className="error-code" aria-hidden>
            {view.notFound ? "404" : "VAR"}
          </span>
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
            <IconArrow />
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
  const accent = item.kind === "card" ? accentOf(main) : { a: "#52d0bd", b: "#6cb6ff", ink: "#52d0bd" };
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

  const style = { "--ca": accent.a, "--cb": accent.b, "--ink": accent.ink } as CSSProperties;
  // Revendiquée par la personne connectée (§18.1) : sa fiche, même sans le jeton de cet appareil.
  const cardLogin = main.login;
  const claimed = !!me && !!cardLogin && me.login === cardLogin.toLowerCase();
  const visitor = !owner && !claimed;

  return (
    <main className={`page page-card page-result${animating ? " is-animating" : ""}`} id="main" style={style}>
      {visitor && (
        <div className="visitor-banner">
          <p>
            {t.result.sharedBanner(main.name)} <b>{t.result.yourTurn}</b>
          </p>
          <EntryForm variant="inline" />
        </div>
      )}

      {animating && (
        <Suspense fallback={null}>
          <Walkout3D card={main} lang={lang} double={item.kind === "comparison"} phase={phase} anchorRef={stageRef} controlRef={walkoutCtl} onHandoff={handoff} onDone={finish} />
        </Suspense>
      )}
      <section ref={stageRef} className="result-stage" onClick={animating ? onStageClick : undefined}>
        <div className="stage-glow" aria-hidden />
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

      <div className={`after${settled ? " is-in" : ""}`} aria-hidden={!settled} inert={!settled ? true : undefined}>
        <ShareBar item={item} toast={toast.show} />
        <LinkedInPhoto cardId={id} hasAvatar={item.kind === "card" ? !!item.card.avatarUrl : !!item.comparison.cv.avatarUrl} />
        <Claim cardId={id} login={cardLogin} lawyer={!owner} me={me} onMe={onMe} toast={toast.show} />
        <Why item={item} />
        {!visitor && <Contest card={main} />}
        {!visitor && item.kind === "card" && <AddSource card={item.card} />}
        {!visitor && <Roast />}
        {!visitor && <EmailForm cardId={id} />}
        <AzeritCta cardId={id} />
        <div className="after-foot">
          {visitor ? (
            <a className="btn-primary" href="/" onClick={(e) => onLinkClick(e, "/")}>
              {t.result.makeYours}
              <IconArrow />
            </a>
          ) : (
            <a className="link-arrow" href="/" onClick={(e) => onLinkClick(e, "/")}>
              {t.result.again} <IconArrow />
            </a>
          )}
          <DeleteCard cardId={id} onDeleted={onDeleted} />
        </div>
      </div>
      {toast.node}
    </main>
  );
}
