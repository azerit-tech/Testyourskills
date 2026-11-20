// L'entrée (§6.1, §18.80). Par défaut, rien à taper ni à coller : deux boutons empilés,
// « Se connecter avec LinkedIn » (le rose) puis « Se connecter avec GitHub », et dessous
// une petite ligne, « ou avec ton CV · ou colle un lien ». « colle un lien » ouvre le
// champ unique : un lien LinkedIn, un lien GitHub ou un pseudo ; un nom tapé y fait
// sortir des personnes, on touche la sienne. Un bouton dont la connexion n'est pas
// réglée côté serveur ouvre ce même champ, sur sa source : jamais de bouton mort.
// « avec ton CV » : le dépôt de PDF, puis « les deux » pour la comparaison ; ces deux-là
// gardent le champ GitHub.
// Variante « inline » : la même entrée, dans le bandeau d'une carte partagée.
// Raccourcis : coller une URL GitHub ou LinkedIn, ou déposer un PDF, n'importe où sur
// la page lance la carte.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { detectEntry, normalizeLinkedinUrl, parseGithubLogin, resolveDoor } from "../../../shared/entry";
import type { Door } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, ApiError, isMock, tokens } from "../lib/api";
import { loadAccount, mockLinkCard, signOut, useAccount } from "../lib/account";
import { askGithub, doneReturn, findPct, getReturn, leadReturn, releaseReturn, startGithubLogin, startLinkedinLogin, subscribeReturn } from "../lib/entryApi";
import { errorFact } from "../lib/errors";
import { navigate, onLinkClick, RANKING_HREF } from "../lib/router";
import { loadCardPage } from "../pages/cardPageLoader";
import { unlockAudio } from "../lib/audio";
import { unlockFilm } from "../film/unlock";
import { prefetchScene, revealScene } from "../lib/revealScene";
import { dropPrefill, markFresh, peekPrefill, rememberInput, setPrefill } from "../lib/session";
import type { Mode, Tab } from "../lib/session";
import { checkPdf, isTouch, parseLogin } from "../lib/util";
import type { PdfCheck } from "../lib/util";
import { BusyDots, busyLabel } from "./Busy";
import { GithubAsk } from "./GithubAsk";
import { IconClose, IconGithub, IconLinkedIn } from "./Icons";
import { SuggestRow, fromLinkedin, useSuggestBox, useSuggestions } from "./Suggest";
import type { Suggestion } from "./Suggest";

interface Props {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** « inline » : sans onglets ni CV, pour le bandeau d'une carte partagée. */
  variant?: "full" | "inline";
  /** Un second formulaire sur la même page (le bas de l'accueil) : ni focus d'emblée, ni
   * raccourcis de page (collage, dépôt de PDF), que le premier porte déjà. */
  secondary?: boolean;
  /** Ouvert par « Faire une autre fiche » : les boutons d'aujourd'hui, jamais « Voir ma fiche » (§18.91). */
  another?: boolean;
}

/** Le champ ouvert : sur LinkedIn ou GitHub (le bouton sans connexion), ou sur tout (« colle un lien »). */
type Open = Door | "link";

/** Les erreurs qui reviendraient au même toucher (limite du jour, commissariat fermé ou débordé) :
 * le bouton passe en contour tant que le champ n'a pas changé, et un lien propose autre chose. */
const BLOCKING = new Set(["rate_limited", "closed", "busy"]);
/** Le top de la semaine sur l'accueil (WeekBoard.tsx, WEEK_ANCHOR) : pas importé, pour ne pas l'emporter dans ce paquet. */
const WEEK_ID = "semaine";

/** Un collage ne lance la carte que s'il ressemble à une URL GitHub (ou LinkedIn), pas à un simple mot. */
const GITHUB_URL_RE = /github\.com\//i;
const LINKEDIN_URL_RE = /linkedin\.com\/in\//i;

/** Dès que le visiteur commence à saisir, la scène 3D de la révélation se
 * télécharge (quelques Mo) ; l'attente du scoring sert ensuite à la préparer
 * (§6.2). Le film (§18.36) : son module et sa poursuite, à ce même premier
 * contact (jamais dès l'ouverture de la page). Pas avec l'économiseur de
 * données : la révélation attendra l'envoi. Rien en mouvement réduit : il n'y
 * aura pas de révélation. */
let prefetched = false;
function prefetchReveal() {
  if (prefetched) return;
  prefetched = true;
  const scene = prefetchScene(revealScene(), {
    saveData: !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    reduced: typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  });
  if (scene === "film")
    void import("./Film")
      .then((m) => m.preloadFilm())
      .catch(() => undefined);
  else if (scene) void import("./Walkout3D").then((m) => m.preloadWalkoutAssets()).catch(() => undefined);
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable;
}

function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types ?? []).includes("Files");
}

/** Le premier PDF d'un dépôt ou d'un collage, sinon le premier fichier (pour l'erreur). */
function fileFrom(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const files = Array.from(dt.files ?? []);
  return files.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)) ?? files[0] ?? null;
}

/** Le champ au départ : fermé, sauf si une saisie revient (« Réessayer », /<pseudo>), qui le rouvre sur sa source. */
function initialEntry(raw: string | undefined): { open: Open | null; login: string } {
  const s = raw ?? "";
  if (/linkedin\.com/i.test(s) && normalizeLinkedinUrl(s)) return { open: "linkedin", login: s };
  if (s && parseGithubLogin(s)) return { open: "github", login: s };
  return { open: s ? "link" : null, login: s };
}

/**
 * Au retour de LinkedIn, le temps de retrouver le profil (§18.90) : une ligne, la barre de
 * l'attente et sa durée, à la place des deux boutons. Jamais un bloc qui revient tel quel.
 */
function FindWait({ since }: { since: number }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, []);
  // Sous une fiche, « À ton tour » est plus bas que l'écran : l'attente y vient.
  useEffect(() => intoView(ref.current), []);
  return (
    <div ref={ref} className="entry-find" role="status" aria-live="polite">
      <p className="entry-find-line">
        <IconLinkedIn />
        {t.home.finding}
      </p>
      {/* La barre de l'attente du jugement (Waiting.tsx), la même. */}
      <div className="load-bar" aria-hidden>
        <span style={{ width: `${findPct(now - since)}%` }} />
      </div>
      <p className="entry-find-note">{t.home.findingNote}</p>
    </div>
  );
}

/** Amène à l'écran ce qui n'y est pas en entier. */
function intoView(el: HTMLElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  el.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

export function EntryForm({ inputRef, variant = "full", secondary = false, another = false }: Props) {
  const inline = variant === "inline";
  const { t, lang } = useT();
  const h = t.home;
  // Lu sans être consommé : un premier rendu peut être jeté (page chargée à la demande) ; le
  // formulaire affiché le retire au montage (/<pseudo> préremplit, §18.48).
  const [init] = useState(() => (inline || secondary ? null : peekPrefill()));
  useEffect(() => dropPrefill(init), [init]);
  const [first] = useState(() => initialEntry(init?.login));
  const [mode, setMode] = useState<Mode>(init?.mode ?? "single");
  const [tab, setTab] = useState<Tab>(init?.tab ?? "github");
  const [open, setOpen] = useState<Open | null>(first.open);
  /** La dernière connexion partie ou revenue : son bouton porte les points d'attente. */
  const [via, setVia] = useState<Door>("linkedin");
  const [login, setLogin] = useState(first.login);
  /** Parti chez LinkedIn ou GitHub : son bouton attend. */
  const [signing, setSigning] = useState<Door | null>(null);
  /** La connexion est revenue sans personne (§18.90) : la phrase le dit, le champ est ouvert sur un lien à coller. */
  const [lost, setLost] = useState<Door | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Le retour de « Se connecter avec LinkedIn » ou « avec GitHub » (§18.80, §18.90) : son état vit hors
  // du composant (entryApi.ts). Un seul formulaire de la page le porte, jamais le second de l'accueil ;
  // s'il se démonte, le suivant le reprend où il en est.
  const self = useRef({});
  const returned = useSyncExternalStore(subscribeReturn, getReturn, () => null);
  const [lead, setLead] = useState(false);
  useEffect(() => {
    if (secondary) return;
    const me = self.current;
    const claim = () => setLead(leadReturn(me));
    claim();
    const off = subscribeReturn(claim);
    return () => {
      off();
      releaseReturn(me);
    };
  }, [secondary]);
  const back = lead ? returned : null;
  /** LinkedIn cherche encore : l'attente prend la place des boutons. */
  const finding = back?.s === "finding" && back.via === "linkedin" ? back : null;
  /** Au retour de LinkedIn, rien de sûr : « C'est toi ? », trois profils au plus (§18.80). */
  const picking = back?.s === "pick" ? back : null;
  /** Son profil trouvé, son GitHub demandé avant de juger (§18.110). */
  const asking = back?.s === "ask" ? back : null;
  const [file, setFile] = useState<File | null>(init?.file ?? null);
  const [error, setError] = useState<string | null>(init?.error ? (typeof init.error === "string" ? init.error : pick(init.error, lang)) : null);
  /** Une limite atteinte : le même toucher échouerait encore (§18.48, un seul rose qui sert). */
  const [blocked, setBlocked] = useState(!!init?.blocked);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // Au doigt, on ne glisse pas un fichier : la zone du CV le dit autrement.
  const [touch] = useState(() => isTouch());
  const fileInput = useRef<HTMLInputElement>(null);
  const localLoginRef = useRef<HTMLInputElement>(null);
  const loginRef = inputRef ?? localLoginRef;
  const uid = useId().replace(/:/g, "");

  const showGithub = inline || mode === "both" || tab === "github";
  const showCv = !inline && (mode === "both" || tab === "cv");

  // LinkedIn, si le serveur sait le lire (§18.24) ; pas avec un CV. Optimiste tant que la
  // config est inconnue, puis lue d'emblée : ni le bouton ni le titre ne clignent.
  const [liOn, setLiOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);
  // Les suggestions et les deux connexions (§18.80) : absentes tant que le serveur ne les annonce pas.
  const [can, setCan] = useState(() => {
    const c = api.knownConfig();
    return { search: !!c?.linkedinSearch, liLogin: !!c?.linkedinLogin, ghLogin: !!c?.githubLogin };
  });
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => {
      if (!alive) return;
      setLiOn(c.linkedinEntry);
      setCan({ search: c.linkedinSearch, liLogin: c.linkedinLogin, ghLogin: c.githubLogin });
    });
    return () => {
      alive = false;
    };
  }, []);
  /** Le champ lit aussi LinkedIn : jamais avec un CV au dossier. */
  const doorsOn = liOn && !showCv;
  /** L'entrée simple, sans CV : les deux boutons, ou le champ une fois ouvert. */
  const simple = inline || (mode === "single" && tab === "github");
  /** L'attente du retour de LinkedIn, ou la question de son GitHub, est à l'écran : ni boutons, ni champ. */
  const hold = (!!finding || !!asking) && simple;
  /** Les deux boutons de connexion à l'écran, le champ fermé. */
  const buttonsOn = simple && open === null && !hold;
  const fieldOn = showGithub && !buttonsOn && !hold;
  // Le compte léger (§18.91), ou le repli de `tys_who` (§18.90) : connecté avec une fiche, l'entrée y
  // ramène d'abord. Pas tant qu'un retour de connexion est en cours : ce parcours-là va jusqu'au bout.
  const acct = useAccount();
  /** Ce que le champ lit d'abord : LinkedIn s'il s'est ouvert sur LinkedIn, GitHub sinon. */
  const fieldDoor: Door = doorsOn && simple && open === "linkedin" ? "linkedin" : "github";
  /** « colle un lien » : le champ prend tout, ses suggestions mêlent les deux sources. */
  const anyField = simple && open === "link";

  // Les écouteurs posés sur le document lisent toujours l'état courant.
  const state = useRef({ mode, tab, login, file, doorsOn });
  state.current = { mode, tab, login, file, doorsOn };
  // Verrou immédiat : deux départs rapprochés (collage puis dépôt) n'en font qu'un.
  const busyRef = useRef(false);

  /** Le focus donné par la page elle-même, à l'ouverture : il ne vaut pas un premier contact. */
  const quietFocus = useRef(false);
  /** Un champ qui prend le focus (clavier, toucher) : le film commence à se charger (§18.36). */
  const onFocus = () => {
    if (!quietFocus.current) prefetchReveal();
  };

  useEffect(() => {
    quietFocus.current = true;
    if (init?.mode === "both" || init?.login) {
      loginRef.current?.focus();
      quietFocus.current = false;
      return;
    }
    // Sur desktop, le champ a le focus d'emblée. Pas sur mobile : le clavier cacherait la carte.
    if (!inline && !secondary && !isTouch()) loginRef.current?.focus({ preventScroll: true });
    quietFocus.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pdfError = (check: Exclude<PdfCheck, { ok: true }>) =>
    check.reason === "not_pdf" ? h.errNotPdf : check.reason === "too_large" ? h.errTooLarge(check.mb) : h.errTooManyPages(check.pages);

  /** Lance la carte : un pseudo validé et/ou un PDF validé, ou un lien LinkedIn normalisé. */
  /** `viaLogin` : lancée par l'entrée connectée (le retour de LinkedIn ou de GitHub) ; elle va au compte (§18.91). */
  /** `noGithub` : « Je n'en ai pas » (§18.110), sa fiche LinkedIn seule. */
  const start = async (input: { login?: string; file?: File | null; linkedin?: string; viaLogin?: boolean; noGithub?: boolean }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Le geste qui lance la fiche débloque le son de la révélation (§18.27) et,
    // pour le film (§18.36), ses deux balises vidéo : avant tout await.
    unlockAudio();
    if (revealScene() === "film") unlockFilm();
    setError(null);
    setBusy(true);
    // La page de l'attente se charge pendant la demande : entre l'accueil et l'attente, aucune image vide.
    const page = loadCardPage().catch(() => undefined);
    try {
      const res = await api.createCard({ login: input.login, linkedin: input.linkedin, cv: input.file ?? undefined, lang, ...(input.noGithub ? { noGithub: true } : {}) });
      await page;
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      // « Réessayer » remet le lien LinkedIn dans le champ unique.
      rememberInput({ login: input.login ?? input.linkedin, file: input.file ?? null });
      markFresh(res.id, input.login, input.linkedin, !!input.file);
      // Le serveur l'a liée au compte ; la démo fait de même. La barre gagne « Ma fiche ».
      if (input.viaLogin) {
        // La question de son GitHub (§18.110) part avec la fiche.
        doneReturn();
        if (isMock()) mockLinkCard(res.id);
        void loadAccount(true);
      }
      navigate(`/c/${res.id}`);
    } catch (err) {
      busyRef.current = false;
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, h.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
      setBlocked(err instanceof ApiError && BLOCKING.has(err.code));
    }
  };

  /** Fichier choisi dans le sélecteur : on l'affiche, le bouton fait le reste. */
  const pickFile = async (f: File | undefined | null) => {
    if (!f) return;
    const check = await checkPdf(f);
    if (!check.ok) {
      setFile(null);
      setError(pdfError(check));
      return;
    }
    setError(null);
    setFile(f);
  };

  /** PDF déposé ou collé n'importe où : « dépôt de PDF, puis la carte » (§2). */
  const receivePdf = async (f: File) => {
    const s = state.current;
    if (busyRef.current) return;
    const check = await checkPdf(f);
    if (!check.ok) {
      if (!inline && s.mode === "single") setTab("cv");
      setFile(null);
      setError(pdfError(check));
      return;
    }
    setError(null);
    if (inline) {
      void start({ file: f });
      return;
    }
    setFile(f);
    // Un pseudo déjà saisi dans un champ visible : les deux sources sont là, on compare.
    const p = s.mode === "both" || s.tab === "github" ? parseLogin(s.login) : null;
    if (p) {
      setMode("both");
      void start({ login: p, file: f });
      return;
    }
    if (s.mode === "both") {
      loginRef.current?.focus();
      return;
    }
    setTab("cv");
    void start({ file: f });
  };

  /** URL GitHub collée : on en tire le pseudo et on lance la carte (porte GitHub, même depuis la porte LinkedIn). */
  const receiveLogin = (p: string) => {
    const s = state.current;
    if (busyRef.current) return;
    setError(null);
    setLogin(p);
    if (!inline && s.mode === "both") {
      if (s.file) void start({ login: p, file: s.file });
      else loginRef.current?.focus();
      return;
    }
    if (!inline) setTab("github");
    setOpen((o) => o ?? "github");
    void start({ login: p });
  };

  const receivePdfRef = useRef(receivePdf);
  receivePdfRef.current = receivePdf;
  const receiveLoginRef = useRef(receiveLogin);
  receiveLoginRef.current = receiveLogin;
  const startRef = useRef(start);
  startRef.current = start;

  // Dépôt n'importe où sur la page, avec un voile pendant le survol.
  useEffect(() => {
    if (secondary) return;
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth++;
      setDrag(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth = e.relatedTarget ? Math.max(0, depth - 1) : 0;
      if (depth === 0) setDrag(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth = 0;
      setDrag(false);
      const f = fileFrom(e.dataTransfer);
      if (f) void receivePdfRef.current(f);
    };
    const reset = () => {
      depth = 0;
      setDrag(false);
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", reset);
    };
  }, []);

  // Collage n'importe où : une URL GitHub, un lien LinkedIn ou un PDF.
  useEffect(() => {
    if (secondary) return;
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt || busyRef.current) return;
      const inOurField = e.target === loginRef.current;
      if (isEditable(e.target) && !inOurField) return;
      const f = fileFrom(dt);
      if (f) {
        e.preventDefault();
        void receivePdfRef.current(f);
        return;
      }
      const text = dt.getData("text");
      if (LINKEDIN_URL_RE.test(text)) {
        const entry = detectEntry(text);
        if (!state.current.doorsOn || entry?.kind !== "linkedin") return;
        e.preventDefault();
        setOpen("linkedin");
        setError(null);
        setLogin(text.trim());
        void startRef.current({ linkedin: entry.url });
        return;
      }
      if (!GITHUB_URL_RE.test(text)) return;
      const p = parseLogin(text);
      if (!p) return;
      e.preventDefault();
      receiveLoginRef.current(p);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ce que le retour a donné. Le profil est sûr, ou GitHub a rendu le pseudo : la fiche part sans
  // rien demander. Personne, ou la connexion n'a pas abouti : jamais les deux boutons revenus tels
  // quels, mais une phrase qui le dit et le champ ouvert, prêt pour un lien collé.
  useEffect(() => {
    if (!back || back.s === "finding" || back.s === "pick" || back.s === "ask") return;
    doneReturn();
    if (back.s === "auto") {
      setLogin(back.name);
      void startRef.current({ linkedin: back.url, viaLogin: true });
    } else if (back.s === "github") {
      setVia("github");
      setLogin(back.login);
      void startRef.current({ login: back.login, viaLogin: true });
    } else {
      setVia(back.via);
      setLost(back.via);
      setLogin("");
      setOpen(back.via);
      setError(back.via === "github" ? h.lostGithub : back.why === "none" ? h.lostNone : h.lostError);
      intoView(formRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back]);
  // Revenu par « Précédent » depuis LinkedIn ou GitHub : le bouton n'attend plus.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) setSigning(null);
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);

  // Les suggestions sous le champ (§18.80) : des profils LinkedIn, des comptes GitHub, ou les deux mêlés.
  const suggestions = useSuggestions(
    login,
    fieldDoor === "linkedin" ? { linkedin: can.search } : { github: true, linkedin: anyField && doorsOn && can.search },
    busy || !!signing || !!picking || !fieldOn,
  );
  const pickSuggestion = (item: Suggestion) => {
    if (busyRef.current) return;
    setError(null);
    if (item.kind === "linkedin") {
      setLogin(item.title);
      void start({ linkedin: item.url });
    } else {
      setLogin(item.login);
      if (!doorsOn && (showCv || mode === "both")) return;
      void start({ login: item.login });
    }
  };
  const fieldLabel = fieldDoor === "linkedin" ? h.linkedinLabel : anyField && doorsOn ? h.linkLabel : h.loginLabel;
  const box = useSuggestBox({ id: `${uid}-sg`, items: suggestions, onPick: pickSuggestion, label: fieldLabel, mixed: anyField && doorsOn && can.search });
  // Le champ vient de s'ouvrir d'un toucher : il prend le focus.
  const focusNext = useRef(false);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    loginRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const openField = (next: Open) => {
    focusNext.current = true;
    setError(null);
    setOpen(next);
  };
  const fieldRef = useRef<HTMLDivElement>(null);
  // Au doigt, le clavier prend la moitié de l'écran : le champ monte, ses lignes restent visibles.
  useEffect(() => {
    if (box.shown && touch) fieldRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [box.shown, touch]);

  /** Un nom dans le champ à l'envoi : une seule personne proposée, c'est elle ; plusieurs, la liste ; aucune, l'erreur. */
  const sendName = (): void => {
    if (suggestions.length === 1) return pickSuggestion(suggestions[0]!);
    if (suggestions.length) box.show();
    else setError(fieldDoor === "linkedin" ? h.errLinkedin : h.errPick);
    loginRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Le champ lit sa source d'abord ; une adresse de l'autre source part quand même.
    if (doorsOn) {
      const r = resolveDoor(fieldDoor, login);
      if (r.kind === "name") return sendName();
      if (r.kind === "error") {
        setError(r.error === "github" ? h.errLogin : r.error === "linkedin" || fieldDoor === "linkedin" ? h.errLinkedin : h.errEmptyLogin);
        loginRef.current?.focus();
        return;
      }
      if (r.kind === "linkedin") {
        void start({ linkedin: r.url });
      } else {
        setLogin(r.login);
        void start({ login: r.login });
      }
      return;
    }
    let parsed: string | undefined;
    if (showGithub) {
      if (!login.trim()) {
        setError(h.errEmptyLogin);
        loginRef.current?.focus();
        return;
      }
      // Sans portes, pas de LinkedIn : avec un CV, ou si le serveur ne sait pas le lire (§18.24).
      if (/linkedin\.com/i.test(login)) {
        setError(showCv ? h.errLinkedinCv : h.errLinkedinOff);
        loginRef.current?.focus();
        return;
      }
      const p = parseLogin(login);
      if (!p) {
        if (resolveDoor("github", login).kind === "name") return sendName();
        setError(h.errLogin);
        loginRef.current?.focus();
        return;
      }
      parsed = p;
    }
    if (showCv && !file) {
      setError(h.errEmptyCv);
      return;
    }
    void start({ login: parsed, file: showCv ? file : null });
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} ${h.sizeUnits.mb}` : `${Math.max(1, Math.round(n / 1024))} ${h.sizeUnits.kb}`);

  const veil =
    drag &&
    createPortal(
      <div className="drop-veil" aria-hidden>
        <span>{h.dropAnywhere}</span>
      </div>,
      document.body,
    );

  const loginInput = (
    <input
      ref={loginRef}
      id={`${uid}-gh`}
      className="field-input"
      type="text"
      inputMode="text"
      enterKeyHint="go"
      autoComplete="off"
      name="who"
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      autoCapitalize={fieldDoor === "linkedin" ? "words" : "none"}
      autoCorrect="off"
      spellCheck={false}
      // Sans recherche de profils, le champ LinkedIn dit ce qu'il prend : un lien.
      placeholder={fieldDoor === "linkedin" ? (can.search && !lost ? h.linkedinPlaceholder : h.linkedinLinkPlaceholder) : anyField && doorsOn ? h.linkPlaceholder : h.loginPlaceholder}
      value={login}
      onChange={(e) => {
        setLogin(e.target.value);
        if (error) setError(null);
        setBlocked(false);
      }}
      onKeyDown={(e) => void box.onKeyDown(e)}
      onFocus={box.show}
      onBlur={() => {
        box.close();
        // Une adresse GitHub tapée à la main devient son pseudo ; pas à chaque frappe.
        if (fieldDoor === "linkedin" || /linkedin\.com/i.test(login)) return;
        const p = parseLogin(login);
        if (p && p !== login) setLogin(p);
      }}
      aria-invalid={!!error && showGithub && !file}
      aria-describedby={`${uid}-err ${uid}-note ${uid}-hint`}
      {...box.inputProps}
    />
  );

  const errorLine = (
    <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
      {error}
    </p>
  );

  /** Limite atteinte : « En attendant : le top de la semaine », plutôt qu'un bouton qui échouera. */
  const meanwhile = blocked && !!error && (
    <button
      type="button"
      className="link-alt entry-meanwhile"
      onClick={() => {
        const board = document.getElementById(WEEK_ID);
        if (board) board.scrollIntoView({ block: "start", behavior: "smooth" });
        else navigate(RANKING_HREF);
      }}
    >
      {document.getElementById(WEEK_ID) ? h.meanwhileTop : h.meanwhileRanking}
    </button>
  );
  /** GitHub vient de rendre la main : un aller-retour, son bouton attend. */
  const ghBack = back?.s === "finding" && back.via === "github";
  /** La fiche part, ou la personne part chez LinkedIn ou GitHub, ou en revient : le bouton attend. */
  const working = busy || !!signing || ghBack;
  const submitCls = `pill pill-big entry-submit${working ? " is-busy" : ""}${blocked && error && !working ? " pill-ghost" : ""}`;

  /** Sous le champ seul, tant qu'il n'y a pas d'erreur (elle prend sa place) : ce que la source sait lire. */
  const hintLine = fieldOn && simple && !inline && !error && !lost && (
    <p id={`${uid}-note`} className="entry-hint">
      {fieldDoor === "linkedin" ? h.linkedinHint : h.githubHint}
    </p>
  );
  /** LinkedIn ne l'a pas retrouvé : où prendre le lien à coller. */
  const helpLine = lost === "linkedin" && fieldOn && fieldDoor === "linkedin" && (
    <p id={`${uid}-note`} className="entry-hint entry-help">
      {h.linkHelp}
    </p>
  );

  /** Le champ, en pilule (maquette validée de l'accueil) : un lien, un pseudo ou un nom, et les personnes proposées dessous (§18.80). */
  const loginField = (
    <div
      ref={fieldRef}
      className="field field-who"
      onClick={(e) => {
        if (e.target === e.currentTarget) loginRef.current?.focus();
      }}
    >
      <label htmlFor={`${uid}-gh`} className="sr-only">
        {fieldLabel}
      </label>
      {loginInput}
      {box.list}
    </div>
  );

  /** Un bouton de connexion. Sans connexion réglée côté serveur, il ouvre le champ sur sa source : jamais de bouton mort. */
  const loginBtn = (d: Door, primary: boolean) => {
    const waits = working && (ghBack ? d === "github" : via === d);
    return (
      <button
        key={d}
        type="button"
        className={`pill pill-big${primary && !(blocked && error) ? "" : " pill-ghost"} entry-login${waits ? " is-busy" : ""}`}
        disabled={working}
        onClick={() => {
          if (!(d === "linkedin" ? can.liLogin : can.ghLogin)) return openField(d);
          setVia(d);
          setSigning(d);
          // Une fiche déjà là : se connecter sert à en faire une autre, pas à revenir sur la sienne (§18.91).
          const redo = !!acct?.cardId;
          if (d === "linkedin") startLinkedinLogin({ redo });
          else startGithubLogin({ redo });
        }}
      >
        {waits ? (
          <>
            {busyLabel(h.submitting)}
            <BusyDots />
          </>
        ) : (
          <>
            {d === "linkedin" ? <IconLinkedIn /> : <IconGithub />}
            {d === "linkedin" ? h.withLinkedin : h.withGithub}
          </>
        )}
      </button>
    );
  };
  /** Les deux boutons empilés, LinkedIn d'abord (le rose) ; sans LinkedIn lisible, GitHub seul, en rose. */
  /** Le compte a déjà son LinkedIn (§18.105) : « Se connecter avec LinkedIn » ne s'affiche plus, le serveur n'y renvoie plus. */
  const liMine = !!acct?.sources.includes("linkedin");
  /**
   * Connecté, une fiche au compte : « Voir ma fiche », et dessous « Refaire ma fiche · Se déconnecter ».
   * Connecté par LinkedIn, sa fiche partie : « Refaire ma fiche » en rose, refaite d'après son compte (§18.105).
   */
  const connected = buttonsOn && (!!acct?.cardId || liMine) && !another && !working && !picking && !returned;
  const mineHref = acct?.cardId ? `/c/${acct.cardId}` : "/";
  /** « Refaire » : le parcours de la source connectée, sans le raccourci vers la fiche ; sans connexion réglée, le champ. */
  const redo = () => {
    const src = acct?.sources ?? [];
    const d: Door | null = (src.includes("linkedin") || !!acct?.known) && liOn && can.liLogin ? "linkedin" : src.includes("github") && can.ghLogin ? "github" : null;
    if (!d) return openField("link");
    setVia(d);
    setSigning(d);
    if (d === "linkedin") startLinkedinLogin({ redo: true });
    else startGithubLogin({ redo: true });
  };
  const connectedBlock =
    connected &&
    (acct?.cardId ? (
      <>
        <a className="pill pill-big entry-mine" href={mineHref} onClick={(e) => onLinkClick(e, mineHref)}>
          {h.account.see}
        </a>
        <div className="entry-foot entry-or" id={`${uid}-hint`}>
          <button type="button" className="link-alt" onClick={redo}>
            {h.account.redo}
          </button>
          <span aria-hidden>·</span>
          <button type="button" className="link-alt" onClick={() => void signOut()}>
            {h.account.out}
          </button>
        </div>
      </>
    ) : (
      <>
        <button type="button" className="pill pill-big entry-mine entry-redo" onClick={redo}>
          {h.account.redo}
        </button>
        <div className="entry-foot entry-or" id={`${uid}-hint`}>
          <button type="button" className="link-alt" onClick={() => void signOut()}>
            {h.account.out}
          </button>
        </div>
      </>
    ));
  const loginBtns = buttonsOn && !connected && (
    <>
      {liOn && !liMine && loginBtn("linkedin", true)}
      {loginBtn("github", !liOn || liMine)}
    </>
  );
  /** Le CV : sur l'accueil, le dépôt s'ouvre sur place ; depuis une fiche, on y va. */
  const toCv = () => {
    if (!inline) return switchTab("cv");
    setPrefill({ tab: "cv" });
    navigate("/");
  };
  /** La petite ligne sous les deux boutons : « ou avec ton CV · ou colle un lien ». */
  const orLine = buttonsOn && !connected && (
    <div className="entry-foot entry-or" id={`${uid}-hint`}>
      <button type="button" className="link-alt" onClick={toCv}>
        {h.orCv}
      </button>
      <span aria-hidden>·</span>
      <button type="button" className="link-alt" onClick={() => openField("link")}>
        {h.orLink}
      </button>
    </div>
  );
  /** Du champ, le retour aux deux boutons. */
  const backLink = (
    <button
      type="button"
      className="link-alt"
      onClick={() => {
        setOpen(null);
        setLost(null);
        setError(null);
      }}
    >
      ← {h.backToLogin}
    </button>
  );

  /** « C'est toi ? » : au retour de LinkedIn, quand ni l'email ni la photo ne désignent un seul profil. */
  const closePicker = () => {
    // Aucun des trois : le champ s'ouvre sur le nom, à chercher, ou sur un lien à coller.
    if (picking) setLogin(picking.name);
    doneReturn();
    openField("linkedin");
  };
  const pickerSheet =
    picking &&
    createPortal(
      <div className="pick-veil" onClick={closePicker} onKeyDown={(e) => e.key === "Escape" && closePicker()}>
        <section className="pick" role="dialog" aria-modal="true" aria-labelledby={`${uid}-pick`} onClick={(e) => e.stopPropagation()}>
          <header className="pick-head">
            <h2 id={`${uid}-pick`}>{t.denounce.isYou}</h2>
            <button type="button" className="icon-btn" onClick={closePicker} aria-label={t.common.close}>
              <IconClose />
            </button>
          </header>
          <ul className="pick-list">
            {picking.candidates.map((p, i) => (
              <li key={p.url}>
                <button
                  type="button"
                  autoFocus={i === 0 && !isTouch()}
                  onClick={() => {
                    setLogin(p.name);
                    // Son GitHub d'abord, s'il n'est pas connu (§18.110).
                    if (picking.ask) return askGithub(p.name || picking.name, p.url, picking.ask);
                    doneReturn();
                    void start({ linkedin: p.url, viaLogin: true });
                  }}
                >
                  <SuggestRow item={fromLinkedin(p)} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>,
      document.body,
    );

  /** « C'est ton GitHub ? » ou « Ajoute ton GitHub » (§18.110) : la réponse lance le dossier, ou la fiche LinkedIn seule. */
  const askBlock = hold && asking && (
    <GithubAsk
      key={asking.url}
      name={asking.name}
      candidate={asking.candidate}
      busy={busy}
      onAnswer={(gh) => void start(gh ? { login: gh, linkedin: asking.url, viaLogin: true } : { linkedin: asking.url, viaLogin: true, noGithub: true })}
    />
  );

  /** L'envoi en pilule, sous le champ ou le dépôt : pas avec les deux boutons, qui lancent eux-mêmes. */
  const submitBtn = (label: string) =>
    !buttonsOn &&
    !hold && (
      <button type="submit" className={submitCls} disabled={working}>
        {working ? busyLabel(h.submitting) : label}
        {working && <BusyDots />}
      </button>
    );

  if (inline) {
    return (
      <form ref={formRef} className="entry entry-inline is-stack" onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} onFocus={onFocus} noValidate>
        {hold && finding && <FindWait since={finding.since} />}
        {askBlock}
        {connectedBlock}
        {loginBtns}
        {fieldOn && loginField}
        {errorLine}
        {helpLine}
        {meanwhile}
        {submitBtn(h.submit)}
        {orLine}
        {!buttonsOn && !hold && (
          <div className="entry-foot" id={`${uid}-hint`}>
            {backLink}
          </div>
        )}
        {veil}
        {pickerSheet}
      </form>
    );
  }

  // Un seul chemin à l'écran : se connecter d'abord ; le CV et le champ à un lien de là, un seul
  // niveau. Les deux sources ensemble : en déposant un PDF avec un pseudo saisi, ou depuis une fiche.
  return (
    <form ref={formRef} className={`entry mode-${mode}${simple ? " is-stack" : ""}`} onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} onFocus={onFocus} onDragEnter={prefetchReveal} noValidate>
      {mode === "both" && <p className="entry-both-head">{h.bothActive}</p>}

      {hold && finding && <FindWait since={finding.since} />}
      {askBlock}
      {connectedBlock}
      {loginBtns}
      {fieldOn && loginField}

      {showCv && (
        <div className={`drop${drag ? " is-drag" : ""}${file ? " has-file" : ""}`}>
          <input
            ref={fileInput}
            id={`${uid}-file`}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {file ? (
            <div className="drop-file">
              <span className="drop-file-meta">
                <b>{file.name}</b>
                <span>{sizeLabel(file.size)}</span>
              </span>
              <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label={h.dropRemove}>
                <IconClose />
              </button>
            </div>
          ) : touch ? (
            <label htmlFor={`${uid}-file`} className="drop-empty">
              <span className="drop-title">{h.dropPick}</span>
              <span className="drop-sub">{h.dropHint}</span>
            </label>
          ) : (
            <label htmlFor={`${uid}-file`} className="drop-empty">
              <span className="drop-title">{h.dropTitle}</span>
              <span className="drop-sub">
                {h.dropOr} <u>{h.dropBrowse}</u> ({h.dropHint})
              </span>
            </label>
          )}
        </div>
      )}

      {errorLine}
      {hintLine}
      {helpLine}
      {meanwhile}

      {submitBtn(mode === "both" ? h.submitBoth : h.submit)}

      {orLine}
      <div className="entry-foot" id={buttonsOn ? undefined : `${uid}-hint`}>
        {showCv && <span className="entry-reassure">{h.reassure}</span>}
        {simple && !buttonsOn && !hold && backLink}
        {mode === "single" && tab === "cv" && (
          <>
            <button type="button" className="link-alt" onClick={() => switchTab("github")}>
              ← {liOn ? h.tabDoors : h.tabGithub}
            </button>
          </>
        )}
        {mode === "both" && (
          <button
            type="button"
            className="link-alt"
            onClick={() => {
              setMode("single");
              setError(null);
            }}
          >
            {h.bothBack}
          </button>
        )}
      </div>
      {veil}
      {pickerSheet}
    </form>
  );
}
