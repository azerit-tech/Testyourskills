// Entrée (§6.1, §18.48, §18.81). Le premier écran dit ce qu'on obtient : le
// titre, la promesse dessous, les portes, le champ et le bouton, et la fiche de
// Jacques (le produit) debout sur son crépuscule : à droite au bureau, juste
// sous le formulaire sur téléphone, où son haut dépasse du premier écran.
// Ensuite, dans l'ordre de l'envie : la berline (§18.79), le top du mois
// (§18.22), les primes si elles sont ouvertes (§18.4), un classement des écoles et un des boîtes (§18.92,
// sous l'ancre « classement » où mène « Classement » de la barre du haut, §18.101), le
// mur des 13 profils (§18.28), et un dernier formulaire avant le pied de page.
// Rien d'autre. La couverture en mosaïque du §18.31 a disparu (§18.81).
// L'accueil se souvient : le dossier encore en cours tient en une ligne au-dessus du
// formulaire, à la place de la promesse.
// Qui a déjà sa fiche a un autre accueil (§18.89) : sa fiche en haut, les classements
// dessous (le top du mois, les primes ouvertes, les écoles, les boîtes, §18.92), et rien d'autre.
// L'exemple est la vraie fiche de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la fiche calculée par le serveur la remplace dès qu'elle existe.
// Aucun dégradé dans la page : seul celui de la fiche.
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { LEVEL_LABELS, starsFor, type CardData } from "../../../shared/types";
import { fileOf, pieceLabel } from "../../../shared/caseFile";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { ProfileWall } from "../components/ProfileWall";
import { Spin } from "../components/Spin";
import { Sunset } from "../components/Sunset";
import { WEEK_ANCHOR, WeekBoard } from "../components/WeekBoard";
import { BandsTop } from "../components/BandsTop";
import { PrimesStrip } from "../components/Primes";
import { Stars } from "../components/Stars";
import { useT } from "../i18n";
import { ApiError, api, type Showcase } from "../lib/api";
import { currentAnchor, onLinkClick } from "../lib/router";
import { RANKING_ANCHOR } from "../../../shared/routes";
import { heroTitleEm } from "../../../shared/promise";
import { homeHook, useAppConfig } from "../lib/season";
import { returnPending } from "../lib/entryApi";
import { MINE_EVENT, clearPending, dropPrefill, filmOwed, myCard, peekPrefill, pendingFile, type MyCard } from "../lib/session";
import { ReturnCall } from "../components/ReturnCall";
import { signOut, useAccount } from "../lib/account";

export { ReturnCall };

/** Dénoncer depuis l'accueil (/<pseudo> d'un autre) : le bloc de la fiche, chargé seulement ce jour-là. */
const Denounce = lazy(() => import("../components/Denounce").then((m) => ({ default: m.Denounce })));

/** Au-delà, le top est tenu pour absent : l'ancre « /#semaine » n'attend pas plus. */
const TOP_WAIT_MS = 3000;

/** La maquette, tant que le serveur n'a pas jugé la vitrine. Avec ses deux pièces, comme la
 * vraie (§18.35) : la légende a ses deux lignes dès le premier rendu, rien ne saute dessous. */
const SHOWCASE_MOCKUP: Showcase = { card: FIXTURES.jmougeot, href: `/${FIXTURES.jmougeot.login ?? "jmougeot"}`, pieces: ["linkedin", "github"] };

/** La fiche de Jacques : la maquette d'abord, la vraie dès que le serveur l'a. `on` : l'accueil la montre (pas celui de qui a sa fiche). */
function useShowcase(on: boolean): Showcase {
  const [showcase, setShowcase] = useState<Showcase>(SHOWCASE_MOCKUP);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    api
      .getShowcase()
      .then((s) => {
        if (alive && s) setShowcase(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [on]);

  return showcase;
}

/** Le top du mois a-t-il répondu ? La requête est celle du tableau (lib/api.ts) ; elle sert à l'ancre « /#semaine ». */
function useTopKnown(): boolean {
  const [known, setKnown] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setKnown(true);
    const late = window.setTimeout(done, TOP_WAIT_MS);
    api.getTop().then(done, done);
    return () => {
      alive = false;
      window.clearTimeout(late);
    };
  }, []);
  return known;
}

/** Ce que l'accueil sait déjà du visiteur (§18.48). */
interface Memory {
  /** La fiche faite dans ce navigateur. */
  mine: MyCard | null;
  /** Le dossier demandé dans cet onglet, pas encore sorti. */
  pending: string | null;
  /** Sa fiche elle-même, pour la montrer (§18.89). `undefined` : pas encore lue ; `null` : le serveur ne l'a pas rendue. */
  card?: CardData | null;
}

/** La dernière fiche lue ici : revenir sur l'accueil (depuis sa fiche, par « Classement ») la montre sans attendre. */
let seen: { id: string; card: CardData } | null = null;

/**
 * La mémoire de l'accueil : lue d'emblée (la ligne a sa place au premier rendu), puis
 * vérifiée auprès du serveur. Un dossier sorti entre-temps devient « Ta fiche », un
 * dossier échoué ou une fiche retirée disparaît.
 */
function useMemory(): Memory {
  const [mem, setMem] = useState<Memory>(() => {
    const mine = myCard();
    return { mine, pending: pendingFile(), card: mine && seen?.id === mine.id ? seen.card : undefined };
  });

  useEffect(() => {
    let alive = true;
    const gone = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 410);
    const check = async () => {
      let { mine } = mem;
      const { pending } = mem;
      if (pending) {
        try {
          const job = await api.getJob(pending);
          if (job.state === "pending") return;
          clearPending(pending);
          if (job.state === "done") {
            const main = job.kind === "card" ? job.card : fileOf(job.comparison);
            mine = { id: pending, login: main.login ?? null, overall: main.overall };
            seen = { id: pending, card: main };
            if (alive) setMem({ mine, pending: null, card: main });
            return;
          }
        } catch (e) {
          // Réseau capricieux : on laisse la ligne, la page du dossier saura dire.
          if (!gone(e)) return;
          clearPending(pending);
        }
        if (!alive) return;
        setMem((m) => ({ ...m, pending: null }));
      }
      if (!mine) return;
      const id = mine.id;
      try {
        const job = await api.getJob(id);
        if (!alive) return;
        if (job.state !== "done") {
          setMem((m) => ({ ...m, card: m.card ?? null }));
          return;
        }
        const main = job.kind === "card" ? job.card : fileOf(job.comparison);
        seen = { id, card: main };
        setMem((m) => ({ ...m, mine: { id, login: main.login ?? null, overall: main.overall }, card: main }));
      } catch (e) {
        if (!alive) return;
        // Fiche retirée : l'accueil redevient celui d'un visiteur. Réseau capricieux : la ligne de la note, sans la fiche.
        setMem((m) => (gone(e) ? { ...m, mine: null, card: null } : { ...m, card: m.card ?? null }));
      }
    };
    void check();
    // La fiche de qui s'est connecté ici, rendue par le serveur après le premier rendu (§18.90).
    const on = () => setMem((m) => ({ ...m, mine: myCard() }));
    window.addEventListener(MINE_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(MINE_EVENT, on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mem;
}

/**
 * La ligne au-dessus du formulaire : « Ta fiche : ★★★★★☆ 79/100. La revoir », ou le dossier en cours.
 * `owed` : la fiche est sortie mais son film reste à voir (retour arrière en plein film) ; la note
 * ne se lit pas avant la poursuite, la ligne y ramène (« Ta poursuite t'attend. La voir »).
 */
export function BackLine({ mine, pending, owed = false }: Pick<Memory, "mine" | "pending"> & { owed?: boolean }) {
  const { t } = useT();
  const b = t.home.back;
  if (!mine && !pending) return null;
  const href = `/c/${pending ?? mine!.id}`;
  const stars = mine ? starsFor(mine.overall) : 0;
  const waiting = pending || owed;
  return (
    <p className="home-back">
      <a href={href} onClick={(e) => onLinkClick(e, href)}>
        {waiting ? (
          <span>{pending ? b.pending : b.owed}</span>
        ) : (
          <span>
            {b.mine} <Stars n={stars} label={t.plea.count(stars)} /> {t.result.score.pct(mine!.overall)}.
          </span>
        )}
        <span className="link-alt">{pending ? b.pendingGo : owed ? b.owedGo : b.mineGo}</span>
      </a>
    </p>
  );
}

/**
 * Qui revient avec sa fiche (§18.89) : sa fiche debout sur le crépuscule, là où le visiteur voit
 * celle de Jacques, et dessous le seul bouton rose de la page. La fiche entière mène à sa page.
 * `card` pas encore lue : son cadre vide, à sa taille (rien ne saute) ; illisible : la ligne de sa note.
 */
export function MineCard({ mine, card }: { mine: MyCard; card: CardData | null | undefined }) {
  const { t, lang } = useT();
  const b = t.home.back;
  const href = `/c/${mine.id}`;
  const stars = starsFor(mine.overall);
  const see = (
    <a className="pill pill-big home-see" href={href} onClick={(e) => onLinkClick(e, href)}>
      {b.see}
    </a>
  );
  if (card === null) {
    return (
      <div className="home-mine-line">
        <p className="home-back">
          <span>
            {b.mine} <Stars n={stars} label={t.plea.count(stars)} /> {t.result.score.pct(mine.overall)}.
          </span>
        </p>
        {see}
      </div>
    );
  }
  return (
    <div className="home-stage">
      <div className="home-stage-in">
        <Sunset />
        <div className="showcase home-mine-card">
          <a className="home-mine-link" href={href} onClick={(e) => onLinkClick(e, href)} aria-label={`${b.see}, ${t.tierCard(LEVEL_LABELS[stars][lang])}`}>
            {card ? <CardView card={card} lang={lang} interactive idPrefix="mine" /> : <span className="home-mine-wait" />}
          </a>
          {see}
        </div>
      </div>
    </div>
  );
}

/** Un message bref en bas de l'écran (la dénonciation copiée), sans emporter l'après-fiche dans l'accueil. */
function useMiniToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  const node = (
    <div className={`toast${msg ? " is-on" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
  return { show, node };
}

/**
 * La fiche de Jacques, debout dans le premier écran (§18.81) : s'incline sous le pointeur, mène à sa page. Jugée avec son
 * LinkedIn (§18.35) : une note, celle de la fiche, et ses pièces dessous (§18.36).
 */
export function ExampleCard({ card, href, pieces }: Showcase) {
  const { t, lang } = useT();
  return (
    <figure className="showcase" aria-label={`${t.home.exampleLabel}, ${t.tierCard(LEVEL_LABELS[starsFor(card.overall)][lang])}`}>
      <CardView card={card} lang={lang} interactive idPrefix="hero" />
      {/* Une seule ligne : le lien vers sa page, puis, en texte, d'où vient la preuve (« d'après LinkedIn et GitHub »). */}
      <figcaption>
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleCaption}
        </a>
        {pieces && pieces.length > 1 && <>, {t.home.exampleFrom(pieces.map((p) => pieceLabel(p, lang)).reduce((a, b) => t.result.pieces.pair(a, b)))}</>}
      </figcaption>
    </figure>
  );
}

const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Venu par une ancre de l'accueil : « /#semaine » (le partage d'une fiche) ou « /#classement » (la barre du haut, §18.101). */
const homeAnchor = (): string | null => {
  const a = currentAnchor();
  return a === WEEK_ANCHOR || a === RANKING_ANCHOR ? a : null;
};

/**
 * L'accueil ouvert sur une ancre : le tableau n'est pas à sa place à la première image (la
 * fiche d'exemple et la berline prennent leur hauteur ensuite). On y descend quand il est là
 * (le top du mois quand il a répondu ; le classement des écoles et des boîtes tient sa
 * place dès le premier rendu), puis de nouveau quand les polices et la vitrine sont posées,
 * tant que la personne n'a pas défilé elle-même. Le titre arrive en haut de l'écran (scroll-margin-top).
 */
function useHomeAnchor(topKnown: boolean) {
  const [anchor] = useState(homeAnchor);
  const wait = anchor === WEEK_ANCHOR && !topKnown;
  useEffect(() => {
    if (!anchor || wait) return;
    let moved = false;
    const mine = () => {
      moved = true;
    };
    const go = () => {
      if (moved || homeAnchor() !== anchor) return;
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
    };
    const opts = { passive: true, once: true } as const;
    window.addEventListener("wheel", mine, opts);
    window.addEventListener("touchstart", mine, opts);
    window.addEventListener("keydown", mine, opts);
    const timers = [0, 300, 800, 1600, 2600].map((ms) => window.setTimeout(go, ms));
    void document.fonts?.ready.then(go);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("wheel", mine);
      window.removeEventListener("touchstart", mine);
      window.removeEventListener("keydown", mine);
    };
  }, [anchor, wait]);
}

export function Home() {
  const { t, lang } = useT();
  const h = t.home;
  const inputRef = useRef<HTMLInputElement>(null);
  /** Le bas de l'accueil de qui a sa fiche : « Faire une autre fiche », puis le formulaire à sa place. */
  const moreRef = useRef<HTMLDivElement>(null);
  const topKnown = useTopKnown();
  const mem = useMemory();
  // La ligne sous le titre (lib/season.ts) : l'entretien seulement si une prime est ouverte.
  const hook = homeHook(h, useAppConfig());
  // Revenu en plein film : la fiche existe, sa note attend la poursuite.
  const owed = !!mem.mine && filmOwed(mem.mine.id);
  useHomeAnchor(topKnown);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  // Un préremplissage attend (« Réessayer », pseudo inconnu) : le formulaire est ouvert d'emblée,
  // en haut de la page, même pour qui a déjà sa fiche.
  const [prefill] = useState(peekPrefill);
  const mineLogin = mem.mine?.login?.toLowerCase() ?? null;
  const direct = prefill?.direct && prefill.login ? prefill.login : null;
  const directIsMine = !!direct && direct.toLowerCase() === mineLogin;
  const fromPrefill = !!prefill && !directIsMine;
  // Une connexion LinkedIn ou GitHub revient sur l'accueil : le formulaire est là pour dire où elle en est (§18.90).
  const [returnBack] = useState(returnPending);
  const [open, setOpen] = useState(fromPrefill || returnBack);
  const returning = !!mem.mine && !owed && !mem.pending;
  // /<pseudo> d'un autre, pour qui a sa fiche : c'est une dénonciation (§18.52), avec ses gardes
  // (pas soi-même, la fiche part au nom du dénonciateur, aucun partage public), pas « Faire ma fiche ».
  const denounce = returning && !!direct && !!mineLogin && !directIsMine ? direct : null;
  useEffect(() => {
    // Le formulaire ne s'affiche pas pour ce pseudo-là : son préremplissage ne sert plus.
    if (prefill?.direct && (denounce || directIsMine)) dropPrefill(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Qui a déjà sa fiche (§18.89) : sa fiche, les classements, et le formulaire replié tout en bas
  // sous « Faire une autre fiche ».
  const mineHome = returning && !denounce && !fromPrefill && !returnBack;
  // Connecté (§18.91) : « Se déconnecter » à côté de « Faire une autre fiche ». Une fiche déjà là :
  // les formulaires de l'accueil gardent leurs boutons, la ligne de sa fiche dit déjà où elle est.
  const acct = useAccount();
  const another = !!mem.mine || !!mem.pending;
  const showcase = useShowcase(!mineHome);
  const toast = useMiniToast();

  /** « Faire une autre fiche » : le formulaire s'ouvre sur place, le champ prend le focus dans le geste. */
  const openForm = () => {
    flushSync(() => setOpen(true));
    // Rien à taper (deux boutons, §18.80) : le premier bouton du formulaire prend le focus que le lien vient de perdre.
    const first = inputRef.current ?? moreRef.current?.querySelector<HTMLElement>("button, a[href], input");
    first?.focus({ preventScroll: true });
    // Tout en bas de la page : le formulaire, plus haut que le lien, reste entier à l'écran.
    moreRef.current?.scrollIntoView({ block: "nearest" });
  };

  /** Une place libre, « Découvre le tien » : retour au champ du pseudo,
   * prêt à taper. Le focus se donne dans le geste, sinon l'iPhone n'ouvre pas le clavier. */
  const play = () => {
    const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
    if (returning && !open && !denounce) flushSync(() => setOpen(true));
    const input = inputRef.current;
    if (!input) {
      // Rien à taper (deux boutons, §18.80) : le formulaire lui-même, en haut de la page, ou en bas pour qui a sa fiche.
      if (moreRef.current) moreRef.current.scrollIntoView({ block: "center", behavior });
      else window.scrollTo({ top: 0, behavior });
      return;
    }
    input.scrollIntoView({ block: "center", behavior });
    input.focus({ preventScroll: true });
  };

  if (mineHome && mem.mine) {
    return (
      <main className="page page-home is-mine" id="main">
        {/* Sa fiche, puis les classements : le top du mois (sa ligne en évidence), les primes ouvertes, les écoles et les boîtes. */}
        <div className="home-mine">
          <MineCard mine={mem.mine} card={mem.card} />
          <WeekBoard onPlay={play} />
          <PrimesStrip />
          <BandsTop onPlay={play} cardId={mem.mine.id} />
        </div>
        <div className="home-more" ref={moreRef}>
          {open ? (
            <EntryForm inputRef={inputRef} another />
          ) : acct ? (
            <div className="entry-foot entry-or home-another">
              <button type="button" className="link-alt" aria-expanded={false} onClick={openForm}>
                {h.back.another}
              </button>
              <span aria-hidden>·</span>
              <button type="button" className="link-alt" onClick={() => void signOut()}>
                {h.account.out}
              </button>
            </div>
          ) : (
            <button type="button" className="link-alt home-another" aria-expanded={false} onClick={openForm}>
              {h.back.another}
            </button>
          )}
        </div>
        {toast.node}
      </main>
    );
  }

  return (
    <main className="page page-home" id="main">
      <div className="home-top">
        <section className="hero">
          {/* Le titre en deux moitiés (shared/promise.ts) : la première en lilas, la chute en crème.
              Sa taille suit la largeur de la colonne et la plus longue de ses lignes (§18.103). */}
          <h1 className="hero-title" style={{ "--title-em": heroTitleEm(lang) } as CSSProperties}>
            <span className="hero-title-claim">{h.titleClaim}</span>{" "}
            <span className="hero-title-proof">{h.titleProof}</span>
          </h1>
          {/* La promesse, sous le titre : ce qu'on obtient, avant de demander quoi que ce soit. */}
          {/* L'accueil se souvient : qui a déjà sa fiche (ou un dossier en cours) connaît la
              promesse ; la ligne qui y ramène prend sa place, le bouton ne descend pas. */}
          {denounce && mem.mine ? (
            <>
              <BackLine mine={mem.mine} pending={null} />
              <div className="home-denounce">
                <Suspense fallback={null}>
                  <Denounce cardId={mem.mine.id} selfLogin={mem.mine.login ?? undefined} mine={mem.mine.overall} toast={toast.show} initial={denounce} />
                </Suspense>
              </div>
            </>
          ) : (
            <>
              {mem.mine || mem.pending ? <BackLine mine={mem.mine} pending={mem.pending} owed={owed} /> : <p className="hero-hook">{hook}</p>}
              <EntryForm inputRef={inputRef} another={another} />
            </>
          )}
        </section>
        {/* Le produit, dans le premier écran (§18.81) : la fiche d'exemple debout sur le crépuscule de l'aperçu de lien. */}
        <div className="home-stage">
          <div className="home-stage-in">
            <Sunset />
            <ExampleCard {...showcase} />
          </div>
        </div>
        {toast.node}
      </div>
      {/* La voiture, et la preuve que d'autres y sont : côte à côte au bureau. */}
      <div className="home-proof">
        {/* La caisse de la poursuite (§18.79) : la berline du film, sous la fiche d'exemple sur téléphone, à côté du top du mois au bureau ; l'accueil n'a pas de film. */}
        <Spin ready place="home" />
        <WeekBoard onPlay={play} />
      </div>
      {/* Les primes ouvertes (§18.4) : rien tant que la saison n'en porte pas. */}
      <PrimesStrip />
      <BandsTop onPlay={play} />
      <ProfileWall onPlay={play} />
      {/* Qui a tout lu n'a pas à remonter : le même formulaire, dans le bloc d'appel. */}
      <section className="home-last block block-call" aria-labelledby="home-last-title">
        <div className="home-last-head">
          <h2 id="home-last-title" className="t-section">
            {h.lastTitle}
          </h2>
          <p>{hook}</p>
        </div>
        <EntryForm secondary another={another} />
      </section>
    </main>
  );
}
