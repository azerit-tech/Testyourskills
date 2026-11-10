// Bandeau de la saison, barre du haut, pied de page, sélecteur de langue.
import type { Lang } from "../../../shared/types";
import { useT } from "../i18n";
import { api, isMock } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { Brand } from "./Brand";

export function LangToggle() {
  const { lang, setLang, t } = useT();
  const opts: Lang[] = ["fr", "en"];
  return (
    <div className="lang-toggle" role="group" aria-label={t.common.langLabel}>
      {opts.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function SkipLink() {
  const { t } = useT();
  return (
    <a className="skip-link" href="#main">
      {t.common.skipToContent}
    </a>
  );
}

/** Un palmier ton sur ton : un tronc qui penche, six palmes, en aplat. */
const PALM =
  "M14.2 44C14.6 35 15.4 25 16.4 13.2L18 13.4C17.4 25 16.9 35 16.8 44Z" +
  "M17.2 12.6C12.5 9.4 6.5 9.6 1.5 14.8C6.8 12.2 11.6 12.4 16.8 14Z" +
  "M17.2 12.4C14 6.6 9 4.2 3.4 4.6C8.6 6.2 12.6 8.8 16.4 13.4Z" +
  "M17.4 12.4C17.8 7.4 19.8 3.6 23.4 1.4C21 4.8 19.4 8.6 18.4 13Z" +
  "M17.6 12.6C21.6 7.4 26.4 6 31 7.8C26.4 8 22.2 10.2 18.2 13.8Z" +
  "M17.8 13C22.6 11.6 27.6 13.6 30.6 19.6C27 15.8 22.6 14.6 17.8 14.6Z" +
  "M16.8 13.4C13 13.2 9 16 7.2 21.4C10 17.6 13.4 15.4 17 14.8Z";

function Palm({ className }: { className: string }) {
  return (
    <svg className={`season-palm ${className}`} viewBox="0 0 32 44" aria-hidden focusable="false">
      <path d={PALM} />
    </svg>
  );
}

/** Le bandeau de la saison, en aplat pêche au-dessus de l'accueil, deux palmiers à chaque bout (§18.31). */
export function SeasonBand() {
  const { t } = useT();
  return (
    <p className="season-band">
      <Palm className="is-l" />
      <Palm className="is-l is-small" />
      <span className="season-text">{t.home.season}</span>
      <Palm className="is-r is-small" />
      <Palm className="is-r" />
    </p>
  );
}

/** La barre du haut, sur l'encre, au-dessus de la couverture de l'accueil (§18.31) comme ailleurs. */
export function TopBar() {
  const { t } = useT();
  return (
    <header className="topbar">
      <a href="/" className="topbar-brand" onClick={(e) => onLinkClick(e, "/")} aria-label="Testyourskills">
        <Brand />
      </a>
      <div className="topbar-right">
        {isMock() && <span className="demo-pill">{t.common.demo}</span>}
        <LangToggle />
      </div>
    </header>
  );
}

export function Footer() {
  const { t, lang } = useT();
  const privacy = lang === "fr" ? "/confidentialite" : "/privacy";
  return (
    <footer className="footer">
      <nav className="footer-links">
        <a href="https://azerit.tech" target="_blank" rel="noopener" onClick={() => api.track("cta_azerit_clicked", null, { from: "footer" })}>
          azerit.tech
        </a>
        <a href={privacy} onClick={(e) => onLinkClick(e, privacy)}>
          {t.footer.privacy}
        </a>
        <a href="/3d/CREDITS.txt" target="_blank" rel="noopener">
          {t.footer.credits3d}
        </a>
      </nav>
    </footer>
  );
}
