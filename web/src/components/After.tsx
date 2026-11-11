// Tout ce qui vient sous la carte (§6.4), dans l'ordre de la spec.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CardData, ComparisonData, Lang, WeekRank } from "../../../shared/types";
import { declaredOf, STAT_CODES, starsFor } from "../../../shared/types";
import { myVerdict } from "../../../shared/compareText";
import { usableGrid } from "../../../shared/gridText";
import { recruiterRead } from "../../../shared/recruiterLine";
import { pick, useT } from "../i18n";
import { api, hasGithub, images, isMine, isMock, tokens, weekOf } from "../lib/api";
import { navigate } from "../lib/router";
import { getPlea } from "../lib/plea";
import { setPrefill } from "../lib/session";
import { shareLead, shareText, shareTextX, type ShareInput } from "../lib/shareText";
import { canShareFile, hasNativeShare, imageFile, inAppBrowser, markTextCopied, portraitFile, preloadImage, preloadPortrait, shareFile, shareSheet, useTextCopied } from "../lib/sharing";
import { copyText, isTouch, shareUrl } from "../lib/util";
import { IconClose, IconDownload, IconLink, IconLinkedIn, IconShare, IconX } from "./Icons";
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

/** Une ligne, en tête de l'après-fiche : le rang, puis ce qui manque (ou la place à défendre). Hors classement : rien. */
function WeekLine({ week }: { week: WeekRank | null }) {
  const { t } = useT();
  const w = t.result.week;
  if (!week) return null;
  const text = week.closed
    ? week.inTop5
      ? w.closedTop5(week.week)
      : w.closedLine(week.rank, week.total, week.week)
    : week.inTop5
      ? w.top5
      : w.line(week.rank, week.total, week.gapToTop5);
  const [head, ...rest] = text.split(" · ");
  return (
    <p className="week-rank" role="status">
      <span>{head}</span>
      {rest.length > 0 && <span className="week-rank-next">{rest.join(" · ")}</span>}
    </p>
  );
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
  if (item.kind === "card") {
    const c = item.card;
    const graded = usableGrid(c.grid);
    return {
      kind: "card",
      stars: starsFor(c.overall),
      overall: c.overall,
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
    };
  }
  const cmp = item.comparison;
  // Le profil de la fiche GitHub : après la comparaison, c'est lui qui porte l'écart (Faussaire).
  const profile = cmp.github.profile ?? cmp.cv.profile;
  // La note du dossier et ses étoiles en tête (§18.37) ; une comparaison d'avant la grille garde celles de la fiche GitHub.
  const kase = usableGrid(cmp.grid) ? cmp.grid.overall : null;
  return {
    kind: "comparison",
    stars: starsFor(kase ?? cmp.github.overall),
    src: declaredOf(cmp) === "linkedin" ? "LinkedIn" : "CV",
    declared: cmp.cv.overall,
    github: cmp.github.overall,
    case: kase,
    profile: profile ? pick(profile.label, lang) : null,
    headline: myVerdict(cmp, lang),
    rank,
    plea,
  };
}

/** Ce qu'un bouton de partage sait d'une fiche : le bloc sous la fiche et la barre du pouce s'en servent. */
export function useSharing(item: Shareable, toast: (m: string) => void) {
  const { t, lang } = useT();
  const ts = t.result.share;
  const id = idOf(item);
  const url = shareUrl(id);
  const week = weekOf(id);
  // Le rang n'entre dans le texte que pendant sa semaine : « 7e cette semaine ».
  const rank = week && !week.closed ? t.result.week.share(week.rank) : null;
  const input = shareInput(item, lang, rank);
  const filename = `testyourskills-${item.kind === "card" ? item.card.login ?? item.card.initials : "comparaison"}.png`;
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
    void shareSheet({ title: "Testyourskills", text: shareLead(ts.words, input), url, file }).then((r) => {
      if (r === null) return;
      if (r === "copy_failed") return toast(url);
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
    void copyText(shareText(ts.words, input, url)).then((ok) => ok && markTextCopied(id));
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
 * LinkedIn : un vrai lien, qui s'ouvre même là où `window.open` est bloqué. Son libellé garde
 * « Texte copié » : on le lit au retour sur l'onglet, pas dans un message déjà parti.
 *
 * Les bloqueurs de contenu masquent tout lien dont l'adresse est celle du partage LinkedIn
 * (listes « réseaux sociaux ») : le bouton principal disparaissait. Le lien porte donc l'adresse
 * de la fiche, et ne prend celle de LinkedIn que le temps du clic.
 */
function LinkedInLink({ kit, className, from, short = false }: { kit: Sharing; className: string; from?: string; short?: boolean }) {
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
      <span aria-live="polite">{kit.textCopied ? (short ? ts.copiedShort : ts.linkedinCopied) : ts.linkedin}</span>
    </a>
  );
}

/** Le bouton principal : « Partager » sur téléphone, LinkedIn ailleurs. La barre du pouce a le même. */
export function ShareMain({ kit, className = "", from, short }: { kit: Sharing; className?: string; from?: string; short?: boolean }) {
  const { t } = useT();
  if (kit.native)
    return (
      <button type="button" className={`pill pill-big ${className}`} onClick={() => kit.share(from)}>
        <IconShare />
        {t.result.share.native}
      </button>
    );
  return <LinkedInLink kit={kit} className={`pill pill-big ${className}`} from={from} short={short} />;
}

export function ShareBar({ item, toast }: { item: Shareable; toast: (m: string) => void }) {
  const { t } = useT();
  const ts = t.result.share;
  const kit = useSharing(item, toast);
  const { id, url, track } = kit;

  const onCopy = async () => {
    const ok = await copyText(url);
    toast(ok ? ts.copiedLink : url);
    track("copy");
  };

  const xHref = `https://x.com/intent/post?text=${encodeURIComponent(shareTextX(ts.words, kit.input))}&url=${encodeURIComponent(url)}`;

  return (
    <section className="after-block out" aria-labelledby="out-title">
      <WeekLine week={weekOf(id)} />
      <h2 id="out-title">{ts.title}</h2>
      <ShareMain kit={kit} className="out-main" />
      {/* Trois boutons secondaires au plus. Sur téléphone, X passe par la feuille de partage. */}
      {kit.native && <LinkedInLink kit={kit} className="pill pill-ghost out-second" />}
      <div className="out-more">
        {!kit.native && (
          <button
            type="button"
            className="pill pill-ghost"
            onClick={() => {
              window.open(xHref, "_blank", "noopener");
              track("x");
            }}
          >
            <IconX />
            {ts.x}
          </button>
        )}
        <button type="button" className="pill pill-ghost" onClick={onCopy}>
          <IconLink />
          {ts.copy}
        </button>
        <SaveImage kit={kit} toast={toast} />
      </div>
      <SaveStory kit={kit} toast={toast} />
    </section>
  );
}

/**
 * « Format story » : la même image en 9:16 (Instagram, TikTok), une action discrète sous
 * les boutons, qui part comme « Télécharger l'image ». Sur téléphone, le fichier se charge
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
  return <ImageAction kit={kit} toast={toast} file={file} src={isMock() ? null : images.story(id)} filename={filename} label={ts.story} channel="story" className="link-quiet out-story" />;
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
  const label = (
    <>
      <IconDownload />
      {t.result.share.download}
    </>
  );
  return <ImageAction kit={kit} toast={toast} file={kit.file} src={isMock() ? null : images.portrait(kit.id)} filename={kit.filename} label={label} channel="download" className="pill pill-ghost" />;
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
  /** Le canal de l'événement `card_shared`. */
  channel: string;
  className: string;
}

/** Une image de partage : en fichier dans la feuille de partage, en panneau dans un navigateur intégré, en téléchargement ailleurs. */
function ImageAction({ kit, toast, file, src: server, filename, label, channel, className }: ImageActionProps) {
  const { t } = useT();
  const ts = t.result.share;
  const { track } = kit;
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // En démo, le serveur ne rend pas l'image : le carton de mock.ts, quand il est prêt.
  const demo = useObjectUrl(isMock() ? file : null);
  const src = isMock() ? demo : server;

  if (kit.native && canShareFile(file))
    return (
      <button type="button" className={className} onClick={() => void shareFile(file).then((ok) => ok && track(channel))}>
        {label}
      </button>
    );

  if (inAppBrowser(navigator.userAgent))
    return (
      <>
        <button
          type="button"
          className={className}
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

  return (
    <a
      className={className}
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
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
    <div className="out-panel" role="dialog" aria-modal="true" aria-label={t.result.share.download}>
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

/* ---------- pièces à conviction ---------- */

/** Ce que la fiche ne dit pas : la peine, ce que veut dire chaque sigle, et le poids de chacun.
 * Les valeurs et les barres sont déjà sur la fiche : on ne les répète pas. */
function WhyCard({ card, withSentence }: { card: CardData; withSentence: boolean }) {
  const { t, lang } = useT();
  const sentence = withSentence ? card.sentence : undefined;
  return (
    <>
      {/* La peine et la caution (§18.2) */}
      {sentence && (
        <p className="why-sentence">
          <span>{pick(sentence.label, lang)}</span>
          {sentence.bail && <span className="why-bail">{pick(sentence.bail, lang)}</span>}
        </p>
      )}
      <dl className="why-legend">
        {STAT_CODES.map((code) => (
          <div key={code} className={code === "BUZZ" ? "is-buzz" : undefined}>
            <dt>{code}</dt>
            <dd>
              <b>{t.stats[code].name}</b> {t.stats[code].what}
            </dd>
          </div>
        ))}
      </dl>
      <p className="why-formula">{usableGrid(card.grid) ? t.result.why.gridLine : t.result.why.overallLine}</p>
    </>
  );
}

export function Why({ item, withSentence = true }: { item: Shareable; withSentence?: boolean }) {
  const { t } = useT();
  const [side, setSide] = useState<"cv" | "github">("github");
  return (
    <Fold name="why" title={t.result.rest.why}>
      {item.kind === "comparison" && (
        <div className="seg" role="tablist" aria-label={t.compare.switchLabel}>
          <button type="button" role="tab" aria-selected={side === "cv"} onClick={() => setSide("cv")}>
            {declaredOf(item.comparison) === "linkedin" ? t.result.why.tabLinkedin : t.result.why.tabCv}
          </button>
          <button type="button" role="tab" aria-selected={side === "github"} onClick={() => setSide("github")}>
            {t.result.why.tabGithub}
          </button>
        </div>
      )}
      <WhyCard card={item.kind === "card" ? item.card : side === "cv" ? item.comparison.cv : item.comparison.github} withSentence={withSentence} />
    </Fold>
  );
}

/* ---------- contester ---------- */

export function Contest({ card }: { card: CardData }) {
  const { t } = useT();
  const c = t.result.contest;
  const [reply, setReply] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const lowest = card.stats.filter((s) => s.code !== "BUZZ").sort((a, b) => a.value - b.value)[0];

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
          {lowest && <p className="var-hint">{c.lowest(lowest.code, lowest.value)}</p>}
        </div>
      )}
      <button type="button" className="pill pill-ghost" onClick={ask}>
        {reply === null ? c.button : c.again}
      </button>
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
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.getConfig().then((cfg) => alive && setEnabled(cfg.claim));
    return () => {
      alive = false;
    };
  }, []);
  if (!enabled || !login) return null;

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
      <p>{lawyer ? c.textLawyer : c.text}</p>
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
      <p id="email-note" className={`email-note${state === "invalid" || state === "error" ? " is-error" : ""}`} role={state === "invalid" || state === "error" ? "alert" : undefined}>
        {state === "invalid" ? e.invalid : state === "error" ? e.error : e.note}
      </p>
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
