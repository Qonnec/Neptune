# Autometrik Help Desk

A static help desk + onboarding funnel that runs on **GitHub Pages**. No server and no build step.

- **Login:** **Sign in with Google** (Firebase Authentication). Only Google accounts on the **staff list** (Admin page) get in.
- **Data:** tickets, onboarding customers, notes and the staff list live in **Cloud Firestore**. The rules in `firestore.rules` are what protect the data: a request is allowed only when it comes from a signed-in Google account that is an active staff member.

```
Neptune/                       ← site repo, served by GitHub Pages (code only, no data)
├── index.html                 Sign in with Google
├── tickets.html               Support tickets
├── funnel.html                Customer onboarding funnel + Kanban
├── admin.html                 Staff list (who can sign in, roles)
├── firestore.rules            Security rules — paste into the Firebase console
├── css/style.css
├── js/
│   ├── config.js              ← EDIT: Firebase config, allowed domain, lists, checklist
│   ├── firebase.js            Firebase init
│   ├── auth.js                Google sign-in, staff check, 30-min idle timeout
│   ├── db.js                  Firestore data layer
│   ├── common.js              Shared helpers
│   ├── login.js / tickets.js / funnel.js / admin.js
└── .nojekyll
```

---

## Setup (about 15 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics is not needed).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Pick a support email and save.
3. **Authentication → Settings → Authorized domains → Add domain:** `<owner>.github.io` (e.g. `qonnec.github.io`). `localhost` is already there for local testing.
4. **Build → Firestore Database → Create database.** Choose *Production mode* and a nearby location (e.g. `asia-southeast1`). The location can't be changed later.
5. **Firestore → Rules:** replace everything with the contents of `firestore.rules` → **Publish**.

### 2. Connect the site
1. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no Hosting needed).
2. Copy the `firebaseConfig` values into `js/config.js`:
   ```js
   firebase: {
     apiKey: "AIza…",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     appId: "1:…:web:…"
   },
   ```
   These values are public by design. They identify the project; they don't grant access.
3. Optional: set `allowedDomain: "yourcompany.com"` if everyone uses a Google Workspace account on that domain.
4. Commit, then **GitHub → Settings → Pages →** Source: *Deploy from a branch*, Branch: `main` / `(root)`.

### 3. Add the first admin (once, in the console)
The staff list starts empty, so the first admin is created by hand:
1. **Firestore → Start collection** → Collection ID: `staff`.
2. **Document ID:** your Google email in **lower case** (e.g. `hmorales@pandai.com`).
3. Fields:
   | Field | Type | Value |
   |---|---|---|
   | `name` | string | Your name |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |
4. Open the site and **Sign in with Google**. Add everyone else from the **Admin** page.

---

## Daily use

**Tickets**
- **+ New ticket:** subject, shop, contact, category, priority, assignee, description.
- **Filters:** status, priority, category, assignee ("Assigned to me" / "Unassigned"), search. **Sort:** updated / priority / oldest.
- **Ticket page:** change status/priority/category/assignee. Each change is logged in the activity thread. Add notes and optionally change the status in the same step.

**Onboarding**
- **KPIs:** pipeline count and ₱ potential, active customers and ₱/month, lead→active conversion, average days to go-live, lost.
- **Funnel:** how many customers reached each stage, conversion from the previous stage, and average days spent in it.
- **Board:** drag cards between stages (or use the dropdown on the card, which works on mobile). Cards show ⚠ when they've been in one stage longer than `staleDays` (14).
- **Customer panel:** details, owner, an onboarding checklist (copied from `config.js`, and you can add items), stage history, and notes.
- **Lost:** moves the customer out of the board (asking for a reason). Tick **Show lost** to see these customers again.

Changes are saved in transactions, so two people editing the same ticket or customer at once won't overwrite each other. The activity log can't be edited or deleted.

---

## Admin tasks

| Task | How |
|---|---|
| Add someone | Admin → enter their **Google account email**, name and role → Save. They can sign in right away. |
| Make someone admin | Admin → Edit → Role: Admin → Save. |
| Remove someone | Admin → **Deactivate** (keeps them in assignee history) or **Remove**. For an instant cut-off of an open session, also disable them in Firebase → Authentication → Users. |
| Change stages, categories or checklist | Edit `js/config.js` and commit. No database change needed. |
| Back up data | Firebase console → Firestore → Import/Export (needs the Blaze plan), or use the Firebase CLI. |

## Security notes
- **What protects the data:** `firestore.rules`. Every read and write is checked by Google's servers: signed in with Google, verified email, and an **active** entry in `staff`. The website code itself is public and grants nothing.
- **Admins** are the only ones who can change the staff list. An admin can't demote, deactivate or remove themselves, so the help desk can't be left without an admin by accident.
- The sign-in session is kept per tab (`sessionStorage`). It ends when the tab closes, on sign-out, or after 30 minutes idle.
- **Script safety:** a strict Content-Security-Policy allows only the site's own scripts plus Google's Firebase SDK, and all ticket/customer text is HTML-escaped before display.
- **Optional hardening:** in Google Cloud console → APIs & Services → Credentials, restrict the Firebase API key to HTTP referrer `https://<owner>.github.io/*` (and `http://localhost:8000/*` for testing).

## Limits & cost
- The Firebase **Spark (free)** plan covers a support team easily: 50,000 reads and 20,000 writes per day, 1 GiB stored.
- Each list loads up to 1,000 records per view.
- This is a staff tool. Customers do not sign in.

## Run locally
```
cd Neptune
python -m http.server 8000
# open http://localhost:8000
```
