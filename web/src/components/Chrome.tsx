// Bandeau de la saison, barre du haut, pied de page, choix de la langue (SPEC §18.48).
import { useEffect, useState } from "react";
import type { Lang } from "../../../shared/types";
import { useT } from "../i18n";
import { api, isMock } from "../lib/api";
import { onLinkClick, usePath } from "../lib/router";
import { seasonLine, useAppConfig } from "../lib/season";
import { MINE_EVENT, myCard } from "../lib/session";
import { useAccount } from "../lib/account";
import { AzeritMark, Brand } from "./Brand";

/** La langue en deux mots, « FR · EN » : l'active soulignée, chacune sur 44 px de zone tactile. */
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

/**
 * Le bandeau de la saison, en aplat pêche au-dessus de l'accueil, deux palmiers à chaque bout (§18.31).
 * Il n'existe que si une prime est ouverte, et c'est un lien vers /primes : sans geste à offrir, il se tait.
 */
export function SeasonBand() {
  const { t, lang } = useT();
  const cfg = useAppConfig();
  if (!cfg?.primesOpen) return null;
  // Les dates de data/season.json, servies par /api/config (lib/season.ts).
  const line = seasonLine(t.home.season, cfg.season ?? null, lang, Date.now(), cfg.interviews);
  if (!line) return null;
  const full = line.tail ? `${line.text}, ${line.tail}` : line.text;
  return (
    <a className="season-band" href="/primes" onClick={(e) => onLinkClick(e, "/primes")} aria-label={`${full}. ${t.chrome.seePrimes}`}>
      <Palm className="is-l" />
      <Palm className="is-l is-small" />
      {/* téléphone : ce qu'on gagne, sur une ligne ; le bureau ajoute jusqu'à quand */}
      <span className="season-text">
        {line.text}
        {line.tail && <span className="season-tail">, {line.tail}</span>}
      </span>
      <Palm className="is-r is-small" />
      <Palm className="is-r" />
    </a>
  );
}

/**
 * La barre du haut, sur l'encre : la marque, puis « Bandes », « Ma fiche » (seulement si une fiche
 * est en mémoire dans ce navigateur) et la langue.
 */
export function TopBar() {
  const { t } = useT();
  const path = usePath();
  // La barre se relit à chaque changement de page, et dès qu'une fiche entre en mémoire.
  const [, reread] = useState(0);
  useEffect(() => {
    const on = () => reread((n) => n + 1);
    window.addEventListener(MINE_EVENT, on);
    return () => window.removeEventListener(MINE_EVENT, on);
  }, []);
  // Connecté avec une fiche au compte (§18.85) : « Ma fiche » en pastille, avec son visage.
  const acct = useAccount();
  const mine = myCard();
  const mineHref = acct?.cardId ? `/c/${acct.cardId}` : mine ? `/c/${mine.id}` : null;
  const onBands = /^\/bandes(\/|$)/.test(path);
  return (
    <header className="topbar">
      <a href="/" className="topbar-brand" onClick={(e) => onLinkClick(e, "/")} aria-label={t.chrome.home}>
        <Brand />
      </a>
      <nav className="topbar-nav" aria-label={t.chrome.nav}>
        <a className="topbar-link" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")} aria-current={onBands ? "page" : undefined}>
          {t.chrome.bands}
        </a>
        {mineHref && acct?.cardId ? (
          <a className="topbar-link topbar-mine" href={mineHref} onClick={(e) => onLinkClick(e, mineHref)} aria-current={path === mineHref ? "page" : undefined}>
            <span className="topbar-face" aria-hidden>
              {acct.avatarUrl ? <img src={acct.avatarUrl} alt="" width={24} height={24} referrerPolicy="no-referrer" /> : (acct.initial ?? "★")}
            </span>
            {t.chrome.mine}
          </a>
        ) : (
          mineHref && (
            <a className="topbar-link" href={mineHref} onClick={(e) => onLinkClick(e, mineHref)} aria-current={path === mineHref ? "page" : undefined}>
              {t.chrome.mine}
            </a>
          )
        )}
      </nav>
      <div className="topbar-right">
        {isMock() && <span className="demo-pill">{t.common.demo}</span>}
        <LangToggle />
      </div>
    </header>
  );
}

/**
 * Le pied de page : qui fait le site, en une phrase, et azerit.tech ; puis les liens du site
 * (primes et règlement seulement quand ils sont ouverts), la vie privée et les crédits.
 */
export function Footer() {
  const { t, lang } = useT();
  const cfg = useAppConfig();
  const path = usePath();
  const privacy = lang === "fr" ? "/confidentialite" : "/privacy";
  const inner: [string, string][] = [["/bandes", t.chrome.bands]];
  if (cfg?.primesListed) inner.push(["/primes", t.chrome.primes]);
  if (cfg?.rulesPublished) inner.push(["/reglement", t.chrome.rules]);
  inner.push([privacy, t.footer.privacy], ["/credits", t.chrome.credits]);
  return (
    <footer className="footer">
      <div className="footer-in">
        <p className="footer-sign">
          <AzeritMark size={16} className="footer-mark" />
          <span>
            {t.chrome.sign}{" "}
            <a className="footer-azerit" href="https://azerit.tech" target="_blank" rel="noopener" onClick={() => api.track("cta_azerit_clicked", null, { from: "footer" })}>
              azerit.tech<span aria-hidden> ↗</span>
            </a>
          </span>
        </p>
        <nav className="footer-links" aria-label={t.chrome.nav}>
          {inner.map(([href, label]) => (
            // la page en cours, soulignée comme dans la barre du haut
            <a key={href} href={href} onClick={(e) => onLinkClick(e, href)} aria-current={path === href ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
