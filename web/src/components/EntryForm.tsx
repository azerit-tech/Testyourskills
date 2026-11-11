// L'entrée (§6.1). Quand le serveur sait lire LinkedIn (§18.24), deux portes au-dessus
// du champ : LinkedIn d'abord (préfixe « linkedin.com/in/ »), puis GitHub (« @ »).
// Sinon, le champ GitHub seul. À un lien de là le CV, puis « les deux » pour la
// comparaison : ces deux-là gardent le champ GitHub, sans portes.
// Variante « inline » : les portes et le champ, dans le bandeau d'une carte partagée.
// Raccourcis : coller une URL GitHub ou LinkedIn, ou déposer un PDF, n'importe où sur
// la page lance la carte (et ouvre la bonne porte).
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { detectEntry, linkedinSlug, parseGithubLogin, resolveDoor } from "../../../shared/entry";
import type { Door } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { unlockFilm } from "../film/unlock";
import { prefetchScene, revealScene } from "../lib/revealScene";
import { markFresh, rememberDoor, rememberInput, sessionDoor, setPrefill, takePrefill } from "../lib/session";
import type { Mode, Tab } from "../lib/session";
import { checkPdf, isTouch, parseLogin } from "../lib/util";
import type { PdfCheck } from "../lib/util";
import { IconClose } from "./Icons";

interface Props {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** « inline » : sans onglets ni CV, pour le bandeau d'une carte partagée. */
  variant?: "full" | "inline";
  /** Une ligne posée entre la pilule et les liens du pied (la promesse de l'accueil, sur téléphone). */
  note?: ReactNode;
}

const DOORS: Door[] = ["linkedin", "github"];

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

/** La porte et le texte du champ au départ : un « Réessayer » rouvre la porte de sa saisie. */
function initialEntry(raw: string | undefined): { door: Door; login: string } {
  const s = raw ?? "";
  const slug = /linkedin\.com/i.test(s) ? linkedinSlug(s) : null;
  if (slug) return { door: "linkedin", login: slug };
  if (s && parseGithubLogin(s)) return { door: "github", login: s };
  return { door: sessionDoor(), login: s };
}

export function EntryForm({ inputRef, variant = "full", note }: Props) {
  const inline = variant === "inline";
  const { t, lang } = useT();
  const h = t.home;
  const [init] = useState(() => (inline ? null : takePrefill()));
  const [first] = useState(() => initialEntry(init?.login));
  const [mode, setMode] = useState<Mode>(init?.mode ?? "single");
  const [tab, setTab] = useState<Tab>(init?.tab ?? "github");
  const [door, setDoor] = useState<Door>(first.door);
  const [login, setLogin] = useState(first.login);
  const [help, setHelp] = useState(false);
  const [file, setFile] = useState<File | null>(init?.file ?? null);
  const [error, setError] = useState<string | null>(init?.error ? (typeof init.error === "string" ? init.error : pick(init.error, lang)) : null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const localLoginRef = useRef<HTMLInputElement>(null);
  const loginRef = inputRef ?? localLoginRef;
  const uid = useId().replace(/:/g, "");

  const showGithub = inline || mode === "both" || tab === "github";
  const showCv = !inline && (mode === "both" || tab === "cv");

  // Les portes, si le serveur sait lire LinkedIn (§18.24) ; pas avec un CV. Optimiste
  // tant que la config est inconnue, puis lue d'emblée : ni les portes ni le titre ne clignent.
  const [liOn, setLiOn] = useState(() => api.knownConfig()?.linkedinEntry ?? true);
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setLiOn(c.linkedinEntry));
    return () => {
      alive = false;
    };
  }, []);
  const doorsOn = liOn && !showCv;
  /** La porte du champ visible : GitHub dès qu'il n'y a pas de portes. */
  const fieldDoor: Door = doorsOn ? door : "github";

  useEffect(() => rememberDoor(door), [door]);

  // Les écouteurs posés sur le document lisent toujours l'état courant.
  const state = useRef({ mode, tab, login, file, doorsOn });
  state.current = { mode, tab, login, file, doorsOn };
  const doorBtns = useRef<Record<Door, HTMLButtonElement | null>>({ linkedin: null, github: null });
  // Verrou immédiat : deux départs rapprochés (collage puis dépôt) n'en font qu'un.
  const busyRef = useRef(false);

  useEffect(() => {
    if (init?.mode === "both" || init?.login) {
      loginRef.current?.focus();
      return;
    }
    // Sur desktop, le champ a le focus d'emblée. Pas sur mobile : le clavier cacherait la carte.
    if (!inline && !isTouch()) loginRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pdfError = (check: Exclude<PdfCheck, { ok: true }>) =>
    check.reason === "not_pdf" ? h.errNotPdf : check.reason === "too_large" ? h.errTooLarge(check.mb) : h.errTooManyPages(check.pages);

  /** Lance la carte : un pseudo validé et/ou un PDF validé, ou un lien LinkedIn normalisé. */
  const start = async (input: { login?: string; file?: File | null; linkedin?: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    // Le geste qui lance la fiche débloque le son de la révélation (§18.27) et,
    // pour le film (§18.36), ses deux balises vidéo : avant tout await.
    unlockAudio();
    if (revealScene() === "film") unlockFilm();
    setError(null);
    setBusy(true);
    try {
      const res = await api.createCard({ login: input.login, linkedin: input.linkedin, cv: input.file ?? undefined, lang });
      if (res.deleteToken) tokens.set(res.id, res.deleteToken);
      // « Réessayer » remet le lien LinkedIn dans le champ unique.
      rememberInput({ login: input.login ?? input.linkedin, file: input.file ?? null });
      markFresh(res.id, input.login);
      navigate(`/c/${res.id}`);
    } catch (err) {
      busyRef.current = false;
      setBusy(false);
      const msg = errorFact(err, t.errors.closed, h.errNetwork);
      setError(typeof msg === "string" ? msg : pick(msg, lang));
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
    setDoor("github");
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
        // Porte LinkedIn, et dans le champ seulement ce qui suit le préfixe.
        setDoor("linkedin");
        setError(null);
        setLogin(linkedinSlug(entry.url) ?? entry.url);
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Les portes : chacune lit son champ ; une adresse de l'autre porte y bascule et lance.
    if (doorsOn) {
      const r = resolveDoor(door, login);
      if (r.kind === "error") {
        setError(r.error === "github" ? h.errLogin : r.error === "linkedin" || door === "linkedin" ? h.errLinkedin : h.errEmptyLogin);
        loginRef.current?.focus();
        return;
      }
      if (r.switchTo) setDoor(r.switchTo);
      if (r.kind === "linkedin") {
        setLogin(linkedinSlug(r.url) ?? login);
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

  /** Un clic sur une porte : sur ordinateur le champ prend le focus ; au doigt, pas de clavier ;
   * au clavier (Espace, Entrée : detail 0), le focus reste sur la porte. */
  const pickDoor = (next: Door, e: ReactMouseEvent) => {
    if (next !== door) {
      setDoor(next);
      setError(null);
    }
    if (e.detail > 0 && !isTouch()) loginRef.current?.focus();
  };

  /** Flèches (et Début, Fin) : la porte suivante, focus compris (tabindex itinérant). */
  const doorKey = (e: ReactKeyboardEvent) => {
    const i = DOORS.indexOf(door);
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? DOORS[(i + DOORS.length - 1) % DOORS.length]
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? DOORS[(i + 1) % DOORS.length]
          : e.key === "Home"
            ? DOORS[0]
            : e.key === "End"
              ? DOORS[DOORS.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    if (next !== door) {
      setDoor(next);
      setError(null);
    }
    doorBtns.current[next]?.focus();
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
      inputMode="url"
      enterKeyHint="go"
      autoComplete="off"
      name="gh-handle"
      data-1p-ignore=""
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder={fieldDoor === "linkedin" ? h.linkedinPlaceholder : h.loginPlaceholder}
      value={login}
      onChange={(e) => {
        setLogin(e.target.value);
        if (error) setError(null);
      }}
      onBlur={() => {
        // Un lien LinkedIn tapé à la main devient ce qui suit « /in/ » ; pas à chaque frappe.
        if (/linkedin\.com/i.test(login)) {
          const slug = fieldDoor === "linkedin" ? linkedinSlug(login) : null;
          if (slug) setLogin(slug);
          return;
        }
        if (fieldDoor === "linkedin") return;
        const p = parseLogin(login);
        if (p && p !== login) setLogin(p);
      }}
      aria-invalid={!!error && showGithub && !file}
      aria-describedby={`${uid}-err ${uid}-hint`}
    />
  );

  const errorLine = (
    <p id={`${uid}-err`} className={`entry-error${error ? " is-on" : ""}`} role="alert">
      {error}
    </p>
  );


  /** Le champ, en pilule (maquette validée de l'accueil) : « @ » devant un pseudo GitHub,
   * « linkedin.com/in/ » devant un profil, sauf quand on y tape une adresse entière. */
  const loginField = (
    <div
      className={`field${fieldDoor === "linkedin" ? " field-li" : ""}`}
      onClick={(e) => {
        if (e.target !== loginRef.current) loginRef.current?.focus();
      }}
    >
      <label htmlFor={`${uid}-gh`} className="sr-only">
        {fieldDoor === "linkedin" ? h.linkedinLabel : h.loginLabel}
      </label>
      {fieldDoor === "github" ? (
        <span className="field-prefix" aria-hidden>
          @
        </span>
      ) : (
        !/(?:linkedin|github)\.com/i.test(login) && (
          <span className="field-prefix" aria-hidden>
            linkedin.com/in/
          </span>
        )
      )}
      {loginInput}
    </div>
  );

  /** Les deux portes, LinkedIn d'abord : un groupe de boutons radio, comme le choix de la langue. */
  const doorsSwitch = doorsOn && (
    <div className="seg entry-doors" role="radiogroup" aria-label={h.doorsLabel} onKeyDown={doorKey}>
      {DOORS.map((d) => (
        <button
          key={d}
          ref={(el) => {
            doorBtns.current[d] = el;
          }}
          type="button"
          role="radio"
          aria-checked={door === d}
          tabIndex={door === d ? 0 : -1}
          onClick={(e) => pickDoor(d, e)}
        >
          {d === "linkedin" ? h.doorLinkedin : h.doorGithub}
        </button>
      ))}
    </div>
  );

  /** Porte LinkedIn : « Où est mon lien ? » ouvre une ligne d'aide, sous les liens du pied. */
  const whereLink = fieldDoor === "linkedin" && (
    <button type="button" className="link-alt" aria-expanded={help} aria-controls={`${uid}-help`} onClick={() => setHelp((v) => !v)}>
      {h.linkedinWhere}
    </button>
  );
  const helpLine = fieldDoor === "linkedin" && (
    <p id={`${uid}-help`} className="entry-help" hidden={!help}>
      {h.linkedinHelp}
    </p>
  );

  if (inline) {
    return (
      <form className={`entry entry-inline${doorsOn ? " has-doors" : ""}`} onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} noValidate>
        {doorsSwitch}
        {loginField}
        <button type="submit" className="pill pill-big entry-submit" disabled={busy}>
          {busy ? h.submitting : h.submit}
        </button>
        {errorLine}
        <div className="entry-foot" id={`${uid}-hint`}>
          {whereLink}
          <button
            type="button"
            className="link-alt"
            onClick={() => {
              setPrefill({ tab: "cv" });
              navigate("/");
            }}
          >
            {h.inlineCv}
          </button>
          {helpLine}
        </div>
        {veil}
      </form>
    );
  }

  // Un seul chemin à l'écran : le pseudo d'abord ; le CV, puis la comparaison, à un lien de là.
  return (
    <form className={`entry mode-${mode}${doorsOn ? " has-doors" : ""}`} onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} onDragEnter={prefetchReveal} noValidate>
      {mode === "both" && <p className="entry-both-head">{h.bothActive}</p>}

      {doorsSwitch}
      {showGithub && loginField}

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
          ) : (
            <label htmlFor={`${uid}-file`} className="drop-empty">
              <span className="drop-title">{h.dropTitle}</span>
              <span className="drop-sub">
                {h.dropOr} <u>{h.dropBrowse}</u> · {h.dropHint}
              </span>
            </label>
          )}
        </div>
      )}

      <button type="submit" className="pill pill-big entry-submit" disabled={busy}>
        {busy ? h.submitting : mode === "both" ? h.submitBoth : h.submit}
      </button>

      {errorLine}
      {note}

      <div className="entry-foot" id={`${uid}-hint`}>
        {showCv && <span className="entry-reassure">{h.reassure}</span>}
        {mode === "single" && tab === "github" && (
          <>
            {whereLink}
            <button type="button" className="link-alt" onClick={() => switchTab("cv")}>
              {h.inlineCv}
            </button>
            {helpLine}
          </>
        )}
        {mode === "single" && tab === "cv" && (
          <>
            <button type="button" className="link-alt" onClick={() => switchTab("github")}>
              ← {h.tabGithub}
            </button>
            <button
              type="button"
              className="link-alt"
              onClick={() => {
                setMode("both");
                setError(null);
              }}
            >
              {h.bothLink}
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
    </form>
  );
}
