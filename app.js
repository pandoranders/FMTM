(() => {
  const LOGIN_USERNAME = "unibear";
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
  const signOut = byId("sign-out");
  const signOutDenied = byId("sign-out-denied");
  const roomForm = byId("room-form");
  const roomInput = byId("room-name");
  const managedRooms = byId("managed-rooms");
  const filters = [...document.querySelectorAll("[data-filter]")];

  let client;
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

  function managerAction(label, task, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button";
    button.textContent = label;
    button.setAttribute("aria-label", label + " " + (task.title ?? task.name));
    button.dataset.taskAction = label + ":" + task.id;
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
      actions.append(managerAction("Rediger", task, startEdit), managerAction("Slett", task, removeTask));
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
      actions.append(managerAction("Gi nytt navn til", item, startRoomEdit), managerAction("Slett", item, removeRoom));
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

  room.addEventListener("change", updateParents);
  byId("cancel-edit").addEventListener("click", resetForm);
  byId("open-task-manager").addEventListener("click", () => {
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
    byId("auth-gate").hidden = allowed;
    byId("app-content").hidden = !allowed;
    signOutDenied.hidden = !user || allowed;
    if (!allowed) {
      manager.close();
      activeUser = null;
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

  async function logOut() {
    const { error } = await client.auth.signOut({ scope: "local" });
    message(error && manager.open ? "manager-feedback" : "auth-message",
      error ? "Kunne ikke logge ut." : "Du er logget ut.", Boolean(error));
  }
  signOut.addEventListener("click", logOut);
  signOutDenied.addEventListener("click", logOut);

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
