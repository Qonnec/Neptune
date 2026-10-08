"use strict";
(() => {
  if (Auth.isActive()) { location.replace("tickets.html"); return; }
  const $ = HD.$;

  function showMsg(text, type) {
    const el = $("#loginMsg");
    el.textContent = text;
    el.className = `notice ${type || ""}`;
    el.hidden = false;
  }

  const msg = new URLSearchParams(location.search).get("msg");
  if (msg) showMsg(msg);
  if (HD_CONFIG.dataOwner.startsWith("YOUR-")) {
    showMsg("Setup needed: set dataOwner and dataRepo in js/config.js.", "error");
  }
  if (!window.crypto?.subtle) {
    showMsg("This page must be opened over HTTPS (or localhost) to sign in.", "error");
  }

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await HD.busy($("#loginBtn"), () => Auth.login($("#username").value, $("#password").value));
      location.replace("tickets.html");
    } catch (err) {
      $("#password").value = "";
      showMsg(err.message, "error");
      $("#password").focus();
    }
  });
})();
