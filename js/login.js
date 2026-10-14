"use strict";
(async () => {
  const $ = HD.$;

  function showMsg(text, type) {
    const el = $("#loginMsg");
    el.textContent = text;
    el.className = `notice ${type || ""}`;
    el.hidden = false;
  }

  const msg = new URLSearchParams(location.search).get("msg");
  if (msg) showMsg(msg);
  if (!FB.configured) {
    showMsg("Setup needed: paste your Firebase config into js/config.js.", "error");
    $("#googleBtn").disabled = true;
    return;
  }

  $("#googleBtn").addEventListener("click", async () => {
    try {
      await HD.busy($("#googleBtn"), () => Auth.signIn());
      location.replace("tickets.html");
    } catch (err) {
      showMsg(err.message, "error");
    }
  });

  // Already signed in in this tab → go straight in (tickets.html re-checks the staff list).
  if (!msg && await Auth.isActive()) location.replace("tickets.html");
})();
