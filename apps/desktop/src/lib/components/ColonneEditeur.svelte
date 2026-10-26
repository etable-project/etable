<script lang="ts">
  // Éditeur de la colonne (clic droit → « Modifier la colonne ») : les groupes dans l'ordre, renommer, monter, descendre, supprimer,
  // créer, et le groupe de chaque page. Tout s'applique tout de suite ; le glisser-déposer dans la colonne marche toujours.
  import { deplacerCategorie, SANS_CATEGORIE, type PageClassee } from "$lib/categories";
  import { settings } from "$lib/state/settings.svelte";

  interface Props {
    groupes: { name: string; items: { key: string; ref: { page: { title: string; category?: string } } }[] }[];
    pagesClassees: PageClassee[];
    /** Ouvrir avec le champ « nouveau groupe » prêt à écrire. */
    nouveau?: boolean;
    onclose: () => void;
  }
  let { groupes, pagesClassees, nouveau = false, onclose }: Props = $props();

  let nomNouveau = $state("");
  const noms = $derived(groupes.map((g) => g.name));

  function creer(): void {
    if (!nomNouveau.trim()) return;
    // le nouveau groupe se range à la fin de ceux qu'on voit déjà
    if (settings.sidebarCategories) settings.setCategoryOrder(noms);
    settings.createCategory(nomNouveau);
    nomNouveau = "";
  }
  function renommer(ancien: string, e: Event): void {
    const champ = e.currentTarget as HTMLInputElement;
    if (champ.value.trim() && champ.value.trim() !== ancien) settings.renameCategory(ancien, champ.value, pagesClassees);
    else champ.value = ancien;
  }
  function deplacerPage(key: string, origine: string | undefined, nom: string): void {
    settings.setCategoryOf(key, nom === (origine || SANS_CATEGORIE) ? "" : nom);
  }
  const focus = (el: HTMLInputElement) => {
    if (nouveau) el.focus();
  };
  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="colonne-titre" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <h2 id="colonne-titre">Modifier la colonne</h2>
    <label class="interrupteur">
      <input type="checkbox" checked={settings.sidebarCategories} onchange={(e) => settings.setSidebarCategories(e.currentTarget.checked)} />
      Ranger les pages par groupes
    </label>

    {#if settings.sidebarCategories}
      <div class="groupes">
        {#each groupes as g, gi (g.name)}
          <section class="groupe">
            <div class="tete">
              <input class="text-input" value={g.name} maxlength="40" aria-label={`Nom du groupe ${g.name}`} onchange={(e) => renommer(g.name, e)} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <button class="btn" disabled={gi === 0} aria-label={`Monter ${g.name}`} title="Monter" onclick={() => settings.setCategoryOrder(deplacerCategorie(noms, g.name, -1))}>↑</button>
              <button class="btn" disabled={gi === groupes.length - 1} aria-label={`Descendre ${g.name}`} title="Descendre" onclick={() => settings.setCategoryOrder(deplacerCategorie(noms, g.name, 1))}>↓</button>
              <button class="btn" aria-label={`Supprimer ${g.name}`} title="Supprimer le groupe (ses pages retournent à leur groupe d'origine)" onclick={() => settings.deleteCategory(g.name, pagesClassees)}>✕</button>
            </div>
            {#each g.items as p (p.key)}
              <div class="ligne-page">
                <span>{p.ref.page.title}</span>
                <select class="text-input" value={g.name} aria-label={`Groupe de ${p.ref.page.title}`} onchange={(e) => deplacerPage(p.key, p.ref.page.category, e.currentTarget.value)}>
                  {#each noms as n (n)}<option value={n}>{n}</option>{/each}
                </select>
              </div>
            {:else}
              <p class="vide">Aucune page : choisis ce groupe pour une page, ou glisse-la dans la colonne.</p>
            {/each}
          </section>
        {/each}
      </div>
    {/if}

    <div class="nouveau">
      <input class="text-input" bind:value={nomNouveau} maxlength="40" placeholder="Nom du nouveau groupe" aria-label="Nom du nouveau groupe" use:focus onkeydown={(e) => e.key === "Enter" && creer()} />
      <button class="btn" onclick={creer} disabled={!nomNouveau.trim()}>+ Groupe</button>
    </div>
    <div class="buttons">
      <button class="btn primary" onclick={onclose}>Terminé</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--scrim);
    animation: fade-in 0.12s ease-out;
  }
  .dialog {
    width: min(560px, 100%);
    max-height: calc(100vh - 32px);
    padding: 20px;
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .interrupteur {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .groupes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    min-height: 0;
    padding: 4px;
    margin: -4px;
  }
  .groupe {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tete,
  .nouveau {
    display: flex;
    gap: 6px;
  }
  .tete .text-input,
  .nouveau .text-input {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }
  .ligne-page {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-left: 8px;
    font-size: 13px;
  }
  .ligne-page select {
    width: 180px;
  }
  .vide {
    margin: 0;
    padding-left: 8px;
    font-size: 12px;
    color: var(--faint);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
  }
</style>
