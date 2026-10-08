"use strict";
/* Shared helpers: escaping, formatting, issue-body metadata, labels, small UI pieces. */
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

  // ---------- Issue body metadata ----------
  // Structured fields are stored as a hidden HTML comment at the top of the issue body:
  //   <!-- hd-meta {"customer":"..."} -->
  //   free text...
  const META_RE = /^\s*<!--\s*hd-meta\s+([\s\S]*?)\s*-->[ \t]*\r?\n?/;
  function parseBody(body) {
    body = body || "";
    const m = META_RE.exec(body);
    if (!m) return { meta: {}, text: body };
    let meta = {};
    try { meta = JSON.parse(m[1]) || {}; } catch { meta = {}; }
    return { meta, text: body.slice(m[0].length) };
  }
  function buildBody(meta, text) {
    // Escape < and > so user text can never close the HTML comment early.
    const json = JSON.stringify(meta || {}).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
    return `<!-- hd-meta ${json} -->\n${text || ""}`;
  }

  // ---------- Labels ----------
  const labelNames = issue => (issue.labels || []).map(l => (typeof l === "string" ? l : l.name));
  const labelValue = (issue, prefix) => {
    const n = labelNames(issue).find(x => x.startsWith(prefix));
    return n ? n.slice(prefix.length) : null;
  };
  /** Returns the full label list with the `prefix:` label replaced by prefix+value. */
  const withLabel = (issue, prefix, value) => {
    const keep = labelNames(issue).filter(n => !n.startsWith(prefix));
    if (value) keep.push(prefix + value);
    return keep;
  };
  const byKey = list => Object.fromEntries(list.map(x => [x.key, x]));
  const opt = x => ({ value: x.key, label: x.label });

  function pill(item, fallback) {
    if (!item) return `<span class="pill">${esc(fallback || "—")}</span>`;
    return `<span class="pill" style="--c:#${esc(item.color || "8c959f")}">${esc(item.label)}</span>`;
  }

  function fillSelect(sel, items, selected) {
    sel.innerHTML = items
      .map(i => `<option value="${esc(i.value)}"${i.value === selected ? " selected" : ""}>${esc(i.label)}</option>`)
      .join("");
  }

  function renderComment(c) {
    const { meta, text } = parseBody(c.body);
    const who = meta.by || c.user?.login || "unknown";
    return `<div class="comment${meta.system ? " system" : ""}">
      <div class="comment-head"><strong>${esc(who)}</strong>
        <span class="muted small" title="${esc(fmtDate(c.created_at))}">${esc(timeAgo(c.created_at))}</span></div>
      <div class="comment-body">${esc(text)}</div></div>`;
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
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.dataset.busy || "Working…";
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function renderNav(active, s) {
    const el = $("#nav");
    if (!el) return;
    const link = (key, href, label) =>
      `<a href="${href}"${active === key ? ' class="active" aria-current="page"' : ""}>${label}</a>`;
    const links = (s ? link("tickets", "tickets.html", "Tickets") + link("funnel", "funnel.html", "Onboarding") : "") +
      (!s || s.role === "admin" ? link("admin", "admin.html", "Admin") : "");
    const user = s
      ? `${s.avatar ? `<img src="${esc(s.avatar)}" alt="" class="avatar">` : ""}
         <span class="nav-name">${esc(s.name)}</span>
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
    $, $$, esc, fmtDate, timeAgo, daysSince, money,
    parseBody, buildBody, labelNames, labelValue, withLabel, byKey, opt, pill,
    fillSelect, renderComment, toast, busy, download, renderNav, wireDialogs
  };
})();
