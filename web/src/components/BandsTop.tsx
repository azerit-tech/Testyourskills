// « Top des bandes » sur l'accueil (§18.38, §18.48) : une phrase qui dit pourquoi
// une bande, les premières écoles et les premières boîtes, une ligne chacune,
// puis le lien vers /bandes. Sans bande au tableau, pas de section.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BandsTop as Top } from "../../../shared/bands";
import { BAND_TYPES } from "../../../shared/bands";
import { useT } from "../i18n";
import { bandsApi } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import { BandRow } from "./BandRow";
import "./bands.css";

const SHOWN = 3;

export function BandsTop({ lead }: { lead?: ReactNode }) {
  const [top, setTop] = useState<Top | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void bandsApi.top().then((v) => alive && setTop(v));
    return () => {
      alive = false;
    };
  }, []);

  if (!top) return null;
  return <BandsTopView top={top} lead={lead} />;
}

/** Le tableau des bandes connues, sans appel au serveur. */
export function BandsTopView({ top, lead }: { top: Top; lead?: ReactNode }) {
  const { t } = useT();
  const th = t.bands.home;
  // Tant qu'aucune bande n'existe (le matin du lancement), l'accueil n'en parle pas.
  if (top.ecole.length === 0 && top.boite.length === 0) return null;

  return (
    <section className="board bands-top" aria-labelledby="bands-top-title">
      <h2 id="bands-top-title">{th.title}</h2>
      {lead && <p className="board-meta">{lead}</p>}
      <div className="bands-top-cols">
        {BAND_TYPES.map((type) =>
          top[type].length === 0 ? null : (
            <div key={type} className="board-top">
              <p className="board-tag">{t.bands.league[type]}</p>
              <ol className="board-list is-top">
                {top[type].slice(0, SHOWN).map((b) => (
                  <BandRow key={b.id} b={b} />
                ))}
              </ol>
            </div>
          ),
        )}
      </div>
      <a className="link-alt bands-top-all" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
        {th.all}
      </a>
    </section>
  );
}
