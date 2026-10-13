<script lang="ts">
  // Android : les widgets de l'écran d'accueil du téléphone. Chaque widget des plugins tourne ici, caché, et envoie son résumé
  // (message `widgetSummary`) ; on le passe à la partie native (MainActivity.kt, WidgetEtable.kt), qui dessine le widget Android.
  // Le catalogue (la liste des widgets disponibles) sert à l'écran « Choisir le widget » d'Android.
  import type { PluginToHost } from "@etabli/sdk/protocol";
  import { clientServeur } from "$lib/fond";
  import { allWidgets, pluginUrl } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import MiniAppFrame from "./MiniAppFrame.svelte";

  type Pont = { postMessage(message: string): void };
  const pont = (): Pont | undefined => (window as unknown as { etabliWidgets?: Pont }).etabliWidgets;

  const widgets = $derived(allWidgets().filter((w) => settings.isPluginEnabled(w.plugin.id)));
  const cle = (pluginId: string, widgetId: string) => `${pluginId}/${widgetId}`;

  // Démarrage différé : l'application s'affiche d'abord, les widgets se calculent ensuite.
  // Un widget toutes les 2 s : lancés tous ensemble, leurs appels de service dépassaient le délai sur téléphone.
  let pret = $state(false);
  let montes = $state(0);
  $effect(() => {
    const t = setTimeout(() => (pret = true), 3000);
    const pas = setInterval(() => pret && montes < widgets.length && montes++, 2000);
    return () => (clearTimeout(t), clearInterval(pas));
  });

  // Les listes à cocher se relisent et s'enregistrent sur le serveur, même application fermée : le téléphone garde
  // l'adresse et le jeton de session (dans le stockage privé de l'application, comme la vue web).
  $effect(() => {
    pont()?.postMessage(JSON.stringify({ serveur: clientServeur?.jeton ? { url: clientServeur.base, jeton: clientServeur.jeton } : null }));
  });

  $effect(() => {
    const catalogue = widgets.map((w) => ({ cle: cle(w.plugin.id, w.widget.id), titre: `${w.widget.title} · ${w.plugin.name}` }));
    pont()?.postMessage(JSON.stringify({ catalogue }));
  });

  function recevoir(pluginId: string) {
    return (message: PluginToHost): void => {
      if (message.type !== "widgetSummary") return;
      const r = message.resume;
      // Les cases ne touchent que les données de ce plugin : c'est l'hôte qui nomme la donnée, jamais le plugin.
      const cases = r.cases ? { cases: { ...r.cases, donnee: `plugin.${pluginId}` } } : {};
      pont()?.postMessage(JSON.stringify({ resume: { cle: cle(pluginId, message.widget), ...r, ...(r.page ? { page: `${pluginId}:${r.page}` } : {}), ...cases } }));
    };
  }
</script>

{#if pret && pont()}
  <div class="cache" aria-hidden="true">
    {#each widgets.slice(0, montes) as w (cle(w.plugin.id, w.widget.id))}
      <div class="cellule">
        <MiniAppFrame
          fill
          src={`${pluginUrl(w.plugin.id, w.app.entry)}#widget=${w.widget.id}&i=1`}
          title={w.widget.title}
          pluginId={w.plugin.id}
          appId={w.app.id}
          initial={{ id: null, title: "", data: null }}
          forward={false}
          onmessage={recevoir(w.plugin.id)}
        />
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Hors de l'écran mais bien rendu : un widget caché par « display: none » ne se calculerait pas. */
  .cache {
    position: fixed;
    left: -10000px;
    top: 0;
    width: 360px;
    pointer-events: none;
  }
  .cellule {
    width: 360px;
    height: 180px;
  }
</style>