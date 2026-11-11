(() => {
  const LOGIN_USERNAME = "unibear";
  const LOGIN_EMAIL = "pandoranders@gmail.com";
  const ROOMS = [
    [["kjokken", "Kjøkken"], ["loftsstue", "Loftsstue"], ["annet", "Uten rom"]],
    [["stue", "Stue"], ["elli", "Rommet til Elli"], ["walk-in", "Walk-in"]]
  ];
  const roomNames = new Map(ROOMS.flat());
  const config = window.FMTM_SUPABASE_CONFIG || {};
  const byId = id => document.getElementById(id);
  const list = byId("task-list");
  const form = byId("add-form");
  const panel = byId("add-panel");
  const input = byId("task-input");
  const room = byId("task-room");
  const parent = byId("task-parent");
  const clearDone = byId("clear-done");
  const signIn = byId("sign-in");
  const signOut = byId("sign-out");
  const filters = [...document.querySelectorAll("[data-filter]")];

  let client;
  let channel;
  let tasks = [];
  let roomSupport = true;
  let currentFilter = "all";
  let editingId = null;
  let activeUser = null;
  let requestVersion = 0;

  for (const [key, name] of ROOMS.flat()) room.add(new Option(name, key));

  function message(id, text, error = false) {
    const element = byId(id);
    element.textContent = text;
    element.classList.toggle("error-text", error);
  }

  function taskRoom(task) {
    return roomNames.has(task.room) ? task.room : "annet";
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
    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (roomSupport) {
      const edit = document.createElement("button");
      edit.className = "delete-button";
      edit.type = "button";
      edit.textContent = "✎";
      edit.setAttribute("aria-label", "Rediger " + task.title);
      edit.addEventListener("click", () => startEdit(task));
      actions.append(edit);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Slett " + task.title);
    remove.addEventListener("click", async () => {
      const { error } = await client.from("tasks").delete().eq("id", task.id);
      if (error) message("feedback", "Oppgaven ble ikke slettet. Prøv igjen.", true);
      else await loadTasks();
    });
    actions.append(remove);
    row.append(label, actions);
    return row;
  }

  function render() {
    const focused = document.activeElement?.dataset.taskId;
    const matches = task => currentFilter === "all" || task.done === (currentFilter === "done");
    const visible = tasks.filter(matches);
    const visibleIds = new Set(visible.map(task => task.id));
    list.replaceChildren();
    for (const rooms of ROOMS) {
      const column = document.createElement("div");
      for (const [key, name] of rooms) {
        const inRoom = visible.filter(task => taskRoom(task) === key);
        if (key === "annet" && inRoom.length === 0) continue;
        const section = document.createElement("section");
        section.className = "room";
        const heading = document.createElement("h2");
        heading.textContent = name;
        const rows = document.createElement("ul");
        rows.className = "task-list";
        const nested = new Set();
        for (const task of inRoom) {
          if (task.parent_id && visibleIds.has(task.parent_id) &&
              inRoom.some(candidate => candidate.id === task.parent_id && !candidate.parent_id)) {
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

    const openCount = tasks.filter(task => !task.done).length;
    byId("remaining").textContent = openCount === 1 ? "1 oppgave igjen" : openCount + " oppgaver igjen";
    byId("empty-state").hidden = visible.length !== 0;
    byId("empty-state").textContent = tasks.length ? "Ingen oppgaver i denne visningen." : "Legg til en oppgave for å komme i gang.";
    clearDone.disabled = !tasks.some(task => task.done);
    byId("room-field").hidden = !roomSupport;
    byId("parent-field").hidden = !roomSupport;
    updateParents();
    if (focused) list.querySelector('[data-task-id="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
  }

  async function loadTasks() {
    const version = ++requestVersion;
    let result = await client.from("tasks").select("id,title,done,created_at,room,parent_id").order("created_at").order("id");
    const missingRooms = result.error?.code === "42703";
    if (missingRooms) result = await client.from("tasks").select("id,title,done,created_at").order("created_at").order("id");
    if (version !== requestVersion || !activeUser) return;
    if (result.error) {
      message("feedback", "Kunne ikke hente oppgavene. Prøv igjen.", true);
      return;
    }
    roomSupport = !missingRooms;
    tasks = result.data || [];
    message("feedback", missingRooms ? "Oppgavene vises under Uten rom til romoppsettet er lagt inn i Supabase." : "");
    render();
  }

  async function saveCheck(task, checkbox) {
    checkbox.disabled = true;
    const { error } = await client.from("tasks").update({ done: checkbox.checked }).eq("id", task.id);
    checkbox.disabled = false;
    if (error) {
      checkbox.checked = task.done;
      message("feedback", "Endringen ble ikke lagret. Prøv igjen.", true);
    } else {
      await loadTasks();
    }
  }

  function startEdit(task) {
    editingId = task.id;
    panel.open = true;
    input.value = task.title;
    room.value = taskRoom(task);
    room.disabled = tasks.some(candidate => candidate.parent_id === task.id);
    updateParents();
    parent.value = task.parent_id || "";
    form.querySelector("[type=submit]").textContent = "Lagre";
    byId("cancel-edit").hidden = false;
    input.focus();
  }

  function resetForm() {
    editingId = null;
    form.reset();
    room.disabled = false;
    form.querySelector("[type=submit]").textContent = "Legg til";
    byId("cancel-edit").hidden = true;
    updateParents();
  }

  room.addEventListener("change", updateParents);
  byId("cancel-edit").addEventListener("click", resetForm);
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
      message("feedback", "Oppgaven ble ikke lagret. Prøv igjen.", true);
      return;
    }
    resetForm();
    await loadTasks();
    input.focus();
  });

  filters.forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filters.forEach(filter => filter.setAttribute("aria-pressed", String(filter === button)));
    render();
  }));

  clearDone.addEventListener("click", async () => {
    const { error } = await client.from("tasks").delete().eq("done", true);
    if (error) message("feedback", "Ferdige oppgaver ble ikke fjernet. Prøv igjen.", true);
    else await loadTasks();
  });

  async function showSession(user) {
    const allowed = user?.email?.toLowerCase() === LOGIN_EMAIL && user.app_metadata?.provider === "email";
    byId("auth-gate").hidden = allowed;
    byId("app-content").hidden = !allowed;
    signOut.hidden = !user;
    if (!allowed) {
      activeUser = null;
      requestVersion++;
      tasks = [];
      list.replaceChildren();
      if (channel) {
        const oldChannel = channel;
        channel = null;
        await client.removeChannel(oldChannel);
      }
      if (user) message("auth-message", "Denne kontoen har ikke tilgang til FMTM.", true);
      return;
    }
    if (activeUser === user.id) return;
    activeUser = user.id;
    channel = client.channel("fmtm-shared-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, loadTasks)
      .subscribe(status => { if (status === "SUBSCRIBED") loadTasks(); });
    await loadTasks();
  }

  byId("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!client || byId("username").value !== LOGIN_USERNAME) return;
    signIn.disabled = true;
    message("auth-message", "Logger inn …");
    const password = byId("password");
    const { error } = await client.auth.signInWithPassword({ email: LOGIN_EMAIL, password: password.value });
    password.value = "";
    signIn.disabled = false;
    if (error) message("auth-message", "Ugyldig brukernavn eller passord.", true);
  });

  signOut.addEventListener("click", async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    message("auth-message", error ? "Kunne ikke logge ut." : "Du er logget ut.", Boolean(error));
  });

  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    message("auth-message", "Kunne ikke koble til Supabase.", true);
    signIn.disabled = true;
    return;
  }
  client = window.supabase.createClient(config.url, config.anonKey);
  signIn.disabled = false;
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => showSession(session?.user), 0);
  });
})();
