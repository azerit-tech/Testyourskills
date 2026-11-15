// La page d'erreur du site (SPEC §18.48, « Erreurs ») : une seule mise en page,
// dans l'univers. Le cadre de toise de la couverture avec la silhouette au
// point d'interrogation, un tampon incliné, un titre à la taille d'un bloc, un
// bouton pleine largeur et, au besoin, un lien dessous. Toujours une sortie
// utile, jamais une impasse.
//
// Les gabarits prêts à poser : <NotFound /> (page inconnue), <CardNotFound />,
// <BandNotFound />, <PrimeNotFound />, et <Unreachable /> quand le serveur ne
// répond pas (jamais « introuvable » : « Réessayer »). Avec `bare`, le panneau
// seul, à poser dans son propre <main>.
import { useT } from "../i18n";
import { onLinkClick } from "../lib/router";

export type ErrorStamp = "none" | "down" | "crash";

export interface ErrorAction {
  label: string;
  /** Un lien du site ; sans lui, un bouton. */
  href?: string;
  onClick?: () => void;
}

export interface ErrorPanelProps {
  /** Le tampon : introuvable, injoignable, interrompu. */
  stamp: ErrorStamp;
  title: string;
  text: string;
  /** Le bouton principal, pleine largeur : la sortie utile. */
  action: ErrorAction;
  /** Un lien d'appoint, dessous. */
  alt?: ErrorAction;
}

function Action({ a, className }: { a: ErrorAction; className: string }) {
  if (a.href) {
    const href = a.href;
    return (
      <a
        className={className}
        href={href}
        onClick={(e) => {
          a.onClick?.();
          onLinkClick(e, href);
        }}
      >
        {a.label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={a.onClick}>
      {a.label}
    </button>
  );
}

/** Le panneau seul : la toise, le tampon, le titre, la phrase, la sortie. */
export function ErrorPanel({ stamp, title, text, action, alt }: ErrorPanelProps) {
  const { t } = useT();
  const te = t.pages.error;
  return (
    <div className="err" role={stamp === "none" ? undefined : "alert"}>
      {/* le dessin de la case « ta place » de la couverture (styles.css, .cover-face) */}
      <div className="err-frame" aria-hidden>
        <span className="cover-face">
          <svg className="cover-face-shape" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
            <circle cx="50" cy="42" r="19" />
            <path d="M8 100c0-27 18-44 42-44s42 17 42 44z" />
          </svg>
          <span className="cover-face-mark">?</span>
          <span className="cover-plate">
            <b>{te.plate[stamp]}</b>
            <i>{te.plateSub}</i>
          </span>
        </span>
        <span className={`err-stamp is-${stamp}`}>{te.stamp[stamp]}</span>
      </div>
      <h1 className="t-block">{title}</h1>
      <p className="err-text">{text}</p>
      <Action a={action} className="btn-primary err-action" />
      {alt && <Action a={alt} className="link-alt" />}
    </div>
  );
}

interface PageProps extends ErrorPanelProps {
  /** Le panneau seul, sans <main> : pour une page qui a déjà le sien. */
  bare?: boolean;
}

export function ErrorPage({ bare, ...panel }: PageProps) {
  if (bare) return <ErrorPanel {...panel} />;
  return (
    <main className="page page-error" id="main">
      <ErrorPanel {...panel} />
    </main>
  );
}

interface Preset {
  bare?: boolean;
}

/** Le serveur ne répond pas (réseau, 5xx, délai) : « Réessayer » recharge la page. */
export function Unreachable({ bare }: Preset) {
  const { t } = useT();
  const d = t.pages.error.down;
  return <ErrorPage bare={bare} stamp="down" title={d.title} text={d.text} action={{ label: d.retry, onClick: () => window.location.reload() }} alt={{ label: d.home, href: "/" }} />;
}

/** Une adresse qui ne mène nulle part. */
export function NotFound({ bare }: Preset) {
  const { t } = useT();
  const p = t.pages.error.page;
  return <ErrorPage bare={bare} stamp="none" title={p.title} text={p.text} action={{ label: p.action, href: "/" }} />;
}

/** Une fiche qui n'existe pas, ou plus. `onMake` : avant de partir vers l'accueil (ex. vider le préremplissage). */
export function CardNotFound({ bare, onMake }: Preset & { onMake?: () => void }) {
  const { t } = useT();
  const c = t.pages.error.card;
  return <ErrorPage bare={bare} stamp="none" title={c.title} text={c.text} action={{ label: c.action, href: "/", onClick: onMake }} />;
}

/** Une bande qui n'est pas au tableau : la monter, ou voir les autres. */
export function BandNotFound({ bare }: Preset) {
  const { t } = useT();
  const b = t.pages.error.band;
  return <ErrorPage bare={bare} stamp="none" title={b.title} text={b.text} action={{ label: b.action, href: "/" }} alt={{ label: b.alt, href: "/bandes" }} />;
}

/** Une prime inconnue : les autres primes si la saison en porte, sinon l'accueil. */
export function PrimeNotFound({ bare, listed }: Preset & { listed: boolean }) {
  const { t } = useT();
  const p = t.pages.error.prime;
  if (!listed) return <ErrorPage bare={bare} stamp="none" title={p.title} text={p.text} action={{ label: t.pages.error.page.action, href: "/" }} />;
  return <ErrorPage bare={bare} stamp="none" title={p.title} text={p.text} action={{ label: p.action, href: "/primes" }} alt={{ label: p.alt, href: "/" }} />;
}
