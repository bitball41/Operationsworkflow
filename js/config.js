export const CONFIG = Object.freeze({
  supabaseUrl: "https://yswxdsagoywzevwgarbf.supabase.co",
  supabasePublishableKey: "sb_publishable_Ah6QGx7Tpr-rBvaa4cQcPw_7djryJ9K",
  supabaseJsVersion: "2.110.8",
  storageBucket: "demo-assets",
  appName: "Operations Workflow",
  defaultRoute: "command-center",
});

export const INTEGRATIONS = Object.freeze([
  { provider: "supabase", name: "Supabase", short: "SB", color: "#37d690", status: "connected", detail: "Database, auth & storage" },
  { provider: "openscout", name: "OpenScout", short: "OS", color: "#4c8dff", status: "planned", detail: "Lead discovery adapter" },
  { provider: "gmail", name: "Gmail", short: "GM", color: "#f06c75", status: "planned", detail: "Send & reply sync" },
  { provider: "whop", name: "Whop", short: "WH", color: "#f1bf5a", status: "planned", detail: "Revenue & payment events" },
  { provider: "cloudflare", name: "Cloudflare", short: "CF", color: "#f0a04c", status: "planned", detail: "Preview deployments" },
  { provider: "models", name: "Model APIs", short: "AI", color: "#9c83ff", status: "planned", detail: "Three-agent execution" },
]);

export const NAV_GROUPS = Object.freeze([
  {
    label: "Overview",
    items: [
      { id: "command-center", label: "Command center", icon: "layout-dashboard" },
      { id: "pipeline", label: "Pipeline", icon: "columns-3" },
    ],
  },
  {
    label: "Acquire",
    items: [
      { id: "discovery", label: "Lead discovery", icon: "radar" },
      { id: "prospects", label: "Prospects", icon: "building-2" },
      { id: "analysis", label: "Site & review analysis", icon: "scan-search" },
    ],
  },
  {
    label: "Build",
    items: [
      { id: "templates", label: "Template library", icon: "panels-top-left" },
      { id: "demos", label: "Demo manager", icon: "monitor-up" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { id: "outreach", label: "Email drafts", icon: "send" },
      { id: "inbox", label: "Reply intelligence", icon: "inbox" },
      { id: "follow-ups", label: "Follow-ups", icon: "timer-reset" },
      { id: "approvals", label: "Approvals", icon: "shield-check" },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "clients", label: "Clients", icon: "briefcase-business" },
      { id: "analytics", label: "Analytics", icon: "chart-no-axes-combined" },
      { id: "finance", label: "Finance", icon: "wallet-cards" },
      { id: "activity", label: "Agent activity", icon: "activity" },
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
  { id: "discovered", label: "New", color: "#737d90" },
  { id: "qualified", label: "Qualified", color: "#4c8dff" },
  { id: "demo_building", label: "Demo", color: "#9c83ff", includes: ["analyzed", "demo_building", "qa"] },
  { id: "ready_to_contact", label: "Ready", color: "#43c9d7" },
  { id: "contacted", label: "Contacted", color: "#f1bf5a", includes: ["contacted", "follow_up"] },
  { id: "replied", label: "Replied", color: "#f08a5d" },
  { id: "won", label: "Won", color: "#37d690" },
]);

export const STATUS_LABELS = Object.freeze({
  discovered: "New",
  qualified: "Qualified",
  analyzed: "Analyzed",
  demo_building: "Building",
  qa: "QA",
  ready_to_contact: "Ready",
  contacted: "Contacted",
  replied: "Replied",
  follow_up: "Follow-up",
  won: "Won",
  lost: "Lost",
  brief: "Brief",
  building: "Building",
  ready: "Ready",
  deployed: "Deployed",
  client_revision: "Revision",
  production: "Production",
  archived: "Archived",
  draft: "Draft",
  pending_approval: "Needs approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  sent: "Sent",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
  due: "Due",
  drafted: "Drafted",
  skipped: "Skipped",
  pending: "Pending",
  rejected: "Rejected",
  queued: "Queued",
  running: "Running",
  waiting_approval: "Waiting",
  completed: "Completed",
  failed: "Failed",
  onboarding: "Onboarding",
  active: "Active",
  awaiting_content: "Awaiting content",
  ready_to_launch: "Ready to launch",
  paused: "Paused",
});

