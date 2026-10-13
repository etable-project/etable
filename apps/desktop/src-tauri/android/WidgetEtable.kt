package __PACKAGE__

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.SpannableString
import android.text.style.StrikethroughSpan
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Widget d'écran d'accueil au modèle commun (docs/27) : un titre, un grand chiffre, quelques lignes. L'application lui envoie le
 * catalogue des widgets et le résumé de chacun (pont « etabliWidgets » de MainActivity) ; le widget garde le dernier résumé reçu
 * et l'affiche même application fermée. Un toucher ouvre la page du plugin.
 */
class WidgetEtable : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) dessiner(context, manager, id)
    // Toutes les 30 minutes (et à la pose) : les listes à cocher se relisent sur le serveur, application fermée.
    enArrierePlan { actualiserCases(context.applicationContext) }
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == BASCULER) {
      val cle = intent.getStringExtra("cle") ?: return
      val element = intent.getStringExtra("element") ?: return
      enArrierePlan { basculer(context.applicationContext, cle, element) }
      return
    }
    super.onReceive(context, intent)
  }

  /** Réseau hors du fil principal ; le système garde le récepteur en vie jusqu'à la fin. */
  private fun enArrierePlan(travail: () -> Unit) {
    val fin = goAsync()
    Thread {
      try { travail() } catch (e: Exception) { } finally { fin.finish() }
    }.start()
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    val edition = prefs(context).edit()
    for (id in ids) edition.remove("choix_$id")
    edition.apply()
  }

  companion object {
    fun prefs(c: Context) = c.getSharedPreferences("etable_widgets", Context.MODE_PRIVATE)

    /** Message de l'application : `{ catalogue: [...] }` ou `{ resume: { cle, titre, valeur, lignes, page } }`. */
    fun recevoir(c: Context, json: String) {
      val o = try { JSONObject(json) } catch (e: Exception) { return }
      val edition = prefs(c).edit()
      o.optJSONArray("catalogue")?.let { edition.putString("catalogue", it.toString()) }
      o.optJSONObject("resume")?.let { r ->
        val cle = r.optString("cle")
        if (cle.isNotEmpty() && cle.length <= 100) edition.putString("resume_$cle", r.toString())
      }
      if (o.has("serveur")) {
        val s = o.optJSONObject("serveur")
        if (s == null) edition.remove("serveur_url").remove("serveur_jeton")
        else edition.putString("serveur_url", s.optString("url").trimEnd('/')).putString("serveur_jeton", s.optString("jeton"))
      }
      edition.apply()
      toutRedessiner(c)
    }

    const val BASCULER = "etable.widget.BASCULER"
    const val CASES_MAX = 8
    private val IDS_CASES = intArrayOf(R.id.etable_case0, R.id.etable_case1, R.id.etable_case2, R.id.etable_case3, R.id.etable_case4, R.id.etable_case5, R.id.etable_case6, R.id.etable_case7)

    private fun lireResume(c: Context, cle: String): JSONObject? =
      prefs(c).getString("resume_$cle", null)?.let { try { JSONObject(it) } catch (e: Exception) { null } }

    private fun ecrireResume(c: Context, cle: String, r: JSONObject) {
      prefs(c).edit().putString("resume_$cle", r.toString()).apply()
      toutRedessiner(c)
    }

    /** Coche ou décoche un élément : affiché tout de suite, puis enregistré sur le serveur (annulé s'il est injoignable). */
    fun basculer(c: Context, cle: String, element: String) {
      val r = lireResume(c, cle) ?: return
      val cases = r.optJSONObject("cases") ?: return
      val elements = cases.optJSONArray("elements") ?: return
      var coche: Boolean? = null
      for (i in 0 until elements.length()) {
        val e = elements.optJSONObject(i) ?: continue
        if (e.optString("id") == element) { coche = !e.optBoolean("coche"); e.put("coche", coche) }
      }
      if (coche == null) return
      r.remove("erreur")
      ecrireResume(c, cle, r)
      try {
        synchroniser(c, cases, element, coche)
      } catch (e: Exception) {
        for (i in 0 until elements.length()) elements.optJSONObject(i)?.takeIf { it.optString("id") == element }?.put("coche", !coche)
        r.put("erreur", "Serveur injoignable : rien n'a été coché.")
      }
      ecrireResume(c, cle, r)
    }

    /** Relit sur le serveur toutes les listes à cocher posées sur l'écran d'accueil. */
    fun actualiserCases(c: Context) {
      val m = AppWidgetManager.getInstance(c)
      val cles = m.getAppWidgetIds(ComponentName(c, WidgetEtable::class.java)).mapNotNull { prefs(c).getString("choix_$it", null) }.toSet()
      for (cle in cles) {
        val r = lireResume(c, cle) ?: continue
        val cases = r.optJSONObject("cases") ?: continue
        try { synchroniser(c, cases, null, false); r.remove("erreur") } catch (e: Exception) { continue }
        ecrireResume(c, cle, r)
      }
    }

    /** Lit les données du plugin, applique la bascule éventuelle, enregistre, et remet les éléments à jour dans `cases`. */
    private fun synchroniser(c: Context, cases: JSONObject, element: String?, coche: Boolean) {
      val url = prefs(c).getString("serveur_url", null) ?: throw IllegalStateException("pas de serveur")
      val jeton = prefs(c).getString("serveur_jeton", null) ?: throw IllegalStateException("pas de session")
      val donnee = cases.optString("donnee")
      if (!Regex("^plugin\\.[a-z0-9-]{1,64}$").matches(donnee)) throw IllegalArgumentException("donnée invalide")
      val adresse = "$url/api/donnees/" + URLEncoder.encode(donnee, "UTF-8")
      val racine = JSONTokener(http("GET", adresse, jeton, null)).nextValue() as? JSONObject ?: throw IllegalStateException("données vides")
      val champId = cases.getString("id")
      val champCoche = cases.getString("coche")
      val trouves = elementsDe(racine, cases.getJSONArray("chemin"))
      if (element != null) {
        val e = trouves.firstOrNull { it.opt(champId)?.toString() == element } ?: throw IllegalStateException("élément disparu")
        e.put(champCoche, coche)
        http("PUT", adresse, jeton, racine.toString())
      }
      val nouveaux = JSONArray()
      for (e in trouves.take(50)) nouveaux.put(JSONObject().put("id", e.opt(champId)?.toString() ?: "").put("texte", e.optString(cases.getString("texte")).take(80)).put("coche", e.optBoolean(champCoche)))
      cases.put("elements", nouveaux)
    }

    /** Suit le chemin depuis la racine : un texte prend ce champ, un objet garde les éléments d'un tableau qui ont ces valeurs. */
    fun elementsDe(racine: JSONObject, chemin: JSONArray): List<JSONObject> {
      var noeuds: List<Any> = listOf(racine)
      for (i in 0 until chemin.length()) {
        val seg = chemin.get(i)
        noeuds = noeuds.flatMap { n ->
          when {
            seg is String && n is JSONObject -> listOfNotNull(n.opt(seg)?.takeIf { it != JSONObject.NULL })
            seg is JSONObject && n is JSONArray -> (0 until n.length()).mapNotNull { n.optJSONObject(it) }.filter { o -> seg.keys().asSequence().all { k -> correspond(o, k, seg.get(k)) } }
            else -> emptyList()
          }
        }
      }
      return noeuds.flatMap { n -> if (n is JSONArray) (0 until n.length()).mapNotNull { n.optJSONObject(it) } else listOfNotNull(n as? JSONObject) }
    }

    private fun correspond(o: JSONObject, champ: String, attendu: Any): Boolean =
      if (attendu == JSONObject.NULL) o.isNull(champ) else !o.isNull(champ) && o.get(champ).toString() == attendu.toString()

    private fun http(methode: String, adresse: String, jeton: String, corps: String?): String {
      val cx = URL(adresse).openConnection() as HttpURLConnection
      try {
        cx.requestMethod = methode
        cx.connectTimeout = 6000
        cx.readTimeout = 8000
        cx.setRequestProperty("Authorization", "Bearer $jeton")
        if (corps != null) {
          cx.doOutput = true
          cx.setRequestProperty("Content-Type", "application/json")
          cx.outputStream.use { it.write(corps.toByteArray(Charsets.UTF_8)) }
        }
        if (cx.responseCode !in 200..299) throw IllegalStateException("HTTP ${cx.responseCode}")
        return cx.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      } finally {
        cx.disconnect()
      }
    }

    /** Dessine une liste à cocher : les éléments à prendre d'abord, ceux déjà pris barrés. */
    private fun dessinerCases(c: Context, vues: RemoteViews, id: Int, cle: String, r: JSONObject, cases: JSONObject) {
      val tous = cases.optJSONArray("elements") ?: JSONArray()
      val elements = (0 until tous.length()).mapNotNull { tous.optJSONObject(it) }.sortedBy { it.optBoolean("coche") }
      vues.setViewVisibility(R.id.etable_valeur, View.GONE)
      for (i in 0 until CASES_MAX) {
        val vue = IDS_CASES[i]
        val e = elements.getOrNull(i)
        if (e == null) { vues.setViewVisibility(vue, View.GONE); continue }
        val coche = e.optBoolean("coche")
        val texte = SpannableString((if (coche) "☑  " else "☐  ") + e.optString("texte"))
        if (coche) texte.setSpan(StrikethroughSpan(), 3, texte.length, 0)
        vues.setTextViewText(vue, texte)
        vues.setViewVisibility(vue, View.VISIBLE)
        val intention = Intent(c, WidgetEtable::class.java).setAction(BASCULER).setData(Uri.parse("etable://case/$id/$i"))
          .putExtra("cle", cle).putExtra("element", e.optString("id"))
        vues.setOnClickPendingIntent(vue, PendingIntent.getBroadcast(c, id * 16 + i, intention, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      val reste = elements.size - CASES_MAX
      val bas = r.optString("erreur").ifEmpty { if (elements.isEmpty()) "Rien à prendre." else if (reste > 0) "+ $reste autre${if (reste > 1) "s" else ""}" else "" }
      vues.setTextViewText(R.id.etable_lignes, bas)
      vues.setViewVisibility(R.id.etable_lignes, if (bas.isEmpty()) View.GONE else View.VISIBLE)
    }

    fun toutRedessiner(c: Context) {
      val m = AppWidgetManager.getInstance(c)
      for (id in m.getAppWidgetIds(ComponentName(c, WidgetEtable::class.java))) dessiner(c, m, id)
    }

    fun dessiner(c: Context, m: AppWidgetManager, id: Int) {
      val vues = RemoteViews(c.packageName, R.layout.etable_widget)
      val cle = prefs(c).getString("choix_$id", null)
      val r = cle?.let { prefs(c).getString("resume_$it", null) }?.let { try { JSONObject(it) } catch (e: Exception) { null } }
      if (r == null) {
        vues.setTextViewText(R.id.etable_titre, c.applicationInfo.loadLabel(c.packageManager))
        vues.setViewVisibility(R.id.etable_valeur, View.GONE)
        vues.setTextViewText(R.id.etable_lignes, if (cle == null) "Touchez pour choisir le widget." else "Ouvrez l'application pour afficher ce widget.")
      } else if (r.optJSONObject("cases") != null) {
        vues.setTextViewText(R.id.etable_titre, r.optString("titre"))
        dessinerCases(c, vues, id, cle.orEmpty(), r, r.getJSONObject("cases"))
      } else {
        val valeur = r.optString("valeur")
        vues.setTextViewText(R.id.etable_titre, r.optString("titre"))
        vues.setTextViewText(R.id.etable_valeur, valeur)
        vues.setViewVisibility(R.id.etable_valeur, if (valeur.isEmpty()) View.GONE else View.VISIBLE)
        val lignes = r.optJSONArray("lignes")
        val texte = StringBuilder()
        if (lignes != null) for (i in 0 until minOf(lignes.length(), 5)) {
          if (i > 0) texte.append('\n')
          texte.append(lignes.optString(i))
        }
        vues.setTextViewText(R.id.etable_lignes, texte.toString())
      }
      val ouvrir = Intent(c, if (cle == null) WidgetChoix::class.java else MainActivity::class.java)
      if (cle == null) ouvrir.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
      else ouvrir.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      r?.optString("page")?.takeIf { it.isNotEmpty() }?.let { ouvrir.putExtra("etable_page", it) }
      val pi = PendingIntent.getActivity(c, id, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      vues.setOnClickPendingIntent(R.id.etable_racine, pi)
      m.updateAppWidget(id, vues)
    }
  }
}

/** Écran « Choisir le widget » : à la pose d'un widget (ou en le reconfigurant), la liste des widgets que l'application propose. */
class WidgetChoix : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
    if (id == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }
    val catalogue = try { JSONArray(WidgetEtable.prefs(this).getString("catalogue", "[]")) } catch (e: Exception) { JSONArray() }
    val cles = ArrayList<String>()
    val titres = ArrayList<String>()
    for (i in 0 until catalogue.length()) {
      val o = catalogue.optJSONObject(i) ?: continue
      cles.add(o.optString("cle"))
      titres.add(o.optString("titre"))
    }
    if (titres.isEmpty()) titres.add("Ouvrez d'abord l'application une fois, puis revenez ici.")
    val liste = ListView(this)
    liste.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, titres)
    liste.setOnItemClickListener { _, _, position, _ ->
      if (position < cles.size) {
        WidgetEtable.prefs(this).edit().putString("choix_$id", cles[position]).apply()
        WidgetEtable.dessiner(this, AppWidgetManager.getInstance(this), id)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
      }
      finish()
    }
    title = "Choisir le widget"
    setContentView(liste)
  }
}