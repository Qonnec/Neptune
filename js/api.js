"use strict";
/* Thin GitHub REST wrapper. All data lives as Issues in the private data repo. */
const GH = (() => {
  const BASE = "https://api.github.com";
  const C = window.HD_CONFIG;
  const repoPath = () => `/repos/${encodeURIComponent(C.dataOwner)}/${encodeURIComponent(C.dataRepo)}`;

  async function req(method, path, body) {
    const s = Auth.session();
    if (!s) { Auth.logout(); throw new Error("Not signed in."); }
    const headers = {
      Authorization: `Bearer ${s.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Network error — check your internet connection.");
    }
    if (res.status === 401) {
      Auth.logout("Your access token is no longer valid. Please sign in again or ask an admin.");
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      let msg = res.statusText || "Request failed";
      try { const j = await res.json(); msg = j.message || msg; if (j.errors?.[0]?.code) msg += ` (${j.errors[0].code})`; } catch { /* no body */ }
      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") msg = "GitHub rate limit reached. Try again in a few minutes.";
      const err = new Error(`GitHub ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function paginate(path, maxPages = 10) {
    const out = [];
    const sep = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= maxPages; page++) {
      const batch = await req("GET", `${path}${sep}per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  /** state: "open" | "closed" | "all" */
  async function listIssues(label, state = "open") {
    const items = await paginate(`${repoPath()}/issues?labels=${encodeURIComponent(label)}&state=${state}&sort=updated&direction=desc`);
    return items.filter(i => !i.pull_request);
  }

  return {
    req,
    repoPath,
    listIssues,
    getIssue: n => req("GET", `${repoPath()}/issues/${n}`),
    createIssue: data => req("POST", `${repoPath()}/issues`, data),
    updateIssue: (n, data) => req("PATCH", `${repoPath()}/issues/${n}`, data),
    listComments: n => paginate(`${repoPath()}/issues/${n}/comments`, 5),
    addComment: (n, body) => req("POST", `${repoPath()}/issues/${n}/comments`, { body }),
    listAssignees: () => paginate(`${repoPath()}/assignees`, 3)
  };
})();
