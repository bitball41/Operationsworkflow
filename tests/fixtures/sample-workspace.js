/**
 * Test fixture only.
 *
 * This is a full, realistic workspace used to exercise every page renderer and
 * every operation. It is deliberately NOT reachable from the application — the
 * dashboard never invents leads, emails, revenue or statistics, so there is no
 * code path that can put these records in front of the person using it.
 *
 * Demo records carry real generated bundles, so bundle and Studio assertions
 * run against actual HTML/CSS/JS.
 */
import { CONFIG } from "../../js/config.js";
import { slugify } from "../../js/core/utils.js";
import { buildBundleForLead } from "../../js/services/sites/bundle.js";
import { previewUrl } from "../../js/services/sites/publish.js";
import { TEMPLATE_CATALOG, templateByKey } from "../../js/data/site-templates.js";

const stamp = (days = 0, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
const day = (days = 0) => stamp(days).slice(0, 10);
const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function lead(n, business, category, city, status, score, extra = {}) {
  const discovered = extra.discovered ?? -2;
  return {
    id: id(n),
    business_name: business,
    contact_name: extra.contact || "",
    email: extra.email || "",
    phone: extra.phone || "",
    address: `${100 + n} Main Street, ${city}, TX 76${String(n).padStart(3, "0")}`,
    city,
    region: "TX",
    postal_code: `76${String(n).padStart(3, "0")}`,
    country: "US",
    website_url: "",
    listing_url: `https://maps.google.com/?cid=seed-${n}`,
    google_maps_url: `https://maps.google.com/?cid=seed-${n}`,
    has_website: false,
    website_status: "No website",
    category,
    source: "openscout",
    source_key: `seed-place-${n}`,
    status,
    priority: score >= 92 ? "high" : "normal",
    qualification_score: score,
    qualification_status: "potential",
    opportunity_score: score,
    opportunity_tags: ["missed_call", "lead_follow_up"],
    opportunity_summary: "Public listing signals suggest a call-handling workflow may be worth qualifying.",
    lead_score: score,
    asking_price: CONFIG.defaultSetupFee,
    deal_value: CONFIG.defaultSetupFee,
    quoted_setup_fee: CONFIG.defaultSetupFee,
    quoted_monthly_fee: CONFIG.defaultMonthlyFee,
    assigned_team_member_id: id(260),
    calls_attempted: 0,
    objections: [],
    pain_points: [],
    current_tools: [],
    stage_entered_at: stamp(discovered),
    last_contacted_at: extra.lastContact ? stamp(extra.lastContact) : null,
    follow_up_at: extra.followUp ? stamp(extra.followUp) : null,
    notes: extra.notes || "",
    tags: [slugify(category), "dfw"],
    source_metadata: {
      engine: "openscout-2026-07-25",
      place_id: `seed-place-${n}`,
      openscout: {
        leadCategory: "none",
        confidence: score,
        rating: extra.rating || 4.7,
        ratingCount: extra.ratingCount || 20 + n,
        reasons: ["Google lists no website", "Has a phone number"],
      },
    },
    discovered_at: stamp(discovered),
    created_at: stamp(discovered),
    updated_at: stamp(extra.lastContact || discovered),
  };
}

function templateRecord(entry, index, useCount) {
  return {
    id: id(200 + index),
    name: entry.name,
    category: entry.category,
    description: entry.description,
    layout_key: entry.key,
    accent_color: entry.theme.accent,
    preview_url: "",
    thumbnail_path: "",
    status: "active",
    is_active: true,
    use_count: useCount,
    created_at: stamp(-60),
    updated_at: stamp(-3 - index),
  };
}

function demoFor(n, leadRecord, templateKey, templateId, status, { viewed = null, created = -3 } = {}) {
  const entry = templateByKey(templateKey);
  const built = buildBundleForLead(leadRecord, entry);
  const slug = slugify(`${leadRecord.business_name}-${leadRecord.city}`);
  return {
    id: id(n),
    lead_id: leadRecord.id,
    template_id: templateId,
    name: `${leadRecord.business_name} website`,
    slug,
    status,
    preview_url: previewUrl(slug, CONFIG.previewDomain),
    production_url: "",
    business_info: {
      name: built.site.business,
      phone: built.site.phone,
      email: built.site.email,
      address: built.site.address,
      hours: built.site.hours,
      cta: built.site.cta,
    },
    theme: { accent: entry.theme.accent, layout: entry.layout },
    content: {
      site: built.site,
      files: built.files,
      layout_key: entry.key,
      publish: {
        slug,
        url: previewUrl(slug, CONFIG.previewDomain),
        hosted: false,
        state: "pending_hosting",
        at: stamp(created),
        provider: "none",
        note: "Bundle saved and previewable. Connect Cloudflare to serve it on the preview domain.",
      },
      custom_edited: false,
    },
    qa_score: 92,
    qa_checklist: { mobile: true, links: true, content: true },
    brief: {},
    viewed_at: viewed ? stamp(viewed) : null,
    created_at: stamp(created),
    updated_at: stamp(viewed || created),
  };
}

export function createSeedData() {
  const leads = [
    lead(1, "North Star Tree Care", "Tree Service", "Arlington", "new", 96, { phone: "(817) 555-0148", rating: 4.9, ratingCount: 37, discovered: -1 }),
    lead(2, "ClearFlow Plumbing", "Plumbing", "Fort Worth", "new", 94, { phone: "(817) 555-0182", rating: 4.8, discovered: -1 }),
    lead(3, "GreenLine Landscaping", "Landscaping", "Hurst", "ready_to_contact", 91, { phone: "(682) 555-0116", email: "hello@greenlineland.example", discovered: -6 }),
    lead(4, "Ridgeway Roofing", "Roofing", "Irving", "contacted", 89, { phone: "(972) 555-0129", contact: "Derek Walsh", email: "derek@ridgeway.example", lastContact: -6, followUp: -1, discovered: -11 }),
    lead(5, "Polar Air Comfort", "HVAC", "Grapevine", "interested", 88, { phone: "(817) 555-0194", email: "service@polarair.example", contact: "Anika Patel", lastContact: -3, discovered: -13 }),
    lead(6, "BrightNest Cleaning", "Cleaning", "Keller", "contacted", 86, { phone: "(817) 555-0165", email: "maya@brightnest.example", contact: "Maya Chen", lastContact: -5, discovered: -15 }),
    lead(7, "Mirror Finish Auto Detail", "Auto Detailing", "Dallas", "interested", 94, { phone: "(214) 555-0150", email: "book@mirrorfinish.example", contact: "Luis Moreno", lastContact: -2, price: 700, discovered: -18 }),
    lead(8, "Blue Oak Contractors", "General Contractor", "Plano", "negotiating", 87, { phone: "(469) 555-0131", email: "projects@blueoak.example", contact: "June Park", lastContact: -2, price: 700, discovered: -24 }),
    lead(9, "Cactus Wrench Handyman", "Handyman", "Denton", "won", 90, { phone: "(940) 555-0108", email: "sam@cactuswrench.example", contact: "Sam Ortega", lastContact: -20, price: 500, discovered: -31 }),
    lead(10, "Lone Star Gutter Co.", "Gutter Service", "Lewisville", "lost", 80, { phone: "(972) 555-0177", lastContact: -16, discovered: -35 }),
    lead(11, "Summit Fence Works", "Fencing", "Mansfield", "new", 93, { phone: "(817) 555-0121", rating: 4.8, discovered: -1 }),
    lead(12, "Bluebonnet Pressure Washing", "Pressure Washing", "Euless", "new", 90, { phone: "(682) 555-0193", rating: 4.6, discovered: -1 }),
    lead(13, "Trinity Pool Service", "Pool Service", "Bedford", "ready_to_contact", 92, { phone: "(817) 555-0139", rating: 4.9, discovered: -2 }),
    lead(14, "Ironwood Electric", "Electrician", "Southlake", "new", 91, { phone: "(817) 555-0157", rating: 4.7, discovered: -2 }),
  ];

  const templates = TEMPLATE_CATALOG.map((entry, index) => templateRecord(entry, index, [8, 5, 7, 4, 3, 2, 1][index] ?? 0));
  const templateIdFor = (key) => templates.find((item) => item.layout_key === key).id;

  const demos = [
    demoFor(40, leads[2], "evergreen", templateIdFor("evergreen"), "ready", { created: -5 }),
    demoFor(41, leads[3], "summit", templateIdFor("summit"), "sent", { created: -9 }),
    demoFor(42, leads[4], "pipeworks", templateIdFor("pipeworks"), "viewed", { created: -11, viewed: -3 }),
    demoFor(43, leads[6], "torque", templateIdFor("torque"), "client_interested", { created: -15, viewed: -2 }),
    demoFor(44, leads[8], "timberline", templateIdFor("timberline"), "converted", { created: -28, viewed: -20 }),
  ];

  const drafts = [
    draft(50, leads[2], "ready", 500, -1),
    draft(51, leads[3], "sent", 700, -7),
    draft(52, leads[4], "sent", 500, -4),
    draft(53, leads[5], "sent", 500, -5),
    draft(54, leads[10], "draft", 500, 0),
  ];

  return {
    profile: {
      id: "local",
      full_name: CONFIG.owner,
      role: "owner",
      preferences: {
        business_name: "Connor Voice Agents",
        owner_name: CONFIG.owner,
        timezone: "America/Chicago",
        currency: "USD",
        package_name: CONFIG.packageName,
        default_setup_fee: CONFIG.defaultSetupFee,
        default_monthly_fee: CONFIG.defaultMonthlyFee,
        default_email: "",
        signature: CONFIG.owner,
        follow_up_days: [3, 7, 14],
        preview_domain: CONFIG.previewDomain,
        batch_target: CONFIG.defaultBatchTarget,
      },
    },
    leads,
    teamMembers: [
      { id: id(260), full_name: "Jordan Lee", access_email: "jordan@example.test", role: "salesperson", status: "active", permissions: {}, commission_rate: 0.14, commission_min: 350, commission_max: 350, created_at: stamp(-30), updated_at: stamp(-1) },
      { id: id(261), full_name: CONFIG.owner, access_email: "owner@example.test", role: "owner", status: "active", permissions: {}, commission_rate: 0.14, commission_min: 350, commission_max: 350, created_at: stamp(-30), updated_at: stamp(-1) },
    ],
    salesCalls: [
      { id: id(262), lead_id: leads[4].id, salesperson_id: id(260), outcome: "interested", notes: "Owner wants better after-hours coverage.", objection: "Needs to hear call quality", pain_point: "Missed evening calls", called_at: stamp(0, -2), created_at: stamp(0, -2), updated_at: stamp(0, -2) },
    ],
    meetings: [
      { id: id(263), lead_id: leads[4].id, client_id: null, salesperson_id: id(260), title: "AI receptionist discovery", starts_at: stamp(2), ends_at: stamp(2, 1), outcome: "scheduled", attendees: ["Anika Patel"], biggest_pain_point: "After-hours calls", automation_proposed: "Unlimited AI receptionist and appointment booking", required_integrations: ["Google Calendar"], quoted_setup_fee: 2500, quoted_monthly_fee: 997, next_action: "Map booking rules", created_at: stamp(0), updated_at: stamp(0) },
    ],
    discoveryRuns: [
      { id: id(30), source: "openscout", engine_version: "openscout-2026-07-25", query: { location: "Arlington, TX", businessType: "tree service", limit: 50, radiusKm: 15 }, status: "completed", scanned_count: 184, result_count: 27, duplicate_count: 9, rejected_count: 4, saved_count: 6, summary: { estimatedAccuracy: 94 }, started_at: stamp(-1, -2), completed_at: stamp(-1, -1), created_at: stamp(-1, -2) },
      { id: id(31), source: "openscout", engine_version: "openscout-2026-07-25", query: { location: "Fort Worth, TX", businessType: "plumbing", limit: 50, radiusKm: 15 }, status: "completed", scanned_count: 121, result_count: 18, duplicate_count: 4, rejected_count: 2, saved_count: 5, summary: { estimatedAccuracy: 92 }, started_at: stamp(-4, -3), completed_at: stamp(-4, -2), created_at: stamp(-4, -3) },
    ],
    discoveryResults: [
      discoveryResult(32, 30, lead(32, "Metro Tree Experts", "Tree Service", "Arlington", "new", 88, { phone: "(817) 555-0170" }), "pending"),
      discoveryResult(33, 30, lead(33, "Oakline Tree & Stump", "Tree Service", "Grand Prairie", "new", 85, { phone: "(972) 555-0144" }), "pending"),
      discoveryResult(34, 30, leads[0], "saved", leads[0].id),
      { ...discoveryResult(35, 30, lead(35, "Cheap Tree Guys", "Tree Service", "Arlington", "new", 61, {}), "rejected"), decision_reason: "Low confidence and no phone" },
    ],
    templates,
    demos,
    demoVersions: [
      { id: id(45), demo_id: id(40), version_number: 1, storage_path: "inline/greenline-landscaping-hurst", change_summary: "Built from Evergreen template", is_current: true, created_at: stamp(-5) },
    ],
    drafts,
    emailThreads: [
      thread(60, leads[4], "Re: after-hours calls at Polar Air", "interested", "Anika Patel", "service@polarair.example", -0.02, true, "Wants to hear how the receptionist handles emergency calls."),
      thread(61, leads[6], "Re: booking calls for Mirror Finish", "needs_changes", "Luis Moreno", "book@mirrorfinish.example", -1, false, "Needs ceramic-coating appointments routed differently."),
      thread(62, leads[3], "Re: missed calls at Ridgeway Roofing", "maybe", "Derek Walsh", "derek@ridgeway.example", -3, false, "Asked to revisit after the current job wraps."),
      thread(63, leads[5], "Re: AI receptionist for BrightNest", "price_objection", "Maya Chen", "maya@brightnest.example", -2, true, "Asked what is included in the $997 monthly service."),
    ],
    emails: [
      email(70, 60, leads[4], "outbound", "after-hours calls at Polar Air", "Could an unlimited AI receptionist help Polar Air answer and book after-hours calls?", -4),
      email(71, 60, leads[4], "inbound", "Re: after-hours calls at Polar Air", "Can it distinguish emergency calls and book regular service?", -0.02),
      email(72, 61, leads[6], "outbound", "booking calls for Mirror Finish", "I can show how the receptionist qualifies and books detailing calls.", -5),
      email(73, 61, leads[6], "inbound", "Re: booking calls for Mirror Finish", "Ceramic coatings need a different appointment length. Can it handle that?", -1),
      email(74, 63, leads[5], "outbound", "AI receptionist for BrightNest", "The package is $2,500 to activate and $997 monthly for unlimited receptionist and booking service.", -5),
      email(75, 63, leads[5], "inbound", "Re: AI receptionist for BrightNest", "What is included in the $997 monthly service?", -2),
    ],
    followUps: [
      { id: id(80), lead_id: leads[3].id, draft_id: id(51), sequence_number: 2, due_at: stamp(-1), status: "scheduled", suggested_text: "Quick check-in on the roofing preview — happy to adjust anything.", created_at: stamp(-7), updated_at: stamp(-1) },
      { id: id(81), lead_id: leads[5].id, draft_id: id(53), sequence_number: 2, due_at: stamp(0, 3), status: "due", suggested_text: "Follow up on the pricing question for BrightNest.", created_at: stamp(-5), updated_at: stamp(-1) },
      { id: id(82), lead_id: leads[4].id, draft_id: id(52), sequence_number: 1, due_at: stamp(-2), status: "replied", completed_at: stamp(-2), suggested_text: "", created_at: stamp(-4), updated_at: stamp(-2) },
      { id: id(83), lead_id: leads[2].id, sequence_number: 1, due_at: stamp(2), status: "scheduled", suggested_text: "Send the GreenLine preview if no reply.", created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    approvals: [],
    assistantConversations: [],
    agentRuns: [
      { id: id(100), agent_type: "orchestrator", title: "Outreach automation", objective: "Prepare and send up to 48 outreach emails", status: "completed", current_step: "Batch finished", progress: 100, estimated_cost: 0, context: { settings: { batchTarget: 12 }, sendConnected: false }, completed_steps: [], upcoming_steps: [], messages: [], started_at: stamp(-1, -3), completed_at: stamp(-1, -2), created_at: stamp(-1, -3), updated_at: stamp(-1, -2) },
    ],
    agentEvents: [
      { id: 1, run_id: id(100), agent_type: "orchestrator", event_type: "lead_prepared", title: "GreenLine Landscaping prepared", detail: "Template Evergreen · demo ready · Outlook not connected so the email stopped at ready.", created_at: stamp(-1, -2) },
      { id: 2, run_id: id(100), agent_type: "orchestrator", event_type: "run_finished", title: "Batch finished", detail: "3 leads processed, 0 sent (email transport not connected).", created_at: stamp(-1, -2) },
    ],
    notifications: [],
    clients: [
      { id: id(120), lead_id: leads[8].id, status: "active", package_name: CONFIG.packageName, agreed_price: 2500, setup_fee: 2500, monthly_fee: 997, amount_received: 2500, contact_name: "Sam Ortega", email: "sam@cactuswrench.example", phone: "(940) 555-0108", purchase_date: day(-20), payment_status: "paid", onboarding_status: "complete", onboarding_progress: 100, support_status: "normal", maintenance_status: "active", primary_team_member_id: id(260), notes: "Prefers text messages.", closed_at: stamp(-22), created_at: stamp(-22), updated_at: stamp(-2) },
      { id: id(121), lead_id: leads[7].id, status: "onboarding", package_name: CONFIG.packageName, agreed_price: 2500, setup_fee: 2500, monthly_fee: 997, amount_received: 2500, contact_name: "June Park", email: "projects@blueoak.example", phone: "(469) 555-0131", purchase_date: day(-2), payment_status: "paid", onboarding_status: "in_progress", onboarding_progress: 38, support_status: "normal", maintenance_status: "inactive", primary_team_member_id: id(260), notes: "Technical discovery is pending.", closed_at: stamp(-2), created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    onboardingRecords: [
      { id: id(264), client_id: id(120), business: { services: ["Handyman services"], service_area: ["Denton"] }, customer_handling: { common_questions: ["What services do you offer?"] }, technical: { phone_system: "Provider unknown", calendar: "Google Calendar" }, automation_goals: { current_problem: "Missed calls", desired_outcome: "More booked estimates" }, status: "complete", progress: 100, completed_at: stamp(-12), created_at: stamp(-20), updated_at: stamp(-12) },
      { id: id(265), client_id: id(121), business: {}, customer_handling: {}, technical: {}, automation_goals: {}, status: "in_progress", progress: 38, completed_at: null, created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    clientSites: [
      { id: id(122), client_id: id(120), demo_id: id(44), name: "Cactus Wrench Website", domain: "cactuswrench.example", production_url: "https://cactuswrench.example", status: "live", config: {}, created_at: stamp(-20), updated_at: stamp(-2) },
      { id: id(123), client_id: id(121), demo_id: null, name: "Blue Oak Contractors Website", domain: "", production_url: "", status: "review", config: {}, created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    projects: [
      { id: id(130), client_id: id(120), name: "Cactus Wrench AI receptionist", status: "testing", automation_type: "voice agent", start_date: day(-20), target_launch: day(10), progress: 78, testing_status: "blocked", deployment_status: "not_deployed", current_version: "v1", owner_id: id(261), requirements: {}, notes: "Voice, calendar, and telephony providers are not connected.", created_at: stamp(-20), updated_at: stamp(-1) },
      { id: id(131), client_id: id(121), name: "Blue Oak missed-call workflow", status: "building", automation_type: "workflow", start_date: day(-2), target_launch: day(8), progress: 38, testing_status: "not_started", deployment_status: "not_deployed", owner_id: id(261), requirements: {}, notes: "Waiting on CRM access.", created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    automations: [
      { id: id(266), client_id: id(120), project_id: id(130), name: "Cactus Wrench Receptionist", automation_type: "voice agent", provider: "Not connected", status: "testing", environment: "development", configuration: {}, tools: [], variables: {}, escalation_behavior: {}, development_version: "v1", deployed_version: null, usage: {}, last_error: "Voice, calendar, and telephony adapters are unavailable.", last_activity_at: null, created_at: stamp(-18), updated_at: stamp(-1) },
      { id: id(267), client_id: id(121), project_id: id(131), name: "Blue Oak Lead Router", automation_type: "workflow", provider: "n8n", status: "building", environment: "development", configuration: {}, tools: [], variables: {}, escalation_behavior: {}, development_version: "v1", deployed_version: null, usage: {}, last_error: null, last_activity_at: null, created_at: stamp(-2), updated_at: stamp(-1) },
    ],
    knowledgeEntries: [
      { id: id(268), client_id: id(120), automation_id: id(266), category: "hours", title: "Business hours", content: "Monday-Friday 8-5", source_type: "hours", approved: true, active: true, last_updated_at: stamp(-2), created_at: stamp(-12), updated_at: stamp(-2) },
    ],
    projectTasks: [
      { id: id(132), project_id: id(131), title: "Collect project photos", status: "in_progress", due_at: stamp(2), sort_order: 1, created_at: stamp(-2), updated_at: stamp(-1) },
      { id: id(133), project_id: id(131), title: "Build commercial services section", status: "pending", due_at: stamp(4), sort_order: 2, created_at: stamp(-2), updated_at: stamp(-2) },
    ],
    maintenanceSubscriptions: [
      { id: id(140), client_id: id(120), project_id: id(130), plan_name: CONFIG.packageName, monthly_amount: 997, status: "active", started_on: day(-18), next_charge_on: day(12), last_payment_on: day(-2), included_usage: null, usage_unit: "unlimited service", overage_rate: null, billing_day: 12, cancellation_status: "none", created_at: stamp(-18), updated_at: stamp(-2) },
      { id: id(141), client_id: id(121), project_id: id(131), plan_name: CONFIG.packageName, monthly_amount: 997, status: "inactive", started_on: day(0), next_charge_on: null, last_payment_on: null, included_usage: null, usage_unit: "unlimited service", overage_rate: null, billing_day: null, cancellation_status: "none", created_at: stamp(-2), updated_at: stamp(-2) },
    ],
    maintenanceRequests: [
      { id: id(142), subscription_id: id(140), title: "Update weekend hours", description: "Change Saturday closing time to 4 PM.", status: "completed", priority: "normal", completed_at: stamp(-3), created_at: stamp(-4), updated_at: stamp(-3) },
      { id: id(143), subscription_id: id(140), title: "Add drywall service", description: "Add drywall repair to the service list.", status: "new", priority: "normal", created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    payments: [
      payment(150, 120, "setup_fee", "Cactus Wrench Handyman", 2500, 72.5, "paid", -20),
      payment(151, 120, "recurring_subscription", "Cactus Wrench Handyman", 997, 28.91, "available", -2, 140),
      payment(152, 121, "setup_fee", "Blue Oak Contractors", 2500, 72.5, "paid", -2),
      payment(153, 120, "recurring_subscription", "Cactus Wrench Handyman", 997, 28.91, "paid", -32, 140),
      payment(154, 121, "recurring_subscription", "Blue Oak Contractors", 997, 28.91, "paid", 0, 141),
    ],
    commissions: [
      { id: id(269), salesperson_id: id(260), client_id: id(120), lead_id: leads[8].id, payment_id: id(150), collected_setup_revenue: 2500, commission_rate: 0.14, commission_min: 350, commission_max: 350, calculated_commission: 350, status: "earned", earned_at: stamp(-20), paid_at: null, reversed_at: null, created_at: stamp(-20), updated_at: stamp(-20) },
    ],
    expenses: [
      expense(155, "hosting", "Cloudflare", "Preview hosting", 5, -3),
      expense(156, "domains", "Registrar", "Preview domain renewal", 14, -12),
      expense(157, "apis", "Google Maps", "Places usage for lead discovery", 8.41, -1),
      expense(158, "software", "Design tools", "Monthly software", 20, -8),
      expense(159, "payment_fees", "Whop", "Payment fees", 26.4, -2),
    ],
    aiUsage: [],
    pricingExperiments: [
      { id: id(160), name: "Missed-call opener", offer_amount: 2500, status: "active", sent_count: 18, reply_count: 5, close_count: 2, revenue: 5000, started_at: stamp(-14), ended_at: null, created_at: stamp(-14), updated_at: stamp(-1) },
      { id: id(161), name: "After-hours opener", offer_amount: 2500, status: "complete", sent_count: 42, reply_count: 14, close_count: 5, revenue: 12500, started_at: stamp(-45), ended_at: stamp(-15), created_at: stamp(-45), updated_at: stamp(-15) },
    ],
    activity: [
      activity(180, "reply_received", "Reply received", "Polar Air Comfort asked about emergency-call handling.", "system", -0.02, leads[4].id),
      activity(181, "automation_run", "Automation finished", "3 leads processed, 0 sent (email transport not connected).", "system", -1, null),
      activity(182, "demo_viewed", "Demo viewed", "Mirror Finish opened the demo twice.", "system", -1.2, leads[6].id),
      activity(183, "payment", "Activation payment received", "$2,500 activation payment recorded for Blue Oak.", "system", -0.2, leads[7].id, id(121)),
      activity(184, "lead_discovery", "Lead search finished", "184 businesses scanned, 27 kept.", "system", -1, null),
      activity(185, "email_sent", "Outreach sent", "Ridgeway Roofing outreach sent with demo.", "user", -7, leads[3].id),
      activity(186, "demo_created", "Demo built", "GreenLine Landscaping · Evergreen", "user", -5, leads[2].id),
    ],
    tasks: [
      task(190, "Reply to Polar Air about emergency-call rules", "urgent", stamp(0, 1), "pending", leads[4].id),
      task(191, "Collect Blue Oak photos", "high", stamp(2), "pending", null, id(121), id(131)),
      task(192, "Explain the BrightNest package", "normal", stamp(-1), "pending", leads[5].id),
      task(193, "Archive dead prospects", "low", stamp(-3), "completed", null),
    ],
    calendarEvents: [
      calendarEvent(200, "Polar Air follow-up call", "call", stamp(0, 3), leads[4].id),
      calendarEvent(201, "Blue Oak photos due", "deadline", stamp(2), null, id(121)),
      calendarEvent(202, "Cactus Wrench maintenance charge", "maintenance", stamp(12), leads[8].id, id(120)),
    ],
    notes: [
      note(210, "Outreach script", "sales", "Short, specific, no compliments. Mention the preview link in the second line and keep the price in its own paragraph.", ["outreach"], true, -12),
      note(211, "Tree service angle", "research", "Lead with emergency and storm work. Insured crew and clean-up matter more than price.", ["niche"], true, -5),
      note(212, "What improved reply rate", "lessons", "Specific demo references beat generic compliments. Keep the first email under 90 words.", ["outreach"], false, -4),
      note(213, "Launch checklist", "procedure", "Payment recorded\nDomain access confirmed\nMobile QA\nForms tested\nSSL healthy", ["launch"], false, -9),
    ],
    deployments: [
      { id: id(220), client_id: id(120), automation_id: id(266), project_id: id(130), provider: "Unconfigured", environment: "development", version: "v1", status: "not_deployed", rollback_version: null, deployed_at: null, notes: "No real voice, calendar, or telephony provider is connected.", created_at: stamp(-12), updated_at: stamp(-1) },
      { id: id(221), client_id: id(121), automation_id: id(267), project_id: id(131), provider: "n8n", environment: "staging", version: "v1", status: "failed", rollback_version: null, deployed_at: stamp(-1), notes: "Webhook connection failed in staging.", hosting_health: "error", created_at: stamp(-1), updated_at: stamp(-1) },
    ],
    settings: [
      { id: id(230), key: "workspace", value: { package_name: CONFIG.packageName, default_setup_fee: 2500, default_monthly_fee: 997, commission_amount: 350, currency: "USD", timezone: "America/Chicago", preview_domain: CONFIG.previewDomain }, created_at: stamp(-30), updated_at: stamp(-1) },
    ],
    integrations: [
      integration(240, "openscout", "connected", -0.01),
      integration(241, "outlook", "not_connected"),
      integration(242, "cloudflare", "not_connected"),
      integration(243, "anthropic", "not_connected"),
      integration(244, "openai", "not_connected"),
      integration(245, "research", "not_connected"),
      integration(246, "whop", "not_connected"),
      integration(247, "mcp", "not_connected"),
    ],
  };
}

function draft(n, leadRecord, status, _price, days) {
  const link = previewUrl(slugify(`${leadRecord.business_name}-${leadRecord.city}`), CONFIG.previewDomain);
  return {
    id: id(n),
    lead_id: leadRecord.id,
    kind: "initial",
    subject: `missed calls at ${leadRecord.business_name}`,
    body: `Hey,\n\nI help local service businesses answer every call with an unlimited AI receptionist that qualifies callers and books appointments.\n\nI prepared this supporting demo for ${leadRecord.business_name}: ${link}\n\nThe package is $2,500 to activate and $997 per month for unlimited receptionist and appointment-booking service.\n\nInterested in a short walkthrough?\n\n${CONFIG.owner}`,
    status,
    scheduled_for: null,
    sent_at: status === "sent" ? stamp(days) : null,
    error_message: status === "ready" ? "Outlook is not connected, so no email was sent." : null,
    created_at: stamp(days),
    updated_at: stamp(days),
  };
}

function thread(n, leadRecord, subject, classification, senderName, senderEmail, days, unread, summary) {
  return {
    id: id(n),
    lead_id: leadRecord.id,
    client_id: null,
    external_thread_id: `seed-thread-${n}`,
    subject,
    sender_name: senderName,
    sender_email: senderEmail,
    classification,
    ai_summary: summary,
    intent: classification,
    suggested_reply: "",
    is_unread: unread,
    last_message_at: stamp(days),
    created_at: stamp(days - 3),
    updated_at: stamp(days),
  };
}

function email(n, threadId, leadRecord, direction, subject, body, days) {
  const contactEmail = leadRecord.email || `contact@${slugify(leadRecord.business_name)}.example`;
  const ownerEmail = `${slugify(CONFIG.owner)}@operations.example`;
  return {
    id: id(n),
    thread_id: id(threadId),
    lead_id: leadRecord.id,
    direction,
    sender: direction === "inbound" ? contactEmail : ownerEmail,
    recipients: direction === "inbound" ? [ownerEmail] : [contactEmail],
    subject,
    body,
    status: direction === "inbound" ? "received" : "sent",
    sent_at: direction === "outbound" ? stamp(days) : null,
    received_at: direction === "inbound" ? stamp(days) : null,
    created_at: stamp(days),
  };
}

function discoveryResult(n, runId, sourceLead, decision, leadId = null) {
  return {
    id: id(n),
    run_id: id(runId),
    lead_id: leadId,
    source: "openscout",
    source_key: sourceLead.source_key,
    business_name: sourceLead.business_name,
    normalized_data: sourceLead,
    raw_source_metadata: sourceLead.source_metadata,
    website_status: sourceLead.website_status,
    lead_score: sourceLead.lead_score,
    decision,
    decision_reason: "",
    duplicate_of_lead_id: null,
    decided_at: decision === "pending" ? null : stamp(-1),
    created_at: stamp(-1),
  };
}

function payment(n, clientId, type, customerName, amount, fee, status, days, maintenanceId = null) {
  return {
    id: id(n),
    client_id: id(clientId),
    maintenance_subscription_id: maintenanceId ? id(maintenanceId) : null,
    payment_type: type,
    customer_name: customerName,
    amount,
    fee_amount: fee,
    status,
    refund_state: "none",
    source: "manual",
    external_transaction_id: "",
    paid_at: stamp(days),
    created_at: stamp(days),
  };
}

function expense(n, category, vendor, description, amount, days) {
  return { id: id(n), category, vendor, description, amount, occurred_on: day(days), lead_id: null, client_id: null, created_at: stamp(days) };
}

function activity(n, type, title, detail, actorType, days, leadId = null, clientId = null) {
  return { id: id(n), type, title, detail, actor_type: actorType, lead_id: leadId, client_id: clientId, project_id: null, metadata: {}, created_at: stamp(days) };
}

function task(n, title, priority, dueAt, status, leadId = null, clientId = null, projectId = null) {
  return { id: id(n), title, description: "", priority, due_at: dueAt, status, lead_id: leadId, client_id: clientId, project_id: projectId, tags: [], created_by: "user", created_at: stamp(-4), updated_at: stamp(-1) };
}

function calendarEvent(n, title, eventType, startsAt, leadId = null, clientId = null) {
  return { id: id(n), title, event_type: eventType, starts_at: startsAt, ends_at: null, all_day: false, lead_id: leadId, client_id: clientId, project_id: null, notes: "", created_at: stamp(-5), updated_at: stamp(-1) };
}

function note(n, title, category, content, tags, pinned, days) {
  return { id: id(n), title, category, content, tags, is_pinned: pinned, is_archived: false, lead_id: null, client_id: null, created_at: stamp(days - 5), updated_at: stamp(days) };
}

function integration(n, provider, status, syncDays = null) {
  return { id: id(n), provider, status, display_name: provider, config: {}, last_synced_at: syncDays === null ? null : stamp(syncDays), created_at: stamp(-30), updated_at: stamp(syncDays ?? -30) };
}
