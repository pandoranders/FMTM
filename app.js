(() => {
  const LOGIN_USERNAME = "unibear";
  const LOGIN_EMAIL = "pandoranders@gmail.com";
  const config = window.FMTM_SUPABASE_CONFIG || {};
  const form = document.getElementById("add-form");
  const input = document.getElementById("task-input");
  const list = document.getElementById("task-list");
  const remaining = document.getElementById("remaining");
  const emptyState = document.getElementById("empty-state");
  const emptyTitle = document.getElementById("empty-title");
  const emptyCopy = document.getElementById("empty-copy");
  const clearDone = document.getElementById("clear-done");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const authGate = document.getElementById("auth-gate");
  const authMessage = document.getElementById("auth-message");
  const loginForm = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const signInButton = document.getElementById("sign-in");
  const signOutButton = document.getElementById("sign-out");
  const appContent = document.getElementById("app-content");
  const accountLabel = document.getElementById("account-label");
  const feedback = document.getElementById("feedback");

  let client;
  let currentFilter = "all";
  let tasks = [];
  let taskChannel;
  let authVersion = 0;

  function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.classList.toggle("error-text", isError);
  }

  function setFeedback(message, isError = false) {
    feedback.textContent = message;
    feedback.classList.toggle("error-text", isError);
  }

  function showSignedOut(message = "") {
    authGate.hidden = false;
    appContent.hidden = true;
    accountLabel.textContent = "";
    signOutButton.hidden = true;
    if (message) setAuthMessage(message);
  }

  function makeIcon(path) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
    element.setAttribute("d", path);
    element.setAttribute("stroke", "currentColor");
    element.setAttribute("stroke-width", "1.7");
    element.setAttribute("stroke-linecap", "round");
    element.setAttribute("stroke-linejoin", "round");
    svg.append(element);
    return svg;
  }

  function render() {
    list.replaceChildren();
    const visibleTasks = tasks.filter(task =>
      currentFilter === "all" ||
      (currentFilter === "active" && !task.done) ||
      (currentFilter === "done" && task.done)
    );
    const openCount = tasks.filter(task => !task.done).length;
    remaining.textContent = openCount === 1 ? "1 oppgave igjen" : `${openCount} oppgaver igjen`;
    clearDone.disabled = !tasks.some(task => task.done);

    for (const task of visibleTasks) {
      const row = document.createElement("li");
      row.className = `task${task.done ? " done" : ""}`;

      const checkWrap = document.createElement("label");
      checkWrap.className = "check-wrap";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.done;
      checkbox.setAttribute("aria-label", `${task.done ? "Marker som �pen: " : "Marker som ferdig: "}${task.title}`);
      checkbox.addEventListener("change", () => updateTask(task.id, { done: checkbox.checked }));
      checkWrap.append(checkbox);

      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-button";
      remove.setAttribute("aria-label", `Slett oppgaven: ${task.title}`);
      remove.append(makeIcon("M4 7h16M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9 7V4h6v3"));
      remove.addEventListener("click", () => deleteTask(task.id));

      row.append(checkWrap, title, remove);
      list.append(row);
    }

    const showEmpty = visibleTasks.length === 0;
    emptyState.hidden = !showEmpty;
    list.hidden = showEmpty;
    if (tasks.length === 0) {
      emptyTitle.textContent = "Lista er klar for dere";
      emptyCopy.textContent = "Legg til en oppgave n�r dere er klare.";
    } else if (currentFilter === "active") {
      emptyTitle.textContent = "Alt er gjort";
      emptyCopy.textContent = "Det er ingen �pne oppgaver akkurat n�.";
    } else if (currentFilter === "done") {
      emptyTitle.textContent = "Ingen ferdige oppgaver enn�";
      emptyCopy.textContent = "Ferdige oppgaver dukker opp her.";
    } else {
      emptyTitle.textContent = "Ingen oppgaver";
      emptyCopy.textContent = "Legg til en ny oppgave over.";
    }
  }

  async function loadTasks() {
    const { data, error } = await client.from("tasks")
      .select("id,title,done,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setFeedback("Kunne ikke hente oppgavene. Sjekk tilkoblingen og pr�v igjen.", true);
      return;
    }
    tasks = data || [];
    setFeedback("");
    render();
  }

  async function updateTask(id, changes) {
    const previous = tasks.find(task => task.id === id);
    if (!previous) return;
    const oldValue = previous.done;
    previous.done = changes.done;
    render();
    const { error } = await client.from("tasks").update({ done: changes.done }).eq("id", id);
    if (error) {
      previous.done = oldValue;
      render();
      setFeedback("Endringen ble ikke lagret. Pr�v igjen.", true);
    } else {
      setFeedback("");
    }
  }

  async function deleteTask(id) {
    const previousTasks = tasks;
    tasks = tasks.filter(task => task.id !== id);
    render();
    const { error } = await client.from("tasks").delete().eq("id", id);
    if (error) {
      tasks = previousTasks;
      render();
      setFeedback("Oppgaven ble ikke slettet. Pr�v igjen.", true);
    } else {
      setFeedback("");
    }
  }

  async function handleSession(user) {
    const myVersion = ++authVersion;
    showSignedOut("Sjekker kontotilgang .");
    if (myVersion !== authVersion) return;
    const email = (user.email || "").toLowerCase();
    const provider = user.app_metadata?.provider;
    if (email !== LOGIN_EMAIL || provider !== "email") {
      authGate.hidden = false;
      appContent.hidden = true;
      accountLabel.textContent = "";
      signOutButton.hidden = false;
      setAuthMessage("Denne kontoen har ikke tilgang til FMTM.", true);
      return;
    }

    authGate.hidden = true;
    appContent.hidden = false;
    accountLabel.textContent = LOGIN_USERNAME;
    signOutButton.hidden = false;
    currentFilter = "all";
    filterButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter)));
    await loadTasks();

    if (taskChannel) await client.removeChannel(taskChannel);
    taskChannel = client.channel("fmtm-shared-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .subscribe();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }
    const { error } = await client.from("tasks").insert({ title });
    if (error) {
      setFeedback("Oppgaven ble ikke lagret. Sjekk tilkoblingen og pr�v igjen.", true);
      return;
    }
    input.value = "";
    currentFilter = "all";
    filterButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter)));
    input.focus();
    await loadTasks();
  });

  filterButtons.forEach(button => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach(filter => filter.setAttribute("aria-pressed", String(filter === button)));
    render();
  }));

  clearDone.addEventListener("click", async () => {
    const { error } = await client.from("tasks").delete().eq("done", true);
    if (error) {
      setFeedback("Ferdige oppgaver ble ikke fjernet. Pr�v igjen.", true);
      return;
    }
    await loadTasks();
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (usernameInput.value.trim() !== LOGIN_USERNAME) {
      setAuthMessage("Ugyldig brukernavn eller passord.", true);
      return;
    }
    signInButton.disabled = true;
    setAuthMessage("Logger inn .");
    const { error } = await client.auth.signInWithPassword({
      email: LOGIN_EMAIL,
      password: passwordInput.value
    });
    passwordInput.value = "";
    if (error) {
      setAuthMessage("Ugyldig brukernavn eller passord.", true);
    }
    signInButton.disabled = false;
  });

  signOutButton.addEventListener("click", async () => {
    await client.auth.signOut();
    showSignedOut("Du er logget ut.");
  });

  if (!config.url || !config.anonKey) {
    setAuthMessage("Appen m� kobles til Supabase f�r du kan logge inn. F�lg oppsettet i SETUP.md.", true);
    signInButton.disabled = true;
  } else if (!window.supabase?.createClient) {
    setAuthMessage("Kunne ikke laste inn Supabase-klienten. Kontroller nettforbindelsen.", true);
    signInButton.disabled = true;
  } else {
    client = window.supabase.createClient(config.url, config.anonKey);
    client.auth.onAuthStateChange((_event, session) => {
      Promise.resolve().then(() => {
        if (session?.user) handleSession(session.user);
        else {
          authVersion += 1;
          showSignedOut();
        }
      });
    });
    client.auth.getSession().then(({ data, error }) => {
      if (error) setAuthMessage("Kunne ikke hente innloggingsstatus. Last siden p� nytt.", true);
      else if (data.session?.user) handleSession(data.session.user);
      else showSignedOut();
    });
  }

})();

