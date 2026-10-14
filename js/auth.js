"use strict";
/*
 * Google sign-in (Firebase Auth), staff check, session and idle timeout.
 * Sign-in only proves who someone is. Access is granted by a document in the Firestore
 * "staff" collection (id = lower-case email, active: true), and enforced by firestore.rules.
 */
const Auth = (() => {
  const C = window.HD_CONFIG;
  const LAST = "hd_last";
  const timeoutMs = () => C.sessionTimeoutMinutes * 60000;
  let current = null;
  let leaving = false;

  // ---------- Idle tracking (sessionStorage, cleared when the tab closes) ----------
  function lastActive() {
    try { return Number(sessionStorage.getItem(LAST)) || 0; } catch { return 0; }
  }
  function setLast(t) {
    try { sessionStorage.setItem(LAST, String(t)); } catch { /* storage blocked */ }
  }
  const expired = () => Date.now() - lastActive() > timeoutMs();

  /** Resolves with the signed-in Firebase user (or null) once Firebase has restored the session. */
  function firstUser() {
    return new Promise(resolve => {
      const off = FB.auth.onAuthStateChanged(u => { off(); resolve(u); });
    });
  }

  async function loadStaff(user) {
    const email = String(user.email || "").toLowerCase();
    if (!email || !user.emailVerified) return null;
    const snap = await FB.db.collection("staff").doc(email).get();
    if (!snap.exists) return null;
    const d = snap.data();
    return d.active === false ? null : d;
  }

  function toSession(user, staff) {
    const email = user.email.toLowerCase();
    return {
      uid: user.uid,
      email,
      name: staff.name || user.displayName || email,
      role: staff.role === "admin" ? "admin" : "agent",
      avatar: user.photoURL || ""
    };
  }

  function signInError(e) {
    switch (e && e.code) {
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Sign-in was cancelled.";
      case "auth/popup-blocked":
        return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
      case "auth/unauthorized-domain":
        return "This site's domain isn't authorized in Firebase (Authentication → Settings → Authorized domains).";
      case "auth/operation-not-allowed":
        return "Google sign-in is not enabled in Firebase (Authentication → Sign-in method → Google).";
      case "auth/network-request-failed":
        return "Network error — check your internet connection.";
      default:
        return (e && e.message) || "Sign-in failed.";
    }
  }

  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const params = { prompt: "select_account" };
    if (C.allowedDomain) params.hd = C.allowedDomain;
    provider.setCustomParameters(params);

    let cred;
    try {
      // Called straight from the click (no await before it) so browsers don't block the pop-up.
      cred = await FB.auth.signInWithPopup(provider);
    } catch (e) {
      throw new Error(signInError(e));
    }

    const user = cred.user;
    const email = String(user.email || "").toLowerCase();
    if (C.allowedDomain && !email.endsWith("@" + C.allowedDomain.toLowerCase())) {
      await FB.auth.signOut();
      throw new Error(`Please sign in with your @${C.allowedDomain} account.`);
    }

    let staff;
    try { staff = await loadStaff(user); }
    catch (e) {
      await FB.auth.signOut();
      throw new Error(`Could not check your access (${e.code || e.message}).`);
    }
    if (!staff) {
      await FB.auth.signOut();
      throw new Error(`${email} is not on the help desk staff list. Ask a help desk admin to add you.`);
    }
    setLast(Date.now());
    current = toSession(user, staff);
    return current;
  }

  function logout(msg) {
    if (leaving) return;
    leaving = true;
    current = null;
    try { sessionStorage.removeItem(LAST); } catch { /* ignore */ }
    const go = () => location.replace("index.html" + (msg ? `?msg=${encodeURIComponent(msg)}` : ""));
    FB.auth.signOut().catch(() => {}).finally(go);
  }

  function touch() {
    if (current && !expired()) setLast(Date.now());
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
      if (expired()) logout("You were signed out after inactivity.");
    }, 30000);
    // Signed out in another tab, or the account was disabled
    FB.auth.onAuthStateChanged(u => { if (!u && current) logout(); });
  }

  /**
   * Call at the top of every protected page:  const s = await Auth.requireLogin();
   * Resolves with the session, or redirects to the sign-in page and resolves null.
   */
  async function requireLogin() {
    const user = await firstUser();
    if (!user) { logout(); return null; }
    if (expired()) { logout("You were signed out after inactivity."); return null; }
    let staff;
    try { staff = await loadStaff(user); }
    catch { logout("Could not check your access. Please sign in again."); return null; }
    if (!staff) { logout("Your account doesn't have access to the help desk. Ask an admin."); return null; }
    current = toSession(user, staff);
    touch();
    watch();
    return current;
  }

  /** True when a Google session exists in this tab and hasn't gone idle. */
  async function isActive() {
    const user = await firstUser();
    return !!user && !expired();
  }

  return { signIn, logout, requireLogin, isActive, session: () => current };
})();
