// Tout ce qui vient sous la carte (§6.4), dans l'ordre de la spec.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CardData, ComparisonData, Lang, WeekRank } from "../../../shared/types";
import { declaredOf, LEVEL_LABELS, starsFor } from "../../../shared/types";
import { declaredLabel, fileOf } from "../../../shared/caseFile";
import { usableGrid } from "../../../shared/gridText";
import { recruiterRead, weakestCriterion } from "../../../shared/recruiterLine";
import { t as cardT } from "../../../shared/card/i18n";
import { pick, useT } from "../i18n";
import { api, hasGithub, images, isMine, isMock, tokens, weekOf } from "../lib/api";
import { navigate } from "../lib/router";
import { getPlea } from "../lib/plea";
import { useAppConfig } from "../lib/season";
import { setPrefill } from "../lib/session";
import { flatteringRank, shareLead, shareText, type ShareInput } from "../lib/shareText";
import { canShareFile, hasNativeShare, imageFile, inAppBrowser, markTextCopied, portraitFile, preloadImage, preloadPortrait, shareFile, shareSheet, useTextCopied } from "../lib/sharing";
import { copyText, isTouch, shareUrl, useReducedMotion } from "../lib/util";
import { IconClose, IconLinkedIn, IconShare } from "./Icons";
import { ProveGithub } from "./ProveGithub";

/* ---------- petit toast partagé ---------- */

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = (
    <div className={`toast${msg ? " is-on" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
  return { show, node };
}

/* ---------- lignes repliées (§18.27) ---------- */

const Chevron = () => (
  <svg className="fold-chevron" viewBox="0 0 24 24" aria-hidden>
    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface FoldProps {
  /** Classe du bloc (why, claim, email…), gardée sur la ligne. */
  name: string;
  title: ReactNode;
  /** Un état qui demande l'attention (erreur, fiche masquée) : la ligne s'ouvre d'elle-même. */
  attention?: boolean;
  /** À chaque ouverture par la personne. */
  onOpen?: () => void;
  children: ReactNode;
}

/**
 * « Le reste » sous la fiche : une ligne de 52 px qui s'ouvre sur place (un `<details>`, donc
 * le clavier et les lecteurs d'écran savent l'ouvrir). Fermée, son contenu reste monté : un
 * champ à moitié rempli ne se perd pas.
 */
export function Fold({ name, title, attention = false, onOpen, children }: FoldProps) {
  const [open, setOpen] = useState(attention);
  useEffect(() => {
    if (attention) setOpen(true);
  }, [attention]);
  return (
    <details
      className={`fold ${name}`}
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now === open) return;
        setOpen(now);
        if (now) onOpen?.();
      }}
    >
      <summary className="fold-row">
        <span>{title}</span>
        <Chevron />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/* ---------- rang de la semaine (§18.22) ---------- */

/** L'écart au top 5 ne se dit que s'il encourage : 10 points au plus. */
export const GAP_SHOWN_MAX = 10;

/**
 * Une ligne, en tête du partage, juste au-dessus du bouton : le rang, puis ce qui manque (ou la place
 * à défendre). Un argument pour partager, pas une sortie : du texte, sans lien. Hors classement : rien.
 * `low` : sous trois étoiles, le rang ne s'affiche que s'il flatte (top 10, §18.48), et sans l'écart.
 */
export function WeekLine({ week, low }: { week: WeekRank | null; low: boolean }) {
  const { t } = useT();
  const w = t.result.week;
  if (!week || (low && !flatteringRank(week.rank))) return null;
  const text = week.closed
    ? week.inTop5
      ? w.closedTop5(week.week)
      : w.closedLine(week.rank, week.total, week.week)
    : week.inTop5
      ? w.top5
      : !low && week.gapToTop5 <= GAP_SHOWN_MAX
        ? w.line(week.rank, week.total, week.gapToTop5)
        : w.rank(week.rank, week.total);
  return <p className="week-rank">{text}</p>;
}

/** « Voir le top de la semaine » : sous les liens du partage, quand la fiche est classée. */
function BoardLink() {
  const { t } = useT();
  return (
    <a className="link-alt out-board" href={`/#${BOARD_ID}`} onClick={toBoard}>
      {t.result.week.board}
    </a>
  );
}

/** L'ancre du top de la semaine, sur l'accueil (WeekBoard.tsx, WEEK_ANCHOR) : l'accueil y descend une fois posé. */
const BOARD_ID = "semaine";

/** Vers le top de la semaine : l'adresse garde son ancre, l'accueil attend sa mise en page pour y descendre. */
function toBoard(e: MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(`/#${BOARD_ID}`);
}

/* ---------- partage ---------- */

export type Shareable = { kind: "card"; card: CardData } | { kind: "comparison"; comparison: ComparisonData };

function idOf(s: Shareable) {
  return s.kind === "card" ? s.card.id : s.comparison.id;
}

/** Le statut le plus partageable : un négatif ou un écart d'abord, c'est là qu'est la blague. */
function bestStatus(card: CardData, lang: Lang): string | null {
  const order = ["gap", "negative", "special", "positive"];
  const sorted = [...card.statuses].sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
  return sorted[0] ? pick(sorted[0].label, lang) : null;
}

/** Ce que le texte de partage dit d'une fiche (lib/shareText.ts) ; le pari vient de ce navigateur. */
export function shareInput(item: Shareable, lang: Lang, rank: string | null): ShareInput {
  const plea = getPlea(idOf(item));
  // Un dossier à deux pièces se partage comme une fiche : sa fiche, sa note, et ses pièces (§18.36).
  const c = item.kind === "card" ? item.card : fileOf(item.comparison);
  const graded = usableGrid(c.grid);
  return {
    kind: "card",
    stars: starsFor(c.overall),
    level: pick(LEVEL_LABELS[starsFor(c.overall)], lang),
    overall: c.overall,
    sealed: !!c.sealed,
    graded,
    // « Point fort : niveau du code, 8/10. » : la ligne du recruteur, jamais l'école.
    strong: graded ? (recruiterRead(c, c.grid, lang)?.strong ?? null) : null,
    profile: c.profile ? pick(c.profile.label, lang) : null,
    // La trouvaille la plus forte (§18.26) prend la place du chef d'accusation.
    finding: c.findings?.[0] ? pick(c.findings[0].text, lang) : null,
    status: bestStatus(c, lang),
    secs: c.judgedInSeconds,
    rank,
    plea,
    ...(item.kind === "comparison" ? { exhibits: declaredLabel(item.comparison) } : {}),
  };
}

/* ---------- copie à la main ---------- */

/**
 * Le presse-papiers refusé (navigateurs intégrés de LinkedIn, d'Instagram) : le lien ou le texte
 * s'affiche dans le bloc de partage, sélectionné, pour un appui long. Un message éphémère ne se
 * laisse ni toucher ni copier. La barre du pouce passe par ici aussi : le bloc est le seul à l'afficher.
 */
interface Manual {
  id: string;
  kind: "link" | "text";
  value: string;
}
let manual: Manual | null = null;
const manualSubs = new Set<() => void>();

function askManual(next: Manual) {
  manual = next;
  manualSubs.forEach((f) => f());
  // Le bloc de partage vient à l'écran (depuis la barre du pouce, il est plus bas).
  window.setTimeout(() => document.querySelector(".after-block.out .out-manual")?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
}

function useManual(id: string): Manual | null {
  const m = useSyncExternalStore(
    (cb) => {
      manualSubs.add(cb);
      return () => manualSubs.delete(cb);
    },
    () => manual,
    () => null,
  );
  return m && m.id === id ? m : null;
}

/** Le champ en lecture seule, sélectionné d'office, et sa consigne. Le duel et la dénonciation s'en servent aussi. */
export function ManualCopy({ m }: { m: { kind: Manual["kind"] | "message"; value: string } }) {
  const { t } = useT();
  const ts = t.result.share;
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
      el.select();
      el.setSelectionRange(0, m.value.length);
    } catch {
      /* champ non sélectionnable : l'appui long reste possible */
    }
  }, [m]);
  const hold = m.kind === "link" ? ts.holdLink : m.kind === "text" ? ts.holdText : ts.holdMessage;
  const props = { ref: field, className: "out-manual-field", readOnly: true, value: m.value, "aria-label": hold };
  return (
    <div className="out-manual" role="status">
      {m.kind === "link" ? <input type="text" {...props} /> : <textarea rows={m.kind === "text" ? 6 : 4} {...props} />}
      <p>{hold}</p>
    </div>
  );
}

/** Ce qu'un bouton de partage sait d'une fiche : le bloc sous la fiche et la barre du pouce s'en servent. */
export function useSharing(item: Shareable, toast: (m: string) => void) {
  const { t, lang } = useT();
  const ts = t.result.share;
  const id = idOf(item);
  const url = shareUrl(id);
  const week = weekOf(id);
  // Le rang n'entre dans le texte que pendant sa semaine, et seulement s'il flatte (top 10) : « 7e cette semaine ».
  const rank = week && !week.closed && flatteringRank(week.rank) ? t.result.week.share(week.rank) : null;
  const input = shareInput(item, lang, rank);
  const named = item.kind === "card" ? item.card : fileOf(item.comparison);
  const filename = `azerit-${named.login ?? named.initials}.png`;
  // Sur téléphone, « Partager » ouvre la feuille du système. Sans elle (ordinateur, WebView Android), LinkedIn reste devant.
  const native = isTouch() && hasNativeShare();

  // L'image portrait se charge dès le montage : au clic, elle est déjà un fichier.
  const [file, setFile] = useState<File | null>(() => portraitFile(id));
  useEffect(() => {
    if (!native && !isMock()) return;
    let alive = true;
    void preloadPortrait(id, filename).then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, [id, filename, native]);

  /** `from` : « dock » quand le geste vient de la barre du pouce. */
  const track = (channel: string, from?: string) => api.track("card_shared", id, { channel, kind: item.kind, ...(from ? { from } : {}) });

  /** Geste direct : rien n'attend avant `navigator.share`. L'image part si elle est déjà là. */
  const share = (from?: string) => {
    void shareSheet({ title: "Azerit", text: shareLead(ts.words, input), url, file }).then((r) => {
      if (r === null) return;
      if (r === "copy_failed") return askManual({ id, kind: "link", value: url });
      if (r === "copy") toast(ts.copiedLink);
      track(r, from);
    });
  };

  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const textCopied = useTextCopied(id);
  /**
   * Au clic sur le lien LinkedIn. LinkedIn n'accepte pas de texte prérempli : il part dans le
   * presse-papier, dans le geste et avant que l'onglet s'ouvre (Safari refuse une copie tardive).
   */
  const onLinkedIn = (from?: string) => {
    const text = shareText(ts.words, input, url);
    void copyText(text).then((ok) => {
      // Copie refusée : le texte attend dans le bloc de partage, au retour de LinkedIn.
      if (!ok) return askManual({ id, kind: "text", value: text });
      markTextCopied(id);
      // La barre du pouce n'a pas la ligne d'aide : la confirmation y passe en message.
      if (from === "dock") toast(ts.copiedShort);
    });
    track("linkedin", from);
  };

  return { id, url, input, filename, native, file, track, share, liHref, onLinkedIn, textCopied };
}

export type Sharing = ReturnType<typeof useSharing>;

/** Le lien vise `target` pour ce clic (le navigateur suit l'adresse après les écouteurs), puis reprend `rest`. */
export function aimAt(a: HTMLAnchorElement, target: string, rest: string) {
  a.href = target;
  window.setTimeout(() => {
    a.href = rest;
  }, 0);
}

/**
 * LinkedIn : un vrai lien, qui s'ouvre même là où `window.open` est bloqué. Son libellé ne change
 * jamais (« Partager sur LinkedIn ») : la ligne d'aide sous le bouton dit où part le texte.
 *
 * Les bloqueurs de contenu masquent tout lien dont l'adresse est celle du partage LinkedIn
 * (listes « réseaux sociaux ») : le bouton principal disparaissait. Le lien porte donc l'adresse
 * de la fiche, et ne prend celle de LinkedIn que le temps du clic.
 */
function LinkedInLink({ kit, className, from }: { kit: Sharing; className: string; from?: string }) {
  const { t } = useT();
  const ts = t.result.share;
  return (
    <a
      className={`${className}${kit.textCopied ? " is-copied" : ""}`}
      href={kit.url}
      target="_blank"
      rel="noopener"
      onClick={(e) => {
        aimAt(e.currentTarget, kit.liHref, kit.url);
        kit.onLinkedIn(from);
      }}
      onAuxClick={(e) => aimAt(e.currentTarget, kit.liHref, kit.url)}
    >
      <IconLinkedIn />
      <span>{ts.linkedin}</span>
    </a>
  );
}

/** Le bouton principal : « Partager » sur téléphone, LinkedIn ailleurs. La barre du pouce a le même. */
export function ShareMain({ kit, className = "", from }: { kit: Sharing; className?: string; from?: string }) {
  const { t } = useT();
  if (kit.native)
    return (
      <button type="button" className={`pill pill-big ${className}`} onClick={() => kit.share(from)}>
        <IconShare />
        {t.result.share.native}
      </button>
    );
  return <LinkedInLink kit={kit} className={`pill pill-big ${className}`} from={from} />;
}

export function ShareBar({ item, toast }: { item: Shareable; toast: (m: string) => void }) {
  const { t } = useT();
  const ts = t.result.share;
  const kit = useSharing(item, toast);
  const { id, url, track } = kit;

  const manualCopy = useManual(id);

  const onCopy = async () => {
    if (await copyText(url)) toast(ts.copiedLink);
    else askManual({ id, kind: "link", value: url });
    track("copy");
  };

  return (
    <section className="after-block out" aria-labelledby="out-title">
      <h2 id="out-title">{ts.title}</h2>
      <WeekLine week={weekOf(id)} low={kit.input.stars < 3} />
      {/* Un bouton rose (« Partager » sur téléphone, LinkedIn ailleurs), LinkedIn en contour quand il passe second. */}
      <ShareMain kit={kit} className="out-main" />
      {kit.native && <LinkedInLink kit={kit} className="pill pill-ghost out-second" />}
      {/* En permanence, sous le bouton LinkedIn : où part le texte, avant comme après l'appui. */}
      <p className={`out-hint${kit.textCopied ? " is-copied" : ""}`} aria-live="polite">
        {ts.linkedinCopied}
      </p>
      {manualCopy && <ManualCopy m={manualCopy} />}
      {/* Le reste en liens : le lien, l'image, l'image pour story. X passe par la feuille de partage du téléphone. */}
      <div className="out-more">
        <button type="button" className="link-alt" onClick={onCopy}>
          {ts.copyShort}
        </button>
        <SaveImage kit={kit} toast={toast} />
        <SaveStory kit={kit} toast={toast} />
      </div>
      {weekOf(id) && <BoardLink />}
      <p className="out-keep">{ts.keep}</p>
    </section>
  );
}

/**
 * « Image pour story » : la même image en 9:16 (Instagram, TikTok), un lien à côté de
 * « Télécharger l'image », qui part comme elle. Sur téléphone, le fichier se charge
 * après le portrait, pour ne pas le retarder.
 */
function SaveStory({ kit, toast }: { kit: Sharing; toast: (m: string) => void }) {
  const { t } = useT();
  const ts = t.result.share;
  const { id, native } = kit;
  const filename = kit.filename.replace(/\.png$/, "-story.png");
  const [file, setFile] = useState<File | null>(() => imageFile(id, "story"));
  useEffect(() => {
    if (!native && !isMock()) return;
    let alive = true;
    void preloadPortrait(id, kit.filename)
      .then(() => preloadImage(id, "story", filename))
      .then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, [id, filename, kit.filename, native]);
  return <ImageAction kit={kit} toast={toast} file={file} src={isMock() ? null : images.story(id)} filename={filename} label={ts.storyShort} title={ts.story} channel="story" className="link-alt" />;
}

/** Une adresse `blob:` pour un fichier, rendue à la mémoire quand il change ou que le bloc part. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    let made: string;
    try {
      made = URL.createObjectURL(file);
    } catch {
      return;
    }
    setUrl(made);
    return () => {
      setUrl(null);
      URL.revokeObjectURL(made);
    };
  }, [file]);
  return url;
}

/**
 * « Télécharger l'image » : sur téléphone, l'image seule dans la feuille de partage ;
 * dans un navigateur intégré (LinkedIn, Instagram, Facebook), où `download` ne fait
 * rien, l'image en plein écran ; ailleurs, le téléchargement du navigateur.
 */
function SaveImage({ kit, toast }: { kit: Sharing; toast: (m: string) => void }) {
  const { t } = useT();
  return <ImageAction kit={kit} toast={toast} file={kit.file} src={isMock() ? null : images.portrait(kit.id)} filename={kit.filename} label={t.result.share.downloadShort} title={t.result.share.download} channel="download" className="link-alt" />;
}

interface ImageActionProps {
  kit: Sharing;
  toast: (m: string) => void;
  /** L'image préchargée (téléphone, démo), ou null. */
  file: File | null;
  /** L'adresse de l'image sur le serveur ; null en démo, où le carton de mock.ts la remplace. */
  src: string | null;
  filename: string;
  label: ReactNode;
  /** Le libellé entier, lu par les lecteurs d'écran (« Télécharger l'image ») quand l'écran dit « Image ». */
  title: string;
  /** Le canal de l'événement `card_shared`. */
  channel: string;
  className: string;
}

/** Une image de partage : en fichier dans la feuille de partage, en panneau dans un navigateur intégré, en téléchargement ailleurs. */
function ImageAction({ kit, toast, file, src: server, filename, label, title, channel, className }: ImageActionProps) {
  const { t } = useT();
  const ts = t.result.share;
  const { track } = kit;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // En démo, le serveur ne rend pas l'image : le carton de mock.ts, quand il est prêt.
  const demo = useObjectUrl(isMock() ? file : null);
  const src = isMock() ? demo : server;

  // Navigateur intégré d'abord (LinkedIn, Instagram) : la feuille de partage y reste en suspens hors iOS,
  // le panneau plein écran marche partout (appui long pour enregistrer).
  if (inAppBrowser(navigator.userAgent))
    return (
      <>
        <button
          type="button"
          className={className}
          aria-label={title}
          aria-haspopup="dialog"
          onClick={() => {
            if (!src) return toast(ts.downloadDemo);
            setOpen(true);
            track(channel);
          }}
        >
          {label}
        </button>
        {open && src && <ImagePanel src={src} onClose={close} />}
      </>
    );

  if (kit.native && canShareFile(file))
    return (
      <button type="button" className={className} aria-label={title} onClick={() => void shareFile(file).then((ok) => ok && track(channel))}>
        {label}
      </button>
    );

  return (
    <a
      className={className}
      aria-label={title}
      href={src ?? images.portrait(kit.id)}
      download={filename}
      onClick={(e) => {
        if (!src) {
          e.preventDefault();
          return toast(ts.downloadDemo);
        }
        track(channel);
      }}
    >
      {label}
    </a>
  );
}

/** L'image seule, sur tout l'écran : un appui long l'enregistre, là où rien ne se télécharge. */
function ImagePanel({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useT();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Le focus reste dans le panneau : Tab tourne entre ce qui s'y touche.
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])")];
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (!first || !last) return;
        if (e.shiftKey ? at === first || !panel.current.contains(at) : at === last || !panel.current.contains(at)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    // La page ne défile pas derrière le panneau.
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      before?.focus({ preventScroll: true });
    };
  }, [onClose]);
  return createPortal(
    <div ref={panel} className="out-panel" role="dialog" aria-modal="true" aria-label={t.result.share.download}>
      <button ref={closeBtn} type="button" className="out-panel-close" onClick={onClose} aria-label={t.common.close}>
        <IconClose />
      </button>
      <img src={src} alt={t.result.share.imageAlt} />
      <p>{t.result.share.holdToSave}</p>
    </div>,
    document.body,
  );
}

/* ---------- photo LinkedIn ---------- */

/**
 * Visible seulement si le serveur a LinkedIn, et à qui peut poser la photo :
 * le propriétaire connecté pour une fiche à pseudo GitHub quand la
 * revendication est active, sinon qui a créé la fiche (son jeton).
 */
export function LinkedInPhoto({ cardId, hasAvatar }: { cardId: string; hasAvatar: boolean }) {
  const { t } = useT();
  const l = t.result.linkedin;
  const token = tokens.get(cardId);
  const [cfg, setCfg] = useState<{ linkedin: boolean; claim: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  if (!cfg?.linkedin) return null;
  if (cfg.claim && hasGithub(cardId) ? !isMine(cardId) : !token) return null;
  return (
    <Fold name="personalize" title={t.result.rest.photo}>
      {!hasAvatar && <p>{l.noPhoto}</p>}
      <button type="button" className="pill pill-peach" onClick={() => api.startLinkedInPhoto(cardId, token)}>
        <IconLinkedIn />
        <span>{l.btn}</span>
      </button>
    </Fold>
  );
}

/* ---------- contester ---------- */

/**
 * « Fais appel » (§18.48) : une ligne d'humour, puis de vraies sorties. Qui ouvre ce pli se sent mal noté :
 * on lui dit d'où vient la note, comment elle bouge (la source qui manque, nommée), et sa fiche se supprime
 * d'ici, le seul endroit de la page où elle se supprime.
 */
export function Contest({ card, cardId, onDeleted }: { card: CardData; cardId: string; onDeleted: () => void }) {
  const { t, lang } = useT();
  const c = t.result.contest;
  const reduced = useReducedMotion();
  const [reply, setReply] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  // Le critère le plus faible de la note, nommé comme au dos (§18.52) ; pas un trait du recto, qui ne fait pas la note.
  const lowest = weakestCriterion(card.grid);
  // Une source manque-t-elle encore au dossier ? Son bloc ou son pli est alors dans la page.
  const SOURCE = ".after-block.add-source, details.fold.add-source";
  const [canAdd, setCanAdd] = useState(false);
  useEffect(() => setCanAdd(!!document.querySelector(SOURCE)), []);

  const toSource = () => {
    const el = document.querySelector<HTMLElement>(SOURCE);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    const target = el.querySelector<HTMLElement>("input, .fold-body button") ?? el;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const ask = () => {
    let next = Math.floor(Math.random() * c.replies.length);
    if (next === reply) next = (next + 1) % c.replies.length;
    setReply(next);
    setRound((r) => r + 1);
  };

  // Ouvrir la ligne, c'est appeler l'avocat : sa réponse est déjà là.
  return (
    <Fold name="contest" title={t.result.rest.contest} onOpen={() => reply === null && ask()}>
      {reply !== null && (
        <div className="var-panel" key={round} role="status">
          <p className="surtitre">{c.title}</p>
          <p className="var-text">{c.replies[reply]}</p>
          {lowest && <p className="var-hint">{c.lowest(cardT(lang).back.criteria[lowest.code], lowest.score)}</p>}
        </div>
      )}
      <p className="contest-real">{canAdd ? c.real(card.source === "github" ? c.realAdd.career : c.realAdd.code) : c.realNoSource}</p>
      <div className="contest-exits">
        {canAdd && (
          <button type="button" className="pill" onClick={toSource}>
            {c.addSource}
          </button>
        )}
        <button type="button" className="link-alt" onClick={ask}>
          {reply === null ? c.button : c.again}
        </button>
      </div>
      <DeleteCard cardId={cardId} onDeleted={onDeleted} />
    </Fold>
  );
}

/* ---------- ajouter l'autre source ---------- */

export function AddSource({ card }: { card: CardData }) {
  const { t } = useT();
  // Fiche LinkedIn seule (§18.24) : un seul appel, « Ajoute ton GitHub pour prouver ».
  if (declaredOf(card) === "linkedin") return card.linkedinUrl ? <ProveGithub linkedinUrl={card.linkedinUrl} /> : null;
  const fromGithub = card.source === "github";
  const copy = fromGithub ? t.result.addCv : t.result.addGithub;
  return (
    <Fold name="add-source" title={copy.title}>
      <p>{copy.text}</p>
      <button
        type="button"
        className="pill pill-peach"
        onClick={() => {
          setPrefill({ mode: "both", login: fromGithub ? card.login : undefined, tab: fromGithub ? "cv" : "github" });
          navigate("/");
        }}
      >
        {copy.btn}
      </button>
    </Fold>
  );
}

/* ---------- « C'est moi » : revendication par GitHub (§18.1) ---------- */

type Me = Awaited<ReturnType<typeof api.getMe>>;

/** Qui est connecté par GitHub ; relu quand `nonce` change (retour d'OAuth). */
export function useMe(nonce = 0) {
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    let alive = true;
    void api.getMe().then((m) => alive && setMe(m));
    return () => {
      alive = false;
    };
  }, [nonce]);
  return [me, setMe] as const;
}

const GhMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

interface ClaimProps {
  cardId: string;
  /** Pseudo GitHub de la fiche ; sans lui (fiche CV seule), rien à revendiquer. */
  login: string | undefined;
  /** Arrivée par un lien partagé ou une dénonciation : « Appeler mon avocat ». */
  lawyer: boolean;
  me: Me;
  onMe: (me: Me) => void;
  toast: (m: string) => void;
}

/** Caché tant que le serveur n'a pas l'OAuth GitHub (/api/config). */
export function Claim({ cardId, login, lawyer, me, onMe, toast }: ClaimProps) {
  const { t } = useT();
  const c = t.result.claim;
  const cfg = useAppConfig();
  const [busy, setBusy] = useState(false);
  if (!cfg?.claim || !login) return null;

  if (me && me.login === login.toLowerCase()) {
    const run = async (action: () => Promise<Me>, done: string) => {
      setBusy(true);
      try {
        onMe(await action());
        toast(done);
      } catch {
        toast(c.failed);
      } finally {
        setBusy(false);
      }
    };
    // Fiche masquée : la ligne s'ouvre d'elle-même, le bouton pour la rendre visible est là.
    return (
      <Fold name="claim is-owned" title={c.owned} attention={me.hidden}>
        <p className="claim-owned">
          <GhMark />
          <span className="claim-who">@{me.login}</span>
        </p>
        <div className="claim-actions">
          <button
            type="button"
            className="pill pill-ghost"
            disabled={busy}
            aria-pressed={me.hidden}
            onClick={() => run(() => api.setHidden(!me.hidden), me.hidden ? c.shownDone : c.hiddenDone)}
          >
            {me.hidden ? c.unhide : c.hide}
          </button>
          <button type="button" className="link-alt" disabled={busy} onClick={() => run(() => api.logout().then(() => null), c.loggedOut)}>
            {c.logout}
          </button>
        </div>
      </Fold>
    );
  }

  return (
    <Fold name="claim" title={lawyer ? c.kickerLawyer : c.kicker}>
      {/* Primes éteintes : rien sur la course ; une prime ouverte : la course en plus. */}
      <p>{lawyer ? c.textLawyer : cfg.primesOpen ? c.textPrimes : c.text}</p>
      <button type="button" className="pill pill-peach" onClick={() => api.startClaim(cardId, login)}>
        <GhMark />
        <span>{lawyer ? c.btnLawyer : c.btn}</span>
      </button>
    </Fold>
  );
}

/* ---------- email ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EmailForm({ cardId }: { cardId: string }) {
  const { t } = useT();
  const e = t.result.email;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error" | "invalid">("idle");

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setState("invalid");
      return;
    }
    setState("sending");
    try {
      // Le serveur enregistre lui-même l'événement card_email sur /api/email.
      await api.sendEmail(cardId, email.trim());
      setState("done");
    } catch {
      setState("error");
    }
  };

  // Le serveur n'accepte l'email que de qui a créé la fiche (jeton) ou du propriétaire connecté.
  if (!tokens.get(cardId) && !isMine(cardId)) return null;

  // Une adresse refusée ou un envoi raté : la ligne reste ouverte sur le message.
  return (
    <Fold name="email" title={t.result.rest.email} attention={state === "invalid" || state === "error"}>
      {state === "done" ? (
        <p className="email-done" role="status">
          <span aria-hidden>✓</span> {e.done}
        </p>
      ) : (
        <form className="email-form" onSubmit={submit} noValidate>
          <label htmlFor="email-input" className="sr-only">
            {e.label}
          </label>
          <input
            id="email-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={e.placeholder}
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              if (state === "invalid" || state === "error") setState("idle");
            }}
            aria-invalid={state === "invalid"}
            aria-describedby="email-note"
          />
          <button type="submit" className="pill pill-ghost" disabled={state === "sending"}>
            {state === "sending" ? e.sending : e.btn}
          </button>
        </form>
      )}
      {/* L'adresse gardée : la confirmation suffit, la note ne la redit pas. */}
      {state !== "done" && (
        <p id="email-note" className={`email-note${state === "invalid" || state === "error" ? " is-error" : ""}`} role={state === "invalid" || state === "error" ? "alert" : undefined}>
          {state === "invalid" ? e.invalid : state === "error" ? e.error : e.note}
        </p>
      )}
    </Fold>
  );
}

/* ---------- le bloc recruteur ---------- */

/** En fin de page, pour le visiteur comme pour qui a fait la fiche : « Vous recrutez ? », une phrase, une pilule. */
export function Hiring({ cardId }: { cardId: string | null }) {
  const { t } = useT();
  const c = t.result.cta;
  return (
    <section className="after-block hire" aria-labelledby="hire-title">
      <h2 id="hire-title">{c.title}</h2>
      <p>{c.text}</p>
      <a className="pill pill-ghost" href="https://azerit.tech" target="_blank" rel="noopener" onClick={() => api.track("cta_azerit_clicked", cardId, { from: "result" })}>
        {c.link}
        <span aria-hidden>↗</span>
      </a>
    </section>
  );
}

/* ---------- suppression ---------- */

export function DeleteCard({ cardId, onDeleted }: { cardId: string; onDeleted: () => void }) {
  const { t } = useT();
  const d = t.result.del;
  const token = tokens.get(cardId);
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "error">("idle");
  // Qui a créé la fiche (jeton), ou le propriétaire connecté de son pseudo GitHub (§11).
  if (!token && !isMine(cardId)) return null;

  const run = async () => {
    setStep("busy");
    try {
      await api.deleteCard(cardId, token);
      tokens.remove(cardId);
      onDeleted();
    } catch {
      setStep("error");
    }
  };

  return (
    <div className="delete-card">
      {step === "idle" && (
        <button type="button" className="link-danger" onClick={() => setStep("confirm")}>
          {d.link}
        </button>
      )}
      {(step === "confirm" || step === "busy") && (
        <span className="delete-confirm" role="group" aria-label={d.confirm}>
          <span>{d.confirm}</span>
          <button type="button" className="link-danger strong" onClick={run} disabled={step === "busy"}>
            {d.yes}
          </button>
          <button type="button" className="link-quiet" onClick={() => setStep("idle")}>
            {d.no}
          </button>
        </span>
      )}
      {step === "error" && (
        <span className="delete-error" role="alert">
          {d.error}
        </span>
      )}
    </div>
  );
}
