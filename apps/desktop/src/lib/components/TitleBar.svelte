<script lang="ts">
  // Barre de titre sans onglets (distribution à une page à la fois) : le titre de la page ouverte (centré) et les boutons de la fenêtre.
  import { shortcutHint } from "$lib/shortcuts";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { describeView } from "$lib/views";
  import { getPlugin } from "$lib/plugins/registry.svelte";
  import { openPluginSettings } from "$lib/pluginSettings";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";
  import WindowControls from "./WindowControls.svelte";

  const info = $derived(tabs.active ? describeView(tabs.active.view) : null);
  // Les réglages du plugin de la page ouverte : toujours au même endroit, à gauche de la barre.
  const reglable = $derived.by(() => {
    const v = tabs.active?.view;
    const p = v?.kind === "page" ? getPlugin(v.pluginId) : undefined;
    return p && (p.parameters.length || p.settings.length) ? p : null;
  });
</script>

<header class="bar">
  <div class="drag-top" data-tauri-drag-region></div>
  {#if reglable}
    <button class="reglages" onclick={() => openPluginSettings(reglable.id)} title="Paramètres de {reglable.name}" aria-label="Paramètres de {reglable.name}"><Icon name="settings" size={17} /></button>
  {/if}
  {#if info}
    <div class="courant" data-tauri-drag-region>
      <Tile color={info.color} icon={info.icon} size={24} />
      <span class="titre">{info.title}</span>
    </div>
  {/if}
  <div class="drag" data-tauri-drag-region></div>
  <WindowControls />
</header>

<style>
  .bar {
    position: relative;
    height: var(--titlebar);
    display: flex;
    align-items: center;
    padding-left: 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .drag-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 138px;
    height: 4px;
    z-index: 2;
  }
  .courant {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
    max-width: calc(100% - 340px);
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .titre {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .reglages {
    position: relative;
    z-index: 3;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .reglages:hover {
    color: var(--text);
    background: var(--field);
  }
  .drag {
    flex: 1;
    align-self: stretch;
    min-width: 0;
  }
</style>