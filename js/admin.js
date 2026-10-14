"use strict";
/* Admin tools: manage the staff list (who may sign in with Google, and their role). */
(async () => {
  const s = await Auth.requireLogin();
  if (!s) return;
  const C = HD_CONFIG, $ = HD.$, esc = HD.esc;
  HD.renderNav("admin", s);

  if (s.role !== "admin") { $("#notAdmin").hidden = false; return; }
  $("#adminArea").hidden = false;
  $("#projId").textContent = C.firebase.projectId;
  $("#meEmail").textContent = s.email;
  $("#domain").textContent = C.allowedDomain ? `@${C.allowedDomain} only` : "Any Google account on the staff list";

  let staff = [];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function load() {
    try { staff = await DB.staff(); }
    catch (e) { HD.toast(e.message, "error"); staff = []; }
    render();
  }

  function render() {
    $("#staffRows").innerHTML = staff.map(m => {
      const me = m.email === s.email;
      return `<tr data-email="${esc(m.email)}">
        <td><div class="cell-title">${esc(m.name)}${me ? ' <span class="muted small">(you)</span>' : ""}</div></td>
        <td>${esc(m.email)}</td>
        <td>${m.role === "admin" ? "Admin" : "Agent"}</td>
        <td>${m.active ? "Active" : '<span class="muted">Inactive</span>'}</td>
        <td class="row-end">
          <button class="btn small" data-act="edit" type="button">Edit</button>
          ${me ? "" : `<button class="btn small" data-act="toggle" type="button">${m.active ? "Deactivate" : "Activate"}</button>
          <button class="btn small danger" data-act="remove" type="button">Remove</button>`}
        </td></tr>`;
    }).join("") || `<tr><td colspan="5" class="muted center">No staff yet.</td></tr>`;
  }

  function clearForm() {
    $("#staffForm").reset();
    $("#sActive").checked = true;
    $("#sEmail").readOnly = false;
  }

  $("#staffForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#sEmail").value.trim().toLowerCase();
    const name = $("#sName").value.trim();
    const role = $("#sRole").value;
    const active = $("#sActive").checked;
    const fail = m => HD.toast(m, "error");

    if (!EMAIL_RE.test(email)) return fail("Enter a valid email address.");
    if (C.allowedDomain && !email.endsWith("@" + C.allowedDomain.toLowerCase())) return fail(`Only @${C.allowedDomain} accounts can sign in.`);
    if (!name) return fail("Enter the person's name.");
    if (email === s.email && (role !== "admin" || !active)) return fail("You can't remove your own admin access. Ask another admin.");

    await HD.busy($("#sSave"), async () => {
      try {
        await DB.saveStaff(email, { name, role, active });
        HD.toast(`${name} saved.`, "ok");
        clearForm();
        await load();
      } catch (err) { fail(err.message); }
    });
  });

  $("#sClear").addEventListener("click", clearForm);
  $("#sRefresh").addEventListener("click", load);

  $("#staffRows").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const email = btn.closest("tr").dataset.email;
    const m = staff.find(x => x.email === email);
    if (!m) return;

    if (btn.dataset.act === "edit") {
      $("#sEmail").value = m.email;
      $("#sEmail").readOnly = true;
      $("#sName").value = m.name;
      $("#sRole").value = m.role;
      $("#sActive").checked = m.active;
      $("#sName").focus();
      return;
    }
    if (email === s.email) return;

    btn.disabled = true;
    try {
      if (btn.dataset.act === "toggle") {
        await DB.saveStaff(email, { ...m, active: !m.active });
        HD.toast(`${m.name} ${m.active ? "deactivated" : "activated"}.`, "ok");
      } else if (btn.dataset.act === "remove") {
        if (!window.confirm(`Remove ${m.name} (${m.email}) from the staff list? Their past notes stay.`)) { btn.disabled = false; return; }
        await DB.removeStaff(email);
        HD.toast(`${m.name} removed.`, "ok");
      }
      await load();
    } catch (err) {
      btn.disabled = false;
      HD.toast(err.message, "error");
    }
  });

  await load();
})();
