"use strict";
/* Shared helpers: escaping, formatting, staff names, small UI pieces. */
const HD = (() => {
  const C = window.HD_CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ESC[c]);

  // ---------- Formatting ----------
  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  }
  function timeAgo(iso) {
    if (!iso) return "";
    const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
    for (const [u, n] of units) if (sec >= n) return `${Math.floor(sec / n)}${u} ago`;
    return "just now";
  }
  const daysSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  const money = n => new Intl.NumberFormat("en-PH", { style: "currency", currency: C.currency, maximumFractionDigits: 0 }).format(n || 0);

  // ---------- Lists ----------
  const byKey = list => Object.fromEntries(list.map(x => [x.key, x]));
  const opt = x => ({ value: x.key, label: x.label });

  // ---------- Staff (assignees / owners are stored by email) ----------
  let staffList = [];
  async function loadStaff() {
    try { staffList = await DB.staff(); } catch { staffList = []; }
    return staffList;
  }
  const activeStaff = () => staffList.filter(x => x.active);
  function nameOf(email) {
    if (!email) return "";
    const m = staffList.find(x => x.email === email);
    return m ? m.name : email;
  }
  /** Select items for active staff, plus `keep` (a current value that is no longer active). */
  function staffItems(keep) {
    const items = activeStaff().map(x => ({ value: x.email, label: x.name }));
    if (keep && !items.some(i => i.value === keep)) items.push({ value: keep, label: nameOf(keep) });
    return items;
  }

  function pill(item, fallback) {
    if (!item) return `<span class="pill">${esc(fallback || "—")}</span>`;
    return `<span class="pill" style="--c:#${esc(item.color || "8c959f")}">${esc(item.label)}</span>`;
  }

  function fillSelect(sel, items, selected) {
    sel.innerHTML = items
      .map(i => `<option value="${esc(i.value)}"${i.value === selected ? " selected" : ""}>${esc(i.label)}</option>`)
      .join("");
  }

  /** c = { text, by, byEmail, system, at } */
  function renderComment(c) {
    const who = c.by || c.byEmail || "unknown";
    return `<div class="comment${c.system ? " system" : ""}">
      <div class="comment-head"><strong>${esc(who)}</strong>
        <span class="muted small" title="${esc(fmtDate(c.at))}">${esc(timeAgo(c.at))}</span></div>
      <div class="comment-body">${esc(c.text)}</div></div>`;
  }

  // ---------- UI ----------
  function toast(msg, type = "info") {
    let box = $("#toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("hide"), type === "error" ? 6000 : 3500);
    setTimeout(() => t.remove(), type === "error" ? 6500 : 4000);
  }

  async function busy(btn, fn) {
    if (!btn) return fn();
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = btn.dataset.busy || "Working…";
    try { return await fn(); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }

  function renderNav(active, s) {
    const el = $("#nav");
    if (!el) return;
    const link = (key, href, label) =>
      `<a href="${href}"${active === key ? ' class="active" aria-current="page"' : ""}>${label}</a>`;
    const links = s
      ? link("tickets", "tickets.html", "Tickets") + link("funnel", "funnel.html", "Onboarding") +
        (s.role === "admin" ? link("admin", "admin.html", "Admin") : "")
      : "";
    const user = s
      ? `${s.avatar ? `<img src="${esc(s.avatar)}" alt="" class="avatar" referrerpolicy="no-referrer">` : ""}
         <span class="nav-name" title="${esc(s.email)}">${esc(s.name)}</span>
         <button class="btn small" id="logoutBtn" type="button">Sign out</button>`
      : `<a class="btn small" href="index.html">Sign in</a>`;
    el.innerHTML = `<div class="nav-inner">
      <a class="brand" href="${s ? "tickets.html" : "index.html"}"><span class="brand-mark" aria-hidden="true">A</span>
        <span>Autometrik <strong>Help Desk</strong></span></a>
      <nav class="nav-links" aria-label="Main">${links}</nav>
      <div class="nav-user">${user}</div></div>`;
    const lb = $("#logoutBtn");
    if (lb) lb.addEventListener("click", () => Auth.logout());
  }

  /** Close any <dialog> when an element with [data-close] inside it is clicked, or the backdrop is clicked. */
  function wireDialogs() {
    $$("dialog").forEach(d => {
      d.addEventListener("click", e => {
        if (e.target.closest("[data-close]") || e.target === d) d.close();
      });
    });
  }

  return {
    $, $$, esc, fmtDate, timeAgo, daysSince, money, byKey, opt, pill,
    loadStaff, activeStaff, nameOf, staffItems,
    fillSelect, renderComment, toast, busy, renderNav, wireDialogs
  };
})();
