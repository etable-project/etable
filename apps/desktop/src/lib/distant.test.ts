import { describe, expect, it } from "vitest";
import { corpsAppel, lireConfigDistant, lireReponse } from "./distantPur";

describe("service distant", () => {
  it("garde une configuration propre", () => {
    expect(lireConfigDistant({ url: " https://cerveau.ts.net/mcp ", jeton: " cv_abc " })).toEqual({ url: "https://cerveau.ts.net/mcp", jeton: "cv_abc" });
    expect(lireConfigDistant({ url: "http://pas-sur", jeton: "a b" })).toEqual({ url: "", jeton: "" });
    expect(lireConfigDistant(null)).toEqual({ url: "", jeton: "" });
  });

  it("forme l'appel d'un outil MCP", () => {
    expect(JSON.parse(corpsAppel("tasks_all", undefined, 3))).toEqual({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "tasks_all", arguments: {} } });
  });

  it("lit la réponse", () => {
    expect(lireReponse(200, { result: { content: [{ type: "text", text: "[1]" }], isError: false } })).toEqual({ ok: true, texte: "[1]" });
    expect(lireReponse(200, { result: { content: [{ type: "text", text: "droit refusé" }], isError: true } })).toMatchObject({ ok: false, code: "refuse" });
    expect(lireReponse(401, null)).toMatchObject({ ok: false, code: "refuse" });
    expect(lireReponse(0, null)).toMatchObject({ ok: false, code: "reseau" });
    expect(lireReponse(200, { error: { message: "outil inconnu" } })).toMatchObject({ ok: false, code: "erreur", message: "outil inconnu" });
  });
});
