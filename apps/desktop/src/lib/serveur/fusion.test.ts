import { describe, expect, it } from "vitest";
import { egal, fusionner } from "./fusion";

const liste = (articles: { id: string; nom: string; pris: boolean }[], suivant = 10) => ({ schema: 1, suivant, listes: [{ id: "l1", nom: "Courses", reglement: null, articles }] });

describe("fusion des données entre appareils", () => {
  const base = liste([
    { id: "a1", nom: "Lait", pris: false },
    { id: "a2", nom: "Pain", pris: false },
  ]);

  it("garde les modifications des deux côtés sur des éléments différents", () => {
    const local = liste([
      { id: "a1", nom: "Lait", pris: true },
      { id: "a2", nom: "Pain", pris: false },
    ]);
    const distant = liste([
      { id: "a1", nom: "Lait", pris: false },
      { id: "a2", nom: "Pain", pris: true },
    ]);
    expect(fusionner(base, local, distant)).toEqual(
      liste([
        { id: "a1", nom: "Lait", pris: true },
        { id: "a2", nom: "Pain", pris: true },
      ]),
    );
  });

  it("garde un ajout d'un côté et une suppression de l'autre", () => {
    const local = liste([{ id: "a1", nom: "Lait", pris: false }]); // a2 retiré ici
    const distant = liste([...base.listes[0]!.articles, { id: "a3", nom: "Œufs", pris: false }], 11); // a3 ajouté ailleurs
    expect(fusionner(base, local, distant)).toEqual(liste([{ id: "a1", nom: "Lait", pris: false }, { id: "a3", nom: "Œufs", pris: false }], 11));
  });

  it("renumérote un élément créé des deux côtés avec le même identifiant", () => {
    const local = liste([...base.listes[0]!.articles, { id: "a10", nom: "Beurre", pris: false }], 11);
    const distant = liste([...base.listes[0]!.articles, { id: "a10", nom: "Riz", pris: false }], 11);
    const r = fusionner(base, local, distant) as ReturnType<typeof liste>;
    expect(r.listes[0]!.articles.map((a) => `${a.id}:${a.nom}`)).toEqual(["a1:Lait", "a2:Pain", "a10:Riz", "a11:Beurre"]);
    expect(r.suivant).toBe(12);
  });

  it("donne raison à cet appareil sur une vraie contradiction, et ne touche rien sans changement ailleurs", () => {
    const renomme = (nom: string) => ({ ...base, listes: [{ ...base.listes[0]!, nom }] });
    const local = renomme("Samedi");
    expect(fusionner(base, local, renomme("Dimanche"))).toEqual(local);
    expect(fusionner(base, local, base)).toBe(local);
    expect(fusionner(null, { a: 1 }, null)).toEqual({ a: 1 });
    expect(egal({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
  });
});
