"use strict";
/*
 * Firestore data layer (replaces the old GitHub Issues wrapper, api.js).
 *
 *   tickets/{n}              support tickets          (n = sequential number, from counters/tickets)
 *   customers/{n}            onboarding customers     (n from counters/customers)
 *   {tickets|customers}/{n}/comments/{auto}   notes + system activity log (append-only)
 *   staff/{email}            who may sign in: { name, role: "admin"|"agent", active }
 *   counters/{tickets|customers}  { last }
 */
const DB = (() => {
  const db = () => FB.db;
  const FV = () => FB.FieldValue;
  const KINDS = ["tickets", "customers"];
  const MAX_ROWS = 1000;

  const iso = v => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : v || null);

  function view(snap) {
    const d = snap.data({ serverTimestamps: "estimate" }) || {};
    d.id = snap.id;
    d.createdAt = iso(d.createdAt);
    d.updatedAt = iso(d.updatedAt) || d.createdAt;
    return d;
  }

  function friendly(e) {
    const code = e && e.code;
    let msg = (e && e.message) || "Request failed";
    if (code === "permission-denied") msg = "You don't have permission to do that. Your access may have been removed — try signing in again.";
    else if (code === "unavailable" || code === "deadline-exceeded") msg = "Network error — check your internet connection.";
    else if (code === "unauthenticated") { Auth.logout("Your session ended. Please sign in again."); msg = "Not signed in."; }
    else if (code === "failed-precondition" && /index/i.test(msg)) msg = `Firestore needs an index for this view: ${msg}`;
    const err = new Error(msg);
    err.code = code;
    return err;
  }
  const guard = fn => async (...args) => {
    try { return await fn(...args); } catch (e) { throw e && e.code ? friendly(e) : e; }
  };

  function kindRef(kind) {
    if (!KINDS.includes(kind)) throw new Error(`Unknown collection: ${kind}`);
    return db().collection(kind);
  }
  const docRef = (kind, n) => kindRef(kind).doc(String(n));

  function commentData(text, s, system) {
    return { text: String(text), by: s.name, byEmail: s.email, system: !!system, at: FV().serverTimestamp() };
  }

  /** state (tickets only): "open" | "closed" | "all" */
  async function list(kind, state = "all") {
    let q = kindRef(kind);
    if (state === "open") q = q.where("closed", "==", false).limit(MAX_ROWS);
    else if (state === "closed") q = q.where("closed", "==", true).limit(MAX_ROWS);
    else q = q.orderBy("updatedAt", "desc").limit(MAX_ROWS);
    const snap = await q.get();
    return snap.docs.map(view);
  }

  async function get(kind, n) {
    const snap = await docRef(kind, n).get();
    if (!snap.exists) throw new Error(`#${n} was not found.`);
    return view(snap);
  }

  /** Creates a record with the next sequential number. Returns the number. */
  async function create(kind, data) {
    const counter = db().collection("counters").doc(kind);
    return db().runTransaction(async tx => {
      const c = await tx.get(counter);
      const n = (c.exists ? Number(c.data().last) || 0 : 0) + 1;
      tx.set(counter, { last: n });
      tx.set(docRef(kind, n), {
        ...data,
        n,
        createdAt: FV().serverTimestamp(),
        updatedAt: FV().serverTimestamp()
      });
      return n;
    });
  }

  /**
   * Read-modify-write in a transaction, so two people editing at once don't overwrite each other.
   * fn(current) returns { patch, note } — patch is merged into the record, note (optional) is
   * written to the activity log in the same transaction. Resolves with the updated record.
   */
  async function transact(kind, n, fn, s) {
    const ref = docRef(kind, n);
    await db().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`#${n} was not found.`);
      const r = fn(view(snap)) || {};
      tx.update(ref, { ...(r.patch || {}), updatedAt: FV().serverTimestamp() });
      if (r.note) tx.set(ref.collection("comments").doc(), commentData(r.note, s, true));
    });
    return get(kind, n);
  }

  async function comments(kind, n) {
    const snap = await docRef(kind, n).collection("comments").orderBy("at").limit(500).get();
    return snap.docs.map(d => {
      const c = d.data({ serverTimestamps: "estimate" });
      return { id: d.id, ...c, at: iso(c.at) };
    });
  }

  /** Adds a note and bumps the record's "updated" time. */
  async function addComment(kind, n, text, s, system = false) {
    const ref = docRef(kind, n);
    const batch = db().batch();
    batch.set(ref.collection("comments").doc(), commentData(text, s, system));
    batch.update(ref, { updatedAt: FV().serverTimestamp() });
    await batch.commit();
  }

  // ---------- Staff ----------
  async function staff() {
    const snap = await db().collection("staff").get();
    return snap.docs
      .map(d => ({ email: d.id, name: d.data().name || d.id, role: d.data().role || "agent", active: d.data().active !== false }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function saveStaff(email, data) {
    const id = String(email).trim().toLowerCase();
    await db().collection("staff").doc(id).set({
      name: String(data.name || id),
      role: data.role === "admin" ? "admin" : "agent",
      active: data.active !== false,
      updatedAt: FV().serverTimestamp()
    });
  }

  async function removeStaff(email) {
    await db().collection("staff").doc(String(email).toLowerCase()).delete();
  }

  return {
    list: guard(list),
    get: guard(get),
    create: guard(create),
    transact: guard(transact),
    comments: guard(comments),
    addComment: guard(addComment),
    staff: guard(staff),
    saveStaff: guard(saveStaff),
    removeStaff: guard(removeStaff),
    MAX_ROWS
  };
})();
