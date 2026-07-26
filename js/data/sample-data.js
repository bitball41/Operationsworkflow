const stamp = (days = 0, hours = 0) => new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString();
const day = (days = 0) => stamp(days).slice(0, 10);
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function createSampleData() {
  const leads = [
    lead(1, "North Star Tree Care", "Tree Service", "Arlington", "TX", "new", 96, 400, -1, { phone: "(817) 555-0148", email: "office@northstartree.example" }),
    lead(2, "ClearFlow Plumbing Co.", "Plumbing", "Fort Worth", "TX", "qualified", 93, 500, -4, { phone: "(817) 555-0182", contact: "Marcus Reed" }),
    lead(3, "GreenLine Landscaping", "Landscaping", "Hurst", "TX", "demo_ready", 91, 400, -7, { phone: "(682) 555-0116", email: "hello@greenlineland.example" }),
    lead(4, "Ridgeway Roofing", "Roofing", "Irving", "TX", "contacted", 89, 700, -11, { phone: "(972) 555-0129", contact: "Derek Walsh", lastContact: -2 }),
    lead(5, "Polar Air Comfort", "HVAC", "Grapevine", "TX", "replied", 88, 500, -13, { phone: "(817) 555-0194", email: "service@polarair.example", contact: "Anika Patel", lastContact: -1 }),
    lead(6, "BrightNest Cleaning", "Cleaning", "Keller", "TX", "contacted", 86, 400, -15, { phone: "(817) 555-0165", lastContact: -5 }),
    lead(7, "Mirror Finish Auto Detail", "Auto Detailing", "Dallas", "TX", "interested", 94, 700, -18, { phone: "(214) 555-0150", email: "book@mirrorfinish.example", contact: "Luis Moreno", lastContact: -1 }),
    lead(8, "Blue Oak Contractors", "General Contractor", "Plano", "TX", "closing", 87, 700, -24, { phone: "(469) 555-0131", email: "projects@blueoak.example", contact: "June Park", lastContact: -2 }),
    lead(9, "Cactus Wrench Handyman", "Handyman", "Denton", "TX", "won", 90, 500, -31, { phone: "(940) 555-0108", email: "sam@cactuswrench.example", contact: "Sam Ortega", lastContact: -8 }),
    lead(10, "Lone Star Gutter Co.", "Gutter Service", "Lewisville", "TX", "lost", 80, 400, -35, { phone: "(972) 555-0177", lastContact: -16 }),
  ];

  const templates = [
    template(20, "Timberline", "Tree Service", "#6fb87b", "active", 8),
    template(21, "Pipeworks", "Plumbing", "#5aa7ff", "active", 5),
    template(22, "Evergreen", "Landscaping", "#73c56f", "active", 7),
    template(23, "Summit Roof", "Roofing", "#d47b5b", "active", 4),
    template(24, "Clean Slate", "Cleaning", "#67c9d4", "active", 3),
    template(25, "Torque", "Auto Detailing", "#9b84ff", "draft", 1),
  ];

  return {
    profile: {
      id: id(900),
      full_name: "Connor",
      role: "owner",
      preferences: {
        manual_mode: true,
        business_name: "Connor Websites",
        owner_name: "Connor",
        timezone: "America/Chicago",
        currency: "USD",
        theme: "dark",
        default_site_price: 400,
        maintenance_price: 50,
        default_offer: "One-time website build",
        default_email: "connor@business.example",
        signature: "Connor",
        follow_up_days: [3, 7, 14],
        daily_cost_limit: 10,
        preview_domain: "preview.example.com",
      },
    },
    leads,
    discoveryRuns: [
      { id: id(30), source: "openscout", engine_version: "openscout-2026-07-25", query: { location: "Arlington, TX", businessType: "tree services", radiusKm: 18 }, status: "completed", scanned_count: 184, result_count: 27, duplicate_count: 9, rejected_count: 12, saved_count: 6, summary: { estimatedAccuracy: 94 }, started_at: stamp(-1, -2), completed_at: stamp(-1, -1), created_at: stamp(-1, -2) },
      { id: id(31), source: "openscout", engine_version: "openscout-2026-07-25", query: { location: "Fort Worth, TX", businessType: "plumbers", radiusKm: 12 }, status: "completed", scanned_count: 121, result_count: 18, duplicate_count: 4, rejected_count: 9, saved_count: 5, summary: { estimatedAccuracy: 92 }, started_at: stamp(-4, -3), completed_at: stamp(-4, -2), created_at: stamp(-4, -3) },
    ],
    discoveryResults: [
      discoveryResult(32, 30, leads[0], "saved", 1),
      discoveryResult(33, 30, leads[2], "saved", 3),
      { ...discoveryResult(34, 30, lead(34, "Metro Tree Experts", "Tree Service", "Arlington", "TX", "new", 72, 400, -1), "rejected"), decision_reason: "Low confidence and no phone" },
    ],
    templates,
    demos: [
      demo(40, 3, 22, "greenline-landscaping", "GreenLine Landscaping Demo", "ready", "https://preview.example.com/d/greenline-landscaping", -5),
      demo(41, 4, 23, "ridgeway-roofing", "Ridgeway Roofing Demo", "sent", "https://preview.example.com/d/ridgeway-roofing", -9),
      demo(42, 5, 21, "polar-air-comfort", "Polar Air Comfort Demo", "viewed", "https://preview.example.com/d/polar-air-comfort", -11, -1),
      demo(43, 7, 25, "mirror-finish-detail", "Mirror Finish Auto Detail", "client_interested", "https://preview.example.com/d/mirror-finish-detail", -15, -2),
      demo(44, 9, 20, "cactus-wrench", "Cactus Wrench Handyman", "converted", "https://preview.example.com/d/cactus-wrench", -28, -18),
    ],
    demoVersions: [
      { id: id(45), demo_id: id(40), version_number: 2, storage_path: `${id(900)}/demos/${id(40)}/v2.zip`, change_summary: "Updated service cards and call button", is_current: true, created_at: stamp(-3) },
      { id: id(46), demo_id: id(40), version_number: 1, storage_path: `${id(900)}/demos/${id(40)}/v1.zip`, change_summary: "Initial template configuration", is_current: false, created_at: stamp(-5) },
    ],
    drafts: [
      draft(50, 3, "GreenLine Landscaping", "pending_approval", 400, -1),
      draft(51, 4, "Ridgeway Roofing", "sent", 700, -9),
      draft(52, 5, "Polar Air Comfort", "sent", 500, -6),
      draft(53, 6, "BrightNest Cleaning", "draft", 400, 0),
    ],
    emailThreads: [
      thread(60, 5, "Re: Website preview for Polar Air Comfort", "interested", "Anika Patel", "service@polarair.example", -1, true, "Likes the direction and asked whether the colors can match the trucks."),
      thread(61, 7, "Re: I built this for Mirror Finish", "needs_changes", "Luis Moreno", "book@mirrorfinish.example", -1, false, "Interested; wants a darker gallery and ceramic coating highlighted."),
      thread(62, 4, "Re: Ridgeway Roofing preview", "maybe", "Derek Walsh", "derek@ridgeway.example", -3, false, "Asked to revisit after the current job wraps."),
      thread(63, 6, "Re: BrightNest website", "price_objection", "Maya Chen", "maya@brightnest.example", -4, true, "Likes the site but asked whether the price can be lower."),
      thread(64, 10, "Re: Website idea", "not_interested", "Lone Star Gutter Co.", "office@lonestargutter.example", -14, false, "Already working with a relative."),
    ],
    emails: [
      email(70, 60, 5, "outbound", "Website preview for Polar Air Comfort", "I made a website preview for Polar Air Comfort.", -6),
      email(71, 60, 5, "inbound", "Re: Website preview for Polar Air Comfort", "This looks really good. Can you match the blue on our trucks?", -1),
      email(72, 61, 7, "outbound", "I built this for Mirror Finish", "Here is the preview I put together.", -5),
      email(73, 61, 7, "inbound", "Re: I built this for Mirror Finish", "I like it. Can the gallery be darker and show ceramic coatings first?", -1),
      email(74, 63, 6, "outbound", "BrightNest website", "Here is a clean website concept for BrightNest.", -8),
      email(75, 63, 6, "inbound", "Re: BrightNest website", "The site is nice but $400 is more than I expected.", -4),
    ],
    followUps: [
      { id: id(80), lead_id: id(4), sequence_number: 2, due_at: stamp(-1), status: "overdue", suggested_text: "Quick check-in on the roofing preview—happy to adjust anything.", created_at: stamp(-8), updated_at: stamp(-1) },
      { id: id(81), lead_id: id(6), sequence_number: 2, due_at: stamp(0, 2), status: "due", suggested_text: "Following up on the BrightNest concept and your pricing question.", created_at: stamp(-6), updated_at: stamp(-1) },
      { id: id(82), lead_id: id(2), sequence_number: 1, due_at: stamp(2), status: "scheduled", suggested_text: "I finished a first pass for ClearFlow and would love your take.", created_at: stamp(-1), updated_at: stamp(-1) },
      { id: id(83), lead_id: id(5), sequence_number: 1, due_at: stamp(-1), status: "replied", completed_at: stamp(-1), suggested_text: "", created_at: stamp(-5), updated_at: stamp(-1) },
    ],
    approvals: [
      { id: id(90), entity_type: "message_draft", entity_id: id(50), approval_type: "email_send", title: "Send GreenLine outreach", summary: "One personalized email with the ready demo attached.", payload: { recipients: 1, price: 400 }, status: "pending", risk_level: "low", requested_by_agent: "writer", created_at: stamp(0, -2), updated_at: stamp(0, -2) },
      { id: id(91), entity_type: "demo", entity_id: id(40), approval_type: "demo_deploy", title: "Publish GreenLine demo", summary: "Make the latest demo version available at its preview URL.", payload: { version: 2 }, status: "pending", risk_level: "medium", requested_by_agent: "orchestrator", created_at: stamp(-1), updated_at: stamp(-1) },
      { id: id(92), entity_type: "pricing_experiment", entity_id: id(160), approval_type: "pricing_change", title: "Start $700 offer test", summary: "Use the $700 offer for the next 20 qualified leads.", payload: { price: 700, sample_size: 20 }, status: "pending", risk_level: "medium", requested_by_agent: "orchestrator", created_at: stamp(-2), updated_at: stamp(-2) },
    ],
    agentRuns: [
      { id: id(100), agent_type: "orchestrator", title: "Prepare this week’s best prospects", objective: "Find 50 DFW service businesses without real websites and prepare the best 20.", status: "paused", current_step: "Waiting for demo publish approval", progress: 64, estimated_cost: 1.28, context: { manual_mode: true }, completed_steps: ["OpenScout search", "Removed duplicates", "Qualified leads"], upcoming_steps: ["Create demos", "Prepare outreach", "Await approval"], messages: [{ role: "user", text: "Prioritize tree service and plumbing.", at: stamp(-1) }], started_at: stamp(-1, -4), created_at: stamp(-1, -4), updated_at: stamp(-1) },
    ],
    agentEvents: [
      { id: id(101), run_id: id(100), agent_type: "orchestrator", event_type: "search_complete", title: "OpenScout search complete", detail: "184 businesses scanned; 27 no-site candidates found.", created_at: stamp(-1, -3) },
      { id: id(102), run_id: id(100), agent_type: "orchestrator", event_type: "dedupe_complete", title: "Duplicates removed", detail: "9 repeated listings merged before qualification.", created_at: stamp(-1, -2) },
      { id: id(103), run_id: id(100), agent_type: "orchestrator", event_type: "waiting_approval", title: "Workflow paused", detail: "GreenLine demo publication needs approval.", created_at: stamp(-1) },
    ],
    notifications: [
      { id: id(110), type: "info", title: "New interested reply", message: "Polar Air Comfort asked for a color adjustment.", action_route: "inbox", is_read: false, created_at: stamp(0, -1) },
      { id: id(111), type: "warning", title: "Follow-up overdue", message: "Ridgeway Roofing was due yesterday.", action_route: "follow-ups", is_read: false, created_at: stamp(-1) },
      { id: id(112), type: "success", title: "Maintenance payment", message: "$50 received from Cactus Wrench Handyman.", action_route: "payments", is_read: true, created_at: stamp(-2) },
    ],
    clients: [
      { id: id(120), lead_id: id(9), status: "active", package_name: "Standard website", agreed_price: 500, amount_received: 500, contact_name: "Sam Ortega", email: "sam@cactuswrench.example", phone: "(940) 555-0108", domain: "cactuswrench.example", production_url: "https://cactuswrench.example", purchase_date: day(-20), payment_status: "paid", project_status: "live", maintenance_status: "active", support_requests: 1, notes: "Prefers text messages.", handoff_checklist: { content: true, domain: true, payment: true, launch: true }, closed_at: stamp(-22), completed_at: stamp(-12), created_at: stamp(-22), updated_at: stamp(-2) },
      { id: id(121), lead_id: id(8), status: "onboarding", package_name: "Premium website", agreed_price: 700, amount_received: 350, contact_name: "June Park", email: "projects@blueoak.example", phone: "(469) 555-0131", domain: "", production_url: "", purchase_date: day(-2), payment_status: "pending", project_status: "changes", maintenance_status: "inactive", support_requests: 0, notes: "Second half due at launch.", handoff_checklist: { content: false, domain: false, payment: false, launch: false }, closed_at: stamp(-2), created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    clientSites: [
      { id: id(122), client_id: id(120), demo_id: id(44), name: "Cactus Wrench Website", domain: "cactuswrench.example", production_url: "https://cactuswrench.example", status: "live", config: { template: "Timberline" }, created_at: stamp(-20), updated_at: stamp(-2) },
      { id: id(123), client_id: id(121), demo_id: null, name: "Blue Oak Contractors Website", domain: "", production_url: "", status: "review", config: { template: "Summit Roof" }, created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    projects: [
      { id: id(130), client_id: id(120), site_id: id(122), name: "Cactus Wrench launch", status: "live", deadline: day(-10), progress: 100, requested_edits: [], notes: "Launched cleanly.", created_at: stamp(-20), updated_at: stamp(-10) },
      { id: id(131), client_id: id(121), site_id: id(123), name: "Blue Oak website build", status: "changes", deadline: day(8), progress: 38, requested_edits: ["Replace project gallery", "Add commercial services"], notes: "Awaiting six photos.", created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    projectTasks: [
      { id: id(132), project_id: id(131), title: "Collect project photos", status: "in_progress", due_at: stamp(2), sort_order: 1, created_at: stamp(-2), updated_at: stamp(-1) },
      { id: id(133), project_id: id(131), title: "Build commercial services section", status: "pending", due_at: stamp(4), sort_order: 2, created_at: stamp(-2), updated_at: stamp(-2) },
      { id: id(134), project_id: id(131), title: "Client review", status: "pending", due_at: stamp(6), sort_order: 3, created_at: stamp(-2), updated_at: stamp(-2) },
    ],
    maintenanceSubscriptions: [
      { id: id(140), client_id: id(120), site_id: id(122), plan_name: "Website Maintenance", monthly_amount: 50, status: "active", started_on: day(-18), next_charge_on: day(12), last_payment_on: day(-2), hosting_included: true, domain_managed: true, created_at: stamp(-18), updated_at: stamp(-2) },
      { id: id(141), client_id: id(121), site_id: id(123), plan_name: "Website Maintenance", monthly_amount: 50, status: "inactive", started_on: day(0), next_charge_on: null, last_payment_on: null, hosting_included: true, domain_managed: false, created_at: stamp(-2), updated_at: stamp(-2) },
    ],
    maintenanceRequests: [
      { id: id(142), subscription_id: id(140), title: "Update weekend hours", description: "Change Saturday closing time to 4 PM.", status: "completed", priority: "normal", completed_at: stamp(-3), created_at: stamp(-4), updated_at: stamp(-3) },
      { id: id(143), subscription_id: id(140), title: "Add drywall service", description: "Add drywall repair to the service list.", status: "new", priority: "normal", created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    payments: [
      payment(150, 120, "website_sale", "Cactus Wrench Handyman", 500, 14.5, "paid", -20),
      payment(151, 120, "maintenance", "Cactus Wrench Handyman", 50, 1.75, "available", -2, 140),
      payment(152, 121, "website_sale", "Blue Oak Contractors", 350, 10.15, "paid", -2),
      payment(153, 120, "maintenance", "Cactus Wrench Handyman", 50, 1.75, "paid", -32, 140),
    ],
    expenses: [
      expense(154, "hosting", "Cloudflare", "Preview hosting", 5, -3),
      expense(155, "domains", "Registrar", "Preview domain renewal", 14, -12),
      expense(156, "apis", "Google Maps", "OpenScout Places usage", 8.41, -1),
      expense(157, "software", "Design tools", "Monthly software", 20, -8),
      expense(158, "ai", "Model API", "Demo copy and outreach drafts", 6.82, -2),
      expense(159, "payment_fees", "Whop", "Recorded payment fees", 26.4, -2),
    ],
    aiUsage: [
      { id: id(170), provider: "OpenAI", model: "Placeholder model", task: "Outreach drafts", request_count: 18, input_tokens: 42000, output_tokens: 11000, cost: 2.31, lead_id: id(3), occurred_at: stamp(-2), created_at: stamp(-2) },
      { id: id(171), provider: "Anthropic", model: "Placeholder model", task: "Demo content", request_count: 7, input_tokens: 32000, output_tokens: 16000, cost: 3.87, lead_id: id(7), occurred_at: stamp(-3), created_at: stamp(-3) },
      { id: id(172), provider: "OpenAI", model: "Placeholder model", task: "Reply classification", request_count: 12, input_tokens: 9000, output_tokens: 1800, cost: 0.64, lead_id: null, occurred_at: stamp(-1), created_at: stamp(-1) },
    ],
    pricingExperiments: [
      { id: id(160), name: "$700 premium offer", offer_amount: 700, status: "active", sent_count: 18, reply_count: 5, close_count: 2, revenue: 1400, started_at: stamp(-14), ended_at: null, created_at: stamp(-14), updated_at: stamp(-1) },
      { id: id(161), name: "$400 baseline", offer_amount: 400, status: "complete", sent_count: 42, reply_count: 14, close_count: 5, revenue: 2000, started_at: stamp(-45), ended_at: stamp(-15), created_at: stamp(-45), updated_at: stamp(-15) },
      { id: id(162), name: "$500 middle test", offer_amount: 500, status: "draft", sent_count: 0, reply_count: 0, close_count: 0, revenue: 0, started_at: null, ended_at: null, created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    activity: [
      activity(180, "reply_received", "Reply received", "Polar Air Comfort asked for color changes.", "system", -0.04, 5),
      activity(181, "lead_discovered", "Lead discovered", "North Star Tree Care found through OpenScout.", "system", -1, 1),
      activity(182, "demo_viewed", "Demo viewed", "Mirror Finish opened the demo twice.", "system", -1.2, 7),
      activity(183, "pipeline_moved", "Pipeline moved", "Blue Oak moved from Interested to Closing.", "user", -2, 8),
      activity(184, "payment", "Payment received", "$350 deposit recorded for Blue Oak.", "system", -2.1, 8, 121),
      activity(185, "maintenance_renewed", "Maintenance renewed", "Cactus Wrench maintenance payment posted.", "system", -2.3, 9, 120),
      activity(186, "email_sent", "Outreach sent", "Ridgeway Roofing outreach sent with demo.", "user", -9, 4),
      activity(187, "demo_created", "Demo created", "GreenLine Landscaping demo created from Evergreen.", "user", -5, 3),
      activity(188, "lead_qualified", "Lead qualified", "ClearFlow scored 93/100.", "user", -4, 2),
    ],
    tasks: [
      task(190, "Finish GreenLine QA", "high", stamp(0, 3), "in_progress", 3),
      task(191, "Reply to Polar Air", "urgent", stamp(0, 1), "pending", 5),
      task(192, "Collect Blue Oak photos", "high", stamp(2), "pending", null, 121, 131),
      task(193, "Review Ridgeway follow-up", "normal", stamp(-1), "pending", 4),
      task(194, "Update Cactus Wrench service", "normal", stamp(3), "pending", 9, 120),
      task(195, "Archive dead prospects", "low", stamp(-3), "completed", null),
    ],
    calendarEvents: [
      calendarEvent(200, "Polar Air reply", "follow_up", stamp(0, 2), 5),
      calendarEvent(201, "Blue Oak photos due", "deadline", stamp(2), null, 121, 131),
      calendarEvent(202, "GreenLine demo send", "follow_up", stamp(1), 3),
      calendarEvent(203, "Blue Oak client review", "call", stamp(6, 3), null, 121, 131),
      calendarEvent(204, "Cactus Wrench maintenance", "maintenance", stamp(12), 9, 120),
    ],
    notes: [
      note(210, "Default outreach script", "sales", "Hey,\n\nI came across [Business Name] and noticed you didn’t have a website...", ["script", "outreach"], true, -12),
      note(211, "Tree service research", "research", "Lead with emergency service, storm cleanup, insured crews, and one-tap calling.", ["tree-service", "niche"], true, -5),
      note(212, "What improved reply rate", "lessons", "Specific demo references beat generic compliments. Keep the first email short.", ["outreach", "lessons"], false, -4),
      note(213, "Client launch checklist", "procedure", "Payment recorded\nDomain access confirmed\nMobile QA\nForms tested\nSSL healthy", ["launch", "procedure"], false, -9),
      note(214, "Orchestrator guardrails", "prompt", "Never send, deploy, delete, or change pricing without an approval record.", ["ai", "guardrail"], false, -2),
    ],
    deployments: [
      { id: id(220), client_id: id(120), site_id: id(122), demo_id: id(44), production_url: "https://cactuswrench.example", domain: "cactuswrench.example", status: "live", ssl_status: "active", dns_status: "active", version: "v12", hosting_health: "healthy", logs: [{ at: stamp(-2), message: "Deployment healthy" }], last_deployed_at: stamp(-2), created_at: stamp(-12), updated_at: stamp(-2) },
      { id: id(221), client_id: id(121), site_id: id(123), demo_id: null, production_url: "", domain: "", status: "pending", ssl_status: "pending", dns_status: "pending", version: "v3", hosting_health: "unknown", logs: [], last_deployed_at: null, created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    settings: [
      { id: id(230), key: "workspace", value: { default_site_price: 400, maintenance_price: 50, currency: "USD", timezone: "America/Chicago" }, created_at: stamp(-30), updated_at: stamp(-1) },
    ],
    integrations: [
      integration(240, "supabase", "connected", "Supabase", -0.01),
      integration(241, "openscout", "connected", "OpenScout", -0.01),
      integration(242, "gmail", "not_connected", "Gmail"),
      integration(243, "google_pubsub", "not_connected", "Google Pub/Sub"),
      integration(244, "whop", "not_connected", "Whop"),
      integration(245, "cloudflare", "not_connected", "Cloudflare"),
      integration(246, "openai", "not_connected", "OpenAI"),
      integration(247, "anthropic", "not_connected", "Anthropic"),
      integration(248, "github", "not_connected", "GitHub"),
      integration(249, "mcp", "disabled", "Custom MCP"),
    ],
  };
}

function lead(n, name, category, city, region, status, score, price, discoveredDays, extra = {}) {
  return {
    id: id(n),
    business_name: name,
    contact_name: extra.contact || "",
    email: extra.email || "",
    phone: extra.phone || "",
    address: `${120 + n} Market Street, ${city}, ${region} 76${String(n).padStart(3, "0")}`,
    city,
    region,
    postal_code: `76${String(n).padStart(3, "0")}`,
    country: "US",
    website_url: "",
    listing_url: `https://maps.google.com/?cid=sample-${n}`,
    google_maps_url: `https://maps.google.com/?cid=sample-${n}`,
    has_website: false,
    website_status: "No website",
    category,
    source: "openscout",
    source_key: `sample-place-${n}`,
    status,
    priority: score >= 92 ? "high" : "normal",
    qualification_score: score,
    opportunity_score: score,
    lead_score: score,
    asking_price: price,
    deal_value: price,
    last_contacted_at: extra.lastContact ? stamp(extra.lastContact) : null,
    follow_up_at: ["contacted", "replied"].includes(status) ? stamp(2) : null,
    notes: "",
    source_payload: { openscout: { leadCategory: "none", confidence: score, rating: 4.7, ratingCount: 20 + n, reasons: ["Google lists no website", "Has a phone number"] } },
    source_metadata: { engine: "openscout-2026-07-25", place_id: `sample-place-${n}`, openscout: { leadCategory: "none", confidence: score, rating: 4.7, ratingCount: 20 + n, reasons: ["Google lists no website", "Has a phone number"] } },
    discovered_at: stamp(discoveredDays),
    created_at: stamp(discoveredDays),
    updated_at: stamp(extra.lastContact || discoveredDays),
    is_sample: true,
    tags: [category.toLowerCase().replaceAll(" ", "-"), "dfw"],
  };
}

function template(n, name, category, accent, status, useCount) {
  return { id: id(n), name, category, description: `Fast, conversion-focused ${category.toLowerCase()} template.`, preview_url: "", desktop_preview_url: "", mobile_preview_url: "", thumbnail_path: "", accent_color: accent, layout_key: "service-pro", is_active: status === "active", status, use_count: useCount, created_at: stamp(-60 + n), updated_at: stamp(-n / 2) };
}

function demo(n, leadId, templateId, slug, name, status, previewUrl, createdDays, viewedDays = null) {
  return { id: id(n), lead_id: id(leadId), template_id: id(templateId), slug, name, status, preview_url: previewUrl, production_url: "", business_info: { phone: "(817) 555-0100", city: "DFW" }, content: { headline: `${name.replace(" Demo", "")} — local service done right`, services: ["Primary service", "Emergency help", "Free estimates"] }, theme: { primary: "#24334a", accent: "#6fb87b" }, qa_score: status === "draft" ? 68 : 94, qa_checklist: { mobile: true, links: true, content: true }, brief: {}, viewed_at: viewedDays ? stamp(viewedDays) : null, created_at: stamp(createdDays), updated_at: stamp(viewedDays || createdDays + 1) };
}

function draft(n, leadId, name, status, price, createdDays) {
  return { id: id(n), lead_id: id(leadId), kind: "initial", subject: `I made a website for ${name}`, body: `Hey,\n\nI came across ${name} and noticed you didn’t have a website, so I went ahead and made one for you.\n\nHere’s the preview: [link]\n\nIf you like it, I can customize anything you want, connect your domain, and get the full site live.\n\nI charge a one-time fee of $${price}.\nIf you don’t like it, you don’t pay.\n\nInterested?\n\nConnor`, status, scheduled_for: null, sent_at: status === "sent" ? stamp(createdDays + 1) : null, created_at: stamp(createdDays), updated_at: stamp(createdDays) };
}

function thread(n, leadId, subject, classification, senderName, senderEmail, lastDays, unread, summary) {
  return { id: id(n), lead_id: id(leadId), client_id: null, external_thread_id: `placeholder-thread-${n}`, subject, sender_name: senderName, sender_email: senderEmail, classification, ai_summary: summary, intent: classification, suggested_reply: "Thanks for taking a look — I can make that change and send an updated preview.", is_unread: unread, last_message_at: stamp(lastDays), created_at: stamp(lastDays - 4), updated_at: stamp(lastDays) };
}

function email(n, threadId, leadId, direction, subject, body, days) {
  return { id: id(n), thread_id: id(threadId), lead_id: id(leadId), direction, sender: direction === "inbound" ? "prospect@example.com" : "connor@business.example", recipients: direction === "inbound" ? ["connor@business.example"] : ["prospect@example.com"], subject, body, status: direction === "inbound" ? "received" : "sent", sent_at: direction === "outbound" ? stamp(days) : null, received_at: direction === "inbound" ? stamp(days) : null, created_at: stamp(days) };
}

function discoveryResult(n, runId, sourceLead, decision, leadId = null) {
  return { id: id(n), run_id: id(runId), lead_id: leadId ? id(leadId) : null, source: "openscout", source_key: sourceLead.source_key, business_name: sourceLead.business_name, normalized_data: sourceLead, raw_source_metadata: sourceLead.source_metadata, website_status: sourceLead.website_status, lead_score: sourceLead.lead_score, decision, decision_reason: "", duplicate_of_lead_id: null, decided_at: stamp(-1), created_at: stamp(-1) };
}

function payment(n, clientId, paymentType, customerName, amount, fee, status, days, maintenanceId = null) {
  return { id: id(n), client_id: id(clientId), maintenance_subscription_id: maintenanceId ? id(maintenanceId) : null, payment_type: paymentType, customer_name: customerName, amount, fee_amount: fee, status, refund_state: "none", source: "whop_placeholder", external_transaction_id: `txn_placeholder_${n}`, paid_at: stamp(days), created_at: stamp(days) };
}

function expense(n, category, vendor, description, amount, days) {
  return { id: id(n), category, vendor, description, amount, occurred_on: day(days), lead_id: null, client_id: null, created_at: stamp(days) };
}

function activity(n, type, title, detail, actorType, days, leadId = null, clientId = null) {
  return { id: id(n), type, title, detail, actor_type: actorType, lead_id: leadId ? id(leadId) : null, client_id: clientId ? id(clientId) : null, project_id: null, metadata: {}, created_at: stamp(days) };
}

function task(n, title, priority, dueAt, status, leadId = null, clientId = null, projectId = null) {
  return { id: id(n), title, description: "", priority, due_at: dueAt, status, lead_id: leadId ? id(leadId) : null, client_id: clientId ? id(clientId) : null, project_id: projectId ? id(projectId) : null, tags: [], created_by: "user", created_at: stamp(-4), updated_at: stamp(-1) };
}

function calendarEvent(n, title, eventType, startsAt, leadId = null, clientId = null, projectId = null) {
  return { id: id(n), title, event_type: eventType, starts_at: startsAt, ends_at: null, all_day: false, lead_id: leadId ? id(leadId) : null, client_id: clientId ? id(clientId) : null, project_id: projectId ? id(projectId) : null, notes: "", created_at: stamp(-5), updated_at: stamp(-1) };
}

function note(n, title, category, content, tags, pinned, days) {
  return { id: id(n), title, category, content, tags, is_pinned: pinned, is_archived: false, lead_id: null, client_id: null, created_at: stamp(days - 5), updated_at: stamp(days) };
}

function integration(n, provider, status, displayName, syncDays = null) {
  return { id: id(n), provider, status, display_name: displayName, config: {}, last_synced_at: syncDays === null ? null : stamp(syncDays), created_at: stamp(-30), updated_at: stamp(syncDays ?? -30) };
}
