"use strict";
/* Admin tools: generate encrypted user entries, remove users, create repo labels. */
(() => {
  const s = Auth.isActive() ? Auth.requireLogin() : null;
  const C = HD_CONFIG, $ = HD.$;
  HD.renderNav("admin", s);
  $("#repoName").textContent = `${C.dataOwner}/${C.dataRepo}`;
  let lastEntry = null;

  async function loadUsers() {
    const r = await fetch(`${C.usersFile}?t=${Date.now()}`, { cache: "no-store" });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`Could not load ${C.usersFile} (${r.status}).`);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`${C.usersFile} is not a JSON array.`);
    return j;
  }

  function refreshInfo() {
    loadUsers()
      .then(u => { $("#usersInfo").textContent = `${u.length} user${u.length === 1 ? "" : "s"} in ${C.usersFile}. Usernames are stored only as hashes, so the file doesn't reveal who has an account. (GitHub Pages can take a few minutes to serve a newly committed file.)`; })
      .catch(e => { $("#usersInfo").textContent = e.message; });
  }
  refreshInfo();

  // ---------- Test token ----------
  $("#testToken").addEventListener("click", async e => {
    const token = $("#uToken").value.trim();
    if (!token) { HD.toast("Paste a token first.", "error"); return; }
    await HD.busy(e.currentTarget, async () => {
      try {
        const r = await fetch(`https://api.github.com/repos/${C.dataOwner}/${C.dataRepo}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
        });
        if (r.ok) {
          const j = await r.json();
          HD.toast(`Token works — it can open ${j.full_name}${j.private ? " (private)" : ""}.`, "ok");
          if (!j.private) HD.toast("Warning: the data repository is PUBLIC. Make it private.", "error");
        } else if (r.status === 401) {
          HD.toast("Token is invalid or expired.", "error");
        } else {
          HD.toast(`Token cannot open ${C.dataOwner}/${C.dataRepo} (${r.status}). Check its repository access.`, "error");
        }
      } catch {
        HD.toast("Network error while testing the token.", "error");
      }
    });
  });

  // ---------- Create entry ----------
  $("#userForm").addEventListener("submit", async e => {
    e.preventDefault();
    const username = $("#uName").value.trim().toLowerCase();
    const name = $("#uFull").value.trim();
    const role = $("#uRole").value;
    const pw = $("#uPass").value;
    const pw2 = $("#uPass2").value;
    const token = $("#uToken").value.trim();
    const fail = m => HD.toast(m, "error");

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail("Username: 3–40 characters — letters, numbers, dot, dash or underscore.");
    if (pw.length < C.minPasswordLength) return fail(`Password must be at least ${C.minPasswordLength} characters.`);
    if (pw !== pw2) return fail("Passwords don't match.");
    if (pw.toLowerCase().includes(username)) return fail("Password must not contain the username.");
    if (!token) return fail("Paste the user's GitHub token.");
    if (!/^(github_pat_|ghp_)/.test(token)) HD.toast("That doesn't look like a GitHub token — double-check it.", "error");

    await HD.busy($("#encryptBtn"), async () => {
      try {
        lastEntry = await HDCrypto.encryptEntry(username, pw, { name: name || username, role, token }, C.pbkdf2Iterations);
        $("#uPass").value = "";
        $("#uPass2").value = "";
        $("#uToken").value = "";
        $("#entryUser").textContent = username;
        $("#entryJson").textContent = JSON.stringify(lastEntry, null, 2);
        $("#entryResult").hidden = false;
      } catch (err) {
        fail(`Encryption failed: ${err.message}`);
      }
    });
  });

  $("#downloadUsers").addEventListener("click", async () => {
    if (!lastEntry) return;
    try {
      const users = await loadUsers();
      const i = users.findIndex(u => u.id === lastEntry.id);
      if (i >= 0) users[i] = lastEntry; else users.push(lastEntry);
      HD.download("users.enc.json", JSON.stringify(users, null, 2) + "\n");
      HD.toast(i >= 0 ? "Existing user replaced in the file." : "User added to the file.", "ok");
    } catch (err) {
      HD.toast(err.message, "error");
    }
  });

  $("#copyEntry").addEventListener("click", async () => {
    if (!lastEntry) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(lastEntry, null, 2));
      HD.toast("Entry copied.", "ok");
    } catch {
      HD.toast("Copy failed — select the text below and copy it manually.", "error");
    }
  });

  // ---------- Remove user ----------
  $("#removeForm").addEventListener("submit", async e => {
    e.preventDefault();
    const uname = $("#removeUser").value.trim().toLowerCase();
    try {
      const id = await HDCrypto.userId(uname);
      const users = await loadUsers();
      const left = users.filter(u => u.id !== id);
      if (left.length === users.length) { HD.toast("No user with that username in the file.", "error"); return; }
      HD.download("users.enc.json", JSON.stringify(left, null, 2) + "\n");
      HD.toast(`${uname} removed. Commit the downloaded file, then revoke their token.`, "ok");
    } catch (err) {
      HD.toast(err.message, "error");
    }
  });

  // ---------- Labels ----------
  function allLabels() {
    const L = [
      { name: "type:ticket", color: "0b5cad", description: "Help desk support ticket" },
      { name: "type:onboarding", color: "1a7f37", description: "Customer onboarding (sales funnel)" }
    ];
    C.ticketStatuses.forEach(x => L.push({ name: `status:${x.key}`, color: x.color, description: `Ticket status: ${x.label}` }));
    C.priorities.forEach(x => L.push({ name: `priority:${x.key}`, color: x.color, description: `Ticket priority: ${x.label}` }));
    C.categories.forEach(x => L.push({ name: `cat:${x.key}`, color: x.color, description: `Ticket category: ${x.label}` }));
    C.funnelStages.forEach(x => L.push({ name: `stage:${x.key}`, color: x.color || "0e8a16", description: `Onboarding stage: ${x.label}` }));
    L.push({ name: "stage:lost", color: "6e7781", description: "Onboarding stage: Lost" });
    return L;
  }

  $("#initLabels").addEventListener("click", async e => {
    if (!s) { HD.toast("Sign in first — this uses your GitHub token.", "error"); return; }
    const log = $("#labelLog");
    log.hidden = false;
    log.textContent = "";
    let failed = 0;
    await HD.busy(e.currentTarget, async () => {
      for (const l of allLabels()) {
        try {
          try {
            await GH.req("POST", `${GH.repoPath()}/labels`, l);
            log.textContent += `created  ${l.name}\n`;
          } catch (err) {
            if (err.status !== 422) throw err;
            await GH.req("PATCH", `${GH.repoPath()}/labels/${encodeURIComponent(l.name)}`, { color: l.color, description: l.description });
            log.textContent += `updated  ${l.name}\n`;
          }
        } catch (err) {
          failed++;
          log.textContent += `FAILED   ${l.name}: ${err.message}\n`;
        }
      }
      log.textContent += failed ? `Done with ${failed} error(s).\n` : "Done.\n";
      HD.toast(failed ? `Labels finished with ${failed} error(s).` : "Labels are ready.", failed ? "error" : "ok");
    });
  });
})();
