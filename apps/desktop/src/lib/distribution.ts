// Ce qui change d'une distribution à l'autre (Quotidien, ERP, Etablink…) : lu à la compilation dans le fichier désigné par
// ETABLE_DISTRIBUTION (voir vite.config.ts), sinon les valeurs d'Établi. Lecture défensive : un champ absent ou invalide garde sa valeur d'origine.
import { THEME_TOKENS, type Theme } from "./themeTokens";

export interface Distribution {
  /** Nom affiché dans la colonne de gauche. */
  name: string;
  /** Entrée « Plugins » dans la colonne et la palette de commandes ; faux : les plugins se gèrent dans Paramètres seulement. */
  pluginsPage: boolean;
  /** Thèmes fixes de la distribution (ni import, ni copie) ; `null` : les thèmes d'Établi, que l'utilisateur peut importer. */
  themes: Theme[] | null;
  /** Dessin du logo (contenu d'un SVG, formes simples), ou `null` : celui d'Établi. Par défaut en trait `currentColor` sur un carré de la couleur d'accent. */
  logo: string | null;
  /** Le logo a ses propres couleurs et son propre fond (comme l'icône de l'application) : il est affiché tel quel, sans carré d'accent. */
  logoPlein: boolean;
  /** Repère du dessin du logo (« 0 0 24 24 » par défaut). */
  logoViewBox: string;
  /** Couleur de la pastille de la page Accueil (`null` : la pastille neutre d'Établi). */
  accueilCouleur: string | null;
  /** Ce que montre l'aperçu rapide : « favoris » (les pages favorites, comme une mini-app) ou « widgets » (le tableau de l'accueil, en lecture). */
  apercu: "favoris" | "widgets";
  /** Intelligence artificielle : l'utilisateur peut y saisir sa clé (Paramètres) et les plugins qui ont la permission « ia » peuvent l'utiliser. La distribution doit aussi autoriser l'adresse de Google dans la CSP. */
  ia: boolean;
  /** Trajets en voiture (clé TomTom de l'utilisateur dans Paramètres, permission `trajets` des plugins). La distribution doit autoriser l'adresse de TomTom dans la CSP. */
  trajets: boolean;
  /** Service distant (serveur MCP) que les plugins qui ont la permission `distant` peuvent appeler ; la clé se saisit dans Paramètres. La distribution doit autoriser son adresse dans la CSP. */
  distant: { nom: string; url: string } | null;
  /** Barre d'onglets : faux, l'application n'a qu'une page à la fois et la barre ne montre que le titre de la page. */
  tabs: boolean;
  /** Icônes propres à la distribution, par nom (« calendrier ») : un plugin de la distribution peut les donner à ses pages. Même forme que le logo, mais remplies (`currentColor`). */
  icons: Record<string, string>;
  /** Icônes posées telles quelles, sans pastille de couleur derrière (dessins en couleurs, façon émoji). */
  tuilesNues: boolean;
  /** Adresse (https) du fichier latest.json de la distribution : l'application Android y cherche une nouvelle version et ouvre le téléchargement de l'APK (ndroid.url). 
ull : pas de mise à jour sur Android. */
  androidUpdateUrl: string | null;
  /** Message rapide dans la colonne : un champ qui envoie le texte à un outil du service distant (`{ text }`). Colonne repliée :
   * un bouton qui ouvre la page de la conversation (« plugin/page »). Demande `distant`. */
  messageRapide: { titre: string; outil: string; page: string | null } | null;
  /** Page d'un plugin (« plugin/page ») qui sert d'accueil : l'entrée Accueil l'affiche, et elle n'est plus listée à part. */
  accueil: string | null;
  /** Colonne imposée : des groupes de pages (« plugin/page »), séparés par un espace, dans cet ordre ; les autres pages
   * n'y sont pas, et l'ordre ne se change plus à la souris. `null` : l'ordre choisi par l'utilisateur. */
  colonne: string[][] | null;
  /** Conversations listées dans la colonne, rangées par catégorie, avec « + Nouvelle » : `outil` (service distant) rend la
   * liste, `page` (« plugin/page ») les ouvre (données `conversation` : `{ id }`, ou `{ nouvelle: true }`). */
  conversations: { outil: string; page: string } | null;
}

export const DISTRIBUTION_DEFAUT: Distribution = { name: "Établi", pluginsPage: true, themes: null, logo: null, logoPlein: false, logoViewBox: "0 0 24 24", accueilCouleur: null, apercu: "favoris", ia: false, trajets: false, distant: null, tabs: true, icons: {}, tuilesNues: false, androidUpdateUrl: null, messageRapide: null, accueil: null, colonne: null, conversations: null };

const objet = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const COULEUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
/** Un logo ne contient que des formes SVG simples : aucun script, aucune image, aucun lien. */
const LOGO = /^(?:\s*<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^<>]*\/>\s*)+$/;

function lireTheme(brut: unknown): Theme | null {
  const t = objet(brut);
  const couleurs = objet(t?.colors);
  if (!t || !couleurs || typeof t.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(t.id) || typeof t.name !== "string" || t.name.trim() === "") return null;
  if (t.base !== "light" && t.base !== "dark") return null;
  const colors = {} as Theme["colors"];
  for (const jeton of THEME_TOKENS) {
    const v = couleurs[jeton];
    if (typeof v !== "string" || !COULEUR.test(v.trim())) return null;
    colors[jeton] = v.trim();
  }
  return { id: t.id, name: t.name.trim().slice(0, 40), author: typeof t.author === "string" ? t.author.slice(0, 60) : "", base: t.base, colors };
}

/** Un émoji seul (avec ses variantes et liaisons), à la place d'un dessin. */
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\u200d\ufe0f\u20e3]|\p{Emoji_Modifier}|\p{Extended_Pictographic}|\p{Regional_Indicator})*$/u;
export const estEmoji = (v: string): boolean => v.length <= 16 && EMOJI.test(v);

/** Au plus 40 icônes, au nom en minuscules, dont le dessin passe le même contrôle que le logo (ou un émoji seul). */
function lireIcones(brut: unknown): Record<string, string> {
  const o = objet(brut);
  const sortie: Record<string, string> = {};
  if (!o) return sortie;
  for (const [nom, dessin] of Object.entries(o).slice(0, 40)) {
    if (/^[a-z][a-z0-9-]{0,30}$/.test(nom) && typeof dessin === "string" && ((dessin.length <= 2000 && LOGO.test(dessin)) || estEmoji(dessin.trim()))) sortie[nom] = dessin.trim();
  }
  return sortie;
}

function lireDistant(brut: unknown): Distribution["distant"] {
  const o = objet(brut);
  if (!o || typeof o.url !== "string" || !/^https:\/\/[^\s]{1,300}$/.test(o.url.trim())) return null;
  return { nom: typeof o.nom === "string" && o.nom.trim() ? o.nom.trim().slice(0, 40) : "Service distant", url: o.url.trim() };
}

function lireMessageRapide(brut: unknown): Distribution["messageRapide"] {
  const o = objet(brut);
  if (!o || typeof o.outil !== "string" || !/^[a-z][a-z0-9_]{0,40}$/.test(o.outil)) return null;
  const page = typeof o.page === "string" && /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}$/.test(o.page) ? o.page : null;
  return { titre: typeof o.titre === "string" && o.titre.trim() ? o.titre.trim().slice(0, 40) : "Message", outil: o.outil, page };
}

const PAGE = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}$/;
const page = (v: unknown): string | null => (typeof v === "string" && PAGE.test(v) ? v : null);

function lireColonne(brut: unknown): Distribution["colonne"] {
  if (!Array.isArray(brut)) return null;
  const groupes = brut.slice(0, 10).map((g) => (Array.isArray(g) ? g.slice(0, 40).map(page).filter((p): p is string => p !== null) : [])).filter((g) => g.length);
  return groupes.length ? groupes : null;
}

function lireConversations(brut: unknown): Distribution["conversations"] {
  const o = objet(brut);
  const p = page(o?.page);
  return o && typeof o.outil === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(o.outil) && p ? { outil: o.outil, page: p } : null;
}

export function lireDistribution(brut: unknown): Distribution {
  const o = objet(brut);
  if (!o) return { ...DISTRIBUTION_DEFAUT };
  const themes = Array.isArray(o.themes) ? o.themes.map(lireTheme).filter((t): t is Theme => t !== null) : [];
  const ids = new Set(themes.map((t) => t.id));
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : DISTRIBUTION_DEFAUT.name,
    pluginsPage: o.pluginsPage !== false,
    // Au moins un thème clair ou sombre valable, sans doublon d'identifiant ; sinon les thèmes d'Établi.
    themes: themes.length > 0 && ids.size === themes.length ? themes : null,
    logo: typeof o.logo === "string" && o.logo.length <= 2000 && LOGO.test(o.logo) ? o.logo.trim() : null,
    logoPlein: o.logoPlein === true,
    logoViewBox: typeof o.logoViewBox === "string" && /^0 0 \d{1,4} \d{1,4}$/.test(o.logoViewBox) ? o.logoViewBox : DISTRIBUTION_DEFAUT.logoViewBox,
    accueilCouleur: typeof o.accueilCouleur === "string" && COULEUR.test(o.accueilCouleur.trim()) ? o.accueilCouleur.trim() : null,
    apercu: o.apercu === "widgets" ? "widgets" : "favoris",
    ia: o.ia === true,
    trajets: o.trajets === true,
    distant: lireDistant(o.distant),
    tabs: o.tabs !== false,
    icons: lireIcones(o.icons),
    tuilesNues: o.tuilesNues === true,
    messageRapide: lireMessageRapide(o.messageRapide),
    accueil: page(o.accueil),
    colonne: lireColonne(o.colonne),
    conversations: lireConversations(o.conversations),
    androidUpdateUrl: typeof o.androidUpdateUrl === "string" && /^https:\/\/[^\s]{1,300}$/.test(o.androidUpdateUrl.trim()) ? o.androidUpdateUrl.trim() : null,
  };
}

declare const __DISTRIBUTION__: unknown;

export const distribution: Distribution = lireDistribution(typeof __DISTRIBUTION__ === "undefined" ? undefined : __DISTRIBUTION__);