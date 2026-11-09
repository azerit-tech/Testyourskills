// Le champ unique de l'entrée (§6.1) : le pseudo GitHub, ou un lien de profil
// LinkedIn quand le serveur sait le lire (§18.24) ; à un lien de là le CV, puis
// « les deux » pour la comparaison.
// Variante « inline » : le champ GitHub seul, dans le bandeau d'une carte partagée.
// Raccourcis : coller une URL GitHub ou déposer un PDF n'importe où sur la page lance la carte.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { detectEntry } from "../../../shared/entry";
import { pick, useT } from "../i18n";
import { api, tokens } from "../lib/api";
import { errorFact } from "../lib/errors";
import { navigate } from "../lib/router";
import { unlockAudio } from "../lib/audio";
import { markFresh, rememberInput, setPrefill, takePrefill } from "../lib/session";
import type { Mode, Tab } from "../lib/session";
import { checkPdf, isTouch, parseLogin } from "../lib/util";
import type { PdfCheck } from "../lib/util";
import { IconClose } from "./Icons";

interface Props {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** « inline » : le champ GitHub seul, sans onglets, pour le bandeau d'une carte partagée. */
  variant?: "full" | "inline";
}

/** Un collage ne lance la carte que s'il ressemble à une URL GitHub (ou LinkedIn), pas à un simple mot. */
const GITHUB_URL_RE = /github\.com\//i;
const LINKEDIN_URL_RE = /linkedin\.com\/in\//i;

/** Dès que le visiteur commence à saisir, la scène 3D de la révélation se
 * télécharge (quelques Mo) ; l'attente du scoring sert ensuite à la préparer
 * (§6.2). Pas avec l'économiseur de données : elle attendra l'envoi. */
let prefetched = false;
function prefetchReveal() {
  if (prefetched) return;
  prefetched = true;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  void import("./Walkout3D").then((m) => m.preloadWalkoutAssets()).catch(() => undefined);
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

export function EntryForm({ inputRef, variant = "full" }: Props) {
  const inline = variant === "inline";
  const { t, lang } = useT();
  const h = t.home;
  const [init] = useState(() => (inline ? null : takePrefill()));
  const [mode, setMode] = useState<Mode>(init?.mode ?? "single");
  const [tab, setTab] = useState<Tab>(init?.tab ?? "github");
  const [login, setLogin] = useState(init?.login ?? "");
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

  // Le champ accepte aussi un lien LinkedIn si le serveur sait le lire (§18.24) ; pas avec un CV.
  const [liOn, setLiOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setLiOn(c.linkedinEntry));
    return () => {
      alive = false;
    };
  }, []);
  const liField = liOn && !showCv;

  // Les écouteurs posés sur le document lisent toujours l'état courant.
  const state = useRef({ mode, tab, login, file, liField });
  state.current = { mode, tab, login, file, liField };
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
    // Le geste qui lance la fiche débloque le son de la révélation (§18.27) : avant tout await.
    unlockAudio();
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

  /** URL GitHub collée : on en tire le pseudo et on lance la carte. */
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

  // Collage n'importe où : une URL GitHub ou un PDF.
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
        if (!state.current.liField || entry?.kind !== "linkedin") return;
        e.preventDefault();
        setLogin(entry.url);
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
    let parsed: string | undefined;
    if (showGithub) {
      if (!login.trim()) {
        setError(h.errEmptyLogin);
        loginRef.current?.focus();
        return;
      }
      // Un lien LinkedIn : seul, et seulement si le serveur sait le lire (§18.24).
      const entry = detectEntry(login);
      if (entry?.kind === "linkedin" || /linkedin\.com/i.test(login)) {
        if (showCv || !liOn || entry?.kind !== "linkedin") {
          setError(showCv ? h.errLinkedinCv : !liOn ? h.errLinkedinOff : h.errEntry);
          loginRef.current?.focus();
          return;
        }
        void start({ linkedin: entry.url });
        return;
      }
      const p = parseLogin(login);
      if (!p) {
        setError(liField ? h.errEntry : h.errLogin);
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
      placeholder={liField ? h.entryPlaceholder : h.loginPlaceholder}
      value={login}
      onChange={(e) => {
        setLogin(e.target.value);
        if (error) setError(null);
      }}
      onBlur={() => {
        if (/linkedin\.com/i.test(login)) return;
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


  /** Le champ du pseudo, en pilule, avec son « @ » (maquette web/gta-accueil.html). */
  const loginField = (
    <div className="field">
      <label htmlFor={`${uid}-gh`} className="sr-only">
        {liField ? h.entryLabel : h.loginLabel}
      </label>
      {/* Le « @ » va à un pseudo ; devant un lien, ou devant « pseudo GitHub ou lien LinkedIn », il gêne. */}
      {(!liField || /^@?[\w-]+$/.test(login.trim())) && (
        <span className="field-prefix" aria-hidden>
          @
        </span>
      )}
      {loginInput}
    </div>
  );

  if (inline) {
    return (
      <form className="entry entry-inline" onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} noValidate>
        {loginField}
        <button type="submit" className="pill pill-big entry-submit" disabled={busy}>
          {busy ? h.submitting : h.submit}
        </button>
        {errorLine}
        <div className="entry-foot" id={`${uid}-hint`}>
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
        </div>
        {veil}
      </form>
    );
  }

  // Un seul chemin à l'écran : le pseudo d'abord ; le CV, puis la comparaison, à un lien de là.
  return (
    <form className={`entry mode-${mode}`} onSubmit={submit} onInput={prefetchReveal} onPointerDown={prefetchReveal} onDragEnter={prefetchReveal} noValidate>
      {mode === "both" && <p className="entry-both-head">{h.bothActive}</p>}

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

      <div className="entry-foot" id={`${uid}-hint`}>
        {showCv && <span className="entry-reassure">{h.reassure}</span>}
        {mode === "single" && tab === "github" && (
          <button type="button" className="link-alt" onClick={() => switchTab("cv")}>
            {h.inlineCv}
          </button>
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
