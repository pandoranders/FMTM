(() => {
  const config = window.FMTM_SUPABASE_CONFIG;
  if (!config?.url || !config.anonKey || !window.supabase) return;

  const byId = id => document.getElementById(id);
  const shoppingScreen = byId("shopping-screen");
  const menu = byId("bottom-menu");
  const storageKey = "sb-" + new URL(config.url).hostname.split(".")[0] + "-auth-token";
  // The main app manages the session. Read its latest token for RLS-protected queries.
  const client = window.supabase.createClient(config.url, config.anonKey, {
    accessToken: async () => {
      try {
        return JSON.parse(localStorage.getItem(storageKey))?.access_token ?? null;
      } catch {
        return null;
      }
    },
  });

  let sessionVersion = 0;
  let questBubbleTimer;


  function message(id, text, error = false) {
    const element = byId(id);
    element.textContent = text;
    element.classList.toggle("error-text", error);
  }

  function makeHeart() {
    const template = document.createElement("template");
    template.innerHTML = '<svg class="heart" viewBox="0 0 32 32" aria-hidden="true"><path class="heart-shape" d="M16 29C10 24 2 18 2 10a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 8-8 14-14 19Z"/><path class="heart-check" d="m10.5 15.5 4.5 5 7-10"/></svg>';
    return template.content.firstElementChild;
  }

  function showProgress(remaining) {
    const bubble = byId("quest-cheer");
    const message = remaining === 0 ? "Det var siste vare. Gå til kassa"
      : remaining === 1 ? "Bare 1 vare igjen" : `Bare ${remaining} varer igjen`;
    clearTimeout(questBubbleTimer);
    bubble.textContent = message;
    bubble.hidden = false;
    bubble.getAnimations().forEach(animation => animation.cancel());
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    bubble.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
      { transform: "translateY(-150px)", opacity: 0, easing: "ease-in" },
      { transform: "translateY(38px)", opacity: 1, offset: .39, easing: "ease-out" },
      { transform: "translateY(-14px)", offset: .63, easing: "ease-in" },
      { transform: "translateY(10px)", offset: .82, easing: "ease-out" },
      { transform: "translateY(0)", opacity: 1 }
    ], { duration: reduced ? 120 : 540 });
    questBubbleTimer = setTimeout(() => { bubble.hidden = true; }, 2200);
    if (!reduced) rainConfetti();
  }

  function rainConfetti() {
    const layer = document.createElement("div");
    layer.className = "celebration quest-confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const colors = ["#35537D", "#BDCCE3", "#A6B8D4", "#E8EFF8"];
    for (let i = 0; i < 70; i++) {
      const piece = document.createElement("span");
      piece.className = "quest-confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.borderRadius = i % 3 === 0 ? "50%" : "2px";
      layer.append(piece);
      const drift = (Math.random() - .5) * 180;
      piece.animate([
        { transform: "translateY(-30px) rotate(0deg)", opacity: 1 },
        { opacity: 1, offset: .8 },
        { transform: "translate(" + drift + "px, " + (innerHeight + 50) + "px) rotate(" + (360 + Math.random() * 540) + "deg)", opacity: 0 }
      ], { duration: 1800 + Math.random() * 900, delay: Math.random() * 350, easing: "linear", fill: "both" });
    }
    setTimeout(() => layer.remove(), 3100);
  }

  function createShoppingList() {
    const screen = "shopping";
    const table = "shopping_items";
    const element = suffix => byId(screen + "-" + suffix);
    const isVisible = () => !shoppingScreen.hidden;
    const form = element("form");
    const input = element("input");
    const addButton = element("add");
    const clearButton = element("clear");
    const clearDialog = element("clear-dialog");
    let items = [];
    let ready = false;
    let busy = false;
    let requestVersion = 0;

    function render() {
      element("empty").hidden = !ready || items.length > 0;
      if (clearButton) clearButton.disabled = !ready || busy || items.length === 0;
      updateSubmit();
      element("list").replaceChildren(...items.map(item => {
        const row = document.createElement("li");
        const label = document.createElement("label");
        label.className = "task-label";
        const checkbox = document.createElement("input");
        checkbox.className = "task-checkbox";
        checkbox.type = "checkbox";
        checkbox.checked = item.done;
        checkbox.disabled = !ready || busy;
        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = item.title;
        label.append(checkbox, makeHeart(), title);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button todo-remove";
        remove.setAttribute("aria-label", "Slett " + item.title);
        remove.disabled = !ready || busy;
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
        remove.addEventListener("click", async () => {
          if (await save(() => client.from(table).delete().eq("id", item.id))) {
            if (isVisible()) input.focus();
          }
        });
        row.append(label, remove);
        checkbox.addEventListener("change", async () => {
          const done = checkbox.checked;
          checkbox.checked = item.done;
          const saved = await save(() => client.from(table).update({ done }).eq("id", item.id));
          if (saved && ready && done && !item.done && isVisible()) {
            showProgress(items.filter(task => !task.done).length);
          }
          if (isVisible()) element("list").querySelectorAll("input")[items.findIndex(task => task.id === item.id)]?.focus();
        });
        return row;
      }));
    }

    async function load() {
      if (busy) return;
      const request = ++requestVersion;
      const session = sessionVersion;
      const { data, error } = await client.from(table)
        .select("id,title,done").order("created_at").order("id");
      if (request !== requestVersion || session !== sessionVersion) return;
      ready = !error;
      if (error) message(screen + "-feedback", "Kunne ikke hente lista. Åpne lista på nytt for å prøve igjen.", true);
      else {
        items = data;
        message(screen + "-feedback", "");
      }
      render();
    }

    async function save(write) {
      if (busy || !ready) return false;
      const request = sessionVersion;
      ++requestVersion;
      busy = true;
      render();
      const { error } = await write();
      if (request !== sessionVersion) return false;
      busy = false;
      if (error) {
        message(screen + "-feedback", "Kunne ikke lagre endringen. Prøv igjen.", true);
        render();
        return false;
      }
      await load();
      return request === sessionVersion;
    }

    function updateSubmit() {
      addButton.disabled = !ready || busy || !input.value.trim();
    }

    input.addEventListener("input", updateSubmit);

    if (clearDialog) {
      clearButton.addEventListener("click", () => {
        clearDialog.returnValue = "";
        clearDialog.showModal();
      });
      clearDialog.addEventListener("close", async () => {
        if (clearDialog.returnValue !== "confirm" || !isVisible()) return;
        const cleared = await save(() => client.from(table).delete().not("id", "is", null));
        if (cleared && isVisible()) input.focus();
      });
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title) {
        input.focus();
        return;
      }
      if (await save(() => client.from(table).insert({ title }))) {
        form.reset();
        updateSubmit();
        if (isVisible()) input.focus();
      }
    });

    return {
      load,
      reset() {
        ++requestVersion;
        if (clearDialog?.open) clearDialog.close();
        items = [];
        ready = false;
        busy = false;
        form.reset();
        message(screen + "-feedback", "");
        render();
      }
    };
  }


  const list = createShoppingList();
  function showShopping() {
    const visible = !menu.hidden && document.documentElement.dataset.screen === "shopping";
    if (visible === !shoppingScreen.hidden) return;
    shoppingScreen.hidden = !visible;
    if (visible) list.load();
    else {
      clearTimeout(questBubbleTimer);
      byId("shopping-clear-dialog").close();
    }
  }

  new MutationObserver(() => {
    if (menu.hidden) {
      ++sessionVersion;
      list.reset();
    }
    showShopping();
  }).observe(menu, { attributeFilter: ["hidden"] });
  new MutationObserver(showShopping).observe(document.documentElement, { attributeFilter: ["data-screen"] });
  showShopping();
})();
