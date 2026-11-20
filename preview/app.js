(() => {
  const LEGACY_USERNAME = "unibear";
  const LOGIN_EMAIL = "pandoranders@gmail.com";
  const DEFAULT_ROOMS = [
    [["kjokken", "Kjøkken"], ["loftsstue", "Loftsstue"], ["annet", "Uten rom"]],
    [["stue", "Stue"], ["elli", "Rommet til Elli"], ["walk-in", "Walk-in"]]
  ].flatMap((rooms, column) => rooms.map(([id, name], index) => ({
    id, name, layout_column: column + 1, sort_order: index * 10
  })));
  const OTHER_ROOM = "annet";
  const config = window.FMTM_SUPABASE_CONFIG || {};
  const byId = id => document.getElementById(id);
  const list = byId("task-list");
  const form = byId("add-form");
  const manager = byId("task-manager");
  const managedList = byId("managed-tasks");
  const input = byId("task-input");
  const room = byId("task-room");
  const parent = byId("task-parent");
  const clearDone = byId("clear-done");
  const signIn = byId("sign-in");
  const usernameInput = byId("username");
  const recoveryForm = byId("recovery-form");
  const signOut = byId("sign-out");
  const signOutDenied = byId("sign-out-denied");
  const roomForm = byId("room-form");
  const roomInput = byId("room-name");
  const managedRooms = byId("managed-rooms");
  const filters = [...document.querySelectorAll("[data-filter]")];

  let client;
  let loginUsername;
  let recoveringPassword = false;
  let recoveryLink = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
  let channel;
  let roomsChannel;
  let tasks = [];
  let rooms = DEFAULT_ROOMS;
  let roomNames = new Map(rooms.map(({ id, name }) => [id, name]));
  let roomSupport = false;
  let roomManagement = false;
  let currentFilter = "all";
  let editingId = null;
  let editingRoomId = null;
  let activeUser = null;
  let requestVersion = 0;

  const screenLinks = [...document.querySelectorAll("[data-screen-link]")];
  const todoForm = byId("todo-form");
  const todoInput = byId("todo-input");
  const todoAdd = byId("todo-add");
  let todoItems = [];
  let todoReady = false;
  let todoBusy = false;
  let todoRequest = 0;

  const ritulas = byId("ritulas-screen");
  const ritulasManager = byId("ritulas-manager");
  const ritulasList = byId("ritulas-list");
  const ritulasForm = byId("ritulas-form");
  const ritulasInput = byId("ritulas-input");
  const ritualCalendar = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", hourCycle: "h23"
  });
  let ritualItems = [];
  let ritualReady = false;
  let ritualBusy = false;
  let ritualRequest = 0;
  let ritualRenderedDay;
  let ritualCelebratedDay;
  let ritualFinaleTimer;

  function ritualDay(now = new Date()) {
    const { year, month, day, hour } = Object.fromEntries(
      ritualCalendar.formatToParts(now).map(({ type, value }) => [type, value])
    );
    return new Date(Date.UTC(+year, month - 1, day - (hour < 2 ? 1 : 0))).toISOString().slice(0, 10);
  }

  function renderRitulas() {
    ritualRenderedDay = ritualDay();
    const locked = !ritualReady || ritualBusy;
    byId("ritulas-edit").disabled = !ritualReady;
    ritulasForm.querySelector("button").disabled = locked;
    byId("ritulas-empty").hidden = !ritualReady || ritualItems.length > 0;
    byId("ritulas-done").hidden = !ritualReady || !ritualItems.length ||
      !ritualItems.every(item => item.completed_on === ritualRenderedDay);

    ritulasList.replaceChildren(...ritualItems.map(item => {
      const row = document.createElement("li");
      const label = document.createElement("label");
      label.className = "task-label";
      const checkbox = document.createElement("input");
      checkbox.className = "task-checkbox";
      checkbox.type = "checkbox";
      checkbox.checked = item.completed_on === ritualRenderedDay;
      checkbox.disabled = locked;
      const title = document.createElement("span");
      title.textContent = item.title;
      label.append(checkbox, makeHeart(), title);
      row.append(label);
      checkbox.addEventListener("change", async () => {
        const day = ritualDay();
        const done = checkbox.checked;
        if (await saveRitula(() => client.from("ritulas")
          .update({ completed_on: done ? day : null }).eq("id", item.id).select().single())) {
          if (!ritulas.hidden) ritulasList.querySelectorAll("input")[ritualItems.findIndex(task => task.id === item.id)]?.focus();
          if (done && !ritulas.hidden && day === ritualDay()) {
            const allDone = ritualItems.every(task => task.completed_on === day);
            if (allDone && ritualCelebratedDay !== day &&
                localStorage.getItem("fmtm-ritulas-finale") !== day) {
              ritualCelebratedDay = day;
              localStorage.setItem("fmtm-ritulas-finale", day);
              showRitulasFinale();
            } else celebrateQuest("ritulas");
          }
        }
      });
      return row;
    }));

    byId("ritulas-edit-list").replaceChildren(...ritualItems.map(item => {
      const row = document.createElement("li");
      const editor = document.createElement("form");
      editor.className = "ritulas-editor-row";
      const field = document.createElement("input");
      field.value = item.title;
      field.required = true;
      field.maxLength = 180;
      field.setAttribute("aria-label", "Rediger " + item.title);
      const save = document.createElement("button");
      save.setAttribute("aria-label", "Lagre " + item.title);
      save.title = "Lagre";
      save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
      save.disabled = locked;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = "Slett";
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
      remove.setAttribute("aria-label", "Slett " + item.title);
      remove.disabled = locked;
      editor.append(field, save, remove);
      editor.addEventListener("submit", event => {
        event.preventDefault();
        const title = field.value.trim();
        if (title && title !== item.title) saveRitula(() => client.from("ritulas")
          .update({ title }).eq("id", item.id).select().single());
      });
      remove.addEventListener("click", () => saveRitula(() => client.from("ritulas")
        .delete().eq("id", item.id).select().single(), true));
      row.append(editor);
      return row;
    }));
  }

  async function loadRitulas() {
    if (ritualBusy) return;
    const request = ++ritualRequest;
    const { data, error } = await client.from("ritulas").select().order("created_at").order("id");
    if (request !== ritualRequest) return;
    ritualReady = !error;
    if (!error) ritualItems = data;
    message("ritulas-status", error ? "Kunne ikke hente daglige oppgaver." : "", Boolean(error));
    renderRitulas();
  }

  async function saveRitula(write, remove = false) {
    if (!activeUser || !ritualReady || ritualBusy) return false;
    ritualBusy = true;
    const request = ++ritualRequest;
    const status = ritulasManager.open ? "ritulas-edit-status" : "ritulas-status";
    message(status, "");
    try {
      const { data, error } = await write();
      if (request !== ritualRequest) return false;
      if (error) throw error;
      const index = ritualItems.findIndex(item => item.id === data.id);
      if (remove) ritualItems = ritualItems.filter(item => item.id !== data.id);
      else if (index < 0) ritualItems.push(data);
      else ritualItems[index] = data;
      return true;
    } catch {
      if (request === ritualRequest) message(status, "Kunne ikke lagre endringen. Prøv igjen.", true);
      return false;
    } finally {
      if (request === ritualRequest) {
        ritualBusy = false;
        renderRitulas();
      }
    }
  }

  function showRitulasFinale() {
    clearTimeout(questBubbleTimer);
    byId("quest-cheer").hidden = true;
    clearTimeout(ritualFinaleTimer);
    byId("ritulas-finale").hidden = false;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) rainQuestConfetti("finale");
    ritualFinaleTimer = setTimeout(() => { byId("ritulas-finale").hidden = true; }, 5200);
  }

  byId("ritulas-edit").addEventListener("click", () => ritulasManager.showModal());
  ritulasForm.addEventListener("submit", async event => {
    event.preventDefault();
    const title = ritulasInput.value.trim();
    if (title && await saveRitula(() => client.from("ritulas").insert({ title }).select().single())) {
      ritulasForm.reset();
      if (ritulasManager.open) ritulasInput.focus();
    }
  });

  function refreshRitualDay() {
    if (!ritulas.hidden && ritualRenderedDay !== ritualDay()) renderRitulas();
  }
  setInterval(refreshRitualDay, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeUser && !ritulas.hidden) {
      refreshRitualDay();
      loadRitulas();
    }
  });

  function showScreen() {
    if (recoveringPassword || !activeUser) return;
    const requested = location.hash.slice(1);
    const screen = screenLinks.some(link => link.dataset.screenLink === requested) ? requested : "todo";
    const previous = document.documentElement.dataset.screen;
    document.documentElement.dataset.screen = screen;
    ritulas.hidden = screen !== "ritulas";
    if (ritulas.hidden) {
      ritulasManager.close();
      byId("ritulas-finale").hidden = true;
    }
    byId("house-banner").hidden = screen !== "house";
    byId("app-content").hidden = screen !== "house";
    byId("todo-screen").hidden = screen !== "todo";
    if (screen !== previous) {
      byId("quest-cheer").hidden = true;
      document.querySelectorAll(".quest-confetti").forEach(layer => layer.remove());
    }
    byId("bear-screen").hidden = screen !== "bear";
    byId("bottom-menu").hidden = false;
    for (const link of screenLinks) {
      if (link.dataset.screenLink === screen) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    document.querySelector('meta[name="theme-color"]').content =
      getComputedStyle(document.documentElement).getPropertyValue("--backdrop").trim();
    window.scrollTo(0, 0);
    if (screen === "todo") loadTodo();
    if (screen === "ritulas") loadRitulas();
    if (screen === "bear") loadBearMessages();
    else checkBearUnread();
  }

  window.addEventListener("hashchange", showScreen);

  const bearMessages = byId("bear-messages");
  const bearActions = byId("bear-actions");
  const bearNavigation = byId("bear-navigation");
  let bearRequest = 0;

  function updateBearDots() {
    const total = bearMessages.children.length;
    if (!total || !bearMessages.clientWidth) return;
    const current = Math.min(total - 1, Math.max(0, Math.round(bearMessages.scrollLeft / bearMessages.clientWidth)));
    [...bearActions.children].forEach((button, index) => { button.hidden = Math.floor(index / 4) !== current; });
    if (total < 2) return;
    const visible = Math.min(total, 5);
    const first = Math.min(Math.max(current - 2, 0), total - visible);
    const label = "Beskjed " + (current + 1) + " av " + total;
    if (bearNavigation.getAttribute("aria-label") === label && bearNavigation.children.length === visible) return;
    bearNavigation.setAttribute("aria-label", label);
    bearNavigation.replaceChildren(...Array.from({ length: visible }, (_, index) => {
      const dot = document.createElement("span");
      dot.className = "bear-dot";
      dot.classList.toggle("is-active", first + index === current);
      return dot;
    }));
  }

  const bearTab = document.querySelector('[data-screen-link="bear"]');
  let readBearId;
  let bearUnreadRequest = 0;

  const unreadEnvelope = bearTab.querySelector(".bear-unread-envelope");
  bearTab.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        !bearTab.classList.contains("has-unread-mail") ||
        unreadEnvelope.classList.contains("is-popping") ||
        matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    unreadEnvelope.classList.add("is-popping");
    const pop = unreadEnvelope.animate([
      { transform: "scale(1)", opacity: 1 },
      { transform: "translateY(-4px) scale(1.45) rotate(-12deg)", opacity: 1, offset: .35 },
      { transform: "translateY(-12px) scale(.6) rotate(14deg)", opacity: 0 }
    ], { duration: 420, easing: "ease-out", fill: "forwards" });
    pop.onfinish = () => {
      unreadEnvelope.classList.remove("is-popping");
      pop.cancel();
    };
  });

  function setBearUnread(unread) {
    bearTab.classList.toggle("has-unread-mail", unread);
    if (unread) bearTab.setAttribute("aria-label", "Bear Mail, new message");
    else bearTab.removeAttribute("aria-label");
  }

  function seenBearId(user) {
    try { return readBearId ?? localStorage.getItem("fmtm-bear-seen:" + user); }
    catch { return readBearId; }
  }

  async function checkBearUnread() {
    if (!activeUser || document.hidden || document.documentElement.dataset.screen === "bear") return;
    const user = activeUser;
    const request = ++bearUnreadRequest;
    const { data, error } = await client.from("bear_messages").select("id")
      .order("created_at", { ascending: false }).order("id").limit(1);
    if (error || user !== activeUser || request !== bearUnreadRequest || document.documentElement.dataset.screen === "bear") return;
    setBearUnread(Boolean(data[0] && data[0].id !== seenBearId(user)));
  }

  document.addEventListener("visibilitychange", checkBearUnread);
  setInterval(checkBearUnread, 60000);

  async function loadBearMessages() {
    const request = ++bearRequest;
    const user = activeUser;
    bearMessages.hidden = true;
    bearNavigation.hidden = true;
    bearMessages.replaceChildren();
    bearActions.replaceChildren();
    bearActions.hidden = true;
    message("bear-heart-status", "");
    message("bear-status", "Henter beskjeder …");
    const { data, error } = await client.from("bear_messages")
      .select("id,title,body,heart_count,fire_count,bear_count,unicorn_count").order("created_at", { ascending: false }).order("id");
    if (request !== bearRequest || user !== activeUser) return;
    if (error) {
      message("bear-status", "Kunne ikke hente beskjedene.", true);
      return;
    }
    if (document.documentElement.dataset.screen === "bear" && data[0]) {
      readBearId = data[0].id;
      try { localStorage.setItem("fmtm-bear-seen:" + user, readBearId); } catch {}
      setBearUnread(false);
    }
    for (const item of data) {
      const card = document.createElement("article");
      const title = document.createElement("h2");
      const body = document.createElement("p");
      title.textContent = item.title;
      body.textContent = item.body;
      card.append(title, body);
      for (const reaction of ["fire", "heart", "bear", "unicorn"]) {
        const button = makeBearHeartButton(item, reaction);
        button.hidden = bearMessages.children.length > 0;
        bearActions.append(button);
      }
      bearMessages.append(card);
    }
    message("bear-status", data.length ? "" : "Ingen beskjeder fra bjørnen ennå.");
    bearMessages.hidden = data.length === 0;
    bearActions.hidden = data.length === 0;
    bearMessages.scrollLeft = 0;
    bearNavigation.hidden = data.length < 2;
    updateBearDots();
  }

  function makeBearHeartButton(item, reaction) {
    const symbols = { fire: 0x1f525, heart: 0x1f496, bear: 0x1f43b, unicorn: 0x1f984 };
    const labels = { fire: "flammer", heart: "hjerter", bear: "bjørner", unicorn: "enhjørninger" };
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bear-heart-button";
    button.innerHTML = '<span class="bear-heart-icon" aria-hidden="true">&#x1F496;</span><span></span>';
    button.firstElementChild.textContent = String.fromCodePoint(symbols[reaction]);
    const count = button.lastElementChild;
    let saved = item[reaction + "_count"];
    let pending = 0;
    let queue = Promise.resolve();

    function renderCount() {
      count.textContent = saved + pending;
      button.setAttribute("aria-label", "Gi reaksjon. " + count.textContent + " " + labels[reaction]);
    }

    renderCount();
    button.addEventListener("click", () => {
      burstBearHearts(button, symbols[reaction]);
      pending++;
      renderCount();
      queue = queue.then(async () => {
        try {
          const { data, error } = await client.rpc("add_bear_reaction", { message_id: item.id, reaction });
          if (error) throw error;
          saved = data;
        } catch {
          message("bear-heart-status", "Kunne ikke lagre reaksjonen. Prøv igjen.", true);
        } finally {
          pending--;
          renderCount();
        }
      });
    });
    return button;
  }

  function burstBearHearts(button, symbol) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = button.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "celebration bear-reaction-burst";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    for (let index = 0; index < 50; index++) {
      const heart = document.createElement("span");
      heart.className = "celebration-sparkle";
      heart.textContent = String.fromCodePoint(symbol);
      heart.style.left = (rect.left + rect.width / 2) + "px";
      heart.style.top = (rect.top + rect.height / 2) + "px";
      heart.style.fontSize = (14 + Math.random() * 14) + "px";
      layer.append(heart);
      const x = (Math.random() - .5) * Math.min(window.innerWidth * 1.4, 1000);
      const y = -(140 + Math.random() * 420);
      const duration = 1200 + Math.random() * 1000;
      heart.animate([
        { transform: "translate(-50%, -50%) scale(.45)", opacity: 1 },
        { opacity: 1, offset: 300 / duration },
        { transform: "translate(calc(-50% + " + x + "px), calc(-50% + " + y + "px)) scale(1)", opacity: 0 }
      ], { duration, easing: "linear" });
    }
    setTimeout(() => layer.remove(), 2300);
  }

  function moveBearMessage(direction) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bearMessages.scrollBy({ left: direction * bearMessages.clientWidth, behavior: reducedMotion ? "instant" : "smooth" });
  }

  bearMessages.addEventListener("scroll", updateBearDots, { passive: true });
  bearMessages.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveBearMessage(event.key === "ArrowLeft" ? -1 : 1);
  });

  // Touch and trackpad use native scrolling and snap. Mouse drag changes one card.
  let bearDrag;
  bearMessages.addEventListener("pointerdown", event => {
    if (event.target.closest("button") || event.pointerType !== "mouse" || event.button !== 0 || bearMessages.children.length < 2) return;
    event.preventDefault();
    bearMessages.setPointerCapture(event.pointerId);
    bearDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  bearMessages.addEventListener("pointerup", event => {
    if (bearDrag?.id !== event.pointerId) return;
    const x = event.clientX - bearDrag.x;
    const y = event.clientY - bearDrag.y;
    if (Math.abs(x) >= 36 && Math.abs(x) > Math.abs(y)) moveBearMessage(x < 0 ? 1 : -1);
  });
  bearMessages.addEventListener("lostpointercapture", () => { bearDrag = undefined; });

  const questCheers = [
    "BAM!", "BOOYAH!", "LEVEL UP!", "TADAAA!", "DING DING!", "HOLY MOLY!",
    "COMPLETED!", "CRUSHED IT!", "ONE LESS QUEST!", "TASK TOASTED",
    "POFF!", "ANOTHER ONE DOWN!", "GET OUTTA HERE!"
  ];
  let lastQuestCheer = -1;
  let questBubbleTimer;

  function celebrateQuest(mode = "quest") {
    const bubble = byId("quest-cheer");
    let index = Math.floor(Math.random() * (questCheers.length - (lastQuestCheer < 0 ? 0 : 1)));
    if (lastQuestCheer >= 0 && index >= lastQuestCheer) index++;
    lastQuestCheer = index;
    clearTimeout(questBubbleTimer);
    bubble.textContent = questCheers[index];
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
    if (!reduced) rainQuestConfetti(mode);
  }

  function rainQuestConfetti(mode) {
    const layer = document.createElement("div");
    layer.className = "celebration quest-confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const colors = ["#a451d9", "#ed83bd", "#ffd65b", "#fff4bc", "#77d7c8", "#ffffff"];
    const rare = mode === "quest" && Math.random() < .05;
    const symbol = rare ? String.fromCodePoint(Math.random() < .5 ? 0x1f43e : 0x1f984) : "";
    const count = { quest: rare ? 42 : 70, ritulas: 22, finale: 150 }[mode];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "quest-confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      if (rare) {
        piece.textContent = symbol;
        piece.classList.add("quest-confetti-symbol");
      } else piece.style.background = colors[i % colors.length];
      piece.style.borderRadius = i % 3 === 0 ? "50%" : "2px";
      layer.append(piece);
      const drift = (Math.random() - .5) * 180;
      piece.animate([
        { transform: "translateY(-30px) rotate(0deg)", opacity: 1 },
        { opacity: 1, offset: .8 },
        { transform: "translate(" + drift + "px, " + (innerHeight + 50) + "px) rotate(" + (360 + Math.random() * 540) + "deg)", opacity: 0 }
      ], { duration: 1800 + Math.random() * 900, delay: Math.random() * (mode === "finale" ? 1400 : 350), easing: "linear", fill: "both" });
    }
    setTimeout(() => layer.remove(), mode === "finale" ? 4200 : 3100);
  }

  function renderTodo() {
    byId("todo-empty").hidden = !todoReady || todoItems.length > 0;
    updateTodoSubmit();
    byId("todo-list").replaceChildren(...todoItems.map(item => {
      const row = document.createElement("li");
      const label = document.createElement("label");
      label.className = "task-label";
      const checkbox = document.createElement("input");
      checkbox.className = "task-checkbox";
      checkbox.type = "checkbox";
      checkbox.checked = item.done;
      checkbox.disabled = !todoReady || todoBusy;
      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = item.title;
      label.append(checkbox, makeHeart(), title);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button todo-remove";
      remove.setAttribute("aria-label", "Slett " + item.title);
      remove.disabled = !todoReady || todoBusy;
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';
      remove.addEventListener("click", async () => {
        if (await changeTodo(() => client.from("todo_items").delete().eq("id", item.id))) {
          if (activeUser && document.documentElement.dataset.screen === "todo") todoInput.focus();
        }
      });
      row.append(label, remove);
      checkbox.addEventListener("change", async () => {
        const done = checkbox.checked;
        checkbox.checked = item.done;
        const saved = await changeTodo(() => client.from("todo_items").update({ done }).eq("id", item.id));
        if (saved && done && !item.done && document.documentElement.dataset.screen === "todo") celebrateQuest();
        byId("todo-list").querySelectorAll("input")[todoItems.findIndex(task => task.id === item.id)]?.focus();
      });
      return row;
    }));
  }

  async function loadTodo() {
    if (todoBusy) return;
    const request = ++todoRequest;
    const user = activeUser;
    const { data, error } = await client.from("todo_items")
      .select("id,title,done").order("created_at").order("id");
    if (request !== todoRequest || user !== activeUser) return;
    todoReady = !error;
    if (error) message("todo-feedback", "Kunne ikke hente lista. Åpne Todo på nytt for å prøve igjen.", true);
    else {
      todoItems = data;
      message("todo-feedback", "");
    }
    renderTodo();
  }

  async function changeTodo(write) {
    if (todoBusy || !todoReady) return false;
    const user = activeUser;
    ++todoRequest;
    todoBusy = true;
    renderTodo();
    const { error } = await write();
    if (user !== activeUser) return false;
    todoBusy = false;
    if (error) {
      message("todo-feedback", "Kunne ikke lagre endringen. Prøv igjen.", true);
      renderTodo();
      return false;
    }
    await loadTodo();
    return user === activeUser;
  }

  function updateTodoSubmit() {
    todoAdd.disabled = !todoReady || todoBusy || !todoInput.value.trim();
  }

  todoInput.addEventListener("input", updateTodoSubmit);

  todoForm.addEventListener("submit", async event => {
    event.preventDefault();
    const title = todoInput.value.trim();
    if (!title) {
      todoInput.focus();
      return;
    }
    if (await changeTodo(() => client.from("todo_items").insert({ title }))) {
      todoForm.reset();
      updateTodoSubmit();
      if (activeUser && document.documentElement.dataset.screen === "todo") todoInput.focus();
    }
  });
  updateRoomOptions();

  function message(id, text, error = false) {
    const element = byId(id);
    element.textContent = text;
    element.classList.toggle("error-text", error);
  }

  function taskRoom(task) {
    return roomNames.has(task.room) ? task.room : OTHER_ROOM;
  }

  function updateRoomOptions() {
    const selected = room.value;
    const ordered = rooms.filter(item => item.id !== OTHER_ROOM);
    ordered.push(...rooms.filter(item => item.id === OTHER_ROOM));
    room.replaceChildren(...ordered.map(item => new Option(item.name, item.id)));
    if (selected) room.value = roomNames.has(selected) ? selected : OTHER_ROOM;
  }

  function updateParents() {
    const current = parent.value;
    parent.replaceChildren(new Option("Ingen", ""));
    // A task with children stays at the top level.
    if (!tasks.some(task => task.parent_id === editingId && editingId)) {
      for (const task of tasks) {
        if (!task.parent_id && task.id !== editingId && taskRoom(task) === room.value) {
          parent.add(new Option(task.title, task.id));
        }
      }
    }
    if ([...parent.options].some(option => option.value === current)) parent.value = current;
  }

  function makeHeart() {
    const template = document.createElement("template");
    template.innerHTML = '<svg class="heart" viewBox="0 0 32 32" aria-hidden="true"><path class="heart-shape" d="M16 29C10 24 2 18 2 10a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 8-8 14-14 19Z"/><path class="heart-check" d="m10.5 15.5 4.5 5 7-10"/></svg>';
    return template.content.firstElementChild;
  }

  function taskRow(task, child) {
    const row = document.createElement("li");
    row.className = child ? "task task-child" : "task";
    const label = document.createElement("label");
    label.className = "task-label";
    const checkbox = document.createElement("input");
    checkbox.className = "task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.dataset.taskId = task.id;
    checkbox.addEventListener("change", () => saveCheck(task, checkbox));
    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;
    label.append(checkbox, makeHeart(), title);
    row.append(label);
    return row;
  }

  function managerAction(icon, label, task, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.title = label;
    button.setAttribute("aria-label", label + " " + (task.title ?? task.name));
    button.dataset.taskAction = label + ":" + task.id;
    const paths = {
      edit: "M12 20h9M16 4l4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z",
      delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", paths[icon]);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    button.append(svg);
    button.addEventListener("click", () => action(task, button));
    return button;
  }

  function renderManager() {
    const focusedAction = managedList.contains(document.activeElement) ? document.activeElement.dataset.taskAction : null;
    const visible = tasks.filter(task => currentFilter === "all" || task.done === (currentFilter === "done"));
    const rows = visible.map(task => {
      const row = document.createElement("li");
      row.className = "managed-task";
      const description = document.createElement("div");
      const title = document.createElement("span");
      title.textContent = task.title;
      const details = document.createElement("small");
      details.textContent = [
        roomNames.get(taskRoom(task)),
        task.parent_id ? "Underoppgave" : "",
        task.done ? "Ferdig" : ""
      ].filter(Boolean).join(" · ");
      description.append(title, details);
      const actions = document.createElement("div");
      actions.className = "managed-actions";
      actions.append(managerAction("edit", "Rediger", task, startEdit), managerAction("delete", "Slett", task, removeTask));
      row.append(description, actions);
      return row;
    });
    managedList.replaceChildren(...rows);
    byId("managed-empty").hidden = visible.length !== 0;
    byId("managed-empty").textContent = tasks.length ? "Ingen oppgaver i denne visningen." : "Ingen oppgaver ennå.";
    const openCount = tasks.filter(task => !task.done).length;
    byId("remaining").textContent = openCount === 1 ? "1 oppgave igjen" : openCount + " oppgaver igjen";
    clearDone.disabled = !tasks.some(task => task.done);
    if (focusedAction) {
      const next = [...managedList.querySelectorAll("button")].find(button => button.dataset.taskAction === focusedAction);
      (next || managedList.querySelector("button") || input).focus({ preventScroll: Boolean(next) });
    }
  }

  function renderRooms() {
    const focused = managedRooms.contains(document.activeElement) ? document.activeElement.dataset.taskAction : null;
    roomForm.hidden = !roomManagement;
    const rows = rooms.filter(item => item.id !== OTHER_ROOM).map(item => {
      const row = document.createElement("li");
      row.className = "managed-task";
      const title = document.createElement("span");
      title.textContent = item.name;
      const actions = document.createElement("div");
      actions.className = "managed-actions";
      actions.append(managerAction("edit", "Gi nytt navn til", item, startRoomEdit), managerAction("delete", "Slett", item, removeRoom));
      row.append(title, actions);
      return row;
    });
    managedRooms.replaceChildren(...(roomManagement ? rows : []));
    if (focused && roomManagement) {
      const next = [...managedRooms.querySelectorAll("button")].find(button => button.dataset.taskAction === focused);
      (next || roomInput).focus({ preventScroll: Boolean(next) });
    }
  }

  function resetRoomForm() {
    editingRoomId = null;
    roomForm.reset();
    roomForm.querySelector("[type=submit]").textContent = "Legg til rom";
    byId("cancel-room-edit").hidden = true;
  }

  function startRoomEdit(item) {
    editingRoomId = item.id;
    roomInput.value = item.name;
    roomForm.querySelector("[type=submit]").textContent = "Lagre romnavn";
    byId("cancel-room-edit").hidden = false;
    roomInput.focus();
  }

  async function removeRoom(item, button) {
    if (!window.confirm("Slette «" + item.name + "»? Oppgavene i rommet flyttes til «Uten rom».")) return;
    button.disabled = true;
    const { error } = await client.from("rooms").delete().eq("id", item.id);
    button.disabled = false;
    if (error) {
      message("room-feedback", "Rommet ble ikke slettet. Prøv igjen.", true);
      return;
    }
    if (editingRoomId === item.id) resetRoomForm();
    await loadTasks();
  }

  async function removeTask(task, button) {
    button.disabled = true;
    const { error } = await client.from("tasks").delete().eq("id", task.id);
    button.disabled = false;
    if (error) {
      message("manager-feedback", "Oppgaven ble ikke slettet. Prøv igjen.", true);
      return;
    }
    if (editingId === task.id) resetForm();
    await loadTasks();
  }

  function render() {
    const focused = document.activeElement?.dataset.taskId;
    list.replaceChildren();
    for (const columnNumber of [1, 2]) {
      const column = document.createElement("div");
      for (const { id, name } of rooms.filter(item => item.layout_column === columnNumber)) {
        const inRoom = tasks.filter(task => taskRoom(task) === id);
        if (id === OTHER_ROOM && inRoom.length === 0) continue;
        const section = document.createElement("section");
        section.className = "room";
        const heading = document.createElement("h2");
        heading.textContent = name;
        const rows = document.createElement("ul");
        rows.className = "task-list";
        const nested = new Set();
        for (const task of inRoom) {
          if (task.parent_id && inRoom.some(candidate => candidate.id === task.parent_id && !candidate.parent_id)) {
            nested.add(task.id);
          }
        }
        for (const task of inRoom) {
          if (nested.has(task.id)) continue;
          rows.append(taskRow(task, Boolean(task.parent_id)));
          for (const child of inRoom) {
            if (nested.has(child.id) && child.parent_id === task.id) rows.append(taskRow(child, true));
          }
        }
        section.append(heading, rows);
        column.append(section);
      }
      list.append(column);
    }

    byId("empty-state").hidden = tasks.length !== 0;
    byId("empty-state").textContent = "Legg til en oppgave under Admin.";
    byId("room-field").hidden = !roomSupport;
    byId("parent-field").hidden = !roomSupport;
    updateParents();
    if (manager.open) {
      renderManager();
      renderRooms();
    }
    if (focused) list.querySelector('[data-task-id="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
  }

  async function loadTasks() {
    const version = ++requestVersion;
    let [result, roomResult] = await Promise.all([
      client.from("tasks").select("id,title,done,created_at,room,parent_id").order("created_at").order("id"),
      client.from("rooms").select("id,name,layout_column,sort_order").order("sort_order").order("name")
    ]);
    const missingRooms = result.error?.code === "42703";
    if (missingRooms) result = await client.from("tasks").select("id,title,done,created_at").order("created_at").order("id");
    if (version !== requestVersion || !activeUser) return;
    if (result.error) {
      message(manager.open ? "manager-feedback" : "feedback", "Kunne ikke hente oppgavene. Prøv igjen.", true);
      return;
    }
    roomSupport = !missingRooms;
    roomManagement = !roomResult.error;
    if (roomManagement) rooms = roomResult.data || [];
    else if (["PGRST205", "42P01"].includes(roomResult.error.code)) rooms = DEFAULT_ROOMS;
    roomNames = new Map(rooms.map(({ id, name }) => [id, name]));
    updateRoomOptions();
    if (roomManagement && !roomsChannel) {
      roomsChannel = client.channel("fmtm-room-updates")
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, loadTasks)
        .subscribe();
    }
    tasks = result.data || [];
    message("feedback", "");
    message("manager-feedback", missingRooms ? "Rom og underoppgaver blir tilgjengelige når romoppsettet er lagt inn i Supabase." : "");
    message("room-feedback", roomManagement ? "" :
      ["PGRST205", "42P01"].includes(roomResult.error.code)
        ? "Kjør den oppdaterte supabase-rooms.sql i Supabase for å administrere rom."
        : "Kunne ikke hente rommene. Prøv igjen.", !roomManagement);
    render();
  }

  function celebrateHeart(origin, motivational = false) {
    document.querySelectorAll(".celebration").forEach(layer => layer.remove());
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layer = document.createElement("div");
    layer.className = "celebration";
    layer.setAttribute("aria-hidden", "true");
    (motivational ? byId("motivation-overlay") : document.body).append(layer);
    const colors = ["#ffcf40", "#fff5ad", "#ff77bc", "#ffffff", "#b78aff", "#79dfe5"];
    const count = reducedMotion ? 10 : motivational ? 240 : 180;
    for (let i = 0; i < count; i++) {
      const sparkle = document.createElement("span");
      sparkle.className = "celebration-sparkle";
      sparkle.textContent = motivational ? ["\u2726", "\u2605", "\u2665"][i % 3] : i % 3 === 0 ? "\u2726" : "\u2605";
      sparkle.style.left = (origin.x - window.scrollX) + "px";
      sparkle.style.top = (origin.y - window.scrollY) + "px";
      sparkle.style.color = colors[i % colors.length];
      sparkle.style.fontSize = (8 + Math.random() * 18) + "px";
      layer.append(sparkle);
      const originX = origin.x - window.scrollX;
      // Spread across the viewport, including when the heart is near an edge.
      const x = (16 + Math.random() * Math.max(0, window.innerWidth - 32) - originX) * .9;
      const y = -(65 + Math.random() * 190);
      const drift = (Math.random() - .5) * 70;
      const fall = 220 + Math.random() * 180;
      const spin = Math.random() * 240 - 120;
      const duration = 3400 + Math.random() * 1100;
      const transform = (dx, dy, scale, rotation) =>
        `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(${scale})`;
      const frames = reducedMotion ? [
        { opacity: 0, transform: transform(x * .06, y * .16, .8, 0) },
        { opacity: 1, offset: .25 },
        { opacity: 0, transform: transform(x * .06, y * .16, .8, 0) }
      ] : Array.from({ length: 91 }, (_, frame) => {
        const progress = frame / 90;
        const seconds = progress * duration / 1000;
        // One continuous curve: rapid launch loses speed, then gentle drift takes over.
        const burst = 1 - Math.exp(-seconds / .16);
        const float = progress * progress;
        const sway = Math.sin(progress * Math.PI * 2) * 14 * progress;
        return {
          offset: progress,
          opacity: Math.min(1, progress * 35) * (1 - Math.max(0, (progress - .7) / .3)),
          transform: transform(
            x * burst + drift * float + sway,
            y * burst + fall * float,
            (.25 + .75 * burst) * (1 - .35 * float),
            spin * burst * .25 + spin * progress * .75
          )
        };
      });
      sparkle.animate(frames, {
        duration: reducedMotion ? 500 : duration,
        delay: reducedMotion ? 0 : Math.random() * 100,
        easing: "linear",
        fill: "both"
      });
    }
    window.setTimeout(() => layer.remove(), reducedMotion ? 600 : 4700);
  }

  async function saveCheck(task, checkbox) {
    const completed = checkbox.checked && !task.done;
    const heart = checkbox.nextElementSibling.getBoundingClientRect();
    const origin = { x: heart.left + heart.width / 2 + window.scrollX, y: heart.top + heart.height / 2 + window.scrollY };
    checkbox.disabled = true;
    const { error } = await client.from("tasks").update({ done: checkbox.checked }).eq("id", task.id);
    checkbox.disabled = false;
    if (error) {
      checkbox.checked = task.done;
      message("feedback", "Endringen ble ikke lagret. Prøv igjen.", true);
    } else {
      if (completed) celebrateHeart(origin);
      await loadTasks();
    }
  }

  function startEdit(task) {
    editingId = task.id;
    input.value = task.title;
    room.value = taskRoom(task);
    room.disabled = tasks.some(candidate => candidate.parent_id === task.id);
    updateParents();
    parent.value = task.parent_id || "";
    byId("task-form-title").textContent = "Rediger oppgave";
    form.querySelector("[type=submit]").textContent = "Lagre";
    byId("cancel-edit").hidden = false;
    input.focus();
  }

  function resetForm() {
    editingId = null;
    form.reset();
    room.disabled = false;
    byId("task-form-title").textContent = "Legg til oppgave";
    form.querySelector("[type=submit]").textContent = "Legg til";
    byId("cancel-edit").hidden = true;
    updateParents();
  }

  const motivationPhrases = [
    "BAM! Du er \u00e9n skrue n\u00e6rmere dr\u00f8mmehjemmet!",
    "BOOM! Oppussingsguden smiler til deg!",
    "POW! Den veggen visste ikke hva som traff den!",
    "HELL YEAH! Du bygger ikke bare et hjem. Du bygger en legende!",
    "KABOOM! Enda et steg mot interi\u00f8r-Nirvana!",
    "DING DING! Du vinner over oppussingskaoset!",
    "OH SNAP! Selv h\u00e5ndverkere ville v\u00e6rt imponert. Kanskje.",
    "BAM! Litt svette, mye stil og null anger!",
    "BOOYAH! Du er en drill med menneskekropp!",
    "LEVEL UP! Oppussingsferdighetene dine \u00f8ker!",
    "POFF! Rot blir til magi. Etter hvert.",
    "YES BABY! Dette huset blir sexy!",
    "KA-CHING! Du \u00f8ker boligverdien! Forh\u00e5pentligvis.",
    "BOOMSHAKALAKA! Den lista sitter som et skudd!",
    "YOU GOT THIS! Selv IKEA ville ansatt deg!",
    "BAM BAM! Du er Michelangelo med sparkel!",
    "HOLY MOLY! Se p\u00e5 deg, din oppussingsmaskin!",
    "EPIC WIN! \u00c9n oppgave mindre. Hundre igjen!",
    "FULL SEND! Rett frem, gjennom st\u00f8v og kaos!",
    "TADAAA! Snart bor du i ditt eget mesterverk!"
];
  const motivationOverlay = byId("motivation-overlay");
  let lastMotivation = -1;
  let motivationTimer;
  function hideMotivation() {
    clearTimeout(motivationTimer);
    if (motivationOverlay.open) motivationOverlay.close();
    motivationOverlay.querySelectorAll(".celebration").forEach(layer => layer.remove());
  }
  function showMotivation() {
    clearTimeout(motivationTimer);
    // Choose uniformly among every phrase except the one just shown.
    let index = Math.floor(Math.random() * (motivationPhrases.length - (lastMotivation < 0 ? 0 : 1)));
    if (lastMotivation >= 0 && index >= lastMotivation) index++;
    lastMotivation = index;
    const text = motivationPhrases[index];
    const split = text.indexOf("!") + 1;
    const heading = document.createElement("strong");
    heading.textContent = text.slice(0, split);
    const body = document.createElement("span");
    body.textContent = text.slice(split).trim();
    byId("motivation-message").replaceChildren(heading, body);
    motivationOverlay.showModal();
    const card = motivationOverlay.firstElementChild;
    card.getAnimations().forEach(animation => animation.cancel());
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: 0, transform: "translateY(100px) scale(.3) rotate(-9deg)" },
      { opacity: 1, transform: "translateY(-22px) scale(1.08) rotate(3deg)", offset: .42 },
      { opacity: 1, transform: "translateY(10px) scale(.96) rotate(-2deg)", offset: .62 },
      { opacity: 1, transform: "translateY(-7px) scale(1.025) rotate(1deg)", offset: .78 },
      { opacity: 1, transform: "translateY(3px) scale(.99) rotate(-.4deg)", offset: .9 },
      { opacity: 1, transform: "translateY(0) scale(1) rotate(0deg)" }
    ], { duration: reduced ? 150 : 950, easing: "cubic-bezier(.2,.8,.2,1)" });
    celebrateHeart({ x: window.scrollX + window.innerWidth / 2, y: window.scrollY + window.innerHeight * .48 }, true);
    motivationTimer = window.setTimeout(hideMotivation, 6500);
  }
  byId("motivation-button").addEventListener("click", showMotivation);
  byId("ritulas-motivation").addEventListener("click", showMotivation);
  motivationOverlay.firstElementChild.addEventListener("click", hideMotivation);
  motivationOverlay.firstElementChild.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      hideMotivation();
    }
  });
  motivationOverlay.addEventListener("cancel", event => {
    event.preventDefault();
    hideMotivation();
  });

  room.addEventListener("change", updateParents);
  byId("cancel-edit").addEventListener("click", resetForm);
  byId("open-task-manager").addEventListener("click", () => {
    hideMotivation();
    resetForm();
    resetRoomForm();
    renderManager();
    renderRooms();
    manager.showModal();
  });
  byId("cancel-room-edit").addEventListener("click", resetRoomForm);
  roomForm.addEventListener("submit", async event => {
    event.preventDefault();
    const name = roomInput.value.trim();
    const submit = roomForm.querySelector("[type=submit]");
    if (!name || !roomManagement || submit.disabled) return;
    const editId = editingRoomId;
    if (rooms.some(item => item.id !== editId && item.name.toLocaleLowerCase("nb") === name.toLocaleLowerCase("nb"))) {
      message("room-feedback", "Det finnes allerede et rom med det navnet.", true);
      return;
    }
    submit.disabled = true;
    const leftCount = rooms.filter(item => item.layout_column === 1 && item.id !== OTHER_ROOM).length;
    const rightCount = rooms.filter(item => item.layout_column === 2).length;
    const layoutColumn = leftCount <= rightCount ? 1 : 2;
    const sortOrder = Math.max(0, ...rooms
      .filter(item => item.layout_column === layoutColumn && item.id !== OTHER_ROOM)
      .map(item => item.sort_order)) + 10;
    const { error } = editId
      ? await client.from("rooms").update({ name }).eq("id", editId)
      : await client.from("rooms").insert({
        id: crypto.randomUUID(), name, layout_column: layoutColumn, sort_order: sortOrder
      });
    submit.disabled = false;
    if (error) {
      message("room-feedback", "Rommet ble ikke lagret. Prøv igjen.", true);
      return;
    }
    if (editingRoomId === editId && roomInput.value.trim() === name) resetRoomForm();
    await loadTasks();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    const record = roomSupport ? { title, room: room.value, parent_id: parent.value || null } : { title };
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    const { error } = editingId
      ? await client.from("tasks").update(record).eq("id", editingId)
      : await client.from("tasks").insert(record);
    submit.disabled = false;
    if (error) {
      message(manager.open ? "manager-feedback" : "feedback", "Oppgaven ble ikke lagret. Prøv igjen.", true);
      return;
    }
    resetForm();
    await loadTasks();
    if (manager.open) input.focus();
  });

  filters.forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach(filter => filter.setAttribute("aria-pressed", String(filter === button)));
    renderManager();
  }));

  clearDone.addEventListener("click", async () => {
    clearDone.disabled = true;
    const { error } = await client.from("tasks").delete().eq("done", true);
    clearDone.disabled = false;
    if (error) {
      message("manager-feedback", "Ferdige oppgaver ble ikke fjernet. Prøv igjen.", true);
      return;
    }
    if (tasks.some(task => task.id === editingId && task.done)) resetForm();
    await loadTasks();
  });

  async function showSession(user) {
    const allowed = user?.email?.toLowerCase() === LOGIN_EMAIL && user.app_metadata?.provider === "email";
    if (!allowed) recoveringPassword = false;
    byId("auth-gate").hidden = allowed;
    byId("recovery-gate").hidden = !recoveringPassword;
    if (!allowed || recoveringPassword) {
      delete document.documentElement.dataset.screen;
      document.querySelector('meta[name="theme-color"]').content = "#F2A7D0";
      byId("house-banner").hidden = false;
      byId("app-content").hidden = true;
      byId("todo-screen").hidden = true;
      ritulas.hidden = true;
      ritulasManager.close();
      byId("ritulas-finale").hidden = true;
      byId("bear-screen").hidden = true;
      byId("bottom-menu").hidden = true;
    }
    signOutDenied.hidden = !user || allowed;
    if (!allowed) {
      manager.close();
      hideMotivation();
      activeUser = null;
      readBearId = undefined;
      setBearUnread(false);
      ++ritualRequest;
      ritualItems = [];
      ritualReady = false;
      ritualBusy = false;
      ritulasForm.reset();
      renderRitulas();
      ++todoRequest;
      todoItems = [];
      todoReady = false;
      todoBusy = false;
      todoForm.reset();
      message("todo-feedback", "");
      renderTodo();
      requestVersion++;
      tasks = [];
      rooms = DEFAULT_ROOMS;
      roomNames = new Map(rooms.map(({ id, name }) => [id, name]));
      roomManagement = false;
      roomSupport = false;
      list.replaceChildren();
      const oldChannels = [channel, roomsChannel].filter(Boolean);
      channel = null;
      roomsChannel = null;
      await Promise.all(oldChannels.map(oldChannel => client.removeChannel(oldChannel)));
      if (user) message("auth-message", "Denne kontoen har ikke tilgang til FMTM.", true);
      return;
    }
    if (recoveringPassword) return;
    if (activeUser === user.id) {
      if (byId("bottom-menu").hidden) showScreen();
      return;
    }
    activeUser = user.id;
    showScreen();
    channel = client.channel("fmtm-shared-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadTasks)
      .subscribe(status => { if (status === "SUBSCRIBED") loadTasks(); });
    await loadTasks();
  }

  byId("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!loginUsername || signIn.disabled || usernameInput.value !== loginUsername) return;
    signIn.disabled = true;
    message("auth-message", "Logger inn …");
    const password = byId("password");
    const { error } = await client.auth.signInWithPassword({ email: LOGIN_EMAIL, password: password.value });
    password.value = "";
    signIn.disabled = false;
    if (error) message("auth-message", "Ugyldig brukernavn eller passord.", true);
  });

  recoveryForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = recoveryForm.querySelector("[type=submit]");
    if (!recoveringPassword || submit.disabled) return;
    const password = byId("new-password").value;
    if (password !== byId("repeat-password").value) {
      message("recovery-message", "Passordene må være like.", true);
      return;
    }
    submit.disabled = true;
    byId("cancel-recovery").disabled = true;
    message("recovery-message", "Lagrer passordet …");
    const { data, error } = await client.auth.updateUser({ password });
    submit.disabled = false;
    byId("cancel-recovery").disabled = false;
    if (error) {
      message("recovery-message", error.message || "Passordet kunne ikke lagres.", true);
      return;
    }
    recoveryForm.reset();
    recoveringPassword = false;
    await showSession(data.user);
    message("feedback", "Passordet er oppdatert.");
  });

  async function logOut() {
    const { error } = await client.auth.signOut({ scope: "local" });
    const destination = error && recoveringPassword ? "recovery-message" :
      error && manager.open ? "manager-feedback" : "auth-message";
    message(destination,
      error ? "Kunne ikke logge ut." : "Du er logget ut.", Boolean(error));
    if (!error) recoveryForm.reset();
  }
  signOut.addEventListener("click", logOut);
  signOutDenied.addEventListener("click", logOut);
  byId("cancel-recovery").addEventListener("click", logOut);

  async function loadLoginUsername() {
    const { data, error } = await client.from("fmtm_login").select("username").single();
    if (!error) loginUsername = data.username;
    else if (["PGRST205", "42P01"].includes(error.code)) loginUsername = LEGACY_USERNAME;
    if (!loginUsername) {
      message("auth-message", "Kunne ikke hente brukernavnet. Last siden på nytt.", true);
      return;
    }
    usernameInput.value = loginUsername;
    signIn.disabled = false;
  }

  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    message("auth-message", "Kunne ikke koble til Supabase.", true);
    signIn.disabled = true;
    return;
  }
  client = window.supabase.createClient(config.url, config.anonKey);
  client.auth.onAuthStateChange((event, session) => {
    if (session?.user && (event === "PASSWORD_RECOVERY" || recoveryLink)) {
      recoveringPassword = true;
      recoveryLink = false;
    }
    setTimeout(() => showSession(session?.user), 0);
  });
  loadLoginUsername();
})();
