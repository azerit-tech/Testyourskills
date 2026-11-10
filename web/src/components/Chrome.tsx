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

/** Le bandeau de la saison, en aplat pêche au-dessus de l'accueil. */
export function SeasonBand() {
  const { t } = useT();
  return <p className="season-band">{t.home.season}</p>;
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
