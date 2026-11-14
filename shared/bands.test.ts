import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import scoring from "../data/scoring.json";
import { BAND_ID_RE, bandHasPage, cleanCompanyLabel, companyBand, companyCheck, companyKey, isBlockedBand, matchSchool, schoolById, schoolList, searchSchools } from "./bands";

describe("écoles des bandes (§18.38)", () => {
  it("des ids uniques, au bon format, et aucun rang du barème", () => {
    const list = schoolList();
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
    for (const s of list) expect(s.id, s.id).toMatch(BAND_ID_RE);
    const raw = readFileSync(new URL("../data/bands.json", import.meta.url), "utf8");
    expect(raw).not.toMatch(/"tier"|aiMaxTier/);
    for (const s of list) expect(Object.keys(s).sort()).toEqual(["id", "label"]);
  });

  it("chaque école du barème a sa bande", () => {
    for (const e of scoring.cv.TEC.school.list) expect(matchSchool(e.school), e.school).not.toBeNull();
  });

  it("un nom lu sur LinkedIn ou un CV donne sa bande, les campus avant leur famille", () => {
    const cases: [string, string][] = [
      ["CentraleSupélec", "centralesupelec"],
      ["École Centrale Paris", "centralesupelec"],
      ["Centrale Méditerranée", "centrale-mediterranee"],
      ["INSA Lyon", "insa-lyon"],
      ["INSA de Toulouse", "insa-toulouse"],
      ["INSA Centre Val de Loire", "insa-cvl"],
      ["Institut National des Sciences Appliquées de Lyon", "insa-autres"],
      ["INSAT", "insat"],
      ["Télécom SudParis", "telecom-sudparis"],
      ["Télécom Paris", "telecom-paris"],
      ["Mines Saint-Étienne", "mines-saint-etienne"],
      ["MINES ParisTech", "mines-paris"],
      ["Mines Albi", "imt-mines-albi"],
      ["École 42", "ecole-42"],
      ["42 Paris", "ecole-42"],
      ["Epitech Paris", "epitech"],
      ["ENSEEIHT", "enseeiht"],
      ["École polytechnique", "polytechnique"],
      ["Polytech Lyon", "polytech"],
      ["Polytechnique Montréal", "polymtl"],
      ["Conservatoire national des arts et métiers", "cnam"],
      ["Arts et Métiers ParisTech", "arts-et-metiers"],
      ["Le Wagon", "le-wagon"],
      ["ETH Zürich", "eth-zurich"],
      ["Université Claude Bernard Lyon 1", "lyon-1"],
    ];
    for (const [name, id] of cases) expect(matchSchool(name)?.id, name).toBe(id);
  });

  it("hors liste, rien", () => {
    for (const name of ["", "   ", "Université de nulle part", "Lycée Henri IV", undefined, null]) expect(matchSchool(name)).toBeNull();
  });

  it("schoolById ne connaît que la liste", () => {
    expect(schoolById("epitech")).toEqual({ type: "ecole", id: "epitech", label: "Epitech" });
    expect(schoolById("nope")).toBeNull();
  });

  it("la recherche trouve par le libellé ou par le motif", () => {
    expect(searchSchools("centrale").map((s) => s.id)).toContain("centralesupelec");
    expect(searchSchools("supelec").map((s) => s.id)).toContain("centralesupelec");
    expect(searchSchools("n7").map((s) => s.id)).toContain("enseeiht");
    expect(searchSchools("epi").map((s) => s.id).slice(0, 2)).toEqual(["epitech", "epita"]);
    expect(searchSchools("")).toEqual([]);
    expect(searchSchools("a").length).toBeLessThanOrEqual(8);
  });
});

describe("boîtes des bandes (§18.38)", () => {
  it("casse, accents et forme juridique ne font qu'une bande", () => {
    for (const name of ["Doctolib", "DOCTOLIB", "Doctolib SAS", "Doctolib S.A.S.", "doctolib, sas", "  Doctolib  "]) {
      expect(companyBand(name), name).toMatchObject({ type: "boite", id: "doctolib" });
    }
    expect(companyBand("Doctolib SAS")?.label).toBe("Doctolib");
    expect(companyBand("Qonto, SA")).toMatchObject({ id: "qonto", label: "Qonto" });
    expect(companyBand("Alan S.A.")).toMatchObject({ id: "alan" });
    expect(companyBand("Datadog Inc.")).toMatchObject({ id: "datadog", label: "Datadog" });
    expect(companyBand("Groupe Renault")).toMatchObject({ id: "renault" });
    expect(companyBand("The Walt Disney Company")).toMatchObject({ id: "walt-disney" });
    expect(companyBand("Société Générale")).toMatchObject({ id: "societe-generale" });
  });

  it("la table d'alias : un nom, une bande", () => {
    expect(companyBand("Facebook")).toEqual({ type: "boite", id: "meta", label: "Meta" });
    expect(companyBand("Meta")).toEqual({ type: "boite", id: "meta", label: "Meta" });
    expect(companyBand("AWS")).toMatchObject({ id: "amazon", label: "Amazon" });
    expect(companyBand("BNP Paribas")).toMatchObject({ id: "bnp-paribas" });
    expect(companyBand("bnpp")).toMatchObject({ id: "bnp-paribas" });
    expect(companyBand("BackMarket")).toMatchObject({ id: "back-market", label: "Back Market" });
    expect(companyBand("Thales Group")).toMatchObject({ id: "thales", label: "Thales" });
    expect(companyBand("Mistral")).toMatchObject({ id: "mistral-ai" });
  });

  it("freelance, indépendant, étudiant, stealth, sans emploi : pas une bande", () => {
    const none = [
      "Freelance",
      "Freelancer",
      "free-lance",
      "Indépendant",
      "Indépendante",
      "Independent consultant",
      "Consultant indépendant",
      "Self-employed",
      "Auto-entrepreneur",
      "Micro-entrepreneur",
      "Étudiant",
      "Étudiante à Epitech",
      "Student",
      "Stealth",
      "Stealth Startup",
      "Stealth mode AI",
      "Sans emploi",
      "Unemployed",
      "En recherche d'emploi",
      "Open to work",
      "Retraité",
      "Confidentiel",
      "Moi",
      "N/A",
      "-",
      "",
      "   ",
    ];
    for (const name of none) expect(companyBand(name), name).toBeNull();
    expect(companyBand(null)).toBeNull();
    expect(companyBand(undefined)).toBeNull();
  });

  it("une forme juridique seule reste un nom ; un nom trop long est refusé", () => {
    expect(companyKey("SAS")).toBe("sas");
    expect(companyBand("x".repeat(81))).toBeNull();
    expect(companyBand("A".repeat(80))?.id.length).toBeLessThanOrEqual(60);
  });

  it("l'id d'une boîte suit le format des adresses", () => {
    for (const name of ["Ça Marche & Cie", "L'Oréal", "3DS Outscale", "AT&T", "Mc Kinsey & Company"]) {
      const b = companyBand(name);
      expect(b, name).not.toBeNull();
      expect(b!.id, name).toMatch(BAND_ID_RE);
    }
  });
});

describe("le nom libre d'une boîte : refus et nettoyage", () => {
  it("une insulte ou un terme haineux, même déguisé : refusé", () => {
    for (const name of ["Connard", "connards & co", "Bande de salopes", "Enculés SAS", "3nculé", "fuuuuck", "F U C K", "s4l0pe", "Nazi Corp", "Sale Arabe", "Hitler Industries", "Ta gueule", "white power inc"]) {
      expect(companyCheck(name), name).toEqual({ refused: "word" });
    }
  });

  it("de vraies boîtes passent, même proches d'un mot refusé", () => {
    for (const name of ["Cockpit Labs", "Scunthorpe Steel", "Spice Group", "Niger Telecom", "Salopette Studio", "Pornic Plage", "Faguo", "Connexion", "Computer Lab", "Unique", "Violette", "Ecole 42 Partners"]) {
      expect(companyCheck(name), name).toHaveProperty("ref");
    }
  });

  it("une adresse, un @ ou un numéro : refusé", () => {
    for (const name of ["@doctolib", "jean@dupont.fr", "www.example.org", "https://x.y", "monsite.com", "06 12 34 56 78", "+33612345678", "12 rue de la Paix", "4 bis avenue Foch"]) {
      expect(companyCheck(name), name).toEqual({ refused: "contact" });
    }
    expect(companyCheck("3DS Outscale")).toHaveProperty("ref");
    expect(companyCheck("360Learning")).toHaveProperty("ref");
  });

  it("vide, freelance ou trop long : pas une bande", () => {
    expect(companyCheck("Freelance")).toEqual({ refused: "none" });
    expect(companyCheck("")).toEqual({ refused: "none" });
    expect(companyCheck("x".repeat(81))).toEqual({ refused: "none" });
  });

  it("le libellé est nettoyé : espaces, casse, ni emoji ni ponctuation décorative", () => {
    expect(cleanCompanyLabel("  Doctolib   SAS  ")).toBe("Doctolib");
    expect(cleanCompanyLabel("🚀 Qonto 🚀")).toBe("Qonto");
    expect(cleanCompanyLabel("★★ ALAN ★★")).toBe("ALAN");
    expect(cleanCompanyLabel("BNP PARIBAS CARDIF")).toBe("BNP Paribas Cardif");
    expect(cleanCompanyLabel("IBM")).toBe("IBM");
    expect(cleanCompanyLabel("doctolib")).toBe("Doctolib");
    expect(cleanCompanyLabel("leBonCoin")).toBe("leBonCoin");
    expect(cleanCompanyLabel("Ça Marche & Cie!!!")).toBe("Ça Marche");
    expect(cleanCompanyLabel("Ça Marche!!! Studio")).toBe("Ça Marche Studio");
    expect(cleanCompanyLabel("~~~Datadog~~~ ###")).toBe("Datadog");
    expect(cleanCompanyLabel("L'Oréal")).toBe("L'Oréal");
    expect(cleanCompanyLabel("Ledger ---- Paris")).toBe("Ledger - Paris");
    expect(companyBand("🔥 la super boîte 🔥")).toEqual({ type: "boite", id: "la-super-boite", label: "La super boîte" });
  });

  it("une bande fermée, ou dont le nom est refusé, est bloquée ; une école de la liste non", () => {
    expect(isBlockedBand("boite", "connard-corp")).toBe(true);
    expect(isBlockedBand("boite", "doctolib")).toBe(false);
    expect(isBlockedBand("boite", "doctolib", "Doctolib connard")).toBe(true);
    expect(isBlockedBand("ecole", "epitech")).toBe(false);
  });

  it("une page publique : toute école, toute boîte d'alias, une boîte au nom libre à trois dossiers", () => {
    expect(bandHasPage("ecole", "epitech", 0)).toBe(true);
    expect(bandHasPage("boite", "meta", 1)).toBe(true);
    expect(bandHasPage("boite", "doctolib", 2)).toBe(false);
    expect(bandHasPage("boite", "doctolib", 3)).toBe(true);
  });
});
