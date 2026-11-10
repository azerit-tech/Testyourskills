import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import example from "../../../data/employers.example.json";
import { CV_OUTPUT_SCHEMA } from "../ai/readCv";
import { EMPLOYERS_ENV, highBarEmployer, highBarEmployers, loadHighBarEmployers, parseEmployers, setHighBarEmployersForTests } from "./employers";

const EXAMPLE_PATH = new URL("../../../data/employers.example.json", import.meta.url).pathname;

afterEach(() => setHighBarEmployersForTests(null));

describe("employeurs à forte barre d'embauche (§18.37)", () => {
  it("l'exemple du dépôt se lit, avec ses noms inventés", () => {
    const list = loadHighBarEmployers({ [EMPLOYERS_ENV]: EXAMPLE_PATH });
    expect(list.source).toBe(EXAMPLE_PATH);
    expect(list.employers.map((e) => e.name)).toEqual(["Fictiva Labs", "Orbe Quantique", "Nimbus Atelier"]);
    expect(parseEmployers(example)).toEqual(list.employers);
  });

  it("un nom de la liste, une de ses écritures, ou suivi d'un mot ; jamais un morceau de mot", () => {
    const list = loadHighBarEmployers({ [EMPLOYERS_ENV]: EXAMPLE_PATH });
    expect(highBarEmployer("Fictiva Labs", list)).toBe("Fictiva Labs");
    expect(highBarEmployer("FICTIVA", list)).toBe("Fictiva Labs");
    expect(highBarEmployer("Fictiva Labs · Paris", list)).toBe("Fictiva Labs");
    expect(highBarEmployer("orbe-quantique sas", list)).toBe("Orbe Quantique");
    expect(highBarEmployer("Nimbus Atelier", list)).toBe("Nimbus Atelier");
    expect(highBarEmployer("Fictivania", list)).toBeNull();
    expect(highBarEmployer("Les amis de Fictiva", list)).toBeNull();
    expect(highBarEmployer("Nimbus", list)).toBeNull();
    expect(highBarEmployer("", list)).toBeNull();
  });

  it("sans fichier : liste vide, aucun avertissement, rien ne plante", () => {
    const warn = vi.fn();
    expect(loadHighBarEmployers({}, undefined, warn)).toEqual({ employers: [], source: null });
    expect(loadHighBarEmployers({ [EMPLOYERS_ENV]: "  " }, undefined, warn)).toEqual({ employers: [], source: null });
    expect(warn).not.toHaveBeenCalled();
    // La liste du processus de test : aucune variable, donc vide.
    expect(highBarEmployers().employers).toEqual([]);
    expect(highBarEmployer("Fictiva Labs")).toBeNull();
  });

  it("fichier absent, illisible ou vide : liste vide et un avertissement, sans lever", () => {
    const warn = vi.fn();
    expect(loadHighBarEmployers({ [EMPLOYERS_ENV]: "/nulle/part/employers.json" }, undefined, warn).employers).toEqual([]);
    expect(loadHighBarEmployers({ [EMPLOYERS_ENV]: "x.json" }, () => "{pas du json", warn).employers).toEqual([]);
    expect(loadHighBarEmployers({ [EMPLOYERS_ENV]: "x.json" }, () => '{"employers":[{"name":""},{"aliases":["x"]},3]}', warn).employers).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("l'IA ne peut pas rendre ce rang : seule la liste le donne", () => {
    // Le schéma de lecture n'a aucune valeur de ce genre…
    expect(JSON.stringify(CV_OUTPUT_SCHEMA)).not.toMatch(/high.?bar|forte.?barre/i);
    // … et la liste ne regarde que le nom de l'employeur.
    setHighBarEmployersForTests(loadHighBarEmployers({ [EMPLOYERS_ENV]: EXAMPLE_PATH }));
    expect(highBarEmployer("Fictiva Labs")).toBe("Fictiva Labs");
    expect(highBarEmployer("Startup Inconnue")).toBeNull();
  });

  it("le dépôt ne garde que l'exemple, et la variable est documentée sans valeur", () => {
    const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    expect(env).toMatch(/^HIGH_BAR_EMPLOYERS_FILE=$/m);
    const ignore = readFileSync(new URL("../../../.gitignore", import.meta.url), "utf8");
    expect(ignore).toMatch(/^data\/employers\.json$/m);
  });
});
