export const CONFIG = Object.freeze({
  defaultRoute: "my-day",
  owner: "Connor",
  packageName: "Unlimited AI Receptionist & Appointment Booking",
  defaultPrice: 2500,
  defaultSetupFee: 2500,
  defaultMonthlyFee: 997,
  defaultCommission: 350,
  defaultBatchTarget: 48,
  /* Empty on purpose: no fake domain is baked into preview links. Until a real
     host is set in Settings, preview URLs are built from wherever the app is
     actually served. */
  previewDomain: "",
});

/* Primary navigation for the agency operating workspace. Legacy routes stay
   renderable for bookmarks and drill-downs without crowding the sidebar. */
export const NAV_GROUPS = Object.freeze([
  {
    label: "Workspace",
    items: [
      { id: "home", label: "Dashboard", icon: "home" },
      { id: "assistant", label: "Copilot", icon: "sparkle" },
      { id: "tasks", label: "Tasks", icon: "check-square" },
      { id: "inbox", label: "Inbox", icon: "inbox" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "voice-agents", label: "Agents", icon: "smartphone" },
      { id: "calling", label: "Calls", icon: "phone" },
      { id: "meetings", label: "Meetings", icon: "calendar" },
      { id: "clients", label: "Clients", icon: "briefcase" },
    ],
  },
  {
    label: "Growth",
    items: [
      { id: "pipeline", label: "Sales", icon: "columns" },
      { id: "playbooks", label: "Playbooks", icon: "book" },
    ],
  },
  {
    label: "Business",
    items: [
      { id: "team", label: "Team", icon: "user" },
      { id: "payments", label: "Finance", icon: "wallet" },
      { id: "activity", label: "Activity", icon: "activity" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "settings", label: "Settings", icon: "settings" },
    ],
  },
]);

/* Legacy website and drill-down routes remain renderable for existing
   bookmarks and records, but are intentionally absent from the sidebar. */
export const LEGACY_ROUTES = Object.freeze([
  "my-day", "automation", "discovery", "leads", "outreach", "follow-ups", "studio",
  "templates", "demos", "projects", "automation-studio", "subscriptions", "commissions",
  "analytics", "costs", "pricing", "calendar", "notes", "integrations",
  "onboarding", "deployments", "maintenance",
]);

export const ROUTES = Object.freeze([
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
  ...LEGACY_ROUTES,
]);

export const PAGE_TITLES = Object.freeze(Object.fromEntries(
  [
    ...NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label])),
    ["my-day", "My Day"],
    ["automation", "Legacy website automation"],
    ["discovery", "Lead Discovery"],
    ["leads", "Leads"],
    ["outreach", "Outreach"],
    ["follow-ups", "Follow-Ups"],
    ["studio", "Website Studio"],
    ["templates", "Templates"],
    ["demos", "Demos"],
    ["deployments", "Deployments"],
    ["onboarding", "Onboarding"],
    ["projects", "Projects"],
    ["automation-studio", "Automation Studio"],
    ["maintenance", "Legacy maintenance"],
    ["subscriptions", "Subscriptions"],
    ["commissions", "Commissions"],
    ["analytics", "Analytics"],
    ["costs", "Costs"],
    ["pricing", "Legacy pricing experiments"],
    ["calendar", "Calendar"],
    ["notes", "Notes"],
    ["integrations", "Integrations"],
  ],
));

/* Routes that own the full viewport instead of the padded page container. */
export const FULL_BLEED_ROUTES = Object.freeze(["assistant", "studio"]);

export const PIPELINE_STAGES = Object.freeze([
  { id: "new", label: "New" },
  { id: "ready_to_contact", label: "Ready to Contact" },
  { id: "contacted", label: "Contacted" },
  { id: "interested", label: "Interested" },
  { id: "meeting_scheduled", label: "Meeting Scheduled" },
  { id: "demo_completed", label: "Demo Completed" },
  { id: "proposal_sent", label: "Proposal Sent" },
  { id: "negotiating", label: "Negotiating" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "follow_up_later", label: "Follow Up Later" },
]);

export const PROJECT_STAGES = Object.freeze([
  "discovery",
  "designing",
  "building",
  "integrating",
  "testing",
  "client_review",
  "limited_launch",
  "live",
  "maintenance",
  "paused",
]);

export const CALL_OUTCOMES = Object.freeze([
  ["no_answer", "No answer"],
  ["voicemail", "Voicemail"],
  ["gatekeeper", "Gatekeeper"],
  ["wrong_number", "Wrong number"],
  ["interested", "Interested"],
  ["meeting_booked", "Meeting booked"],
  ["call_back_later", "Call back later"],
  ["not_interested", "Not interested"],
  ["already_has_solution", "Already has solution"],
  ["unqualified", "Unqualified"],
]);

export const AUTOMATION_OPPORTUNITIES = Object.freeze([
  ["high_call_volume", "Likely high call volume"],
  ["appointment_based", "Appointment based"],
  ["quote_based", "Quote based"],
  ["emergency_service", "Emergency service"],
  ["after_hours", "After-hours opportunity"],
  ["missed_call", "Missed-call opportunity"],
  ["support_heavy", "Support-heavy"],
  ["lead_follow_up", "Lead follow-up opportunity"],
  ["booking", "Booking opportunity"],
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
  { provider: "supabase", name: "Workspace database", detail: "Server-side records and private assets behind Cloudflare Access", status: "connected", manage: "settings" },
  { provider: "openscout", name: "OpenScout", detail: "Google Places business discovery and source evidence", status: "connected", manage: "discovery" },
  { provider: "elevenlabs", name: "ElevenLabs", detail: "Creates, configures, syncs, and receives post-call transcripts through server-only functions", status: "not_connected", manage: "voice-agents" },
  { provider: "n8n", name: "n8n", detail: "Workflow execution is unavailable until a real Worker adapter exists", status: "not_connected", available: false },
  { provider: "twilio", name: "Twilio", detail: "Telephony is unavailable until a real Worker adapter exists", status: "not_connected", available: false },
  { provider: "calendar_provider", name: "Booking calendar", detail: "Calendar booking is unavailable until a real provider adapter exists", status: "not_connected", available: false },
  { provider: "outlook", name: "Outlook", detail: "Sends outreach through Microsoft Graph", status: "not_connected" },
  { provider: "cloudflare", name: "Cloudflare", detail: "Publishes demos and client sites", status: "not_connected" },
  { provider: "anthropic", name: "Anthropic", detail: "Model provider for the assistant and automation", status: "not_connected" },
  { provider: "openai", name: "OpenAI", detail: "First-class model provider for the assistant and automation", status: "not_connected" },
  { provider: "kimi", name: "Kimi", detail: "OpenAI-compatible model provider configured and verified by the Worker", status: "not_connected" },
  { provider: "qwen", name: "Qwen", detail: "OpenAI-compatible Model Studio provider configured and verified by the Worker", status: "not_connected" },
  { provider: "research", name: "Business research", detail: "Browser-based public research tool", status: "not_connected" },
  { provider: "whop", name: "Whop", detail: "Signed payment and refund webhooks", status: "not_connected" },
  { provider: "mcp", name: "MCP tool server", detail: "Exposes the same tools to external agents", status: "not_connected" },
]);

export const STATUS_LABELS = Object.freeze({
  new: "New",
  qualified: "Qualified",
  unreviewed: "Unreviewed",
  potential: "Potential",
  unqualified: "Unqualified",
  ready_to_contact: "Ready to contact",
  meeting_scheduled: "Meeting scheduled",
  demo_completed: "Demo completed",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
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
  designing: "Designing",
  building: "Building",
  integrating: "Integrating",
  testing: "Testing",
  limited_launch: "Limited launch",
  production: "Production",
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
  discovery: "Discovery",
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
  setup_fee: "Activation fee",
  recurring_subscription: "Recurring subscription",
  usage_overage: "Usage overage",
  custom_invoice: "Custom invoice",
  refund: "Refund",
  earned: "Earned",
  reversed: "Reversed",
  not_started: "Not started",
  blocked: "Blocked",
  critical: "Critical",
  offline: "Offline",
  medium: "Medium",
  simple: "Simple",
  standard: "Standard",
  complex: "Complex",
  custom: "Custom",
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
export const OUTREACH_SUBJECT = "A practical way to capture more calls at {{business}}";

export const OUTREACH_BODY = `Hey,

I help local service businesses answer every call with an unlimited AI receptionist that can qualify callers and book appointments around the clock.

I noticed {{business}} may be a fit. If missed calls, after-hours coverage, or slow booking follow-up are costing opportunities, I can show you a focused demo built around your workflow.

The package is \${{price}} to activate and $997 per month for the unlimited receptionist and appointment-booking service.

Interested?

{{owner}}`;

export const FOLLOW_UP_BODY = `Hey,

Just checking in about the call-handling and lead-booking workflow for {{business}}.

If missed calls, after-hours coverage, qualification, or appointment booking are a problem, I can map the current process and show the unlimited AI receptionist in action. The package is \${{price}} to activate plus $997 per month.

Would a short workflow review be useful?

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
