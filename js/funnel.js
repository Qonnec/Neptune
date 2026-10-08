"use strict";
/* Onboarding funnel: KPIs, funnel chart, Kanban board, customer detail.
   Customers = Issues labelled type:onboarding + stage:<key>. Stage history lives in the issue's hd-meta. */
(() => {
  const s = Auth.requireLogin();
  if (!s) return;
  const C = HD_CONFIG, $ = HD.$, esc = HD.esc;
  HD.renderNav("funnel", s);
  HD.wireDialogs();

  const STAGES = C.funnelStages;
  const IDX = Object.fromEntries(STAGES.map((x, i) => [x.key, i]));
  const LOST = { key: "lost", label: "Lost" };
  const ACTIVE_KEY = STAGES[STAGES.length - 1].key;
  const stageLabel = k => (k === "lost" ? LOST.label : STAGES[IDX[k]]?.label || k || "—");

  let customers = [];
  let assignees = [];
  let openN = null;
  let editing = null;
  let dragN = null;

  HD.fillSelect($("#cSource"), [{ value: "", label: "—" }, ...C.leadSources.map(x => ({ value: x, label: x }))], "");
  HD.fillSelect($("#cStage"), STAGES.map(HD.opt), STAGES[0].key);
  $("#planList").innerHTML = C.plans.map(p => `<option value="${esc(p)}"></option>`).join("");

  function toView(i) {
    const { meta, text } = HD.parseBody(i.body);
    const stage = HD.labelValue(i, "stage:") || STAGES[0].key;
    const history = (Array.isArray(meta.history) ? meta.history : []).filter(h => h && h.stage && h.at);
    const lastEntry = [...history].reverse().find(h => h.stage === stage);
    const since = lastEntry ? lastEntry.at : i.created_at;
    const checklist = Array.isArray(meta.checklist) ? meta.checklist : [];
    return {
      n: i.number,
      issue: i,
      shop: i.title,
      meta,
      notes: text,
      stage,
      history,
      since,
      daysInStage: HD.daysSince(since),
      checklist,
      done: checklist.filter(c => c.done).length,
      value: Number(meta.value) || 0,
      owner: i.assignee ? i.assignee.login : "",
      lost: stage === "lost"
    };
  }

  async function loadAssignees() {
    try { assignees = await GH.listAssignees(); } catch { assignees = []; }
    HD.fillSelect($("#fOwner"), [
      { value: "", label: "All owners" },
      { value: "__me", label: "Mine" },
      ...assignees.map(a => ({ value: a.login, label: a.login }))
    ], "");
  }

  async function load() {
    $("#board").innerHTML = `<p class="muted">Loading customers…</p>`;
    try {
      customers = (await GH.listIssues("type:onboarding", "all")).map(toView);
    } catch (e) {
      HD.toast(e.message, "error");
      customers = [];
    }
    render();
  }

  function upsert(issue) {
    const v = toView(issue);
    const i = customers.findIndex(c => c.n === v.n);
    if (i >= 0) customers[i] = v; else customers.unshift(v);
    render();
    return v;
  }

  /** Read-modify-write of the hd-meta block (fetches fresh copy first to avoid overwriting others' edits). */
  async function updateMeta(n, mutate) {
    const fresh = await GH.getIssue(n);
    const { meta, text } = HD.parseBody(fresh.body);
    const r = mutate(meta, fresh) || {};
    return GH.updateIssue(n, { body: HD.buildBody(meta, r.text ?? text), ...(r.patch || {}) });
  }

  // ---------- Filtering ----------
  function baseFiltered() {
    const q = $("#q").value.trim().toLowerCase();
    const o = $("#fOwner").value;
    return customers.filter(c =>
      (!o || (o === "__me" ? c.owner === s.login : c.owner === o)) &&
      (!q || `${c.shop} ${c.meta.contact || ""} ${c.meta.city || ""} ${c.meta.email || ""}`.toLowerCase().includes(q)));
  }

  function render() {
    const base = baseFiltered();
    renderStats(base);
    renderBoard(base.filter(c => $("#showLost").checked || !c.lost));
  }

  // ---------- Stats ----------
  function reachedIndex(c) {
    let max = 0;
    for (const h of c.history) if (h.stage in IDX) max = Math.max(max, IDX[h.stage]);
    if (c.stage in IDX) max = Math.max(max, IDX[c.stage]);
    return max;
  }

  function renderStats(list) {
    const reached = STAGES.map(() => 0);
    const durations = STAGES.map(() => []);
    const toGoLive = [];

    for (const c of list) {
      const hi = reachedIndex(c);
      for (let i = 0; i <= hi; i++) reached[i]++;
      const h = [...c.history].sort((a, b) => a.at.localeCompare(b.at));
      for (let k = 0; k < h.length - 1; k++) {
        if (h[k].stage in IDX) durations[IDX[h[k].stage]].push((Date.parse(h[k + 1].at) - Date.parse(h[k].at)) / 864e5);
      }
      const gl = h.find(x => x.stage === "go-live");
      if (gl && h.length) toGoLive.push((Date.parse(gl.at) - Date.parse(h[0].at)) / 864e5);
    }

    const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const sum = arr => arr.reduce((t, c) => t + c.value, 0);
    const pipeline = list.filter(c => !c.lost && c.stage !== ACTIVE_KEY);
    const active = list.filter(c => c.stage === ACTIVE_KEY);
    const first = reached[0], last = reached[reached.length - 1];
    const goLive = avg(toGoLive);

    const tiles = [
      ["In pipeline", pipeline.length, `${HD.money(sum(pipeline))}/mo potential`],
      ["Active customers", active.length, `${HD.money(sum(active))}/mo`],
      ["Lead → active", first ? `${Math.round((last / first) * 100)}%` : "—", `${last} of ${first} leads`],
      ["Avg. days to go-live", goLive == null ? "—" : Math.round(goLive), "from first contact"],
      ["Lost", list.filter(c => c.lost).length, "closed as not planned"]
    ];
    $("#kpis").innerHTML = tiles.map(([l, v, sub]) =>
      `<div class="stat"><div class="stat-value">${esc(v)}</div><div class="stat-label">${esc(l)}</div><div class="stat-sub">${esc(sub)}</div></div>`).join("");

    const max = first || 1;
    $("#funnelChart").innerHTML = STAGES.map((st, i) => {
      const pct = (reached[i] / max) * 100;
      const conv = i === 0 ? "Entry point" : reached[i - 1] ? `${Math.round((reached[i] / reached[i - 1]) * 100)}% from previous` : "—";
      const here = list.filter(c => c.stage === st.key).length;
      const d = avg(durations[i]);
      const tip = `${st.label}: ${reached[i]} reached · ${here} here now${d != null ? ` · avg ${d.toFixed(1)} days` : ""}`;
      return `<div class="fn-row" role="row" title="${esc(tip)}">
        <div class="fn-label" role="rowheader">${esc(st.label)}</div>
        <div class="fn-track" role="cell"><div class="fn-bar" style="width:${pct.toFixed(1)}%"></div><span class="fn-val">${reached[i]}</span></div>
        <div class="fn-meta" role="cell"><span>${esc(conv)}</span><span>${here} here now${d != null ? ` · avg ${d.toFixed(1)}d` : ""}</span></div>
      </div>`;
    }).join("");
  }

  // ---------- Board ----------
  function stageOptions(selected) {
    return [...STAGES, LOST].map(st =>
      `<option value="${esc(st.key)}"${st.key === selected ? " selected" : ""}>${esc(st.label)}</option>`).join("");
  }

  function card(c) {
    const total = c.checklist.length;
    const pct = total ? Math.round((c.done / total) * 100) : 0;
    const stale = c.daysInStage >= C.staleDays && c.stage !== ACTIVE_KEY && !c.lost;
    const sub = [c.meta.contact, c.meta.city].filter(Boolean).join(" · ");
    return `<article class="kcard" draggable="true" data-n="${c.n}" tabindex="0" aria-label="${esc(c.shop)}">
      <div class="kcard-title">${esc(c.shop)}</div>
      <div class="muted small">${esc(sub || "—")}</div>
      <div class="kcard-meta"><span>${c.value ? `${esc(HD.money(c.value))}/mo` : ""}</span>
        <span class="${stale ? "stale" : ""}">${c.daysInStage}d in stage</span></div>
      ${total ? `<div class="progress" title="Checklist ${c.done}/${total}"><span style="width:${pct}%"></span></div>` : ""}
      <div class="kcard-foot"><span class="small muted">${c.owner ? esc(c.owner) : "No owner"}</span>
        <select class="move" aria-label="Move ${esc(c.shop)} to stage">${stageOptions(c.stage)}</select></div>
    </article>`;
  }

  function renderBoard(list) {
    const cols = [...STAGES, ...($("#showLost").checked ? [LOST] : [])];
    $("#board").innerHTML = cols.map(st => {
      const cards = list.filter(c => c.stage === st.key).sort((a, b) => a.since.localeCompare(b.since));
      const total = cards.reduce((t, c) => t + c.value, 0);
      return `<section class="col" data-stage="${esc(st.key)}" aria-label="${esc(st.label)}">
        <header class="col-head"><span>${esc(st.label)}</span><span class="col-count">${cards.length}</span></header>
        <div class="col-sub muted small">${esc(HD.money(total))}/mo</div>
        <div class="col-body">${cards.map(card).join("") || '<p class="col-empty">—</p>'}</div>
      </section>`;
    }).join("");
  }

  async function moveStage(n, to) {
    const c = customers.find(x => x.n === n);
    if (!c || c.stage === to) return;
    let reason = "";
    if (to === "lost") {
      reason = window.prompt(`Why was ${c.shop} lost? (optional)`, "");
      if (reason === null) { render(); return; }
    }
    const prev = c.stage;
    c.stage = to; // optimistic
    c.lost = to === "lost";
    render();
    try {
      const updated = await updateMeta(n, (meta, fresh) => {
        meta.history = Array.isArray(meta.history) ? meta.history : [];
        meta.history.push({ stage: to, at: new Date().toISOString(), by: s.name });
        const patch = { labels: HD.withLabel(fresh, "stage:", to) };
        if (to === "lost") { patch.state = "closed"; patch.state_reason = "not_planned"; }
        else if (fresh.state === "closed") patch.state = "open";
        return { patch };
      });
      await GH.addComment(n, HD.buildBody({ by: s.name, system: true },
        `Stage: ${stageLabel(prev)} → ${stageLabel(to)}${reason ? `\nReason: ${reason}` : ""}`));
      upsert(updated);
      HD.toast(`${c.shop} → ${stageLabel(to)}`, "ok");
      if (openN === n) openDetail(n);
    } catch (e) {
      c.stage = prev;
      c.lost = prev === "lost";
      render();
      HD.toast(e.message, "error");
    }
  }

  const board = $("#board");
  board.addEventListener("click", e => {
    if (e.target.closest("select")) return;
    const el = e.target.closest(".kcard");
    if (el) openDetail(Number(el.dataset.n));
  });
  board.addEventListener("keydown", e => {
    const el = e.target.closest(".kcard");
    if (el && e.key === "Enter" && e.target === el) openDetail(Number(el.dataset.n));
  });
  board.addEventListener("change", e => {
    if (!e.target.matches("select.move")) return;
    moveStage(Number(e.target.closest(".kcard").dataset.n), e.target.value);
  });
  board.addEventListener("dragstart", e => {
    const el = e.target.closest?.(".kcard");
    if (!el) return;
    dragN = Number(el.dataset.n);
    el.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragN));
  });
  board.addEventListener("dragend", e => {
    e.target.closest?.(".kcard")?.classList.remove("dragging");
    HD.$$(".col.over").forEach(c => c.classList.remove("over"));
  });
  board.addEventListener("dragover", e => {
    const col = e.target.closest(".col");
    if (!col || dragN == null) return;
    e.preventDefault();
    HD.$$(".col.over").forEach(c => { if (c !== col) c.classList.remove("over"); });
    col.classList.add("over");
  });
  board.addEventListener("drop", e => {
    const col = e.target.closest(".col");
    if (!col || dragN == null) return;
    e.preventDefault();
    col.classList.remove("over");
    const n = dragN;
    dragN = null;
    moveStage(n, col.dataset.stage);
  });

  // ---------- Detail ----------
  async function openDetail(n) {
    openN = n;
    const dlg = $("#detailDialog");
    const box = $("#detailBody");
    if (!dlg.open) {
      box.innerHTML = `<div class="dialog-body"><p class="muted">Loading…</p></div>`;
      dlg.showModal();
    }
    try {
      const [issue, comments] = await Promise.all([GH.getIssue(n), GH.listComments(n)]);
      const c = upsert(issue);
      renderDetail(c, comments);
    } catch (e) {
      box.innerHTML = `<header class="dialog-head"><h2>Could not load</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></header>
        <div class="dialog-body"><p class="notice error">${esc(e.message)}</p></div>`;
    }
  }

  function renderDetail(c, comments) {
    const box = $("#detailBody");
    const m = c.meta;
    const ownerItems = [{ value: "", label: "No owner" }, ...assignees.map(a => ({ value: a.login, label: a.login }))];
    if (c.owner && !assignees.some(a => a.login === c.owner)) ownerItems.push({ value: c.owner, label: c.owner });
    const row = (k, v) => `<dt>${k}</dt><dd>${v || "—"}</dd>`;

    box.innerHTML = `
      <header class="dialog-head">
        <div>
          <h2>${esc(c.shop)}</h2>
          <p class="muted small">Customer #${c.n} · ${esc(stageLabel(c.stage))} for ${c.daysInStage} day${c.daysInStage === 1 ? "" : "s"}${m.createdBy ? ` · added by ${esc(m.createdBy)}` : ""}</p>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">×</button>
      </header>
      <div class="dialog-body">
        <div class="detail-grid">
          <div>
            <section class="panel">
              <h3>Details</h3>
              <dl class="kv">
                ${row("Contact", esc(m.contact))}
                ${row("Phone", m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : "")}
                ${row("Email", m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : "")}
                ${row("City / area", esc(m.city))}
                ${row("Branches", esc(m.branches))}
                ${row("Plan", esc(m.plan))}
                ${row("Monthly value", c.value ? esc(HD.money(c.value)) : "")}
                ${row("Lead source", esc(m.source))}
              </dl>
              ${c.notes.trim() ? `<h3 style="margin-top:14px">Notes</h3><div class="prose">${esc(c.notes)}</div>` : ""}
            </section>
            <section class="panel">
              <h3>Activity</h3>
              <div class="thread">${comments.map(HD.renderComment).join("") || '<p class="muted">No activity yet.</p>'}</div>
              <form id="cNoteForm">
                <label for="cNoteText" class="sr-only">Add a note</label>
                <textarea id="cNoteText" rows="3" required placeholder="Add a note: call summary, next step, follow-up date…"></textarea>
                <div class="row-end"><button class="btn primary" type="submit" id="cNoteBtn" data-busy="Saving…">Add note</button></div>
              </form>
            </section>
          </div>
          <aside>
            <section class="panel">
              <div class="field"><label for="dStage">Stage</label><select id="dStage">${stageOptions(c.stage)}</select></div>
              <div class="field"><label for="dOwner">Owner</label><select id="dOwner">${ownerItems.map(o =>
                `<option value="${esc(o.value)}"${o.value === c.owner ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>
            </section>
            <section class="panel">
              <h3>Onboarding checklist <span class="muted small">${c.done}/${c.checklist.length}</span></h3>
              <ul class="checklist">${c.checklist.map((it, i) => `
                <li><label><input type="checkbox" data-i="${i}"${it.done ? " checked" : ""}> <span>${esc(it.t)}</span></label>
                ${it.done && it.at ? `<span class="muted small">${esc(new Date(it.at).toLocaleDateString("en-PH"))}${it.by ? ` · ${esc(it.by)}` : ""}</span>` : ""}</li>`).join("")}
              </ul>
              <form id="addItemForm" class="inline-form">
                <label for="newItem" class="sr-only">New checklist item</label>
                <input id="newItem" placeholder="Add checklist item" maxlength="120" required>
                <button class="btn small" type="submit">Add</button>
              </form>
            </section>
            <section class="panel">
              <h3>Stage history</h3>
              <ol class="timeline">${[...c.history].reverse().map(h =>
                `<li><strong>${esc(stageLabel(h.stage))}</strong><span class="muted small">${esc(HD.fmtDate(h.at))}${h.by ? ` · ${esc(h.by)}` : ""}</span></li>`).join("") || '<li class="muted">No history.</li>'}</ol>
            </section>
          </aside>
        </div>
      </div>
      <footer class="dialog-foot">
        <a class="btn" href="${esc(c.issue.html_url)}" target="_blank" rel="noopener noreferrer">View on GitHub</a>
        <span class="spacer"></span>
        <button type="button" class="btn" id="dEdit">Edit details</button>
        <button type="button" class="btn" data-close>Close</button>
      </footer>`;

    const n = c.n;
    $("#dStage").addEventListener("change", e => moveStage(n, e.target.value));
    $("#dOwner").addEventListener("change", async e => {
      const v = e.target.value;
      e.target.disabled = true;
      try {
        const updated = await GH.updateIssue(n, { assignees: v ? [v] : [] });
        await GH.addComment(n, HD.buildBody({ by: s.name, system: true }, v ? `Owner: ${v}` : "Owner removed"));
        upsert(updated);
        HD.toast("Owner updated", "ok");
      } catch (err) { HD.toast(err.message, "error"); }
      openDetail(n);
    });
    HD.$$(".checklist input", box).forEach(cb => cb.addEventListener("change", async () => {
      cb.disabled = true;
      const i = Number(cb.dataset.i);
      const checked = cb.checked;
      try {
        const updated = await updateMeta(n, meta => {
          const it = meta.checklist?.[i];
          if (it) { it.done = checked; it.at = checked ? new Date().toISOString() : null; it.by = checked ? s.name : null; }
        });
        upsert(updated);
        openDetail(n);
      } catch (err) {
        cb.checked = !checked;
        cb.disabled = false;
        HD.toast(err.message, "error");
      }
    }));
    $("#addItemForm").addEventListener("submit", async e => {
      e.preventDefault();
      const t = $("#newItem").value.trim();
      if (!t) return;
      try {
        const updated = await updateMeta(n, meta => {
          meta.checklist = Array.isArray(meta.checklist) ? meta.checklist : [];
          meta.checklist.push({ t, done: false });
        });
        upsert(updated);
        openDetail(n);
      } catch (err) { HD.toast(err.message, "error"); }
    });
    $("#cNoteForm").addEventListener("submit", async e => {
      e.preventDefault();
      const text = $("#cNoteText").value.trim();
      if (!text) return;
      await HD.busy($("#cNoteBtn"), async () => {
        try {
          await GH.addComment(n, HD.buildBody({ by: s.name }, text));
          HD.toast("Note added", "ok");
          await openDetail(n);
        } catch (err) { HD.toast(err.message, "error"); }
      });
    });
    $("#dEdit").addEventListener("click", () => {
      $("#detailDialog").close();
      openCustDialog(c);
    });
  }

  $("#detailDialog").addEventListener("close", () => { openN = null; });

  // ---------- Create / edit ----------
  function openCustDialog(c = null) {
    editing = c;
    const f = $("#custForm");
    f.reset();
    $("#custTitle").textContent = c ? `Edit ${c.shop}` : "New customer";
    $("#cSave").textContent = c ? "Save changes" : "Add customer";
    HD.$$(".create-only", f).forEach(el => { el.hidden = !!c; });
    HD.fillSelect($("#cOwner"), [{ value: "", label: "No owner" }, ...assignees.map(a => ({ value: a.login, label: a.login }))],
      assignees.some(a => a.login === s.login) ? s.login : "");
    if (c) {
      const m = c.meta;
      $("#cShop").value = c.shop;
      $("#cContact").value = m.contact || "";
      $("#cPhone").value = m.phone || "";
      $("#cEmail").value = m.email || "";
      $("#cCity").value = m.city || "";
      $("#cBranches").value = m.branches || "";
      $("#cPlan").value = m.plan || "";
      $("#cValue").value = m.value || "";
      $("#cSource").value = m.source || "";
      $("#cNotes").value = c.notes || "";
    }
    $("#custDialog").showModal();
    $("#cShop").focus();
  }

  $("#custForm").addEventListener("submit", async e => {
    e.preventDefault();
    const shop = $("#cShop").value.trim();
    const fields = {
      contact: $("#cContact").value.trim(),
      phone: $("#cPhone").value.trim(),
      email: $("#cEmail").value.trim(),
      city: $("#cCity").value.trim(),
      branches: $("#cBranches").value ? Number($("#cBranches").value) : "",
      plan: $("#cPlan").value.trim(),
      value: $("#cValue").value ? Number($("#cValue").value) : 0,
      source: $("#cSource").value
    };
    const notes = $("#cNotes").value;
    await HD.busy($("#cSave"), async () => {
      try {
        if (editing) {
          const n = editing.n;
          const updated = await updateMeta(n, meta => { Object.assign(meta, fields); return { text: notes, patch: { title: shop } }; });
          upsert(updated);
          $("#custDialog").close();
          HD.toast("Customer saved", "ok");
          openDetail(n);
        } else {
          const stage = $("#cStage").value;
          const owner = $("#cOwner").value;
          const meta = {
            ...fields,
            createdBy: s.name,
            checklist: C.onboardingChecklist.map(t => ({ t, done: false })),
            history: [{ stage, at: new Date().toISOString(), by: s.name }]
          };
          const issue = await GH.createIssue({
            title: shop,
            body: HD.buildBody(meta, notes),
            labels: ["type:onboarding", `stage:${stage}`],
            ...(owner ? { assignees: [owner] } : {})
          });
          upsert(issue);
          $("#custDialog").close();
          HD.toast(`${shop} added`, "ok");
        }
      } catch (err) {
        HD.toast(err.message, "error");
      }
    });
  });

  // ---------- Events / start ----------
  $("#q").addEventListener("input", render);
  $("#fOwner").addEventListener("change", render);
  $("#showLost").addEventListener("change", render);
  $("#refreshBtn").addEventListener("click", load);
  $("#newCustBtn").addEventListener("click", () => openCustDialog());

  (async () => {
    await loadAssignees();
    await load();
  })();
})();
