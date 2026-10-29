<script lang="ts">
  // Colonne des pages (docs/28) : ce que les plugins déclarent dans `pages`, dans l'ordre choisi par l'utilisateur.
  import { api } from "$lib/api";
  import { categorieDe, grouper } from "$lib/categories";
  import { distribution } from "$lib/distribution";
  import { appelerDistant } from "$lib/distant";
  import { openWith } from "$lib/send";
  import { allPages, pageKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { shortcutHint } from "$lib/shortcuts";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { View } from "$lib/types";
  import ColonneEditeur from "./ColonneEditeur.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Tile from "./Tile.svelte";

  /** Pages des plugins actifs, dans l'ordre choisi par glisser-déposer (les nouvelles à la fin, dans l'ordre du plugin). */
  const pages = $derived.by(() => {
    const order = settings.pageOrder;
    const rank = (key: string) => {
      const index = order.indexOf(key);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return allPages()
      .filter((p) => settings.isPluginEnabled(p.plugin.id) && `${p.plugin.id}/${p.page.id}` !== distribution.accueil)
      .map((ref, index) => ({ ref, index, key: pageKey(ref.plugin.id, ref.page.id) }))
      .sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index);
  });
  /** Les pages rangées par catégorie (colonne en mode « catégories »). */
  const groupes = $derived(
    grouper(
      pages.map((p) => ({ ...p, category: p.ref.page.category })),
      settings.categoryOf,
      settings.categoryOrder,
      settings.customCategories,
    ),
  );
  const pagesClassees = $derived(pages.map((p) => ({ key: p.key, category: p.ref.page.category ?? "" })));
  // Clic droit sur la colonne : un petit menu, dont « Modifier la colonne » qui ouvre l'éditeur des groupes.
  let menu = $state<{ x: number; y: number } | null>(null);
  let editeur = $state<{ nouveau: boolean } | null>(null);
  function ouvrirMenu(event: MouseEvent): void {
    if (ui.compact || imposee) return;
    event.preventDefault();
    menu = { x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 140) };
  }
  function choisir(action: () => void): void {
    menu = null;
    action();
  }
  /** Colonne imposée par la distribution : ses groupes de pages, dans son ordre (ni glisser, ni groupes à modifier). */
  const imposee = $derived(
    distribution.colonne?.map((g) => g.flatMap((cle) => pages.filter((p) => `${p.ref.plugin.id}/${p.ref.page.id}` === cle))).filter((g) => g.length) ?? null,
  );
  /** Ordre d'affichage des pages : celui de la colonne, catégories comprises. */
  const ordreAffiche = $derived(settings.sidebarCategories ? groupes.flatMap((g) => g.items.map((p) => p.key)) : pages.map((p) => p.key));
  let nav: HTMLElement;
  let drag: { id: string; startY: number; moved: boolean } | null = null;
  let dragging = $state<string | null>(null);
  let justDragged = false;

  function startDrag(event: PointerEvent, id: string): void {
    // Au doigt, glisser fait défiler la liste : pas de réorganisation en mode compact.
    if (event.button !== 0 || ui.compact || imposee) return;
    drag = { id, startY: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    dragging = drag.id;
    // Glissée sur le titre d'un groupe (même vide) : la page rejoint ce groupe.
    const titre = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-categorie]");
    if (settings.sidebarCategories && titre?.dataset.categorie) {
      const moi = pages.find((p) => p.key === drag!.id);
      if (moi) settings.setCategoryOf(moi.key, titre.dataset.categorie === (moi.ref.page.category || "Autres") ? "" : titre.dataset.categorie, false);
      return;
    }
    const items = [...nav.querySelectorAll<HTMLElement>("[data-page]")];
    const target = items.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const ids = [...ordreAffiche];
    const from = ids.indexOf(drag.id);
    if (target < 0 || target === from) return;
    // Une page lâchée parmi celles d'une autre catégorie rejoint cette catégorie.
    if (settings.sidebarCategories) {
      const cible = pages.find((p) => p.key === ids[target]);
      const moi = pages.find((p) => p.key === drag!.id);
      if (cible && moi) {
        const nom = categorieDe({ key: cible.key, category: cible.ref.page.category }, settings.categoryOf);
        settings.setCategoryOf(moi.key, nom === (moi.ref.page.category || "Autres") ? "" : nom, false);
      }
    }
    ids.splice(target, 0, ...ids.splice(from, 1));
    settings.setPageOrder(ids, false);
  }

  function endDrag(): void {
    if (drag?.moved) {
      justDragged = true;
      settings.setPageOrder([...settings.pageOrder]);
    }
    drag = null;
    dragging = null;
  }

  const view = $derived(tabs.active?.view);
  const isActive = (ref: PageRef): boolean =>
    view?.kind === "page" && view.pluginId === ref.plugin.id && view.pageId === ref.page.id;

  const pageView = (ref: PageRef): View => ({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
  function go(target: View, event: MouseEvent): void {
    ui.menuOpen = false;
    tabs.navigate(target, { newTab: event.ctrlKey || event.button === 1 });
  }

  // Message rapide (distribution.messageRapide) : envoyé à un outil du service distant ; colonne repliée, le bouton ouvre la conversation.
  const rapide = distribution.messageRapide;
  let texteRapide = $state("");
  let etatRapide = $state<"" | "envoi" | "ok" | string>("");
  async function envoyerRapide(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const text = texteRapide.trim();
    if (!rapide || !text || etatRapide === "envoi") return;
    etatRapide = "envoi";
    const r = await appelerDistant(rapide.outil, { text });
    etatRapide = r.ok ? "ok" : r.message;
    if (r.ok) texteRapide = "";
    setTimeout(() => (etatRapide = etatRapide === "ok" ? "" : etatRapide), 2500);
  }
  function ouvrirConversation(event: MouseEvent): void {
    const [pluginId, pageId] = (rapide?.page ?? "").split("/");
    if (pluginId && pageId) go({ kind: "page", pluginId, pageId }, event);
  }

  // Conversations de la distribution (distribution.conversations), rangées comme dans Claude : par catégorie, avec « + ».
  type Conv = { id: number; titre: string; agents: string[]; element: boolean };
  const convs = distribution.conversations;
  let conversations = $state<Conv[]>([]);
  let convOuverte = $state<number | null>(null);
  async function chargerConversations(): Promise<void> {
    if (!convs) return;
    const r = await appelerDistant(convs.outil, {});
    if (!r.ok) return;
    try {
      conversations = JSON.parse(r.texte) as Conv[];
    } catch {
      /* réponse illisible : on garde la liste d'avant */
    }
  }
  $effect(() => {
    if (!convs) return;
    void chargerConversations();
    const t = setInterval(() => void chargerConversations(), 15000);
    return () => clearInterval(t);
  });
  const joli = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const titreConv = (c: Conv) => c.titre || c.agents.map(joli).join(", ") || "Conversation";
  const categoriesConv = $derived(
    [
      { nom: "Épinglée", liste: conversations.filter((c) => c.element) },
      { nom: "Avec un agent", liste: conversations.filter((c) => !c.element && c.agents.length <= 1) },
      { nom: "À plusieurs", liste: conversations.filter((c) => !c.element && c.agents.length > 1) },
    ].filter((g) => g.liste.length),
  );
  const convPage = $derived(convs ? convs.page.split("/") : ["", ""]);
  const surConversations = $derived(view?.kind === "page" && view.pluginId === convPage[0] && view.pageId === convPage[1]);
  function ouvrirConv(data: { id: number } | { nouvelle: true }): void {
    ui.menuOpen = false;
    convOuverte = "id" in data ? data.id : null;
    openWith(convPage[0]!, convPage[1]!, { kind: "conversation", data, from: "colonne" });
    setTimeout(() => void chargerConversations(), 1500);
  }

  const preventAutoscroll = (e: MouseEvent) => e.button === 1 && e.preventDefault();

  let resizing = $state(false);

  function startResize(event: PointerEvent): void {
    if (settings.sidebarCollapsed) return;
    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = settings.sidebarWidth;
    handle.setPointerCapture(event.pointerId);
    resizing = true;

    const move = (e: PointerEvent) => settings.setSidebarWidth(startWidth + e.clientX - startX, false);
    const stop = () => {
      resizing = false;
      settings.setSidebarWidth(settings.sidebarWidth);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  // Une fois le repli terminé (0,2 s), les textes déjà invisibles sont retirés de la mise en page ;
  // au dépliage, ils reviennent tout de suite pour s'afficher en fondu.
  const FOLD_DURATION = 200;
  let folded = $state(settings.sidebarCollapsed);
  $effect(() => {
    if (!settings.sidebarCollapsed) {
      folded = false;
      return;
    }
    const timer = setTimeout(() => (folded = true), FOLD_DURATION);
    return () => clearTimeout(timer);
  });
</script>

<aside
  class="side"
  class:drawer={ui.compact}
  class:open={ui.compact && ui.menuOpen}
  class:collapsed={settings.sidebarCollapsed && !ui.compact}
  class:folded={folded && !ui.compact}
  class:resizing
  inert={ui.compact && !ui.menuOpen}
  style:width={ui.compact ? undefined : settings.sidebarCollapsed ? "64px" : `${settings.sidebarWidth}px`}
>
  <div class="brand-row">
    <button class="brand" onclick={(e) => go({ kind: "home" }, e)} title="Accueil">
      <Logo size={32} />
      <span class="label">{distribution.name}</span>
    </button>
    <!-- Zone vide de la barre de titre : elle déplace la fenêtre. -->
    <div class="drag" data-tauri-drag-region></div>
  </div>

  <nav class="nav" aria-label="Pages" bind:this={nav} oncontextmenu={ouvrirMenu}>
    <button
      class="item"
      class:active={view?.kind === "home"}
      onclick={(e) => go({ kind: "home" }, e)}
      onauxclick={(e) => e.button === 1 && go({ kind: "home" }, e)}
      onmousedown={preventAutoscroll}
      title="Accueil"
    >
      {#if distribution.accueilCouleur}<Tile color={distribution.accueilCouleur} icon="home" />{:else}<Tile color="var(--muted)" icon="home" variant="plain" />{/if}
      <span class="label">Accueil</span>
    </button>
    {#if api.capacites.plugins && distribution.pluginsPage}
      <button
        class="item"
        class:active={view?.kind === "plugins"}
        onclick={(e) => go({ kind: "plugins" }, e)}
        onauxclick={(e) => e.button === 1 && go({ kind: "plugins" }, e)}
        onmousedown={preventAutoscroll}
        title="Plugins installés"
      >
        <Tile color="var(--muted)" icon="puzzle" variant="plain" />
        <span class="label">Plugins</span>
      </button>
    {/if}

    {#if !pages.length}
      <p class="none label">Aucune page : installez un plugin.</p>
    {/if}

    {#snippet entree(ref: PageRef, key: string, cache: boolean)}
      <button
        hidden={cache}
        class="item"
        class:active={isActive(ref)}
        class:dragging={dragging === key}
        data-page={key}
        onclick={(e) => {
          // Un glisser-déposer se termine par un clic : il ne doit pas ouvrir la page.
          if (justDragged) justDragged = false;
          else go(pageView(ref), e);
        }}
        onauxclick={(e) => e.button === 1 && go(pageView(ref), e)}
        onmousedown={preventAutoscroll}
        onpointerdown={(e) => startDrag(e, key)}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        title={imposee ? ref.page.title : `${ref.page.title} (glisser pour déplacer)`}
      >
        <Tile color={ref.plugin.color} icon={ref.page.icon} />
        <span class="label">{ref.page.title}</span>
      </button>
    {/snippet}

    {#if imposee}
      {#each imposee as g, gi (gi)}
        {#if gi > 0}<div class="espace-groupe"></div>{/if}
        {#each g as { ref, key } (key)}
          {@render entree(ref, key, false)}
        {/each}
      {/each}
    {:else if settings.sidebarCategories}
      {#each groupes as g (g.name)}
        {@const replie = settings.foldedCategories.includes(g.name)}
        <div class="categorie" data-categorie={g.name}>
          <button class="cat-nom" onclick={() => settings.toggleCategoryFolded(g.name)} aria-expanded={!replie} title={replie ? "Déplier" : "Replier"}>
            <span class="chevron" class:replie aria-hidden="true">▾</span>
            <span class="label">{g.name}</span>
          </button>
        </div>
        {#each g.items as { ref, key } (key)}
          {@render entree(ref, key, replie)}
        {/each}
        {#if g.items.length === 0 && !replie}<p class="groupe-vide label">Glissez une page ici</p>{/if}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}
        {@render entree(ref, key, false)}
      {/each}
    {/if}
    {#if convs}
      <div class="conv-tete">
        <span class="conv-titre label">Conversations</span>
        <button class="conv-nouvelle" onclick={() => ouvrirConv({ nouvelle: true })} title="Nouvelle conversation" aria-label="Nouvelle conversation">+</button>
      </div>
      {#each categoriesConv as g (g.nom)}
        <div class="conv-cat label">{g.nom}</div>
        {#each g.liste as c (c.id)}
          <button class="conv label" class:active={surConversations && convOuverte === c.id} onclick={() => ouvrirConv({ id: c.id })} title={titreConv(c)}>
            {c.element ? "📌 " : ""}{titreConv(c)}
          </button>
        {/each}
      {/each}
    {/if}
  </nav>

  {#if menu}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="menu-fond" onclick={() => (menu = null)} oncontextmenu={(e) => (e.preventDefault(), (menu = null))}></div>
    <div class="menu" role="menu" style:left="{menu.x}px" style:top="{menu.y}px">
      <button role="menuitem" onclick={() => choisir(() => (editeur = { nouveau: false }))}>✎ Modifier la colonne…</button>
      <button role="menuitem" onclick={() => choisir(() => (editeur = { nouveau: true }))}>＋ Nouveau groupe…</button>
      <button role="menuitem" onclick={() => choisir(() => settings.toggleSidebar())}>{settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne"}</button>
    </div>
  {/if}

  {#if rapide}
    {#if settings.sidebarCollapsed && !ui.compact}
      <button class="rapide-btn" onclick={ouvrirConversation} title={rapide.titre} aria-label={rapide.titre}>💬</button>
    {:else}
      <form class="rapide" onsubmit={envoyerRapide}>
        <input bind:value={texteRapide} placeholder="💬 {rapide.titre}…" aria-label={rapide.titre} disabled={etatRapide === "envoi"} />
        {#if etatRapide && etatRapide !== "envoi"}<small class:erreur={etatRapide !== "ok"}>{etatRapide === "ok" ? "Envoyé ✔" : etatRapide}</small>{/if}
      </form>
    {/if}
  {/if}

  <!-- Dépliée : les deux boutons côte à côte. Repliée : « Replier » glisse au-dessus de
       « Paramètres », en même temps que la colonne se réduit (aucun saut). -->
  <div class="strip">
    <button
      class="strip-btn settings"
      class:on={view?.kind === "settings"}
      onclick={(e) => go({ kind: "settings" }, e)}
      title="Paramètres"
      aria-label="Paramètres"
    >
      <Icon name="settings" />
    </button>
    <button
      class="strip-btn fold"
      onclick={() => settings.toggleSidebar()}
      title={shortcutHint(settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne", "toggleSidebar")}
      aria-label={settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne"}
    >
      <Icon name="panel" />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resizer" onpointerdown={startResize}></div>
</aside>

{#if editeur}
  <ColonneEditeur {groupes} {pagesClassees} nouveau={editeur.nouveau} onclose={() => (editeur = null)} />
{/if}

<style>
  .groupe-vide {
    margin: 2px 12px 6px 28px;
    font-size: 11.5px;
    color: var(--faint);
  }
  .rapide {
    display: grid;
    gap: 4px;
    padding: 10px 10px 12px;
  }
  .espace-groupe {
    height: 14px;
    flex: none;
  }
  .conv-tete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    flex: none;
  }
  .conv-titre {
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--faint);
  }
  .conv-nouvelle {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    font-size: 18px;
    line-height: 1;
  }
  .conv-nouvelle:hover {
    background: var(--field);
    color: var(--text);
  }
  .conv-cat {
    padding: 8px 8px 2px;
    font-size: 11.5px;
    color: var(--faint);
    white-space: nowrap;
  }
  .conv {
    flex: none;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    padding: 6px 8px;
    text-align: left;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
  }
  .conv:hover {
    background: var(--field);
  }
  .conv.active {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border);
  }
  .collapsed .conv-tete,
  .collapsed .conv-cat,
  .collapsed .conv {
    display: none;
  }
  .rapide input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--field);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .rapide small {
    font-size: 11.5px;
    color: var(--muted);
  }
  .rapide small.erreur {
    color: var(--danger, #d9534f);
  }
  .rapide-btn {
    margin: 8px auto;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    cursor: pointer;
    font-size: 16px;
  }
  .rapide-btn:hover {
    background: var(--field);
  }
  .side {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface-2);
    border-right: 1px solid var(--border);
    transition: width 0.2s ease-out;
  }
  .side.resizing {
    transition: none;
  }

  /* Écran étroit : la colonne devient un tiroir qui glisse depuis la gauche, par-dessus la page. */
  .side.drawer {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(86vw, 320px);
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 0.2s ease-out;
    box-shadow: none;
    padding-top: env(safe-area-inset-top, 0px);
  }
  .side.drawer.open {
    transform: none;
    box-shadow: var(--shadow);
  }
  .side.drawer .resizer,
  .side.drawer .strip-btn.fold {
    display: none;
  }
  .side.drawer .item {
    min-height: 44px;
  }

  /* Mêmes marges repliée ou dépliée : logo et tuiles ne bougent pas pendant l'animation,
     seule la largeur change et les textes s'estompent. Repliée (64 px), tout tombe au centre. */
  /* Un peu plus haute que la barre de titre : le logo et le nom respirent sous le bord de la fenêtre. */
  .brand-row {
    height: calc(var(--titlebar) + 12px);
    display: flex;
    align-items: center;
    padding: 0 12px;
    flex: none;
    overflow: hidden;
  }
  .drag {
    flex: 1;
    align-self: stretch;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 4px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    font-weight: 700;
    font-size: 19px;
    letter-spacing: -0.2px;
    white-space: nowrap;
  }
  .brand:hover {
    background: var(--field);
  }

  .nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    transition: opacity 0.12s ease-out;
  }
  .none {
    margin: 0;
    padding: 0 8px;
    font-size: 12.5px;
    color: var(--faint);
    white-space: nowrap;
  }
  .collapsed.folded .none {
    display: none;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 4px;
    flex: none;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    text-align: left;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .item:hover {
    background: var(--field);
  }
  .item.active {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border);
  }
  .item.active::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 13px;
    bottom: 13px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .item .label {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .item.active .label {
    font-weight: 600;
  }
  .item[hidden] {
    display: none;
  }
  .categorie {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px 2px 8px;
  }
  .cat-nom {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--faint);
    white-space: nowrap;
  }
  .chevron {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    font-size: 12px;
    line-height: 1;
    transition: transform 0.12s, background 0.12s, color 0.12s;
  }
  .cat-nom:hover .chevron,
  .cat-nom:focus-visible .chevron {
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    border-color: var(--accent);
  }
  .chevron.replie {
    transform: rotate(-90deg);
  }
  .menu-fond {
    position: fixed;
    inset: 0;
    z-index: 39;
  }
  .menu {
    position: fixed;
    z-index: 40;
    min-width: 200px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
  }
  .menu button {
    text-align: left;
    padding: 7px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--field);
  }
  .collapsed .categorie {
    height: 0;
    min-height: 0;
    padding: 0;
    margin: 6px 10px;
    border-top: 1px solid var(--border);
    overflow: hidden;
  }
  .collapsed .categorie:first-of-type {
    border-top: 0;
    margin: 0;
  }
  .collapsed .categorie > *,
  .collapsed .groupe-vide {
    display: none;
  }
  .collapsed .nav {
    scrollbar-width: none;
  }
  .collapsed .nav::-webkit-scrollbar {
    display: none;
  }
  .item.dragging {
    background: var(--surface);
    box-shadow: var(--shadow);
    cursor: grabbing;
    z-index: 2;
  }

  /* Deux boutons de 40 px placés à la main, pour animer leur déplacement avec la même durée et
     la même courbe que la largeur de la colonne. Paramètres ne bouge jamais (en bas à gauche). */
  .strip {
    position: relative;
    height: 57px; /* 1 px de trait + 8 + 40 + 8 */
    border-top: 1px solid var(--border);
    flex: none;
    transition: height 0.2s ease-out;
  }
  .collapsed .strip {
    height: 101px; /* un bouton de plus au-dessus : 44 px */
  }
  .strip-btn {
    position: absolute;
    left: 12px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    transition:
      transform 0.2s ease-out,
      background 0.12s,
      color 0.12s;
  }
  .strip-btn.fold {
    transform: translateX(44px);
  }
  .collapsed .strip-btn.fold {
    transform: translateY(-44px);
  }
  .resizing .strip,
  .resizing .strip-btn {
    transition: none;
  }
  .strip-btn:hover {
    background: var(--field);
    color: var(--text);
  }
  /* Page Paramètres ouverte : même repère que les plugins de la colonne (fond, bordure, barre d'accent). */
  .strip-btn.on {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border);
    color: var(--text);
  }
  .strip-btn.on::before {
    content: "";
    position: absolute;
    left: -12px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }

  /* Repliée : les textes s'estompent (en gardant leur place : rien ne remonte), puis
     disparaissent une fois l'animation finie pour que les boutons restent bien carrés. */
  .collapsed .label {
    opacity: 0;
  }
  .collapsed.folded .item .label,
  .collapsed.folded .brand .label {
    display: none;
  }
  /* Repliée : chaque entrée est un carré centré dans la colonne, l'icône pile au milieu de son fond. */
  .collapsed.folded .item {
    width: 48px;
    padding: 0;
    gap: 0;
    justify-content: center;
    align-self: center;
  }

  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .collapsed .resizer {
    display: none;
  }
</style>
