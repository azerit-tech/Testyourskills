// Banc de la poursuite (§18.33), en dev seulement : /chase.html, page à part
// comme la galerie (gallery.html), hors du build de production (seul
// index.html y entre). Paramètres :
//   ?stars=1..6     le niveau (défaut 6)
//   &profile=<id>   le décor et sa lumière (défaut arsonist ; sans profil : default)
//   &t=<secondes>   image figée à cet instant
//   &lang=fr|en
//   &player=1       le vrai lecteur (Chase.tsx) et ses phases, comme sur la fiche ;
//                   sinon une boucle simple sur l'image pure. window.__chase.seek/hold
//                   marche dans les deux cas.
// ?mock=1 est accepté et sans effet : rien ici n'appelle l'API.
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { FIXTURES } from "../../shared/fixtures";
import type { CardData, Lang } from "../../shared/types";
import { ChaseFrame, chasePlan } from "../../shared/chase";
import { Chase } from "./components/Chase";
import type { Phase } from "./components/Reveal";
import { LangProvider } from "./i18n";
import { watchGestures } from "./lib/audio";
import "./styles.css";
import "./card/fonts.css";

const q = new URLSearchParams(window.location.search);
const OVERALL = [0, 22, 38, 52, 67, 82, 94];
const stars = Math.min(6, Math.max(1, Number(q.get("stars") ?? 6) || 6));
const profileId = q.get("profile") ?? "arsonist";
const lang = (q.get("lang") === "en" ? "en" : "fr") as Lang;
const frozen = q.get("t");
const base = FIXTURES.silver;
const card: CardData = {
  ...base,
  id: `dev-${profileId}-${stars}`,
  overall: OVERALL[stars],
  profile: profileId === "none" ? undefined : { ...base.profile!, id: profileId },
};

function useSize() {
  const [s, setS] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setS({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return s;
}

/** L'image pure en boucle (ou figée) : de quoi régler le dessin. */
function Loop() {
  const plan = useMemo(() => chasePlan(card), []);
  const { w, h } = useSize();
  const [t, setT] = useState(frozen !== null ? Number(frozen) : 0);
  useEffect(() => {
    const c = { base: t, since: performance.now() / 1000, held: frozen !== null };
    let raf = 0;
    const tick = () => {
      if (!c.held) {
        let v = c.base + performance.now() / 1000 - c.since;
        if (v > plan.duration + 1.2) {
          c.base = 0;
          c.since = performance.now() / 1000;
          v = 0;
        }
        setT(v);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.__chase = {
      plan,
      seek(v: number) {
        c.base = v;
        c.since = performance.now() / 1000;
        setT(v);
      },
      hold(on: boolean) {
        if (!on) {
          c.since = performance.now() / 1000;
        } else {
          c.base = c.base + performance.now() / 1000 - c.since;
        }
        c.held = on;
      },
    };
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <ChaseFrame t={t} plan={plan} width={w} height={h} lang={lang} />
    </div>
  );
}

/** Le vrai lecteur, avec les phases de la fiche ; recommence 1,5 s après la fin. */
function Player() {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  useEffect(() => {
    if (phase !== "ready") return;
    const id = window.setTimeout(() => setPhase("playing"), 700);
    return () => window.clearTimeout(id);
  }, [phase, run]);
  useEffect(() => {
    if (phase !== "done") return;
    const id = window.setTimeout(() => {
      setPhase("ready");
      setRun((r) => r + 1);
    }, 1500);
    return () => window.clearTimeout(id);
  }, [phase]);
  return (
    <>
      <p style={{ position: "fixed", inset: "45% 0 auto", textAlign: "center", color: "#fff9cb", font: "600 14px Outfit" }}>la fiche se pose ici · {phase}</p>
      {phase !== "done" && (
        <Chase
          key={run}
          card={card}
          lang={lang}
          double={false}
          phase={phase}
          onHandoff={() => setPhase("handoff")}
          onDone={() => setPhase("done")}
          onTap={() => setPhase("done")}
        />
      )}
    </>
  );
}

watchGestures();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>{q.get("player") === "1" ? <Player /> : <Loop />}</LangProvider>
  </StrictMode>,
);
