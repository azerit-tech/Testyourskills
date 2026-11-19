// Le raisonnement des modèles qui raisonnent d'office (SPEC §18.32, §18.89) :
// coupé sur Haiku 5.x, au minimum sur GLM, et le repli si la coupure est refusée.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBudgetForTests } from "./budget";
import { callStructured, ChatHttpError, issueKinds, resetToolModeForTests, type StructuredCall } from "./client";
import { fakeClient } from "./testing";

const call = (model: string, client: StructuredCall<unknown>["client"]): StructuredCall<{ ok: true }> => ({
  label: "essai",
  name: "essai",
  model,
  system: "s",
  schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  userText: "u",
  maxTokens: 100,
  validate: () => ({ ok: true, value: { ok: true } }),
  client,
});

beforeEach(() => {
  resetBudgetForTests();
  resetToolModeForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("le raisonnement", () => {
  it("Haiku 5.5 : coupé", async () => {
    const { client, calls } = fakeClient([{}]);
    await callStructured(call("anthropic/claude-haiku-5.5", client));
    expect(calls[0]!.body.reasoning).toEqual({ effort: "none" });
    // La génération 5 de Claude refuse la température.
    expect(calls[0]!.body.temperature).toBeUndefined();
  });

  it("GLM 5.3 Flash : au minimum, il refuse qu'on le coupe", async () => {
    const { client, calls } = fakeClient([{}]);
    await callStructured(call("z-ai/glm-5.3-flash", client));
    expect(calls[0]!.body.reasoning).toEqual({ effort: "minimal" });
  });

  it("un modèle qui ne raisonne pas d'office : aucune consigne", async () => {
    const { client, calls } = fakeClient([{}]);
    await callStructured(call("anthropic/claude-haiku-4.5", client));
    expect(calls[0]!.body.reasoning).toBeUndefined();
  });

  it("la coupure refusée par le fournisseur : l'appel repart au minimum, et le modèle y reste", async () => {
    const { client, calls } = fakeClient([{ error: new ChatHttpError(400, "Reasoning is mandatory for this endpoint and cannot be disabled.") }, {}, {}]);
    const model = "anthropic/claude-haiku-5.5";
    expect(await callStructured(call(model, client))).toEqual({ ok: true });
    expect(calls.map((c) => c.body.reasoning?.effort)).toEqual(["none", "minimal"]);
    // Le repli garde le mode de sortie : ce n'est pas le schéma qui a été refusé.
    expect(calls[1]!.body.response_format?.type).toBe("json_schema");
    await callStructured(call(model, client));
    expect(calls[2]!.body.reasoning).toEqual({ effort: "minimal" });
  });

  it("une autre erreur 400 ne touche pas au raisonnement", async () => {
    const { client, calls } = fakeClient([{ error: new ChatHttpError(400, "bad request") }]);
    expect(await callStructured(call("anthropic/claude-haiku-5.5", client))).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("issueKinds", () => {
  it("dit la nature des refus, jamais leur texte", () => {
    expect(issueKinds(['"secret/repo" is not one of the repositories listed', 'evidence_file "a/b.ts" is not one of the files received for x', "missing a valid reading for x"])).toBe(
      "dépôt inconnu, fichier inconnu, lecture manquante",
    );
    expect(issueKinds(["the answer was not valid JSON"])).toBe("JSON");
    expect(issueKinds(["roles.0.title: Invalid input", "years_declared: Too big"])).toBe("schéma");
    expect(issueKinds([])).toBe("inconnue");
  });
});
