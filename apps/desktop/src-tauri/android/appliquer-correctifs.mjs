// Applique au projet Android généré par `tauri android init` les deux correctifs du moteur (docs/26) :
//  1. le pont natif n'est ouvert qu'à l'origine de l'application, jamais aux cadres des plugins (MainActivity.kt) ;
//  2. les permissions d'alarme exacte, que le plugin de notifications ne déclare pas.
// Échoue si quoi que ce soit manque : mieux vaut ne pas produire d'APK que d'en produire un au pont ouvert.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const projet = join(ici, "..", "gen", "android");
const principal = join(projet, "app", "src", "main");
const echec = (message) => {
  console.error(`appliquer-correctifs : ${message}`);
  process.exit(1);
};
if (!existsSync(principal)) echec(`projet Android introuvable (${principal}) : lancez d'abord « tauri android init ».`);

// 1. MainActivity.kt : on garde le paquet que Tauri a tiré de l'identifiant de l'application.
const trouver = (dossier) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      const trouve = trouver(chemin);
      if (trouve) return trouve;
    } else if (nom === "MainActivity.kt") return chemin;
  }
  return null;
};
const cible = trouver(join(principal, "java"));
if (!cible) echec("MainActivity.kt introuvable dans le projet généré.");
const paquet = /^package\s+([\w.]+)/m.exec(readFileSync(cible, "utf8"))?.[1];
if (!paquet) echec("paquet de MainActivity.kt illisible.");
const source = readFileSync(join(ici, "MainActivity.kt"), "utf8").replace("__PACKAGE__", paquet);
writeFileSync(cible, source);

// 1 bis. Widgets de l'écran d'accueil (WidgetEtable.kt) : le code, ses ressources (couleurs claires et sombres, fond arrondi,
// mise en page, description) et leur déclaration dans le manifeste.
writeFileSync(join(dirname(cible), "WidgetEtable.kt"), readFileSync(join(ici, "WidgetEtable.kt"), "utf8").replace("__PACKAGE__", paquet));
const res = join(principal, "res");
const ressource = (chemin, contenu) => {
  mkdirSync(dirname(join(res, chemin)), { recursive: true });
  // Une distribution peut fournir les siennes (copiées après) : on n'écrase jamais un fichier déjà présent.
  if (!existsSync(join(res, chemin))) writeFileSync(join(res, chemin), contenu);
};
const couleurs = (fond, texte, doux) => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="etable_widget_fond">${fond}</color>\n  <color name="etable_widget_texte">${texte}</color>\n  <color name="etable_widget_doux">${doux}</color>\n</resources>\n`;
ressource("values/etable_widget.xml", couleurs("#FFFBF4", "#3B342C", "#7E7366"));
ressource("values-night/etable_widget.xml", couleurs("#262320", "#ECE4D6", "#AA9F90"));
ressource("drawable/etable_widget_fond.xml", `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n  <solid android:color="@color/etable_widget_fond" />\n  <corners android:radius="22dp" />\n</shape>\n`);
const texte = (id, couleur, taille, gras, lignes) =>
  `  <TextView android:id="@+id/${id}" android:layout_width="match_parent" android:layout_height="wrap_content" android:textColor="@color/${couleur}" android:textSize="${taille}sp"${gras ? ' android:textStyle="bold"' : ""} android:maxLines="${lignes}" android:ellipsize="end" />\n`;
ressource(
  "layout/etable_widget.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/etable_racine" android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical" android:gravity="center_vertical" android:padding="14dp" android:background="@drawable/etable_widget_fond">\n` +
    texte("etable_titre", "etable_widget_doux", 12, true, 1) +
    texte("etable_valeur", "etable_widget_texte", 26, true, 1) +
    texte("etable_lignes", "etable_widget_texte", 13, false, 5) +
    // Lignes d'une liste à cocher (WidgetEtable.CASES_MAX), cachées pour les autres widgets.
    Array.from({ length: 8 }, (_, i) =>
      `  <TextView android:id="@+id/etable_case${i}" android:layout_width="match_parent" android:layout_height="wrap_content" android:paddingTop="7dp" android:paddingBottom="7dp" android:textColor="@color/etable_widget_texte" android:textSize="15sp" android:maxLines="1" android:ellipsize="end" android:visibility="gone" />\n`,
    ).join("") +
    `</LinearLayout>\n`,
);
ressource(
  "xml/etable_widget_info.xml",
  `<?xml version="1.0" encoding="utf-8"?>\n<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android" android:minWidth="110dp" android:minHeight="50dp" android:targetCellWidth="2" android:targetCellHeight="1" android:resizeMode="horizontal|vertical" android:widgetCategory="home_screen" android:initialLayout="@layout/etable_widget" android:configure="${paquet}.WidgetChoix" android:widgetFeatures="reconfigurable" android:updatePeriodMillis="1800000" />\n`,
);

// 2. Permissions d'alarme exacte et d'installation des mises à jour (REQUEST_INSTALL_PACKAGES) (USE_EXACT_ALARM est accordée d'office hors Play Store ; SCHEDULE_EXACT_ALARM couvre Android 12 et 13).
const manifeste = join(principal, "AndroidManifest.xml");
let xml = readFileSync(manifeste, "utf8");
const internet = '<uses-permission android:name="android.permission.INTERNET" />';
if (!xml.includes(internet)) echec("ligne INTERNET introuvable dans le manifeste : le gabarit de Tauri a changé.");
for (const permission of ["SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM", "REQUEST_INSTALL_PACKAGES", "CAMERA"]) {
  if (!xml.includes(`android.permission.${permission}`)) {
    xml = xml.replace(internet, `${internet}\n    <uses-permission android:name="android.permission.${permission}" />`);
  }
}
// L'appareil photo n'est pas obligatoire : l'application s'installe aussi sur un appareil sans caméra. Sans la permission CAMERA déclarée,
// le champ « photo » du WebView n'ouvre pas l'appareil photo (wry le vérifie).
if (!xml.includes("android.hardware.camera")) {
  xml = xml.replace(internet, `${internet}\n    <uses-feature android:name="android.hardware.camera" android:required="false" />`);
}
// Android 11+ : sans « queries », l'application ne voit pas l'application appareil photo (resolveActivity renvoie null) et le champ
// « photo » retombe sur la galerie. Le gabarit de Tauri n'en déclare aucune.
if (!xml.includes("android.media.action.IMAGE_CAPTURE")) {
  if (!xml.includes("<application")) echec("balise <application> introuvable dans le manifeste.");
  xml = xml.replace("<application", `<queries>\n        <intent>\n            <action android:name="android.media.action.IMAGE_CAPTURE" />\n        </intent>\n    </queries>\n    <application`);
}
// Déclaration des widgets (récepteur et écran de choix), une seule fois.
if (!xml.includes(".WidgetEtable")) {
  if (!xml.includes("</application>")) echec("balise </application> introuvable dans le manifeste.");
  xml = xml.replace(
    "</application>",
    `    <receiver android:name="${paquet}.WidgetEtable" android:exported="true" android:label="@string/app_name">\n` +
      `      <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>\n` +
      `      <meta-data android:name="android.appwidget.provider" android:resource="@xml/etable_widget_info" />\n` +
      `    </receiver>\n` +
      `    <activity android:name="${paquet}.WidgetChoix" android:exported="true" android:theme="@android:style/Theme.DeviceDefault.Dialog">\n` +
      `      <intent-filter><action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" /></intent-filter>\n` +
      `    </activity>\n` +
      `  </application>`,
  );
}
if (!xml.includes(internet)) echec("la permission INTERNET a disparu du manifeste : l'application n'aurait plus aucun accès au réseau.");
writeFileSync(manifeste, xml);
if ((xml.match(/EXACT_ALARM/g) ?? []).length < 2) echec("permissions d'alarme exacte non écrites.");

console.log(`Correctifs appliqués : ${cible.slice(projet.length + 1)} (paquet ${paquet}) et permissions d'alarme exacte.`);