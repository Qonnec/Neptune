"use strict";
/* Firebase setup (compat SDK loaded from gstatic in each page). Exposes FB.auth and FB.db. */
const FB = (() => {
  const C = window.HD_CONFIG;
  if (!window.firebase) {
    throw new Error("Firebase SDK did not load. Check your internet connection or the page's Content-Security-Policy.");
  }
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(C.firebase);
  const auth = app.auth();
  const db = app.firestore();
  // Keep the sign-in for this tab only (cleared when the tab closes), like the old session.
  auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => { /* storage blocked: falls back to memory */ });
  const configured = !String(C.firebase.apiKey || "").startsWith("YOUR-");
  return { app, auth, db, configured, FieldValue: firebase.firestore.FieldValue };
})();
