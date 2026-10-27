// Trajets (TomTom) : la configuration enregistrée sur cet appareil et l'appel au service. Seule l'interface hôte parle à TomTom ;
// un plugin demande (message `route`, permission `trajets`) sans jamais voir la clé. L'adresse de TomTom doit être autorisée par
// la distribution (`connect-src` de sa configuration Tauri).
import {
  CONFIG_TRAJETS_DEFAUT,
  departCourant,
  empreinteDomiciles,
  erreurHttp,
  lireAdresseTrouvee,
  lireConfigTrajets,
  lireCoordonnees,
  lirePosition,
  lireTrajet,
  nettoyerAdresse,
  RAYON_PROCHE_M,
  resoudreAdresse,
  urlGeocodage,
  urlRecherche,
  urlTrajet,
  type ConfigTrajets,
  type ResultatTrajet,
} from "./trajetsPur";
import { load, save } from "./storage";

export { departCourant, urlWaze, type ConfigTrajets, type Domicile, type ResultatTrajet } from "./trajetsPur";

export const configTrajets = (): ConfigTrajets => lireConfigTrajets(load("trajets", CONFIG_TRAJETS_DEFAUT));
export const enregistrerConfigTrajets = (c: ConfigTrajets): void => save("trajets", lireConfigTrajets(c));

async function json(url: string): Promise<{ statut: number; corps: unknown }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  } catch {
    return { statut: 0, corps: null };
  }
}

/** Les noms des domiciles (jamais leurs adresses) et leur empreinte, pour qu'un plugin choisisse un logement et sache quand recalculer. */
export function domicilesPourPlugin(): { domiciles: { nom: string; principal: boolean }[]; empreinte: string } {
  const c = configTrajets();
  return { domiciles: c.domiciles.map((d) => ({ nom: d.nom, principal: d.nom === c.principal })), empreinte: empreinteDomiciles(c) };
}

/** Ce qu'un plugin reçoit : le temps et la distance, jamais les adresses trouvées. */
export async function calculerTrajet(demande: { vers: string; depuis?: string; arriveeAvant?: number; departA?: number }, brute: ConfigTrajets = configTrajets()): Promise<ResultatTrajet> {
  const r = await calculerTrajetDetaille(demande, brute);
  return r.ok ? { ok: true, minutes: r.minutes, distanceKm: r.distanceKm } : r;
}

/** Les adresses que TomTom a trouvées aux deux bouts, pour que l'utilisateur voie s'il s'est trompé (Paramètres → Trajets). */
export type TrajetDetaille = ResultatTrajet & { depart?: string; arrivee?: string };

/** Temps de trajet en voiture entre deux adresses (départ : celui des réglages s'il n'est pas donné). Ne jette jamais. */
export async function calculerTrajetDetaille(demande: { vers: string; depuis?: string; arriveeAvant?: number; departA?: number }, brute: ConfigTrajets = configTrajets()): Promise<TrajetDetaille> {
  const config = lireConfigTrajets(brute);
  if (config.cle === "") return { ok: false, code: "non_configure", message: "Ajoutez votre clé TomTom dans Paramètres → Trajets et domiciles." };
  const depuis = resoudreAdresse(config, (demande.depuis ?? departCourant(config)).trim()).trim();
  const vers = resoudreAdresse(config, demande.vers.trim()).trim();
  if (depuis === "" || vers === "") return { ok: false, code: "non_configure", message: "Ajoutez votre domicile principal dans Paramètres → Trajets et domiciles." };
  let depart = "";
  let pa = lireCoordonnees(depuis);
  if (!pa) {
    const a = await json(urlGeocodage(config.cle, nettoyerAdresse(depuis), config.pays));
    if (a.statut !== 200) return erreurHttp(a.statut);
    pa = lirePosition(a.corps);
    depart = lireAdresseTrouvee(a.corps);
  }
  // L'arrivée : d'abord une recherche libre à moins de 150 km du départ (« Armar Anglet » est une entreprise, pas une adresse), puis le
  // géocodage dans tout le pays si rien n'est trouvé près.
  let b = await json(urlRecherche(config.cle, vers, config.pays, pa ?? undefined, pa ? RAYON_PROCHE_M : undefined));
  if (b.statut !== 200) return erreurHttp(b.statut);
  if (!lirePosition(b.corps)) {
    b = await json(urlGeocodage(config.cle, nettoyerAdresse(vers), config.pays, pa ?? undefined));
    if (b.statut !== 200) return erreurHttp(b.statut);
  }
  const pb = lirePosition(b.corps);
  const arrivee = lireAdresseTrouvee(b.corps);
  if (!pa) return { ok: false, code: "introuvable", message: `Adresse de départ introuvable : « ${depuis} ».` };
  if (!pb) return { ok: false, code: "introuvable", message: `Adresse introuvable : « ${vers} ».` };
  const t = await json(urlTrajet(config.cle, pa, pb, Date.now(), demande.arriveeAvant, config.sansPeage, demande.departA));
  if (t.statut !== 200) return erreurHttp(t.statut);
  const trajet = lireTrajet(t.corps);
  return trajet ? { ok: true, ...trajet, depart, arrivee } : { ok: false, code: "erreur", message: "TomTom n'a pas trouvé de trajet en voiture." };
}