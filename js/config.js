export const CONFIG = Object.freeze({
  supabaseUrl: "https://yswxdsagoywzevwgarbf.supabase.co",
  supabasePublishableKey: "sb_publishable_Ah6QGx7Tpr-rBvaa4cQcPw_7djryJ9K",
  supabaseJsVersion: "2.110.8",
  storageBucket: "demo-assets",
  appName: "Operations Workflow",
  defaultRoute: "home",
});

export const INTEGRATIONS = Object.freeze([
  { provider: "supabase", name: "Supabase", short: "SB", color: "#37d690", status: "connected", detail: "Database, auth, storage and realtime" },
  { provider: "openscout", name: "OpenScout", short: "OS", color: "#4c8dff", status: "connected", detail: "Google Places discovery engine included" },
  { provider: "gmail", name: "Gmail", short: "GM", color: "#f06c75", status: "setup_required", detail: "Outreach and inbox sync placeholder" },
  { provider: "google_pubsub", name: "Google Pub/Sub", short: "PS", color: "#71a2ff", status: "setup_required", detail: "Inbox event delivery placeholder" },
  { provider: "whop", name: "Whop", short: "WH", color: "#f1bf5a", status: "setup_required", detail: "Payments and webhooks placeholder" },
  { provider: "cloudflare", name: "Cloudflare", short: "CF", color: "#f0a04c", status: "setup_required", detail: "Production deployment placeholder" },
  { provider: "openai", name: "OpenAI", short: "OA", color: "#37d690", status: "setup_required", detail: "Writing and orchestration placeholder" },
  { provider: "anthropic", name: "Anthropic", short: "AN", color: "#df9f73", status: "setup_required", detail: "Design and writing placeholder" },
  { provider: "github", name: "GitHub", short: "GH", color: "#9aa4b7", status: "setup_required", detail: "Template source sync placeholder" },
  { provider: "mcp", name: "Custom MCP", short: "MC", color: "#9c83ff", status: "disabled", detail: "Shared Operations API tool layer — future" },
]);

export const NAV_GROUPS = Object.freeze([
  {
    label: "Overview",
    items: [
      { id: "home", label: "Home", icon: "layout-dashboard" },
      { id: "activity", label: "Activity", icon: "activity" },
      { id: "tasks", label: "Tasks", icon: "clipboard-check" },
      { id: "calendar", label: "Calendar", icon: "clock" },
    ],
  },
  {
    label: "Sales",
    items: [
      { id: "discovery", label: "Lead Discovery", icon: "radar" },
      { id: "leads", label: "Leads", icon: "building-2" },
      { id: "pipeline", label: "Pipeline", icon: "columns-3" },
      { id: "outreach", label: "Outreach", icon: "send" },
      { id: "inbox", label: "Inbox", icon: "inbox" },
      { id: "follow-ups", label: "Follow-Ups", icon: "timer-reset" },
    ],
  },
  {
    label: "Websites",
    items: [
      { id: "studio", label: "Website Studio", icon: "panels-top-left" },
      { id: "templates", label: "Templates", icon: "file-code-2" },
      { id: "demos", label: "Demos", icon: "monitor-up" },
      { id: "deployments", label: "Deployments", icon: "globe" },
    ],
  },
  {
    label: "Clients",
    items: [
      { id: "clients", label: "Clients", icon: "briefcase-business" },
      { id: "projects", label: "Projects", icon: "clipboard-check" },
      { id: "maintenance", label: "Maintenance", icon: "refresh-cw" },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "payments", label: "Payments", icon: "wallet-cards" },
      { id: "analytics", label: "Analytics", icon: "chart-no-axes-combined" },
      { id: "pricing", label: "Pricing Experiments", icon: "badge-dollar-sign" },
      { id: "costs", label: "Costs", icon: "circle-dollar-sign" },
    ],
  },
  {
    label: "Workspace",
    items: [{ id: "notes", label: "Notes", icon: "pencil" }],
  },
  {
    label: "System",
    items: [
      { id: "integrations", label: "Integrations", icon: "paperclip" },
      { id: "settings", label: "Settings", icon: "settings-2" },
    ],
  },
]);

export const PAGE_META = Object.freeze(Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [
    item.id,
    { title: item.label, kicker: group.label },
  ])),
));

export const PIPELINE_STAGES = Object.freeze([
  { id: "new", label: "New", color: "#737d90" },
  { id: "qualified", label: "Qualified", color: "#4c8dff" },
  { id: "demo_ready", label: "Demo Ready", color: "#9c83ff" },
  { id: "contacted", label: "Contacted", color: "#43c9d7" },
  { id: "replied", label: "Replied", color: "#f1bf5a" },
  { id: "interested", label: "Interested", color: "#f08a5d" },
  { id: "closing", label: "Closing", color: "#cf79ff" },
  { id: "won", label: "Won", color: "#37d690" },
  { id: "lost", label: "Lost", color: "#f06c75" },
]);

export const STATUS_LABELS = Object.freeze({
  new: "New",
  qualified: "Qualified",
  demo_ready: "Demo Ready",
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
  client_interested: "Client Interested",
  converted: "Converted",
  archived: "Archived",
  pending: "Pending",
  pending_approval: "Needs Approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes Requested",
  scheduled: "Scheduled",
  due: "Due",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
  active: "Active",
  inactive: "Inactive",
  paused: "Paused",
  queued: "Queued",
  running: "Working",
  waiting_approval: "Awaiting Approval",
  failed: "Failed",
  paid: "Paid",
  available: "Available",
  refunded: "Refunded",
  setup_required: "Setup Required",
  connected: "Connected",
  disabled: "Disabled",
  error: "Error",
  payment_received: "Payment Received",
  changes: "Changes",
  client_review: "Client Review",
  domain_setup: "Domain Setup",
  launch: "Launch",
  live: "Live",
  healthy: "Healthy",
  warning: "Warning",
  unread: "Unread",
});

export const OUTREACH_BODY = `Hey,

I came across [Business Name] and noticed you didn’t have a website, so I went ahead and made one for you.

Here’s the preview: [link]

If you like it, I can customize anything you want, connect your domain, and get the full site live.

I charge a one-time fee of $400.
If you don’t like it, you don’t pay.

Interested?

Connor`;
