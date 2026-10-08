# Autometrik Help Desk

A static help desk + onboarding funnel that runs on **GitHub Pages**. No server and no build step.

- **Login:** encrypted user file (`data/users.enc.json`), with each entry AES-256-GCM-encrypted using a key derived from that user's password (PBKDF2-SHA256, 600k iterations). The file can be public safely, and usernames are stored only as hashes.
- **Data:** tickets and onboarding customers are **Issues** in a separate **private** repository, read and written through the GitHub API using each user's own token (which is stored inside their encrypted entry).

```
autometrik-helpdesk/          ← PUBLIC repo, served by GitHub Pages
├── index.html                 Sign in
├── tickets.html               Support tickets
├── funnel.html                Customer onboarding funnel + Kanban
├── admin.html                 Add/remove users, set up labels
├── css/style.css
├── js/
│   ├── config.js              ← EDIT: data repo owner/name, lists, checklist
│   ├── crypto.js              PBKDF2 + AES-GCM (Web Crypto)
│   ├── auth.js                Login, session, 30-min idle timeout
│   ├── api.js                 GitHub REST wrapper
│   ├── common.js              Shared helpers
│   ├── login.js / tickets.js / funnel.js / admin.js
├── data/users.enc.json        Encrypted logins (starts as [])
└── .nojekyll

autometrik-helpdesk-data/     ← PRIVATE repo, Issues only (never published)
```

---

## Setup (about 15 minutes)

### 1. Create the private data repository
1. On GitHub, create a **private** repo, e.g. `autometrik-helpdesk-data` (under your org or account).
2. Make sure **Issues** is enabled (Settings → General → Features).
3. Add each staff member as a collaborator with **Write** (or **Triage**) access. Anyone who appears in the *Assignee/Owner* dropdowns must be a collaborator.

### 2. Create the site repository
1. Create a repo, e.g. `autometrik-helpdesk`. It must be **public** for free GitHub Pages; a private one needs GitHub Pro/Team/Enterprise. Public is fine because the repo only holds code and the encrypted user file.
2. Edit `js/config.js`:
   ```js
   dataOwner: "your-org-or-username",
   dataRepo:  "autometrik-helpdesk-data",
   ```
3. Upload/commit all files.
4. **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main` / `(root)`. After a minute the site is at `https://<owner>.github.io/autometrik-helpdesk/`.

### 3. Create a GitHub token for each user
Each staff member does this on **their own** GitHub account (an admin can also do it for a shared "bot" account):

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Resource owner:** the org/user that owns the data repo.
3. **Repository access:** *Only select repositories* → `autometrik-helpdesk-data`.
4. **Permissions → Repository permissions → Issues: Read and write** (Metadata: Read is added automatically).
5. Set an expiration, e.g. 1 year, and copy the token (`github_pat_…`).
6. For an **org-owned** repo, an org owner may need to approve the token (Org settings → Personal access tokens).

### 4. Add users
1. Open `https://…/admin.html`.
2. Enter the username, full name, role, password (12+ characters) and token. Click **Test token**, then **Encrypt user entry**.
3. Click **Download updated users.enc.json** and commit it to `data/users.enc.json` in the site repo.
4. Repeat for each person. GitHub Pages can take a few minutes to serve the new file.

### 5. Create labels (once)
Sign in as an admin → **Admin → Create / update labels**. This creates the `type:`, `status:`, `priority:`, `cat:` and `stage:` labels in the data repo. Run it again whenever you change those lists in `config.js`.

---

## Daily use

**Tickets**
- **+ New ticket:** subject, shop, contact, category, priority, assignee, description.
- **Filters:** status, priority, category, assignee ("Assigned to me" / "Unassigned"), search. **Sort:** updated / priority / oldest.
- **Ticket page:** change status/priority/category/assignee. Each change is logged in the activity thread. Add notes and optionally change the status in the same step.
- Choosing **Closed** closes the issue on GitHub; choosing any other status reopens it.

**Onboarding**
- **KPIs:** pipeline count and ₱ potential, active customers and ₱/month, lead→active conversion, average days to go-live, lost.
- **Funnel:** how many customers reached each stage, conversion from the previous stage, and average days spent in it.
- **Board:** drag cards between stages (or use the dropdown on the card, which works on mobile). Cards show ⚠ when they've been in one stage longer than `staleDays` (14).
- **Customer panel:** details, owner, an onboarding checklist (copied from `config.js`, and you can add items), stage history, and notes.
- **Lost:** moves the customer out of the board (asking for a reason) and closes the issue as *not planned*. Tick **Show lost** to see these customers again.

Everything is also visible directly in GitHub Issues. Structured fields are stored in a hidden `<!-- hd-meta {...} -->` block at the top of each issue body. **Don't edit that block by hand.**

---

## Admin tasks

| Task | How |
|---|---|
| Reset a password | Admin page → enter the same username + new password + their token → download → commit. |
| Remove someone | **Revoke their token** (or remove them as a collaborator on the data repo). This cuts off access immediately. Then Admin → *Remove a user* → commit the file. |
| Token expired | The user sees a message at login. Create a new token and re-encrypt their entry. |
| Change stages, categories or checklist | Edit `js/config.js`, commit, then run *Create / update labels*. |

## Security notes
- **What protects the data:** the data repo is private and only reachable with a valid token. The token sits inside the encrypted entry, and only the user's password decrypts it.
- **Use strong passwords.** Anyone can download the user file and try to guess passwords offline. The slow key derivation (600k iterations) makes each guess expensive, but a weak password can still be cracked. Use 12+ characters, ideally a passphrase.
- **Revoking the token is the real "off switch."** Old copies of the user file stay in git history.
- After login, the token is kept in `sessionStorage`. It's cleared when the tab closes, on sign-out, or after 30 minutes idle.
- **Script safety:** a strict Content-Security-Policy allows only the site's own scripts, and all ticket/customer text is HTML-escaped before display.
- **Roles:** Admin vs. Agent only controls what the UI shows. Real permissions come from each token and from repo access.

## Limits
- GitHub API: 5,000 requests/hour per user, which is plenty for a support team.
- The lists load up to 1,000 issues per view (10 pages). Older closed tickets remain searchable on GitHub.
- This is a staff tool. Customers do not sign in.

## Run locally
Web Crypto needs `https://` or `localhost`:
```
cd autometrik-helpdesk
python -m http.server 8000
# open http://localhost:8000
```
