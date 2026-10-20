"use strict";
/*
 * Autometrik Help Desk — configuration.
 * Before deploying, paste your Firebase web-app config below
 * (Firebase console → Project settings → General → Your apps → SDK setup and configuration → Config).
 * These values are not secrets: access is enforced by Google sign-in + firestore.rules.
 */
window.HD_CONFIG = Object.freeze({
  appName: "Autometrik Help Desk",

  // Firebase project (Auth with Google + Firestore)
  firebase: {
     apiKey: "AIzaSyDqfM1mUG6HgpAmA2MwZe91merdxBpfLv0",
     authDomain: "autometrik-help-desk.firebaseapp.com",
     projectId: "autometrik-help-desk",
     appId: "1:640874249696:web:5f0b4e2aca77ad88f73f85"
  },

  // Optional: only offer accounts from this Google Workspace domain (e.g. "pandai.com").
  // Leave "" to allow any Google account that is on the staff list.
  // This is a convenience filter; the staff list in Firestore is what actually grants access.
  allowedDomain: "",

  // Security
  sessionTimeoutMinutes: 30,

  // Display
  currency: "PHP",
  staleDays: 14, // onboarding cards older than this in one stage are flagged

  // Ticket fields
  ticketStatuses: [
    { key: "open", label: "Open", color: "1f6feb" },
    { key: "in-progress", label: "In progress", color: "bf8700" },
    { key: "waiting-customer", label: "Waiting on customer", color: "8250df" },
    { key: "closed", label: "Closed", color: "6e7781" }
  ],
  priorities: [
    { key: "low", label: "Low", color: "8c959f" },
    { key: "normal", label: "Normal", color: "54aeff" },
    { key: "high", label: "High", color: "fb8f44" },
    { key: "urgent", label: "Urgent", color: "cf222e" }
  ],
  categories: [
    { key: "how-to", label: "How-to / question", color: "c5def5" },
    { key: "bug", label: "Bug / error", color: "d73a4a" },
    { key: "billing", label: "Billing", color: "fbca04" },
    { key: "bir-einvoicing", label: "BIR e-invoicing", color: "0e8a16" },
    { key: "payroll", label: "Payroll", color: "5319e7" },
    { key: "inventory", label: "Inventory & tires", color: "006b75" },
    { key: "job-orders", label: "Job orders & service", color: "1d76db" },
    { key: "hardware", label: "Hardware / printer", color: "bfd4f2" },
    { key: "feature-request", label: "Feature request", color: "a2eeef" },
    { key: "other", label: "Other", color: "ededed" }
  ],

  // Onboarding funnel stages (order matters; last = fully onboarded)
  funnelStages: [
    { key: "lead", label: "Lead", color: "d4e5f7" },
    { key: "demo-scheduled", label: "Demo scheduled", color: "b6d4f2" },
    { key: "proposal-sent", label: "Proposal sent", color: "8fbce9" },
    { key: "signed", label: "Signed", color: "5fa0dc" },
    { key: "setup", label: "Setup & data migration", color: "3884cc" },
    { key: "training", label: "Training", color: "1f6bb5" },
    { key: "go-live", label: "Go-live", color: "15549a" },
    { key: "active", label: "Active customer", color: "0e8a16" }
  ],

  // Default checklist copied onto every new onboarding customer
  onboardingChecklist: [
    "Kickoff call done",
    "Shop details collected (services, labor rates, branches)",
    "Parts & tire inventory imported",
    "Customer & vehicle records imported",
    "BIR e-invoicing setup",
    "Payroll setup",
    "User accounts & roles created",
    "Staff training completed",
    "Go-live sign-off"
  ],

  leadSources: ["Referral", "Facebook", "Website", "Walk-in", "Trade show", "Cold call", "Other"],
  plans: ["Starter", "Standard", "Pro", "Multi-branch"]
});
