import { isoOffset } from "../core/utils.js";

const ids = {
  lead1: "11111111-1111-4111-8111-111111111111",
  lead2: "22222222-2222-4222-8222-222222222222",
  lead3: "33333333-3333-4333-8333-333333333333",
  lead4: "44444444-4444-4444-8444-444444444444",
  lead5: "55555555-5555-4555-8555-555555555555",
  lead6: "66666666-6666-4666-8666-666666666666",
  lead7: "77777777-7777-4777-8777-777777777777",
  template1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  template2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  template3: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  demo1: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  demo2: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  draft1: "12121212-1212-4212-8212-121212121212",
  draft2: "13131313-1313-4313-8313-131313131313",
  run1: "14141414-1414-4414-8414-141414141414",
};

export function createSampleData() {
  const leads = [
    { id: ids.lead1, business_name: "Northstar Tree Care", contact_name: "Mike", email: "mike@northstartrees.example", phone: "(817) 555-0142", city: "North Richland Hills", region: "TX", category: "Tree service", source: "OpenScout", status: "ready_to_contact", priority: "high", qualification_score: 94, opportunity_score: 91, asking_price: 400, next_action: "Approve outreach draft", next_action_at: isoOffset({ hours: 1 }), tags: ["no website", "strong reviews"], is_sample: true, created_at: isoOffset({ days: -4 }), updated_at: isoOffset({ minutes: -18 }) },
    { id: ids.lead2, business_name: "Apex Garage Doors", contact_name: "Elena", email: "elena@apexgarage.example", city: "Keller", region: "TX", category: "Garage doors", source: "OpenScout", status: "demo_building", priority: "high", qualification_score: 88, opportunity_score: 84, asking_price: 400, next_action: "Finish mobile QA", next_action_at: isoOffset({ days: 1 }), tags: ["dated site"], is_sample: true, created_at: isoOffset({ days: -3 }), updated_at: isoOffset({ hours: -2 }) },
    { id: ids.lead3, business_name: "Marisol's Alterations", contact_name: "Marisol", phone: "(817) 555-0198", city: "Hurst", region: "TX", category: "Alterations", source: "Manual", status: "qualified", priority: "normal", qualification_score: 82, opportunity_score: 86, asking_price: 400, next_action: "Choose template", next_action_at: isoOffset({ days: 1 }), tags: ["no website", "local favorite"], is_sample: true, created_at: isoOffset({ days: -2 }), updated_at: isoOffset({ hours: -3 }) },
    { id: ids.lead4, business_name: "Clearview Pressure Wash", contact_name: "Jordan", email: "jordan@clearview.example", city: "Colleyville", region: "TX", category: "Pressure washing", source: "OpenScout", status: "contacted", priority: "normal", qualification_score: 79, opportunity_score: 76, asking_price: 400, next_action: "Follow up #1", next_action_at: isoOffset({ days: 2 }), tags: ["one-page site"], is_sample: true, created_at: isoOffset({ days: -7 }), updated_at: isoOffset({ days: -1 }) },
    { id: ids.lead5, business_name: "Lone Star Mobile Detail", contact_name: "Andre", email: "andre@lonestardetail.example", city: "Fort Worth", region: "TX", category: "Auto detailing", source: "Manual", status: "replied", priority: "high", qualification_score: 85, opportunity_score: 90, asking_price: 400, next_action: "Reply with revision scope", next_action_at: isoOffset({ hours: 3 }), tags: ["interested"], is_sample: true, created_at: isoOffset({ days: -9 }), updated_at: isoOffset({ minutes: -42 }) },
    { id: ids.lead6, business_name: "Birdville Fence Co.", contact_name: "Sam", email: "sam@birdvillefence.example", city: "Haltom City", region: "TX", category: "Fencing", source: "OpenScout", status: "discovered", priority: "normal", qualification_score: 68, opportunity_score: 72, asking_price: 400, next_action: "Qualify owner contact", tags: ["facebook only"], is_sample: true, created_at: isoOffset({ hours: -7 }), updated_at: isoOffset({ hours: -7 }) },
    { id: ids.lead7, business_name: "Bluebonnet Pool Repair", contact_name: "Tara", email: "tara@bluebonnetpool.example", city: "Southlake", region: "TX", category: "Pool service", source: "Manual", status: "won", priority: "normal", qualification_score: 92, opportunity_score: 89, asking_price: 400, next_action: "Collect domain details", next_action_at: isoOffset({ days: 1 }), tags: ["client"], is_sample: true, created_at: isoOffset({ days: -18 }), updated_at: isoOffset({ days: -2 }) },
  ];

  const templates = [
    { id: ids.template1, name: "Local Service Pro", category: "Home services", description: "High-trust hero, service grid, reviews, and fast quote CTA.", accent_color: "#7c5cff", layout_key: "service-pro", is_active: true, use_count: 8, created_at: isoOffset({ days: -20 }) },
    { id: ids.template2, name: "Clean Craft", category: "Personal services", description: "Editorial layout built for portfolios, pricing, and local proof.", accent_color: "#43c9d7", layout_key: "clean-craft", is_active: true, use_count: 4, created_at: isoOffset({ days: -17 }) },
    { id: ids.template3, name: "Fieldwork", category: "Outdoor services", description: "Bold imagery, urgent booking flow, and coverage-area content.", accent_color: "#f1bf5a", layout_key: "fieldwork", is_active: true, use_count: 6, created_at: isoOffset({ days: -12 }) },
  ];

  return {
    profile: { id: "preview", full_name: "Connor", role: "owner", preferences: { manual_mode: true, email_approval_required: true, demo_deploy_approval_required: true, daily_cost_limit: 5 } },
    leads,
    analyses: [
      { id: "analysis-1", lead_id: ids.lead1, website_score: 0, website_findings: [{ label: "No website found", severity: "high" }, { label: "Google profile is active", severity: "good" }], review_score: 92, review_findings: [{ label: "4.9 average across 71 reviews", severity: "good" }, { label: "Customers repeatedly mention fast cleanup", severity: "good" }], opportunity_summary: "Strong operator with visible demand and no owned web presence. Lead with credibility and quote requests.", recommended_template: "Fieldwork", analyzed_at: isoOffset({ days: -1 }) },
      { id: "analysis-2", lead_id: ids.lead2, website_score: 38, website_findings: [{ label: "Desktop-only layout", severity: "high" }, { label: "No clear quote CTA", severity: "medium" }], review_score: 84, review_findings: [{ label: "Fast emergency response praised", severity: "good" }], opportunity_summary: "A mobile-first replacement can outperform the existing site immediately.", recommended_template: "Local Service Pro", analyzed_at: isoOffset({ days: -1 }) },
      { id: "analysis-3", lead_id: ids.lead3, website_score: 0, website_findings: [{ label: "No owned website", severity: "high" }], review_score: 88, review_findings: [{ label: "Strong local word of mouth", severity: "good" }], opportunity_summary: "Portfolio, services, and directions are the conversion core.", recommended_template: "Clean Craft", analyzed_at: isoOffset({ hours: -6 }) },
    ],
    templates,
    demos: [
      { id: ids.demo1, lead_id: ids.lead1, template_id: ids.template3, name: "Northstar Tree Care Demo", status: "ready", storage_prefix: "preview/northstar-tree-care", preview_url: "https://example.com", qa_score: 96, qa_checklist: { mobile: true, links: true, copy: true, speed: true }, brief: { goal: "Generate estimate requests" }, created_at: isoOffset({ days: -2 }), updated_at: isoOffset({ minutes: -18 }) },
      { id: ids.demo2, lead_id: ids.lead2, template_id: ids.template1, name: "Apex Garage Doors Demo", status: "qa", storage_prefix: "preview/apex-garage", qa_score: 78, qa_checklist: { mobile: false, links: true, copy: true, speed: true }, brief: { goal: "Drive emergency calls" }, created_at: isoOffset({ days: -1 }), updated_at: isoOffset({ hours: -2 }) },
    ],
    demoVersions: [
      { id: "version-1", demo_id: ids.demo1, version_number: 2, storage_path: "preview/northstar/v2.zip", change_summary: "Improved service-area copy and mobile CTA", is_current: true, created_at: isoOffset({ hours: -8 }) },
      { id: "version-2", demo_id: ids.demo1, version_number: 1, storage_path: "preview/northstar/v1.zip", change_summary: "Initial demo", is_current: false, created_at: isoOffset({ days: -2 }) },
    ],
    drafts: [
      { id: ids.draft1, lead_id: ids.lead1, kind: "initial", subject: "I made a website for Northstar Tree Care", body: "Hey Mike,\n\nI came across Northstar Tree Care and noticed you didn’t have a website, so I went ahead and made one for you.\n\nHere’s the preview: [demo link]\n\nIf you like it, I can customize anything you want, connect your domain, and get the full site live.\n\nI charge a one-time fee of $400. If you don’t like it, you don’t pay.\n\nInterested?\n\nConnor", status: "pending_approval", created_at: isoOffset({ hours: -2 }), updated_at: isoOffset({ minutes: -35 }) },
      { id: ids.draft2, lead_id: ids.lead4, kind: "follow_up", subject: "Quick follow-up — Clearview website", body: "Hey Jordan,\n\nJust wanted to make sure the website preview reached you. I’m happy to adjust the design or copy if you want anything changed.\n\nConnor", status: "approved", created_at: isoOffset({ days: -1 }), updated_at: isoOffset({ hours: -5 }) },
    ],
    communications: [
      { id: "comm-1", lead_id: ids.lead5, direction: "inbound", channel: "gmail", subject: "Re: Website for Lone Star Mobile Detail", body_preview: "This looks good. Can you make the booking section show our three packages?", sentiment: "positive", reply_classification: "interested_revision", occurred_at: isoOffset({ minutes: -42 }) },
      { id: "comm-2", lead_id: ids.lead4, draft_id: ids.draft2, direction: "outbound", channel: "gmail", subject: "Quick follow-up — Clearview website", body_preview: "Just wanted to make sure the website preview reached you.", sentiment: "neutral", occurred_at: isoOffset({ hours: -5 }) },
    ],
    followUps: [
      { id: "follow-1", lead_id: ids.lead4, draft_id: ids.draft2, sequence_number: 1, due_at: isoOffset({ days: 2 }), status: "scheduled", created_at: isoOffset({ days: -1 }) },
      { id: "follow-2", lead_id: ids.lead1, sequence_number: 1, due_at: isoOffset({ days: 3 }), status: "scheduled", created_at: isoOffset({ hours: -1 }) },
    ],
    approvals: [
      { id: "approval-1", entity_type: "message_draft", entity_id: ids.draft1, approval_type: "email_send", title: "Send initial email to Northstar Tree Care", summary: "Writer prepared a personalized email using the approved $400 one-time offer.", payload: { subject: "I made a website for Northstar Tree Care" }, status: "pending", risk_level: "medium", requested_by_agent: "writer", created_at: isoOffset({ minutes: -35 }) },
      { id: "approval-2", entity_type: "demo", entity_id: ids.demo1, approval_type: "demo_deploy", title: "Publish Northstar demo preview", summary: "QA passed 4/4 checks. This creates the public preview link for outreach.", payload: { qa_score: 96 }, status: "pending", risk_level: "low", requested_by_agent: "designer", created_at: isoOffset({ hours: -1 }) },
    ],
    agentRuns: [
      { id: ids.run1, agent_type: "orchestrator", title: "Prepare Northstar outreach", status: "waiting_approval", current_step: "Waiting for email and deploy approval", progress: 82, estimated_cost: 0.18, started_at: isoOffset({ hours: -2 }), created_at: isoOffset({ hours: -2 }), updated_at: isoOffset({ minutes: -35 }) },
    ],
    agentEvents: [
      { id: 1, run_id: ids.run1, agent_type: "orchestrator", event_type: "approval_requested", title: "Approval requested", detail: "Email and demo are ready for review.", created_at: isoOffset({ minutes: -35 }) },
      { id: 2, run_id: ids.run1, agent_type: "writer", event_type: "draft_created", title: "Personalized email drafted", detail: "Used the approved concise outreach structure.", created_at: isoOffset({ minutes: -48 }) },
      { id: 3, run_id: ids.run1, agent_type: "designer", event_type: "qa_passed", title: "Demo passed QA", detail: "Mobile, links, copy, and speed checks passed.", created_at: isoOffset({ hours: -1 }) },
      { id: 4, agent_type: "system", event_type: "lead_added", title: "Lead added to pipeline", detail: "Birdville Fence Co. entered discovery.", created_at: isoOffset({ hours: -7 }) },
    ],
    notifications: [
      { id: "notification-1", type: "approval", title: "Two approvals waiting", message: "Northstar demo and email are ready.", action_route: "approvals", is_read: false, created_at: isoOffset({ minutes: -35 }) },
      { id: "notification-2", type: "success", title: "Positive reply detected", message: "Lone Star Mobile Detail requested a revision.", action_route: "inbox", is_read: false, created_at: isoOffset({ minutes: -42 }) },
      { id: "notification-3", type: "info", title: "Daily cost is on track", message: "$0.84 used of the $5.00 limit.", action_route: "analytics", is_read: true, created_at: isoOffset({ hours: -3 }) },
    ],
    clients: [
      { id: "client-1", lead_id: ids.lead7, status: "onboarding", package_name: "Standard website", agreed_price: 400, amount_received: 0, domain: null, production_url: null, handoff_checklist: { content: false, domain: false, payment: false, launch: false }, closed_at: isoOffset({ days: -2 }), created_at: isoOffset({ days: -2 }), updated_at: isoOffset({ days: -2 }) },
    ],
    costEvents: [
      { id: "cost-1", lead_id: ids.lead1, run_id: ids.run1, category: "analysis", provider: "Model API", model: "analysis-model", input_units: 3200, output_units: 900, amount: 0.08, occurred_at: isoOffset({ hours: -2 }) },
      { id: "cost-2", lead_id: ids.lead1, run_id: ids.run1, category: "design", provider: "Model API", model: "design-model", input_units: 4200, output_units: 1900, amount: 0.07, occurred_at: isoOffset({ hours: -1 }) },
      { id: "cost-3", lead_id: ids.lead1, run_id: ids.run1, category: "writing", provider: "Model API", model: "writing-model", input_units: 1500, output_units: 500, amount: 0.03, occurred_at: isoOffset({ minutes: -48 }) },
      { id: "cost-4", lead_id: ids.lead2, category: "design", provider: "Model API", model: "design-model", input_units: 4800, output_units: 2200, amount: 0.11, occurred_at: isoOffset({ hours: -4 }) },
      { id: "cost-5", lead_id: ids.lead3, category: "analysis", provider: "Model API", model: "analysis-model", input_units: 2900, output_units: 650, amount: 0.07, occurred_at: isoOffset({ hours: -6 }) },
    ],
    pricingExperiments: [
      { id: "price-1", name: "$400 baseline", offer_amount: 400, status: "active", sent_count: 12, reply_count: 4, close_count: 1, revenue: 400, started_at: isoOffset({ days: -12 }) },
      { id: "price-2", name: "$700 test", offer_amount: 700, status: "draft", sent_count: 0, reply_count: 0, close_count: 0, revenue: 0 },
    ],
    financeTransactions: [
      { id: "tx-1", scope: "business", kind: "income", category: "Website sale", description: "Bluebonnet Pool Repair", amount: 400, occurred_on: isoOffset({ days: -2 }).slice(0, 10), source: "manual" },
      { id: "tx-2", scope: "business", kind: "expense", category: "AI", description: "Prospect processing", amount: 0.84, occurred_on: isoOffset({}).slice(0, 10), source: "manual" },
      { id: "tx-3", scope: "personal", kind: "expense", category: "Software", description: "ChatGPT Plus", amount: 20, occurred_on: isoOffset({ days: -8 }).slice(0, 10), source: "manual" },
    ],
    financeGoals: [
      { id: "goal-1", name: "MacBook Air", target_amount: 1200, current_amount: 470, target_date: null, priority: 1, color: "#7c5cff", is_complete: false },
      { id: "goal-2", name: "Business tools buffer", target_amount: 200, current_amount: 80, target_date: null, priority: 2, color: "#43c9d7", is_complete: false },
      { id: "goal-3", name: "Dream PC", target_amount: 5500, current_amount: 0, target_date: null, priority: 3, color: "#f1bf5a", is_complete: false },
    ],
    integrations: [],
  };
}

