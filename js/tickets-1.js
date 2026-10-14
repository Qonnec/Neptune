"use strict";
/* Support tickets: list, filters, detail, notes, create/edit. Tickets = Firestore "tickets" collection. */
(async () => {
  const s = await Auth.requireLogin();
  if (!s) return;
  const C = HD_CONFIG, $ = HD.$, esc = HD.esc;
  HD.renderNav("tickets", s);
  HD.wireDialogs();

  const STATUS = HD.byKey(C.ticketStatuses);
  const PRIO = HD.byKey(C.priorities);
  const CAT = HD.byKey(C.categories);
  const PRIO_RANK = Object.fromEntries(C.priorities.map((p, i) => [p.key, i]));

  let tickets = [];
  let loadedState = null;
  let current = null;
  let editing = null;
  let dirty = false;

  // ---------- Filters ----------
  HD.fillSelect($("#fStatus"), [
    { value: "active", label: "All active" },
    ...C.ticketStatuses.filter(x => x.key !== "closed").map(HD.opt),
    { value: "closed", label: "Closed" },
    { value: "all", label: "Everything" }
  ], "active");
  HD.fillSelect($("#fPriority"), [{ value: "", label: "Any priority" }, ...C.priorities.map(HD.opt)], "");
  HD.fillSelect($("#fCategory"), [{ value: "", label: "Any category" }, ...C.categories.map(HD.opt)], "");

  function toView(d) {
    return {
      n: d.n,
      title: d.title || "",
      customer: d.customer || "",
      contact: d.contact || "",
      meta: d,
      text: d.description || "",
      status: d.status || (d.closed ? "closed" : "open"),
      priority: d.priority || "normal",
      category: d.category || "",
      assignee: d.assignee || "",
      updated: d.updatedAt || "",
      created: d.createdAt || ""
    };
  }

  async function loadAssignees() {
    await HD.loadStaff();
    HD.fillSelect($("#fAssignee"), [
      { value: "", label: "Anyone" },
      { value: "__me", label: "Assigned to me" },
      { value: "__none", label: "Unassigned" },
      ...HD.staffItems()
    ], "");
  }

  async function load(force = false) {
    const f = $("#fStatus").value;
    const state = f === "closed" ? "closed" : f === "all" ? "all" : "open";
    if (!force && state === loadedState) { render(); return; }
    $("#rows").innerHTML = `<tr><td colspan="7" class="muted center">Loading tickets…</td></tr>`;
    $("#empty").hidden = true;
    try {
      tickets = (await DB.list("tickets", state)).map(toView);
      loadedState = state;
    } catch (e) {
      HD.toast(e.message, "error");
      tickets = [];
      loadedState = null;
    }
    render();
  }

  function filtered() {
    const f = $("#fStatus").value, p = $("#fPriority").value, c = $("#fCategory").value, a = $("#fAssignee").value;
    const q = $("#q").value.trim().toLowerCase();
    const list = tickets.filter(t =>
      (["active", "all", "closed"].includes(f) || t.status === f) &&
      (!p || t.priority === p) &&
      (!c || t.category === c) &&
      (!a || (a === "__me" ? t.assignee === s.email : a === "__none" ? !t.assignee : t.assignee === a)) &&
      (!q || `#${t.n} ${t.title} ${t.customer} ${t.contact}`.toLowerCase().includes(q)));
    const sort = $("#sort").value;
    if (sort === "priority") {
      list.sort((x, y) => (PRIO_RANK[y.priority] ?? 0) - (PRIO_RANK[x.priority] ?? 0) || y.updated.localeCompare(x.updated));
    } else if (sort === "oldest") {
      list.sort((x, y) => x.created.localeCompare(y.created));
    } else {
      list.sort((x, y) => y.updated.localeCompare(x.updated));
    }
    return list;
  }

  function renderSummary() {
    const el = $("#summary");
    if (loadedState !== "open") { el.hidden = true; return; }
    el.hidden = false;
    const count = k => tickets.filter(t => t.status === k).length;
    const tiles = [
      [STATUS.open?.label || "Open", count("open")],
      [STATUS["in-progress"]?.label || "In progress", count("in-progress")],
      [STATUS["waiting-customer"]?.label || "Waiting", count("waiting-customer")],
      ["High / urgent", tickets.filter(t => t.priority === "urgent" || t.priority === "high").length],
      ["Unassigned", tickets.filter(t => !t.assignee).length]
    ];
    el.innerHTML = tiles.map(([l, v]) =>
      `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${esc(l)}</div></div>`).join("");
  }

  function render() {
    renderSummary();
    const list = filtered();
    $("#count").textContent = `${list.length} ticket${list.length === 1 ? "" : "s"} shown`;
    $("#empty").hidden = list.length > 0;
    $("#rows").innerHTML = list.map(t => `
      <tr data-n="${t.n}" tabindex="0">
        <td class="num">#${t.n}</td>
        <td><div class="cell-title">${esc(t.title)}</div><div class="muted small">${esc(t.customer)}${t.contact ? ` · ${esc(t.contact)}` : ""}</div></td>
        <td>${HD.pill(STATUS[t.status], t.status)}</td>
        <td>${HD.pill(PRIO[t.priority], t.priority)}</td>
        <td class="hide-sm">${t.category ? esc(CAT[t.category]?.label || t.category) : '<span class="muted">—</span>'}</td>
        <td class="hide-sm">${t.assignee ? esc(HD.nameOf(t.assignee)) : '<span class="muted">—</span>'}</td>
        <td class="hide-sm muted" title="${esc(HD.fmtDate(t.updated))}">${esc(HD.timeAgo(t.updated))}</td>
      </tr>`).join("");
  }

  // ---------- Routing (#/t/123 = detail) ----------
  function route() {
    const m = /^#\/t\/(\d+)/.exec(location.hash);
    if (m) { showDetail(Number(m[1])); return; }
    current = null;
    $("#detailView").hidden = true;
    $("#detailView").innerHTML = "";
    $("#listView").hidden = false;
    if (dirty) { dirty = false; load(true); } else render();
  }
  window.addEventListener("hashchange", route);

  // ---------- Detail ----------
  async function showDetail(n) {
    $("#listView").hidden = true;
    const d = $("#detailView");
    d.hidden = false;
    if (!current || current.n !== n) d.innerHTML = `<p class="muted">Loading ticket #${n}…</p>`;
    try {
      const [doc, comments] = await Promise.all([DB.get("tickets", n), DB.comments("tickets", n)]);
      current = toView(doc);
      renderDetail(current, comments);
    } catch (e) {
      d.innerHTML = `<a href="#/" class="back">← All tickets</a><p class="notice error">${esc(e.message)}</p>`;
    }
  }

  function selectHtml(id, items, value) {
    return `<select id="${id}">${items.map(i =>
      `<option value="${esc(i.value)}"${i.value === value ? " selected" : ""}>${esc(i.label)}</option>`).join("")}</select>`;
  }

  function renderDetail(t, comments) {
    const d = $("#detailView");
    const m = t.meta;
    const assigneeItems = [{ value: "", label: "Unassigned" }, ...HD.staffItems(t.assignee)];

    d.innerHTML = `
      <a href="#/" class="back">← All tickets</a>
      <div class="detail-head">
        <div>
          <h1>#${t.n} ${esc(t.title)}</h1>
          <p class="muted">Opened ${esc(HD.fmtDate(t.created))}${m.createdBy ? ` by ${esc(m.createdBy)}` : ""} · updated ${esc(HD.timeAgo(t.updated))}</p>
        </div>
        <div class="actions">
          <button class="btn" id="editBtn" type="button">Edit</button>
        </div>
      </div>
      <div class="detail-grid">
        <div>
          <section class="panel">
            <h2>Description</h2>
            <div class="prose">${t.text.trim() ? esc(t.text) : '<span class="muted">No description.</span>'}</div>
          </section>
          <section class="panel">
            <h2>Activity <span class="muted small">(${comments.length})</span></h2>
            <div class="thread">${comments.map(HD.renderComment).join("") || '<p class="muted">No notes yet.</p>'}</div>
            <form id="noteForm">
              <label for="noteText" class="sr-only">Add a note</label>
              <textarea id="noteText" rows="4" required placeholder="Add a note: what you did, what the customer said, next steps…"></textarea>
              <div class="row-end">
                <label class="sr-only" for="noteStatus">Also change status</label>
                <select id="noteStatus">
                  <option value="">Keep status</option>
                  ${C.ticketStatuses.filter(x => x.key !== t.status).map(x => `<option value="${esc(x.key)}">Set to: ${esc(x.label)}</option>`).join("")}
                </select>
                <button class="btn primary" type="submit" id="noteBtn" data-busy="Saving…">Add note</button>
              </div>
            </form>
          </section>
        </div>
        <aside>
          <section class="panel">
            <div class="field"><label for="sStatus">Status</label>${selectHtml("sStatus", C.ticketStatuses.map(HD.opt), t.status)}</div>
            <div class="field"><label for="sPriority">Priority</label>${selectHtml("sPriority", C.priorities.map(HD.opt), t.priority)}</div>
            <div class="field"><label for="sCategory">Category</label>${selectHtml("sCategory", [{ value: "", label: "—" }, ...C.categories.map(HD.opt)], t.category)}</div>
            <div class="field"><label for="sAssignee">Assignee</label>${selectHtml("sAssignee", assigneeItems, t.assignee)}</div>
          </section>
          <section class="panel">
            <h2>Customer</h2>
            <dl class="kv">
              <dt>Shop</dt><dd>${esc(m.customer || "—")}</dd>
              <dt>Contact</dt><dd>${esc(m.contact || "—")}</dd>
              <dt>Phone</dt><dd>${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : "—"}</dd>
              <dt>Email</dt><dd>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : "—"}</dd>
            </dl>
          </section>
        </aside>
      </div>`;

    $("#editBtn").addEventListener("click", () => openDialog(t));
    [["sStatus", "status"], ["sPriority", "priority"], ["sCategory", "category"], ["sAssignee", "assignee"]].forEach(([id, field]) =>
      $("#" + id).addEventListener("change", e => applyChange(t.n, field, e.target.value, e.target)));

    $("#noteForm").addEventListener("submit", async e => {
      e.preventDefault();
      const text = $("#noteText").value.trim();
      if (!text) return;
      const newStatus = $("#noteStatus").value;
      await HD.busy($("#noteBtn"), async () => {
        try {
          await DB.addComment("tickets", t.n, text, s);
          dirty = true;
          HD.toast("Note added", "ok");
          if (newStatus) await applyChange(t.n, "status", newStatus, null);
          else await showDetail(t.n);
        } catch (err) { HD.toast(err.message, "error"); }
      });
    });
  }

  async function applyChange(n, field, value, el) {
    if (el) el.disabled = true;
    const lbl = (map, k) => map[k]?.label || k || "—";
    try {
      await DB.transact("tickets", n, fresh => {
        if (field === "status") {
          return {
            patch: { status: value, closed: value === "closed" },
            note: `Status: ${lbl(STATUS, fresh.status)} → ${lbl(STATUS, value)}`
          };
        }
        if (field === "priority") {
          return { patch: { priority: value }, note: `Priority: ${lbl(PRIO, fresh.priority)} → ${lbl(PRIO, value)}` };
        }
        if (field === "category") {
          return { patch: { category: value }, note: `Category: ${lbl(CAT, value)}` };
        }
        if (field === "assignee") {
          return { patch: { assignee: value }, note: value ? `Assigned to ${HD.nameOf(value)}` : "Unassigned" };
        }
        return {};
      }, s);
      dirty = true;
      HD.toast("Ticket updated", "ok");
    } catch (e) {
      HD.toast(e.message, "error");
    }
    await showDetail(n);
  }

  // ---------- Create / edit dialog ----------
  function openDialog(t = null) {
    editing = t;
    const f = $("#ticketForm");
    f.reset();
    $("#dlgTitle").textContent = t ? `Edit ticket #${t.n}` : "New ticket";
    $("#tSave").textContent = t ? "Save changes" : "Create ticket";
    HD.$$(".create-only", f).forEach(el => { el.hidden = !!t; });
    HD.fillSelect($("#tCategory"), C.categories.map(HD.opt), C.categories[0].key);
    HD.fillSelect($("#tPriority"), C.priorities.map(HD.opt), "normal");
    const items = HD.staffItems();
    HD.fillSelect($("#tAssignee"), [{ value: "", label: "Unassigned" }, ...items],
      items.some(a => a.value === s.email) ? s.email : "");
    $("#customerList").innerHTML = [...new Set(tickets.map(x => x.customer).filter(Boolean))].sort()
      .map(c => `<option value="${esc(c)}"></option>`).join("");
    if (t) {
      $("#tTitle").value = t.title;
      $("#tCustomer").value = t.meta.customer || "";
      $("#tContact").value = t.meta.contact || "";
      $("#tPhone").value = t.meta.phone || "";
      $("#tEmail").value = t.meta.email || "";
      $("#tDesc").value = t.text;
    }
    $("#ticketDialog").showModal();
    $("#tTitle").focus();
  }

  $("#ticketForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("#tTitle").value.trim();
    const fields = {
      customer: $("#tCustomer").value.trim(),
      contact: $("#tContact").value.trim(),
      phone: $("#tPhone").value.trim(),
      email: $("#tEmail").value.trim()
    };
    const desc = $("#tDesc").value;
    await HD.busy($("#tSave"), async () => {
      try {
        if (editing) {
          const n = editing.n;
          await DB.transact("tickets", n, () => ({ patch: { title, ...fields, description: desc } }), s);
          $("#ticketDialog").close();
          dirty = true;
          HD.toast("Ticket saved", "ok");
          await showDetail(n);
        } else {
          const n = await DB.create("tickets", {
            title,
            ...fields,
            description: desc,
            status: "open",
            closed: false,
            priority: $("#tPriority").value,
            category: $("#tCategory").value,
            assignee: $("#tAssignee").value,
            createdBy: s.name,
            createdByEmail: s.email
          });
          $("#ticketDialog").close();
          dirty = true;
          HD.toast(`Ticket #${n} created`, "ok");
          location.hash = `#/t/${n}`;
        }
      } catch (err) {
        HD.toast(err.message, "error");
      }
    });
  });

  // ---------- Events ----------
  $("#fStatus").addEventListener("change", () => load());
  ["#fPriority", "#fCategory", "#fAssignee", "#sort"].forEach(id => $(id).addEventListener("change", render));
  $("#q").addEventListener("input", render);
  $("#refreshBtn").addEventListener("click", () => load(true));
  $("#newTicketBtn").addEventListener("click", () => openDialog());
  $("#rows").addEventListener("click", e => {
    const tr = e.target.closest("tr[data-n]");
    if (tr) location.hash = `#/t/${tr.dataset.n}`;
  });
  $("#rows").addEventListener("keydown", e => {
    const tr = e.target.closest("tr[data-n]");
    if (tr && e.key === "Enter") location.hash = `#/t/${tr.dataset.n}`;
  });

  // ---------- Start ----------
  await loadAssignees();
  await load(true);
  if (location.hash.startsWith("#/t/")) route();
})();
