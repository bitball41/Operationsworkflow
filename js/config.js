export const CONFIG = Object.freeze({
  supabaseUrl: "https://yswxdsagoywzevwgarbf.supabase.co",
  supabasePublishableKey: "sb_publishable_Ah6QGx7Tpr-rBvaa4cQcPw_7djryJ9K",
  supabaseJsVersion: "2.110.8",
  storageBucket: "demo-assets",
  defaultRoute: "home",
  owner: "Connor",
  defaultPrice: 500,
  defaultBatchTarget: 48,
  /* Empty on purpose: no fake domain is baked into preview links. Until a real
     host is set in Settings, preview URLs are built from wherever the app is
     actually served. */
  previewDomain: "",
});

/* Sidebar is the only navigation system. Groups map 1:1 to routes. */
export const NAV_GROUPS = Object.freeze([
  {
    label: "",
    items: [
      { id: "home", label: "Home", icon: "home" },
      { id: "assistant", label: "AI Assistant", icon: "sparkle" },
      { id: "automation", label: "Automation", icon: "play" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "discovery", label: "Lead Discovery", icon: "radar" },
      { id: "leads", label: "Leads", icon: "building" },
      { id: "pipeline", label: "Pipeline", icon: "columns" },
      { id: "outreach", label: "Outreach", icon: "send" },
      { id: "inbox", label: "Inbox", icon: "inbox" },
      { id: "follow-ups", label: "Follow-Ups", icon: "timer" },
    ],
  },
  {
    label: "Websites",
    items: [
      { id: "studio", label: "Website Studio", icon: "code" },
      { id: "templates", label: "Templates", icon: "layers" },
      { id: "demos", label: "Demos", icon: "monitor" },
      { id: "deployments", label: "Deployments", icon: "globe" },
    ],
  },
  {
    label: "Clients",
    items: [
      { id: "clients", label: "Clients", icon: "briefcase" },
      { id: "projects", label: "Projects", icon: "check-square" },
      { id: "maintenance", label: "Maintenance", icon: "refresh" },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "payments", label: "Payments", icon: "wallet" },
      { id: "analytics", label: "Analytics", icon: "chart" },
      { id: "costs", label: "Costs", icon: "dollar" },
      { id: "pricing", label: "Pricing Experiments", icon: "flask" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "tasks", label: "Tasks", icon: "check-square" },
      { id: "calendar", label: "Calendar", icon: "calendar" },
      { id: "notes", label: "Notes", icon: "note" },
      { id: "activity", label: "Activity", icon: "activity" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", icon: "plug" },
      { id: "settings", label: "Settings", icon: "settings" },
    ],
  },
]);

export const ROUTES = Object.freeze(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)));

export const PAGE_TITLES = Object.freeze(Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label])),
));

/* Routes that own the full viewport instead of the padded page container. */
export const FULL_BLEED_ROUTES = Object.freeze(["assistant", "studio"]);

export const PIPELINE_STAGES = Object.freeze([
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "demo_ready", label: "Demo Ready" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "interested", label: "Interested" },
  { id: "closing", label: "Closing" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
]);

export const PROJECT_STAGES = Object.freeze([
  "payment_received",
  "changes",
  "client_review",
  "domain_setup",
  "launch",
  "live",
]);

export const REPLY_CLASSIFICATIONS = Object.freeze([
  "interested",
  "maybe",
  "needs_changes",
  "price_objection",
  "follow_up_later",
  "not_interested",
  "wrong_person",
  "other",
]);

export const INTEGRATIONS = Object.freeze([
  { provider: "supabase", name: "Supabase", detail: "Database, storage and realtime sync", status: "connected", manage: "settings" },
  { provider: "openscout", name: "OpenScout", detail: "Google Places lead discovery engine", status: "connected", manage: "discovery" },
  { provider: "gmail", name: "Gmail", detail: "Sends outreach and syncs replies", status: "not_connected" },
  { provider: "cloudflare", name: "Cloudflare", detail: "Publishes demos and client sites", status: "not_connected" },
  { provider: "anthropic", name: "Anthropic", detail: "Model provider for the assistant and automation", status: "not_connected" },
  { provider: "openai", name: "OpenAI", detail: "Alternate model provider", status: "not_connected" },
  { provider: "research", name: "Business research", detail: "Browser-based public research tool", status: "not_connected" },
  { provider: "whop", name: "Whop", detail: "Payment events and receipts", status: "not_connected" },
  { provider: "mcp", name: "MCP tool server", detail: "Exposes the same tools to external agents", status: "not_connected" },
]);

export const STATUS_LABELS = Object.freeze({
  new: "New",
  qualified: "Qualified",
  demo_ready: "Demo ready",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  closing: "Closing",
  won: "Won",
  lost: "Lost",
  draft: "Draft",
  ready: "Ready",
  sent: "Sent",
  viewed: "Viewed",
  failed: "Failed",
  client_interested: "Interested",
  converted: "Converted",
  archived: "Archived",
  pending: "Pending",
  approved: "Approved",
  scheduled: "Scheduled",
  snoozed: "Snoozed",
  due: "Due",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
  active: "Active",
  inactive: "Inactive",
  paused: "Paused",
  queued: "Queued",
  running: "Running",
  stopped: "Stopped",
  idle: "Idle",
  paid: "Paid",
  available: "Available",
  refunded: "Refunded",
  not_connected: "Not connected",
  connected: "Connected",
  disabled: "Disabled",
  error: "Error",
  live: "Live",
  healthy: "Healthy",
  warning: "Warning",
  unknown: "Unknown",
  unread: "Unread",
  dead: "Dead",
  skipped: "Skipped",
  duplicate: "Duplicate",
  rejected: "Rejected",
  saved: "Saved",
  payment_received: "Payment received",
  changes: "Changes",
  client_review: "Client review",
  domain_setup: "Domain setup",
  launch: "Launch",
  complete: "Complete",
  past_due: "Past due",
  onboarding: "Onboarding",
  awaiting_content: "Awaiting content",
  ready_to_launch: "Ready to launch",
  website_sale: "Website sale",
  maintenance: "Maintenance",
  interested_reply: "Interested",
  maybe: "Maybe",
  needs_changes: "Needs changes",
  price_objection: "Price objection",
  follow_up_later: "Follow up later",
  not_interested: "Not interested",
  wrong_person: "Wrong person",
  other: "Other",
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
  in_progress: "In progress",
  hosting: "Hosting",
  domains: "Domains",
  apis: "APIs",
  software: "Software",
  payment_fees: "Payment fees",
  ai: "AI",
  user: "Me",
  system: "System",
  automation: "Automation",
  orchestrator: "Automation",
});

/* The default outreach email. Kept as data so automation and the composer
   always produce the same message. */
export const OUTREACH_SUBJECT = "I made a website for {{business}}";

export const OUTREACH_BODY = `Hey,

I came across {{business}} and noticed you didn't have a website, so I went ahead and made one for you.

Here's the preview: {{link}}

If you like it, I can customize anything you want, connect your domain, and get the full site live.

I charge a one-time fee of \${{price}}.
If you don't like it, you don't pay.

Interested?

{{owner}}`;

export const FOLLOW_UP_BODY = `Hey,

Just checking in on the website preview I sent for {{business}}:

{{link}}

Happy to change anything you want — colors, photos, wording, layout. Still \${{price}} one time, and you only pay if you like it.

Want me to adjust anything?

{{owner}}`;

export const AUTOMATION_DEFAULTS = Object.freeze({
  batchTarget: CONFIG.defaultBatchTarget,
  price: CONFIG.defaultPrice,
  concurrency: 2,
  stepDelayMs: 220,
  maxConsecutiveFailures: 3,
  autoFollowUp: true,
  followUpDays: 3,
  research: true,
  niche: "",
  location: "",
});
