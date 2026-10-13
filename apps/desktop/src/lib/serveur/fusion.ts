// Fusion à trois des données d'un plugin : ce que le serveur avait à la dernière lecture (base), ce que cet appareil veut
// écrire (local) et ce que le serveur a maintenant (distant), modifié entre-temps par un autre appareil ou un widget.
// Champ par champ et élément par élément (tableaux d'objets à `id`) : seules les modifications des deux côtés sur la
// même valeur se contredisent, et c'est alors cet appareil, le dernier à écrire, qui gagne.

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet => typeof v === "object" && v !== null && !Array.isArray(v);

export function egal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => egal(x, b[i]));
  if (estObjet(a) && estObjet(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && egal(a[k], b[k]));
  }
  return false;
}

type Id = string | number;
const avecIds = (t: unknown[]): t is (Objet & { id: Id })[] => {
  const vus = new Set<Id>();
  for (const e of t) {
    if (!estObjet(e) || (typeof e.id !== "string" && typeof e.id !== "number") || vus.has(e.id)) return false;
    vus.add(e.id);
  }
  return true;
};

/** Éléments ajoutés des deux côtés avec le même identifiant (compteur `suivant` avancé sur deux appareils). */
interface Collision {
  tableau: Objet[];
  element: Objet;
}

function fusion(base: unknown, local: unknown, distant: unknown, collisions: Collision[]): unknown {
  if (egal(local, distant)) return local;
  if (egal(base, local)) return distant;
  if (egal(base, distant)) return local;

  if (estObjet(local) && estObjet(distant)) {
    const b = estObjet(base) ? base : {};
    const res: Objet = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(distant)])) {
      const enL = Object.prototype.hasOwnProperty.call(local, k);
      const enD = Object.prototype.hasOwnProperty.call(distant, k);
      const enB = Object.prototype.hasOwnProperty.call(b, k);
      if (enL && enD) res[k] = fusion(b[k], local[k], distant[k], collisions);
      // Retiré d'un côté : on le garde seulement si l'autre côté l'a ajouté ou modifié.
      else if (enL) {
        if (!enB || !egal(b[k], local[k])) res[k] = local[k];
      } else if (!enB || !egal(b[k], distant[k])) res[k] = distant[k];
    }
    return res;
  }

  if (Array.isArray(local) && Array.isArray(distant) && avecIds(local) && avecIds(distant)) {
    const b = Array.isArray(base) && avecIds(base) ? base : [];
    const mb = new Map(b.map((e) => [e.id, e]));
    const ml = new Map(local.map((e) => [e.id, e]));
    const md = new Map(distant.map((e) => [e.id, e]));
    const res: Objet[] = [];
    for (const e of local) {
      const d = md.get(e.id);
      if (d && !mb.has(e.id) && !egal(d, e)) {
        // Même identifiant créé des deux côtés pour deux éléments différents : on garde les deux.
        res.push(d);
        collisions.push({ tableau: res, element: e });
      } else if (d) res.push(fusion(mb.get(e.id), e, d, collisions) as Objet);
      else if (!mb.has(e.id) || !egal(mb.get(e.id), e)) res.push(e);
    }
    for (const e of distant) if (!ml.has(e.id) && (!mb.has(e.id) || !egal(mb.get(e.id), e))) res.push(e);
    return res;
  }

  // Compteur avancé des deux côtés : le plus grand, pour ne jamais redonner un identifiant déjà pris.
  if (typeof local === "number" && typeof distant === "number" && typeof base === "number" && local > base && distant > base) return Math.max(local, distant);
  return local;
}

/**
 * Fusionne `local` dans `distant` en partant de `base`. Les éléments créés des deux côtés avec le même identifiant
 * `<lettres><numéro>` reçoivent un nouveau numéro pris sur le compteur `suivant` de la racine.
 */
export function fusionner(base: unknown, local: unknown, distant: unknown): unknown {
  const collisions: Collision[] = [];
  const res = fusion(base, local, distant, collisions);
  for (const c of collisions) {
    const m = typeof c.element.id === "string" ? /^([a-z]+)\d+$/i.exec(c.element.id) : null;
    // shortcut: le nouvel élément local garde ses données mais les références vers son ancien identifiant ne suivent pas ; assez rare (deux créations simultanées) pour s'en contenter.
    if (m && estObjet(res) && typeof res.suivant === "number") {
      c.tableau.push({ ...c.element, id: `${m[1]}${res.suivant}` });
      res.suivant += 1;
    } else {
      // Pas de compteur : deux éléments ne peuvent pas porter le même identifiant, celui de cet appareil gagne.
      const i = c.tableau.findIndex((e) => e.id === c.element.id);
      c.tableau[i] = c.element;
    }
  }
  return res;
}
