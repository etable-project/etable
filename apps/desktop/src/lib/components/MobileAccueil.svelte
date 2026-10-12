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
  const ouvrir = (ref: PageRef): void => tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
</script>

<div class="accueil">
  <header>
    <div class="marque"><Logo size={34} /><h1>{distribution.name}</h1></div>
    <p>{dateDuJour}</p>
  </header>

  <nav aria-label="Pages">
    {#if !pages.length}<p class="vide">Aucune page : installez un plugin.</p>{/if}
    {#snippet carte(ref: PageRef)}
      <button class="carte" onclick={() => ouvrir(ref)}>
        <Tile color={ref.plugin.color} icon={ref.page.icon} size={40} />
        <span class="texte">
          <span class="nom">{ref.page.title}</span>
          <span class="sous">{ref.plugin.name}</span>
        </span>
        <Icon name="next" size={18} />
      </button>
    {/snippet}
    {#if settings.sidebarCategories}
      {#each groupes as g (g.name)}
        <div class="categorie">{g.name}</div>
        {#each g.items as { ref, key } (key)}{@render carte(ref)}{/each}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}{@render carte(ref)}{/each}
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
  /* Le logo et le nom forment un bloc centré ; la date est centrée dessous. */
  header {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: calc(4px + env(safe-area-inset-top, 0px)) 16px 8px;
  }
  /* Le nom est exactement au centre ; le logo se place à sa gauche sans le décaler. */
  .marque {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: 8px;
  }
  .marque > :global(:first-child) {
    justify-self: end;
  }
  .marque :global(svg) {
    display: block;
  }
  h1 {
    margin: 0;
    font-size: 21px;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  header p {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
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
    padding: 2px 16px calc(8px + env(safe-area-inset-bottom, 0px));
  }
</style>