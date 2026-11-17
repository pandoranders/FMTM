(() => {
  const login = document.getElementById("bear-login");
  const editor = document.getElementById("bear-editor");
  const status = document.getElementById("bear-admin-status");
  const config = window.FMTM_SUPABASE_CONFIG;
  if (!config?.url || !config.anonKey || !window.supabase) {
    status.textContent = "Kunne ikke koble til Supabase.";
    login.hidden = true;
    return;
  }
  const client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { storageKey: "fmtm-bear-admin", detectSessionInUrl: false }
  });
  const posts = document.getElementById("bear-posts");
  const postStatus = document.getElementById("bear-posts-status");
  const postList = document.getElementById("bear-post-list");
  let postRequest = 0;

  async function loadPosts() {
    const request = ++postRequest;
    postStatus.textContent = "Henter poster …";
    const { data, error } = await client.from("bear_messages")
      .select("id,title").order("created_at", { ascending: false }).order("id");
    if (request !== postRequest || posts.hidden) return;
    if (error) {
      postStatus.textContent = "Kunne ikke hente publiserte poster.";
      return;
    }
    postList.replaceChildren(...data.map(post => {
      const item = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = post.title;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Slett";
      button.setAttribute("aria-label", "Slett " + post.title);
      button.addEventListener("click", async () => {
        if (!window.confirm("Vil du slette denne posten?")) return;
        button.disabled = true;
        try {
          const { data, error } = await client.from("bear_messages")
            .delete().eq("id", post.id).select("id").maybeSingle();
          if (error || !data) {
            postStatus.textContent = "Kunne ikke slette posten.";
            return;
          }
          await loadPosts();
        } finally {
          button.disabled = false;
        }
      });
      item.append(title, " ", button);
      return item;
    }));
    postStatus.textContent = data.length ? "" : "Ingen poster publisert ennå.";
  }

  const isOwner = user => user?.email === "pandoranders@gmail.com" && user.app_metadata?.provider === "email";
  client.auth.onAuthStateChange((_event, session) => {
    editor.hidden = !isOwner(session?.user);
    login.hidden = !editor.hidden;
    const wasHidden = posts.hidden;
    posts.hidden = editor.hidden;
    if (posts.hidden) {
      postRequest++;
      postList.replaceChildren();
    } else if (wasHidden) {
      setTimeout(() => { if (!posts.hidden) loadPosts(); }, 0);
    }
  });

  login.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(login);
    const button = event.submitter;
    button.disabled = true;
    try {
      const { data: auth, error } = await client.auth.signInWithPassword({
        email: data.get("email"), password: data.get("password")
      });
      status.textContent = error || !isOwner(auth.user) ? "Innloggingen ga ikke tilgang." : "";
      if (!error && !isOwner(auth.user)) await client.auth.signOut({ scope: "local" });
    } finally {
      login.elements.password.value = "";
      button.disabled = false;
    }
  });

  editor.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(editor);
    const title = data.get("title").trim();
    const body = data.get("body").trim();
    if (!title || !body) {
      status.textContent = "Skriv inn både tittel og beskjed.";
      return;
    }
    const button = event.submitter;
    if (button.disabled) return;
    button.disabled = true;
    try {
      const { error } = await client.from("bear_messages").insert({ title, body });
      status.textContent = error ? "Kunne ikke publisere beskjeden. Prøv igjen." : "Beskjeden er publisert.";
      if (!error) {
        editor.reset();
        if (!editor.hidden) {
          editor.elements.title.focus();
          await loadPosts();
        }
      }
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("bear-logout").addEventListener("click", async () => {
    const { error } = await client.auth.signOut({ scope: "local" });
    status.textContent = error ? "Kunne ikke logge ut." : "";
    if (!error) editor.reset();
  });
})();
