// Les logos qui mènent aux profils publics d'une personne fichée (§18.108) : LinkedIn,
// puis GitHub, dans un nouvel onglet. Rien que les sources que la règle permet
// (shared/profileLinks.ts) ; aucune : rien. Mats, monochromes, sans texte à côté :
// le nom de chaque lien est lu (« LinkedIn de Léa Martin »), jamais écrit.
// Le dessin est dans styles.css (.plinks).
import type { MouseEvent } from "react";
import { siGithub } from "simple-icons";
import type { ProfileLinks as Links } from "../../../shared/profileLinks";
import { hasLinks } from "../../../shared/profileLinks";
import { useT } from "../i18n";
import "./profileLinks.css";

/** Le « in » de LinkedIn (simple-icons ne l'a plus, à la demande de LinkedIn) : celui du partage (Icons.tsx). */
const LINKEDIN_PATH =
  "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z";

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** `who` : le nom de la personne tel que la ligne ou la page l'écrit (« @pseudo » sans nom). */
export function ProfileLinks({ links, who, className = "" }: { links: Links | null | undefined; who: string; className?: string }) {
  const { t } = useT();
  if (!hasLinks(links)) return null;
  const tp = t.profiles;
  // Un toucher sur un logo ne doit pas ouvrir la ligne ou retourner la fiche autour de lui.
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <span className={`plinks${className ? ` ${className}` : ""}`} role="group" aria-label={tp.group(who)}>
      {links.linkedin && (
        <a className="plink is-linkedin" href={links.linkedin} target="_blank" rel="noopener noreferrer" aria-label={tp.linkedin(who)} title={tp.linkedin(who)} onClick={stop}>
          <Glyph d={LINKEDIN_PATH} />
        </a>
      )}
      {links.github && (
        <a className="plink is-github" href={links.github} target="_blank" rel="noopener noreferrer" aria-label={tp.github(who)} title={tp.github(who)} onClick={stop}>
          <Glyph d={siGithub.path} />
        </a>
      )}
    </span>
  );
}
