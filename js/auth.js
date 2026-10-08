"use strict";
/* Login, session (sessionStorage, cleared when the tab closes) and idle timeout. */
const Auth = (() => {
  const KEY = "hd_session";
  const C = window.HD_CONFIG;
  const timeoutMs = () => C.sessionTimeoutMinutes * 60000;

  function session() {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
  }
  function save(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  }
  const expired = s => !s || Date.now() - (s.last || 0) > timeoutMs();

  function ghGet(token, path) {
    return fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
  }

  async function login(username, password) {
    const uname = String(username || "").trim().toLowerCase();
    if (!uname || !password) throw new Error("Enter your username and password.");

    const res = await fetch(`${C.usersFile}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load the user file. Check the site setup.");
    const users = await res.json();

    const id = await HDCrypto.userId(uname);
    const entry = Array.isArray(users) ? users.find(u => u.id === id) : null;
    const invalid = "Invalid username or password.";
    if (!entry) { await HDCrypto.burn(password); throw new Error(invalid); }

    let profile;
    try { profile = await HDCrypto.decryptEntry(entry, password); }
    catch { throw new Error(invalid); }

    const me = await ghGet(profile.token, "/user");
    if (me.status === 401) throw new Error("Your GitHub access token has expired or was revoked. Ask an admin for a new one.");
    if (!me.ok) throw new Error(`Could not reach GitHub (${me.status}).`);
    const gh = await me.json();

    const repo = await ghGet(profile.token, `/repos/${C.dataOwner}/${C.dataRepo}`);
    if (!repo.ok) throw new Error("Your access token cannot open the help desk data repository. Ask an admin to check its permissions.");

    save({
      username: uname,
      name: profile.name || uname,
      role: profile.role || "agent",
      token: profile.token,
      login: gh.login,
      avatar: gh.avatar_url,
      last: Date.now()
    });
  }

  function logout(msg) {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    location.replace("index.html" + (msg ? `?msg=${encodeURIComponent(msg)}` : ""));
  }

  function touch() {
    const s = session();
    if (s && !expired(s)) { s.last = Date.now(); save(s); }
  }

  let watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    let lastTouch = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch > 15000) { lastTouch = now; touch(); }
    };
    ["click", "keydown", "pointermove", "touchstart", "scroll"].forEach(ev =>
      window.addEventListener(ev, onActivity, { passive: true }));
    setInterval(() => {
      if (expired(session())) logout("You were signed out after inactivity.");
    }, 30000);
  }

  /** Call at the top of every protected page. Returns the session or redirects to login. */
  function requireLogin() {
    const s = session();
    if (!s) { logout(); return null; }
    if (expired(s)) { logout("You were signed out after inactivity."); return null; }
    touch();
    watch();
    return session();
  }

  return { login, logout, session, requireLogin, isActive: () => !expired(session()) };
})();
