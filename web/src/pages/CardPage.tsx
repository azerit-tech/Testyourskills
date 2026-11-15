// Route /c/:id : attente, révélation puis résultat pour une carte fraîche ;
// affichage direct (sans pack) pour un lien partagé.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fileOf } from "../../../shared/caseFile";
import { usableGrid } from "../../../shared/gridText";
import type { CardData, Fact, Finding, JobState, ProgressEvent } from "../../../shared/types";
import { declaredOf, LEVEL_LABELS, starsFor } from "../../../shared/types";
import { AddSource, Claim, Contest, EmailForm, Hiring, LinkedInPhoto, ShareBar, useMe, useToast } from "../components/After";
import type { Shareable } from "../components/After";
import { BandPick } from "../components/BandPick";
import { Denounce } from "../components/Denounce";
import { Denounced, useRemake } from "../components/Denounced";
import { Duel, useDuelSend } from "../components/Duel";
import { EntryForm } from "../components/EntryForm";
import { PrimeRace } from "../components/Primes";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { CardNotFound, Unreachable } from "../components/ErrorPage";
import { Dossier } from "../components/Findings";
import { Jury, JuryLine } from "../components/Jury";
import { MakeYours } from "../components/MakeYours";
import { PleaVerdict } from "../components/Plea";
import { RecruiterRead } from "../components/RecruiterRead";
import { RemovalRequest } from "../components/Removal";
import { AddLinkedin } from "../components/AddLinkedin";
import { Pieces } from "../components/Pieces";
import { Penalty, ProfileSky } from "../components/ProfileTile";
import { CardViewOptions } from "../card/CardView";
import { RevealCard, useReveal } from "../components/Reveal";
import { ShareDock } from "../components/ShareDock";
import type { WalkoutControl } from "../components/Walkout3D";
import { Waiting } from "../components/Waiting";
import { pick, useT } from "../i18n";
import { api, ApiError, tokens, type CaseInfo } from "../lib/api";
import { isClosed, isInputError } from "../lib/errors";
import { useHold, type SceneState } from "../lib/hold";
import { gaveUp, nextPatience, type Patience } from "../lib/patience";
import { REMOTE_PATIENCE_MS } from "../lib/remote";
import { filmTrace } from "../film/trace";
import { ChaseLink } from "../film/ChaseLink";
import { navigate, onLinkClick } from "../lib/router";
import { chaseWatched, filmOwed, forgetMine, freshCv, markChaseWatched, freshLogin, freshSince, freshSlug, iDenounced, lastVisited, markFilmSeen, myCard, prefillFromLast, rememberMine, rememberVisited, type MyCard } from "../lib/session";
import { revealScene, revealToPlay } from "../lib/revealScene";
import { useReducedMotion } from "../lib/util";

/** La révélation 3D et Three.js, hors du bundle de l'accueil. */
const loadWalkout = () => import("../components/Walkout3D");
const Walkout3D = lazy(() => loadWalkout().then((m) => ({ default: m.Walkout3D })));
/** Le film (§18.36) : deux balises vidéo, ni Three.js ni WebGL. Les vidéos se chargent dès l'attente. */
const loadFilm = () => import("../components/Film");
const Film = lazy(() => loadFilm().then((m) => ({ default: m.Film })));

const POLL_MS = 600;
/** Échecs réseau d'affilée avant que l'attente dise que le commissariat ne répond pas (environ 5 s). */
const OFFLINE_AFTER = 3;

type View =
  | { s: "loading" }
  | { s: "pending"; progress: ProgressEvent[]; queue?: number; findings?: Finding[] }
  | { s: "done"; item: Shareable }
  | { s: "error"; message: Fact | string }
  /** Fiche inconnue (404) ; serveur injoignable (toute autre panne, lib/remote.ts). */
  | { s: "none" }
  | { s: "down" }
  /** Masquée par son propriétaire revendiqué (§18.1) : 410 de l'API. */
  | { s: "withdrawn" }
  | { s: "deleted" };

function useJob(id: string, nonce: number) {
  const [view, setView] = useState<View>({ s: "loading" });
  const [sawPending, setSawPending] = useState(false);
  // Réseau coupé : l'attente le dit et propose « Réessayer », qui relit seulement l'état de la fiche.
  const [offline, setOffline] = useState(false);
  const retry = useRef<() => void>(() => undefined);
  const { t } = useT();

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let busy = false;
    let fails = 0;
    /** La fiche est arrivée (ou a échoué) : plus rien à relire, ni au retour du réseau. */
    let over = false;
    // Le temps passé en file d'attente ne compte pas : le serveur coupe lui-même au bout de 3 min.
    // En traitement, on attend le délai que le serveur annonce, rallonge LinkedIn comprise (lib/patience.ts).
    let patience: Patience = { started: freshSince(id) ?? Date.now(), giveUpAt: null };
    let downSince = 0;
    /** On attend sa propre fiche (écran d'attente), et non une fiche déjà faite qu'on vient voir. */
    let waiting = freshSince(id) != null;
    const poll = async () => {
      if (busy) return;
      busy = true;
      window.clearTimeout(timer);
      try {
        const job: JobState = await api.getJob(id);
        if (!alive) return;
        downSince = 0;
        fails = 0;
        setOffline(false);
        over = job.state !== "pending";
        if (job.state === "pending") waiting = true;
        if (job.state === "pending") {
          setSawPending(true);
          setView({ s: "pending", progress: job.progress ?? [], queue: job.queue, findings: job.findings });
          patience = nextPatience(patience, job, Date.now());
          if (gaveUp(patience, Date.now())) {
            over = true;
            setView({ s: "error", message: t.errors.timeout });
            return;
          }
          timer = window.setTimeout(poll, POLL_MS);
        } else if (job.state === "done") {
          setView({ s: "done", item: job.kind === "card" ? { kind: "card", card: job.card } : { kind: "comparison", comparison: job.comparison } });
        } else if (isClosed(job.code)) {
          // Commissariat fermé : retour à l'entrée, pseudo prérempli, message affiché, bouton en contour.
          prefillFromLast(job.message ?? t.errors.closed, true);
          navigate("/", { replace: true });
        } else if (isInputError(job.code) && job.message) {
          // Pseudo inconnu, organisation : la seule erreur est sous le champ, à corriger.
          prefillFromLast(job.message);
          navigate("/", { replace: true });
        } else {
          setView({ s: "error", message: job.message });
        }
      } catch (e) {
        if (!alive) return;
        over = e instanceof ApiError && (e.status === 404 || e.status === 410);
        if (e instanceof ApiError && e.status === 404) setView({ s: "none" });
        else if (e instanceof ApiError && e.status === 410) setView({ s: "withdrawn" });
        else {
          // Réseau capricieux, serveur en panne : on retente en silence. Pendant l'attente de sa
          // fiche, l'écran d'attente le dit et garde la main (« Réessayer ») ; à l'arrivée sur
          // une fiche, la page d'erreur prend le relais au bout de la patience commune.
          downSince ||= Date.now();
          if (waiting) {
            if (++fails >= OFFLINE_AFTER) setOffline(true);
            timer = window.setTimeout(poll, POLL_MS * 3);
          } else if (Date.now() - downSince >= REMOTE_PATIENCE_MS) {
            over = true;
            setView({ s: "down" });
          } else timer = window.setTimeout(poll, POLL_MS * 3);
        }
      } finally {
        busy = false;
      }
    };
    // Le réseau revient, ou « Réessayer » : on relit tout de suite, sans attendre le prochain essai.
    const now = () => {
      if (!over) void poll();
    };
    retry.current = now;
    window.addEventListener("online", now);
    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", now);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, nonce]);

  const onRetry = useCallback(() => retry.current(), []);
  return { view, setView, sawPending, offline, onRetry };
}

export function CardPage({ id }: { id: string }) {
  const { t, lang } = useT();
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null);
  const { view, setView, sawPending, offline, onRetry } = useJob(id, nonce);
  const fresh = freshSince(id) !== null;
  const owner = fresh || tokens.get(id) !== null;
  // Le film joue une fois (§18.48) : dû à une fiche demandée ici (ou rechargée en plein film)
  // tant qu'il ne s'est pas posé. Lu à l'arrivée sur la fiche : la page ne bascule pas quand il se pose.
  const [owed] = useState(() => filmOwed(id));
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

  // Titre de l'onglet. Fiche introuvable ou serveur muet : le gabarit d'erreur pose le sien.
  useEffect(() => {
    if (view.s === "none" || view.s === "down") return;
    if (view.s !== "done") {
      document.title = t.meta.title;
      return;
    }
    // Un dossier à deux pièces : sa fiche, sa seule note (§18.36). Scellé : la note ne se dit pas.
    const c = view.item.kind === "card" ? view.item.card : fileOf(view.item.comparison);
    document.title = c.sealed ? t.meta.titleSealed(c.name) : t.meta.titleCard(c.name, c.overall);
  }, [view, t]);

  // La scène 3D (Three.js et ses assets) se charge dès que la fiche est
  // demandée, et s'y prépare pendant l'attente du scoring : shaders compilés,
  // textures sur le GPU. Jamais en mouvement réduit : il n'y aura pas de scène.
  // Le film (§18.36) télécharge ses vidéos pendant l'attente, en basse priorité ;
  // fiche prête, le niveau est connu : seule la fin utile se charge (fin6 à six étoiles).
  useEffect(() => {
    const scene = revealToPlay(revealScene(), reduced);
    if (scene === "film" && view.s === "done" && (owed || sawPending)) {
      const main = view.item.kind === "card" ? view.item.card : fileOf(view.item.comparison);
      loadFilm()
        .then((m) => m.preloadFilm(starsFor(main.overall)))
        .catch(() => undefined);
    } else if (scene && (view.s === "pending" || (view.s === "loading" && owed))) {
      if (scene === "film")
        loadFilm()
          .then((m) => m.preloadFilm())
          .catch(() => undefined);
      else
        loadWalkout()
          .then((m) => m.warmWalkout(lang))
          .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.s]);

  // Plus d'écran noir (§18.27) : fiche prête, l'attente reste par-dessus la page
  // tant que les pièces du dossier ne sont pas lues (§18.26, Waiting rend la
  // main) et que la scène 3D n'a pas rendu sa première image ; 20 s au plus.
  // Vaut pour une fiche fraîche servie du cache, qui n'a ni pièces ni pari.
  const lastPending = useRef<{ progress: ProgressEvent[]; queue?: number; findings?: Finding[] }>({ progress: [] });
  if (view.s === "pending") lastPending.current = view;
  const animate = view.s === "done" && (owed || sawPending) && !reduced;
  // Ma fiche n'existe plus à son adresse : le navigateur l'oublie (« Ma fiche », l'accueil, le duel).
  useEffect(() => {
    if (view.s === "none" || view.s === "deleted") forgetMine(id);
  }, [view.s, id]);
  const hold = useHold({ active: view.s === "done" && (animate || sawPending), animate });

  // La photo d'identité : l'avatar du pseudo tapé dès la première seconde ; sinon, fiche prête, sa photo.
  const typed = freshLogin(id);
  const doneCard = view.s === "done" ? (view.item.kind === "card" ? view.item.card : fileOf(view.item.comparison)) : null;
  const w = view.s === "pending" ? view : lastPending.current;
  // L'attente garde la même instance de bout en bout (clé fixe) : la photo, le pari et les pièces restent en place.
  const waiting =
    view.s === "pending" || (view.s === "loading" && owed) || hold.show ? (
      <Waiting
        key="waiting"
        cardId={id}
        login={typed ?? doneCard?.login}
        avatarUrl={typed ? null : doneCard?.avatarUrl}
        slug={freshSlug(id)}
        cv={freshCv(id)}
        name={doneCard?.name}
        initials={doneCard?.initials}
        createdAt={doneCard?.createdAt}
        plea={owner && sawPending}
        progress={w.progress}
        startedAt={startedAt}
        queue={w.queue}
        findings={w.findings}
        ready={view.s === "done"}
        onRelease={hold.onRelease}
        scene={hold.line}
        onOpen={hold.onOpen}
        leaving={hold.leaving}
        offline={offline}
        onRetry={onRetry}
      />
    ) : null;

  if (view.s === "loading" || view.s === "pending") {
    return (
      <>
        {waiting}
        <main className="page page-card is-loading" id="main">
          {!waiting && (
            <div className="stage-slot loading-slot" aria-busy="true">
              <span className="sr-only">{t.common.loading}</span>
            </div>
          )}
        </main>
      </>
    );
  }

  if (view.s === "deleted") {
    return (
      <main className="page page-card" id="main">
        <div className="panel-center">
          <div role="status">
            <h1 className="deleted-msg">{t.result.del.done}</h1>
            <p>{t.result.del.doneText}</p>
          </div>
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

  if (view.s === "none" || view.s === "down") {
    return (
      <main className="page page-error" id="main">
        {view.s === "none" ? <CardNotFound bare onMake={() => prefillFromLast(null)} /> : <Unreachable bare />}
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
              prefillFromLast(view.message);
              navigate("/");
            }}
          >
            {t.errors.retry}
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {waiting}
      <Result
        key={id}
        item={view.item}
        animate={animate}
        start={hold.start}
        abort={hold.abort}
        onScene={hold.onScene}
        owner={owner}
        fresh={fresh && owed}
        notice={notice}
        me={me}
        onMe={setMe}
        onDeleted={() => setView({ s: "deleted" })}
      />
    </>
  );
}

export interface ResultProps {
  item: Shareable;
  animate: boolean;
  /** L'écran d'attente s'est levé : la révélation peut partir (§18.27). */
  start: boolean;
  /** La scène 3D n'est pas venue à temps : la fiche sort sans révélation. */
  abort: boolean;
  /** La scène 3D a rendu sa première image (« ready »), ou n'aura pas lieu (« off »). */
  onScene: (state: SceneState) => void;
  owner: boolean;
  fresh: boolean;
  notice: { text: string; n: number } | null;
  me: Awaited<ReturnType<typeof api.getMe>>;
  onMe: (me: Awaited<ReturnType<typeof api.getMe>>) => void;
  onDeleted: () => void;
}

export function Result({ item, animate, start, abort, onScene, owner, fresh, notice, me, onMe, onDeleted }: ResultProps) {
  const { t, lang } = useT();
  const id = item.kind === "card" ? item.card.id : item.comparison.id;
  // Un dossier à deux pièces s'affiche comme une fiche seule : la fiche du dossier, sa note (§18.36).
  // Calculée une fois par dossier : un objet neuf à chaque rendu recréait le film en route (lecteur, son, gel).
  const main: CardData = useMemo(() => (item.kind === "card" ? item.card : fileOf(item.comparison)), [item]);
  const [scene] = useState(revealScene);
  // Le film part dès que l'attente se lève : sa première image est déjà à l'écran.
  const { phase, open, skip, replay, stage, staged, handoff, finish, animating, settled } = useReveal(animate, start, scene === "film" ? 0 : undefined);
  // Revoir le film (§18.48) : depuis la tête de la fiche, pour tout le monde, jamais en lecture automatique.
  // Le film se charge au toucher ; la page remonte en haut, la fiche se remonte sous l'arrêt sur image.
  // En mouvement réduit aussi : le film ne part jamais seul, mais il se joue sur ce geste.
  const [replayed, setReplayed] = useState(false);
  const playChase = () => {
    setReplayed(true);
    window.scrollTo(0, 0);
    replay();
  };
  // La scène ne viendra pas (délai dépassé, WebGL absent, animation passée) : l'attente n'a plus à la guetter.
  useEffect(() => {
    if (abort) skip();
  }, [abort, skip]);
  useEffect(() => {
    if (animate && phase === "done") onScene("off");
  }, [animate, phase, onScene]);
  // La fiche posée (film vu, passé ou replié) : revenir ici ne relance plus le film (§18.48).
  useEffect(() => {
    if (settled) markFilmSeen(id);
  }, [settled, id]);
  // Le film a vraiment joué : le lien dira « Revoir », plus « Voir ma poursuite ».
  useEffect(() => {
    if (scene === "film" && phase === "playing") markChaseWatched(id);
  }, [scene, phase, id]);
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
      if (e.key === "Escape") {
        filmTrace("passer : échap");
        skip();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [animating, skip]);

  // Le film fini ou passé, le focus va au titre de la fiche : le clavier et le lecteur
  // d'écran reprennent là, pas en haut de la page.
  const played = useRef(false);
  useEffect(() => {
    if (animating) played.current = true;
    else if (settled && played.current) {
      played.current = false;
      document.querySelector<HTMLElement>(".page-result .wanted-head")?.focus({ preventScroll: true });
    }
  }, [animating, settled]);

  // Un toucher sur le film ne le saute plus (§18.48) : seul « Passer » le fait. L'ascenseur (?scene=walkout) garde son geste.
  const onStageClick = () => {
    if (scene === "film") return;
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
  // La fiche d'un autre, regardée ici : celle qu'on fera ensuite s'y mesure (parcours 7).
  const [rival] = useState(lastVisited);
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
  useEffect(() => {
    if (visitor && settled && kase && !wantedYou && !main.sealed) rememberVisited({ id: main.id, login: main.login ?? null, name: main.name, overall: main.overall });
  }, [visitor, settled, kase, wantedYou, main.id, main.login, main.name, main.sealed, main.overall]);
  const other = mine && mine.id !== id && !(mine.login && main.login && mine.login === main.login.toLowerCase()) ? mine : null;
  const proveFirst = item.kind === "card" && declaredOf(item.card) === "linkedin";
  const who = main.login ? `@${main.login}` : main.name;
  // Au-dessus de la fiche, sur téléphone : « @pseudo », ou le prénom seul.
  const whoShort = main.login ? `@${main.login}` : (main.name.split(/\s+/)[0] ?? main.name);
  // La source qui manque au dossier, en bloc : le GitHub d'une fiche LinkedIn seule, le LinkedIn d'une fiche GitHub seule.
  const missing =
    visitor || item.kind !== "card" ? null : proveFirst ? (
      <AddSource card={main} />
    ) : item.card.source === "github" && item.card.login ? (
      <AddLinkedin login={item.card.login} />
    ) : null;
  // Sous trois étoiles (§18.48) : la source qui manque est le remède, elle remonte sous le verdict.
  const low = starsFor(main.overall) < 3;

  // « Revoir ma poursuite » : dans la tête de la fiche ; sur un téléphone court, la tête se masque
  // et le lien descend sous la fiche, à côté de « Pièces à conviction » (le CSS choisit).
  const chase = scene === "film" && settled ? <ChaseLink mine={!visitor} seen={chaseWatched(id)} onPlay={playChase} /> : null;
  // Fiche dénoncée : « C'est moi » reprend par GitHub, ou refait la fiche depuis son lien LinkedIn.
  // Le bloc le montre à tous (en contour pour qui a déjà sa fiche) ; la barre, seulement à qui n'a pas de fiche.
  const remake = useRemake(wantedYou && !cardLogin && main.linkedinUrl ? main.linkedinUrl : null, toast.show);
  const claimHere = wantedYou && claimOn && cardLogin ? () => api.startClaim(id, cardLogin) : null;
  const lawyer = other ? null : (claimHere ?? remake?.go ?? null);
  // Qui a sa fiche : le duel, et le même envoi dans la barre fixe.
  const duel = useDuelSend(visitor ? other : null, main, toast.show);
  // Sa fiche toute neuve, après être arrivé par celle d'un autre : le duel en tête du partage, une fois.
  const fromRival = !visitor && fresh && rival && rival.id !== id && !(rival.login && main.login && rival.login.toLowerCase() === main.login.toLowerCase()) ? rival : null;
  const own: MyCard = { id, login: main.login ?? null, overall: main.overall };
  const fromDuel = useDuelSend(fromRival && !main.sealed ? own : null, fromRival ?? main, toast.show);

  return (
    <main className={`page page-card page-result${animating ? " is-animating" : ""}${visitor ? " is-visitor" : ""}${wantedYou ? " is-wanted" : ""}`} id="main">
      {/* Le ciel de la page (§18.29) : derrière la barre du haut, une fois la fiche posée. */}
      {/* Le film se pose sur ce ciel : il entre sous le flash, au passage de relais. */}
      <ProfileSky card={main} shown={settled || (scene === "film" && phase === "handoff")} />
      {claimed && me?.hidden && (
        <p className="hidden-banner" role="status">
          {t.result.claim.hiddenBanner}
        </p>
      )}

      <div className="result-top">
        {/* L'en-tête posé sur le ciel, puis la fiche entière au-dessus de la ligne de flottaison (§18.7, §18.29). */}
        <WantedHead card={main}>{chase}</WantedHead>
        {/* Le visiteur, sur téléphone (§18.48) : ce qu'il regarde, au-dessus de la fiche, deux lignes au plus.
            Au bureau, la phrase entière ouvre « À ton tour », en tête de la colonne de droite. */}
        {visitor && (
          <p className="visitor-lead">
            {wantedYou ? (
              t.result.leadDenounced(who, kase?.by ?? null)
            ) : (
              <>
                {t.result.leadShort(whoShort)}
                {!other && (
                  <>
                    <br />
                    {t.result.leadYours}
                  </>
                )}
              </>
            )}
          </p>
        )}

        {animating && (
          // Morceau 3D introuvable : même repli que sans WebGL, la fiche sort sans révélation.
          <ErrorBoundary fallback={null} onError={finish}>
            <Suspense fallback={null}>
              {scene === "film" ? (
                <Film card={main} lang={lang} phase={phase} onReady={() => onScene("ready")} onGesture={() => onScene("gesture")} onStage={stage} onHandoff={handoff} onDone={finish} replay={replayed} />
              ) : (
                <Walkout3D card={main} lang={lang} declared={declaredOf(item.kind === "comparison" ? item.comparison : item.card)} phase={phase} anchorRef={stageRef} controlRef={walkoutCtl} onReady={() => onScene("ready")} onHandoff={handoff} onDone={finish} />
              )}
            </Suspense>
          </ErrorBoundary>
        )}
        <section ref={stageRef} className="result-stage" onClick={animating && scene !== "film" ? onStageClick : undefined}>
          <div className="single-stage">
            {/* La fiche se retourne (§18.27). Les étoiles ne s'allument ici que sans révélation 3D : sinon elles se rallumeraient sur la carte posée. */}
            {/* Un dossier à deux pièces : une seule fiche, et ses pièces dessous (§18.36). */}
            <CardViewOptions.Provider value={{ flippable: true, starsIntro: !animate && !replayed }}>
              <RevealCard card={main} lang={lang} phase={phase} idPrefix="result" staged={staged} />
            </CardViewOptions.Provider>
            {item.kind === "comparison" && settled && <Pieces cmp={item.comparison} />}
          </div>
          {chase && <div className="stage-chase">{chase}</div>}
          {animating && phase !== "ready" && (
            <button
              type="button"
              className="skip-btn"
              onClick={(e) => {
                e.stopPropagation();
                filmTrace("passer : bouton");
                skip();
              }}
            >
              {t.reveal.skip}
            </button>
          )}
          <p className="sr-only" aria-live="polite">
            {settled ? (main.sealed ? t.reveal.revealedSealed : t.reveal.revealed(LEVEL_LABELS[starsFor(main.overall)][lang], main.overall)) : ""}
          </p>
        </section>

        {/* Sous la fiche, pour le visiteur (§18.48) : ce qu'il regarde, le jury, les critères, le reste replié. */}
        {visitor && (
          <div className="visitor-col">
            {/* Fiche dénoncée (§18.6, §18.48) : qui l'a dénoncée, « C'est moi », « Ce n'est pas moi », la demande de retrait, en un bloc. */}
            {wantedYou && (
              <Denounced who={who} by={kase?.by ?? null} onLawyer={claimHere} onRemake={remake} notMe={!other} quiet={!!other}>
                {!cardLogin && <RemovalRequest cardId={id} short />}
              </Denounced>
            )}
            {/* Le jury (§18.27) : un geste à un toucher ; la peine et la caution dans son bloc. */}
            <Jury cardId={id} card={main} jury={kase?.jury ?? null} toast={toast.show} turn={other ? null : who}>
              <Penalty card={main} />
            </Jury>
            {/* Les critères (§18.37, §18.48) : la ligne du recruteur, les huit tuiles, le détail replié ; ni nom d'école ni d'ancien employeur. */}
            <RecruiterRead item={item} shared who={who} />
            <div className="rest">
              {/* L'enquête en direct (§18.26) : les trois trouvailles les plus fortes, chacune vers sa preuve, en ligne repliée. */}
              <Dossier card={main} />
              {/* Fiche dénoncée : « C'est moi » est déjà sous la fiche. */}
              {!(wantedYou && claimOn) && <Claim cardId={id} login={cardLogin} lawyer me={me} onMe={onMe} toast={toast.show} />}
            </div>
          </div>
        )}
        {/* « À ton tour » : en fin de page sur téléphone (la barre fixe y mène) ; au bureau, en tête de la colonne de droite,
            avec la phrase qui dit ce qu'on regarde (sous le bloc d'une fiche dénoncée, qui a son propre bouton rose). */}
        {/* Qui a déjà sa fiche : le duel à la place, avec le score à envoyer. */}
        {visitor &&
          (other ? (
            <Duel mine={other} card={main} duel={duel} strong />
          ) : (
            <section className="you" id="you" aria-labelledby="you-title">
              <h2 id="you-title">{t.denounce.andYou}</h2>
              <p className="you-lead">
                {t.result.lead(who)} {t.result.leadYours}
              </p>
              {/* Sans bloc des critères au-dessus, la question ne parle pas de « ces huit critères ». */}
              <p className="you-turn">{usableGrid(item.kind === "card" ? item.card.grid : item.comparison.grid) ? t.result.yourTurn : t.result.yourTurnBare}</p>
              <EntryForm variant="inline" />
            </section>
          ))}
        {/* Sans pseudo GitHub, ni revendication ni masquage : la personne fichée demande le retrait. */}
        {/* Fiche dénoncée : la demande est déjà dans son bloc, sous la fiche. */}
        {visitor && !cardLogin && !wantedYou && <RemovalRequest cardId={id} />}
      </div>

      <div className={`after${settled ? " is-in" : ""}`} aria-hidden={!settled} inert={!settled ? true : undefined}>
        {/* L'après-fiche dans l'ordre de §18.48 : le verdict, le partage, la bande, dénoncer, la course aux primes, les critères, puis le reste replié. */}
        {/* Le verdict : le pari, le jury, la peine et la caution, un seul bloc aligné à gauche. Vide, il ne s'affiche pas. */}
        {!visitor && (
          <div className="after-head">
            <PleaVerdict cardId={id} overall={main.overall} shown={settled} />
            <JuryLine jury={kase?.jury ?? null} />
            <Penalty card={main} />
          </div>
        )}
        {/* Sous trois étoiles : « Ajoute ton LinkedIn » (ou ton GitHub) tout de suite, avant le partage. */}
        {low && missing}
        {/* Fiche masquée : /og/* et /c/:id répondent 404 / 410 à tous, l'image ne se télécharge pas et le lien ne montre rien. */}
        {fromRival && <Duel mine={own} card={fromRival} duel={fromDuel} from />}
        {!visitor && !(claimed && me?.hidden) && <ShareBar item={item} toast={toast.show} />}
        {/* Tu roules pour qui ? (§18.38) : l'école et la boîte, la raison de partager, juste après le partage. */}
        {!visitor && <BandPick cardId={id} toast={toast.show} />}
        {/* Dénonce un complice (§18.6). */}
        {!visitor && <Denounce cardId={id} selfLogin={cardLogin} toast={toast.show} />}
        {/* « Tu es en course » (§18.5) : seulement si une prime est ouverte, après le partage. */}
        {!visitor && <PrimeRace cardId={id} card={main} />}
        {/* Les critères (§18.37, §18.48) : un seul bloc, la ligne du recruteur, les huit tuiles, le détail replié. */}
        {!visitor && <RecruiterRead item={item} shared={false} who={who} />}
        {/* La source qui manque, sous les critères qu'elle ouvre : « Ajoute ton GitHub » (§18.24) ou, en miroir, « Ajoute ton LinkedIn » (§18.37). */}
        {!low && missing}
        {!visitor && (
          <div className="rest">
            {/* L'enquête en direct (§18.26) : les trois trouvailles les plus fortes, chacune vers sa preuve, en ligne repliée. */}
            <Dossier card={main} />
            {/* Ses pièces à conviction sont au dos de la fiche (§18.27), dossier à deux pièces compris. */}
            <Claim cardId={id} login={cardLogin} lawyer={!owner} me={me} onMe={onMe} toast={toast.show} />
            <LinkedInPhoto cardId={id} hasAvatar={item.kind === "card" ? !!item.card.avatarUrl : !!item.comparison.cv.avatarUrl} />
            {item.kind === "card" && !proveFirst && <AddSource card={item.card} />}
            <EmailForm cardId={id} />
            <Contest card={main} cardId={id} onDeleted={onDeleted} />
          </div>
        )}
        <Hiring cardId={id} />
        {/* « Supprimer ma fiche » n'est que dans le pli « Fais appel » : une action, un endroit. */}
        {!visitor && (
          <div className="after-foot">
            <a className="link-alt" href="/" onClick={(e) => onLinkClick(e, "/")}>
              {t.result.again}
            </a>
          </div>
        )}
      </div>
      {/* La barre du pouce (§18.27) : mêmes conditions que le bloc de partage, une fois la fiche posée. Avant le toast, qui se cale dessus. */}
      {!visitor && !(claimed && me?.hidden) && <ShareDock item={item} ready={settled} toast={toast.show} />}
      {/* La barre fixe du visiteur sur téléphone (§18.48) : « Faire ma fiche », « C'est moi » sur une fiche dénoncée, ou « Lui envoyer mon score ». */}
      {visitor && settled && (!other || duel.send) && <MakeYours watch={wantedYou} onLawyer={lawyer} onSend={other ? duel.send : null} />}
      {toast.node}
    </main>
  );
}

/**
 * En tête d'une fiche, posé sur le ciel : « AVIS DE RECHERCHE » dans la voix qui annonce, puis « @LOGIN ».
 * La fiche dit le reste (étoiles, profil, note) ; le texte sous la fiche, la peine. Lu « Avis de recherche : @x ».
 */
export function WantedHead({ card, children }: { card: CardData; children?: ReactNode }) {
  const { t } = useT();
  return (
    <header className="wanted">
      <h1 className="wanted-head" tabIndex={-1}>
        <span className="wanted-kicker announce">{t.result.wanted}</span>
        <span className="sr-only">{t.result.wantedSep}</span>
        <span className="wanted-name">{card.login ? `@${card.login}` : card.name}</span>
      </h1>
      {/* « Revoir ma poursuite » (§18.48), sur la ligne de « Avis de recherche » */}
      {children}
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
