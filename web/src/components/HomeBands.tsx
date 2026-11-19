// Les bandes sur l'accueil de qui a sa fiche (§18.89) : ses propres bandes, et où
// elles en sont, à côté du haut de chaque ligue. Les mots et les lignes de /bandes
// (§18.85), en plus court : trois bandes au tableau par ligue ; sans bande au
// tableau, trois bandes en formation. Rien à montrer, pas de section.
import { useEffect, useState } from "react";
import type { BandBoard, BandStanding, BandType } from "../../../shared/bands";
import { BAND_TYPES } from "../../../shared/bands";
import { useT } from "../i18n";
import { bandsApi, myBandIds, starLine } from "../lib/bands";
import { onLinkClick } from "../lib/router";
import { MineForming } from "./BandMine";
import { useBandShare } from "./BandPick";
import { BandLists } from "./BandLists";
import "./bands.css";

const SHOWN = 3;

export interface HomeBandsData {
  /** Sa bande dans chaque ligue, ou null. */
  mine: Record<BandType, BandStanding | null>;
  boards: Record<BandType, BandBoard>;
  /** Les étoiles que sa fiche rapporte, si le serveur les a dites. */
  stars: number | null;
}

/**
 * Ses bandes d'abord (le serveur les lit sur sa fiche, §18.82 ; à défaut, celles que ce
 * navigateur a retenues), puis le tableau de chaque ligue, demandé avec la sienne.
 */
async function load(cardId: string): Promise<HomeBandsData> {
  const mb = await bandsApi.mine(cardId);
  const kept = myBandIds();
  const ids: Record<BandType, string | null> = mb ? { ecole: mb.ecole?.id ?? null, boite: mb.boite?.id ?? null } : kept;
  const [ecole, boite] = await Promise.all(BAND_TYPES.map((k) => bandsApi.board(k, ids[k])));
  const boards = { ecole, boite } as Record<BandType, BandBoard>;
  const own = (k: BandType) => mb?.[k] ?? boards[k].extra ?? boards[k].entries.find((b) => b.id === ids[k]) ?? null;
  return { mine: { ecole: own("ecole"), boite: own("boite") }, boards, stars: mb?.stars ?? null };
}

export function HomeBands({ cardId, toast }: { cardId: string; toast: (msg: string) => void }) {
  const { t } = useT();
  const [data, setData] = useState<HomeBandsData | null>(null);
  const { share, native } = useBandShare(toast);

  useEffect(() => {
    let alive = true;
    load(cardId).then(
      (d) => alive && setData(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (!data) return null;
  // Le partage de sa bande en formation : celui de sa page ; sans page publique, celui de sous la fiche.
  const shareBand = (band: BandStanding) => {
    const text = band.hasPage || data.stars === null ? t.bands.page.shareText(band) : t.bands.pick.shareTextNoPage(starLine(data.stars), band.label, t.bands.rank(band));
    void share(band, text, cardId);
  };
  return <HomeBandsView data={data} onShare={shareBand} native={native} />;
}

/** Ce qu'une ligue montre sur l'accueil : sa bande, le haut du tableau, ou les bandes en formation. */
function leagueOf(data: HomeBandsData, type: BandType) {
  const own = data.mine[type];
  const board = data.boards[type];
  const top = board.entries.slice(0, SHOWN);
  const forming = top.length === 0 ? board.forming.filter((b) => b.id !== own?.id).slice(0, SHOWN) : [];
  return { own, top, forming, empty: !own && top.length === 0 && forming.length === 0 };
}

/** Les bandes connues, sans appel au serveur. */
export function HomeBandsView({ data, onShare, native }: { data: HomeBandsData; onShare: (band: BandStanding) => void; native: boolean }) {
  const { t } = useT();
  const tb = t.bands.board;
  const leagues = BAND_TYPES.map((type) => ({ type, ...leagueOf(data, type) })).filter((l) => !l.empty);
  if (leagues.length === 0) return null;

  return (
    <section className="board home-bands" aria-labelledby="home-bands-title">
      <h2 id="home-bands-title">{tb.title}</h2>
      <div className="home-bands-cols">
        {leagues.map(({ type, own, top, forming }) => (
          <div key={type} className="home-league">
            <h3 className="home-league-name">{t.bands.league[type]}</h3>
            {own && own.rank === null && <MineForming band={own} onShare={onShare} native={native} />}
            {/* le haut du tableau ; classée plus bas que les trois premières, sa ligne à part ; sans tableau, les bandes en formation */}
            <BandLists entries={top} lower={own && own.rank !== null && !top.some((b) => b.id === own.id) ? { tag: tb.yours, band: own } : null} forming={forming} mine={own?.id} />
          </div>
        ))}
      </div>
      <a className="link-alt bands-top-all" href="/bandes" onClick={(e) => onLinkClick(e, "/bandes")}>
        {t.bands.home.all}
      </a>
    </section>
  );
}
