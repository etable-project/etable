<script lang="ts">
  // Accueil sur téléphone : comme une messagerie. Le nom de l'application en haut, la liste des pages au centre,
  // les paramètres en bas. Toucher une page l'ouvre en plein écran ; le retour (bouton ou geste) revient ici.
  import { system } from "$lib/api";
  import { distribution } from "$lib/distribution";
  import { grouper } from "$lib/categories";
  import { allPages, pageKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Tile from "./Tile.svelte";

  const pages = $derived.by(() => {
    const order = settings.pageOrder;
    const rank = (key: string) => {
      const index = order.indexOf(key);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return allPages()
      .filter((p) => settings.isPluginEnabled(p.plugin.id))
      .map((ref, index) => ({ ref, index, key: pageKey(ref.plugin.id, ref.page.id) }))
      .sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index);
  });
  const groupes = $derived(
    grouper(
      pages.map((p) => ({ ...p, category: p.ref.page.category })),
      settings.categoryOf,
      settings.categoryOrder,
    ),
  );

  const dateDuJour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  /** La version installée, toujours visible : on sait tout de suite si une mise à jour a bien été installée. */
  let version = $state("");
  $effect(() => {
    void system.appInfo().then((i) => (version = i.version)).catch(() => {});
  });
  /** Mode « modifier l'ordre » : des flèches remplacent l'ouverture des pages ; l'ordre est le même que dans la colonne du PC. */
  let reorganiser = $state(false);
  function deplacer(key: string, sens: -1 | 1): void {
    const ids = pages.map((p) => p.key);
    const i = ids.indexOf(key);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    settings.setPageOrder(ids);
  }
  const ouvrir = (ref: PageRef): void => tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
</script>

<div class="accueil">
  <header>
    <!-- Le logo s'aligne sur les icônes des pages (plus grand : ce n'est pas une page), la date sur leurs noms. -->
    <Logo size={48} />
    <p class="date">{dateDuJour}</p>
  </header>

  <nav aria-label="Pages">
    {#if !pages.length}<p class="vide">Aucune page : installez un plugin.</p>{/if}
    {#snippet carte(ref: PageRef)}
      {@const key = pageKey(ref.plugin.id, ref.page.id)}
      {#if reorganiser}
        <div class="carte">
          <Tile color={ref.plugin.color} icon={ref.page.icon} size={40} />
          <span class="texte"><span class="nom">{ref.page.title}</span></span>
          <button class="fleche" onclick={() => deplacer(key, -1)} aria-label="Monter {ref.page.title}">↑</button>
          <button class="fleche" onclick={() => deplacer(key, 1)} aria-label="Descendre {ref.page.title}">↓</button>
        </div>
      {:else}
        <button class="carte" onclick={() => ouvrir(ref)}>
          <Tile color={ref.plugin.color} icon={ref.page.icon} size={40} />
          <span class="texte"><span class="nom">{ref.page.title}</span></span>
          <Icon name="next" size={18} />
        </button>
      {/if}
    {/snippet}
    {#if settings.sidebarCategories}
      {#each groupes as g (g.name)}
        <div class="categorie">{g.name}</div>
        {#each g.items as { ref, key } (key)}{@render carte(ref)}{/each}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}{@render carte(ref)}{/each}
    {/if}
    {#if pages.length > 1}
      <button class="ordre" class:actif={reorganiser} onclick={() => (reorganiser = !reorganiser)} aria-label={reorganiser ? "Terminer" : "Modifier l'ordre des pages"} title={reorganiser ? "Terminer" : "Modifier l'ordre"}>
        <Icon name={reorganiser ? "check" : "pencil"} size={18} />
      </button>
    {/if}
  </nav>

  <footer>
    <button class="carte" onclick={() => tabs.navigate({ kind: "settings" })}>
      <Tile color="var(--muted)" icon="settings" variant="plain" size={40} />
      <span class="texte"><span class="nom">Paramètres</span><span class="sous">Apparence, serveur, plugins…</span></span>
      <Icon name="next" size={18} />
    </button>
    {#if version}<p class="version">{distribution.name} {version}</p>{/if}
  </footer>
</div>

<style>
  .accueil {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 16px;
    padding: 12px 15px 10px;
  }
  header :global(svg) {
    display: block;
    flex: none;
    margin-left: -4px;
  }
  .date {
    margin: 0;
    font-size: 21px;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-transform: capitalize;
  }
  nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 16px 8px;
  }
  .carte {
    width: 100%;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .carte:active {
    background: var(--field);
    transform: scale(0.99);
  }
  .carte > :global(svg) {
    color: var(--faint);
  }
  .texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nom {
    font-size: 16.5px;
    font-weight: 700;
  }
  .sous {
    font-size: 12.5px;
    color: var(--muted);
  }
  .fleche {
    width: 40px;
    height: 40px;
    flex: none;
    border: 0;
    border-radius: 999px;
    background: var(--field);
    color: var(--text);
    font-size: 18px;
    font-weight: 700;
  }
  /* Petit bouton rond avec un crayon (une coche pendant la modification). */
  .ordre {
    align-self: center;
    width: 40px;
    height: 40px;
    margin-top: 4px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    background: var(--field);
    color: var(--muted);
  }
  .ordre.actif {
    background: var(--accent);
    color: var(--accent-text);
  }
  .categorie {
    padding: 8px 6px 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .vide {
    padding: 24px 18px;
    text-align: center;
    color: var(--muted);
  }
  .version {
    margin: 6px 0 0;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }
  footer {
    flex: none;
    padding: 2px 16px 8px;
  }
</style>