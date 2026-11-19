// Un moteur figé pour les tests du pipeline seul (sans l'API) : fiches de
// shared/fixtures.ts, aucune attente, et le journal des appels dans leur ordre
// de départ. Chaque module se remplace à la demande (`over`).

import { FIXTURES } from "../../../shared/fixtures";
import type { CvReading } from "../../../shared/readings";
import type { CardData } from "../../../shared/types";
import type { CardBody, Deps } from "../pipeline";
import { fakeDossier } from "./fakeDossier";

export const READING: CvReading = {
  language: "fr",
  position: "FS",
  full_name: "Camille Ardent",
  years_declared: 7,
  seniority_claimed: "senior",
  roles: [],
  technos_listed: ["react"],
  technos_described: ["react"],
  tests_ci_review_mentions: [],
  projects_with_dated_outcome: 1,
  writing_quality: 3,
  is_dev_profile: true,
  title_mentions_ai: false,
  describes_ai_project: false,
  school_name: "",
  school_tier: "none",
};

function body(card: CardData): CardBody {
  const { id: _id, createdAt: _c, ...rest } = card;
  return rest;
}

export const FILES = [{ repo: "api", activity: 3, files: [{ path: "src/a.ts", content: "export const a = 1;\n" }] }];

export function fakeEngine(over: Partial<Deps> = {}) {
  /** Les modules appelés, dans l'ordre où ils ont démarré. */
  const calls: string[] = [];
  const base: Deps = {
    async collectGithub(login) {
      return { login, profile: { login } };
    },
    async pickFilesForReading() {
      return FILES;
    },
    async readCode() {
      return { readings: [], ai_status: null };
    },
    aiAvailable: () => true,
    scoreGithub(facts, _ai, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.gold), login: (facts as { login: string }).login, lang, judgedInSeconds };
    },
    async extractPdfText() {
      return { text: "Camille Ardent, développeuse.", pages: 1 };
    },
    cvTextCounts: () => ({ words: 80, pages: 1, buzzwords: {}, buzzwordsPer100: 0, passionCount: 0 }),
    async readCv() {
      return READING;
    },
    scoreCv(_r, _c, { lang, judgedInSeconds }) {
      return { ...body(FIXTURES.cv), lang, judgedInSeconds };
    },
    scoreDossier(declared, github, o) {
      return fakeDossier(deps, declared, github, o);
    },
    async renderImage() {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    },
  };
  const merged = { ...base, ...over };
  const logged = <K extends keyof Deps>(name: K): Deps[K] =>
    ((...args: unknown[]) => {
      calls.push(name);
      return (merged[name] as (...a: unknown[]) => unknown)(...args);
    }) as Deps[K];
  const deps: Deps = {
    ...merged,
    collectGithub: logged("collectGithub"),
    pickFilesForReading: logged("pickFilesForReading"),
    readCode: logged("readCode"),
    readCv: logged("readCv"),
    scoreGithub: logged("scoreGithub"),
    scoreCv: logged("scoreCv"),
    scoreDossier: logged("scoreDossier"),
  };
  return { deps, calls };
}

/** Une promesse qu'on résout à la main, pour ordonner un test. */
export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
