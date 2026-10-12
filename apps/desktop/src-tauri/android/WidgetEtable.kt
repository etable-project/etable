package __PACKAGE__

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

/**
 * Widget d'écran d'accueil au modèle commun (docs/27) : un titre, un grand chiffre, quelques lignes. L'application lui envoie le
 * catalogue des widgets et le résumé de chacun (pont « etabliWidgets » de MainActivity) ; le widget garde le dernier résumé reçu
 * et l'affiche même application fermée. Un toucher ouvre la page du plugin.
 */
class WidgetEtable : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) dessiner(context, manager, id)
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
      edition.apply()
      toutRedessiner(c)
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