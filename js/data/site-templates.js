/**
 * Template catalogue. Templates are known-good foundations kept in the repo and
 * versioned with the code — automation picks one and injects business data
 * rather than generating a website from scratch each time.
 *
 * A `site_templates` row points here through its `layout_key`.
 */

const THEMES = {
  forest: {
    accent: "#2f7d4f", accentDeep: "#256240", accentInk: "#ffffff",
    ink: "#15201a", muted: "#5d6b62", paper: "#ffffff", card: "#f6f9f6",
    band: "#f2f6f2", hairline: "#dfe7e0", hero: "#12261b",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  water: {
    accent: "#1f6fd0", accentDeep: "#17569f", accentInk: "#ffffff",
    ink: "#131c26", muted: "#5a6674", paper: "#ffffff", card: "#f5f8fc",
    band: "#f1f5fa", hairline: "#dde4ec", hero: "#0f1d2c",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  clay: {
    accent: "#c2562c", accentDeep: "#a04522", accentInk: "#ffffff",
    ink: "#231812", muted: "#6d5c53", paper: "#ffffff", card: "#faf6f3",
    band: "#f7f1ed", hairline: "#e8ded7", hero: "#241611",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  slate: {
    accent: "#3d6b8f", accentDeep: "#2f5470", accentInk: "#ffffff",
    ink: "#161b1f", muted: "#5f6a72", paper: "#ffffff", card: "#f6f8f9",
    band: "#f2f5f6", hairline: "#e0e5e8", hero: "#12191f",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  mint: {
    accent: "#1f8a80", accentDeep: "#186b63", accentInk: "#ffffff",
    ink: "#12211f", muted: "#566a68", paper: "#ffffff", card: "#f4faf9",
    band: "#eff7f6", hairline: "#dbe8e6", hero: "#10231f",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  graphite: {
    accent: "#d29b3c", accentDeep: "#b3812b", accentInk: "#1a1508",
    ink: "#17181a", muted: "#65686d", paper: "#ffffff", card: "#f7f7f8",
    band: "#f3f3f4", hairline: "#e3e3e5", hero: "#131416",
    font: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
};

export const TEMPLATE_CATALOG = Object.freeze([
  {
    key: "timberline",
    name: "Timberline",
    category: "Tree Service",
    layout: "service-pro",
    theme: THEMES.forest,
    keywords: ["tree", "arborist", "stump", "logging", "landclearing"],
    description: "Emergency-forward tree care layout with a quote form.",
    content: {
      eyebrow: "Licensed & insured tree care",
      headline: "{{city}} tree work done safely, cleanly, and on time.",
      subheadline: "Removals, trimming, and storm cleanup by a crew that shows up when it says it will and leaves the yard clean.",
      cta: "Call for a free estimate",
      servicesHeadline: "Everything from a single limb to a full removal.",
      services: [
        { title: "Tree removal", text: "Tight-access removals handled with rigging, not guesswork. Stump grinding available same visit." },
        { title: "Trimming & pruning", text: "Structural pruning that protects the tree and clears your roof, driveway, and power lines." },
        { title: "Storm cleanup", text: "Emergency response for fallen limbs and split trunks, including insurance documentation." },
      ],
      aboutHeadline: "A local crew, not a call centre.",
      aboutText: "You talk to the person who does the work. We quote honestly, protect your property, and haul everything away before we leave.",
      points: ["Free on-site estimates", "Fully insured crew", "Clean-up included", "Same-week scheduling"],
      contactText: "Send a photo of the tree and we can usually quote it the same day.",
      ctaHeadline: "Need a tree looked at this week?",
      ctaText: "Estimates are free and there is no obligation.",
      badgeValue: "24/7", badgeLabel: "Storm response",
    },
  },
  {
    key: "pipeworks",
    name: "Pipeworks",
    category: "Plumbing",
    layout: "bold-local",
    theme: THEMES.water,
    keywords: ["plumb", "drain", "sewer", "water heater", "leak", "rooter"],
    description: "Urgency-first plumbing layout for emergency call volume.",
    content: {
      eyebrow: "Emergency plumbing, {{city}}",
      headline: "A plumber who answers the phone.",
      subheadline: "Leaks, clogs, water heaters, and repipes — diagnosed properly and priced before we start the work.",
      cta: "Call now",
      servicesHeadline: "Repairs today, not next week.",
      services: [
        { title: "Emergency repairs", text: "Burst pipes, no hot water, and active leaks handled the same day wherever possible." },
        { title: "Drains & sewer", text: "Camera inspection and hydro jetting so the clog does not come back next month." },
        { title: "Water heaters", text: "Repair, replacement, and tankless installs with straightforward pricing up front." },
      ],
      aboutHeadline: "Straight pricing, clean work.",
      aboutText: "We quote the job before we start, protect your floors, and explain what failed so it does not happen twice.",
      points: ["Upfront pricing", "Licensed & insured", "Same-day service", "Workmanship guaranteed"],
      contactText: "Call or text a photo of the problem for a faster quote.",
      ctaHeadline: "Water where it should not be?",
      ctaText: "Call now and we will tell you what it takes to fix it.",
      badgeValue: "Same day", badgeLabel: "Most repairs",
    },
  },
  {
    key: "evergreen",
    name: "Evergreen",
    category: "Landscaping",
    layout: "service-pro",
    theme: THEMES.mint,
    keywords: ["landscap", "lawn", "garden", "irrigation", "sod", "mow", "hardscape"],
    description: "Maintenance and design layout with recurring-service focus.",
    content: {
      eyebrow: "Landscape design & upkeep",
      headline: "A yard you are glad to come home to.",
      subheadline: "Design, installation, and dependable maintenance for {{city}} homes — one crew, one point of contact.",
      cta: "Get a free quote",
      servicesHeadline: "Design it once, keep it looking right.",
      services: [
        { title: "Design & installation", text: "Planting plans, beds, sod, and hardscape built to survive local summers." },
        { title: "Recurring maintenance", text: "Mowing, edging, seasonal cleanups, and bed care on a schedule you can forget about." },
        { title: "Irrigation", text: "Sprinkler repair, adjustment, and smart controllers that cut the water bill." },
      ],
      aboutHeadline: "Reliability is the service.",
      aboutText: "Same crew every visit, photos after big jobs, and a schedule that actually holds through the season.",
      points: ["Free design consult", "Weekly or biweekly plans", "Licensed & insured", "Locally owned"],
      contactText: "Tell us the size of the yard and what you want fixed first.",
      ctaHeadline: "Ready for the yard to look handled?",
      ctaText: "Free walkthrough and quote, no pressure.",
      badgeValue: "5-star", badgeLabel: "Local reviews",
    },
  },
  {
    key: "summit",
    name: "Summit",
    category: "Roofing",
    layout: "bold-local",
    theme: THEMES.clay,
    keywords: ["roof", "shingle", "gutter", "siding", "storm damage"],
    description: "Storm and insurance-claim oriented roofing layout.",
    content: {
      eyebrow: "Roofing & storm damage",
      headline: "Roof repairs that stop the leak for good.",
      subheadline: "Free inspections, honest assessments, and insurance paperwork handled with you instead of around you.",
      cta: "Book a free inspection",
      servicesHeadline: "Repair, replace, or just tell you the truth.",
      services: [
        { title: "Leak repair", text: "We find the actual entry point instead of patching the stain on your ceiling." },
        { title: "Full replacement", text: "Architectural shingles, proper ventilation, and a clean site every single day." },
        { title: "Storm & hail claims", text: "Documented inspections and adjuster meetings so the claim reflects the damage." },
      ],
      aboutHeadline: "No scare tactics.",
      aboutText: "If the roof has five years left, we say so. Most of our work comes from neighbours of past customers.",
      points: ["Free inspection & photos", "Insurance claim support", "Manufacturer warranties", "Clean job site daily"],
      contactText: "Send your address and we can start with satellite imagery before we climb up.",
      ctaHeadline: "Missing shingles after the last storm?",
      ctaText: "Inspections are free and take about 30 minutes.",
      badgeValue: "Free", badgeLabel: "Roof inspection",
    },
  },
  {
    key: "cleanslate",
    name: "Clean Slate",
    category: "Cleaning",
    layout: "service-pro",
    theme: THEMES.slate,
    keywords: ["clean", "maid", "janitor", "housekeep", "carpet", "window wash", "pressure wash"],
    description: "Recurring residential and commercial cleaning layout.",
    content: {
      eyebrow: "Home & office cleaning",
      headline: "Come home to a place that feels reset.",
      subheadline: "Vetted, insured cleaners with a checklist you can adjust — one-time deep cleans or a standing schedule.",
      cta: "Get a quote",
      servicesHeadline: "Clean the way you would do it yourself.",
      services: [
        { title: "Recurring cleaning", text: "Weekly, biweekly, or monthly visits with the same trusted cleaner each time." },
        { title: "Deep & move-out", text: "Baseboards, appliances, inside cabinets — the cleaning that gets a deposit back." },
        { title: "Offices & rentals", text: "After-hours commercial cleaning and fast turnovers between guests." },
      ],
      aboutHeadline: "Background-checked and insured.",
      aboutText: "Same cleaner where possible, a checklist you control, and a re-clean if anything is missed.",
      points: ["Background-checked staff", "Bring our own supplies", "Flat pricing", "Satisfaction re-clean"],
      contactText: "Tell us bedrooms, bathrooms, and how often — we can quote from that.",
      ctaHeadline: "Want your weekends back?",
      ctaText: "Free quote in a couple of minutes.",
      badgeValue: "Insured", badgeLabel: "& bonded team",
    },
  },
  {
    key: "torque",
    name: "Torque",
    category: "Auto Detailing",
    layout: "bold-local",
    theme: THEMES.graphite,
    keywords: ["auto", "detail", "ceramic", "car wash", "paint correction", "tint", "mobile detail"],
    description: "Premium detailing layout for higher-ticket packages.",
    content: {
      eyebrow: "Mobile detailing & ceramic coating",
      headline: "Your car, better than the day you bought it.",
      subheadline: "Paint correction, interior restoration, and ceramic coatings — done at your driveway or our shop.",
      cta: "Book a detail",
      servicesHeadline: "Packages built around the paint, not the clock.",
      services: [
        { title: "Full detail", text: "Decontamination wash, interior extraction, and dressed trim inside and out." },
        { title: "Paint correction", text: "Multi-stage polishing that removes swirls instead of hiding them in wax." },
        { title: "Ceramic coating", text: "Multi-year protection with proper prep, cure time, and aftercare instructions." },
      ],
      aboutHeadline: "Detail-obsessed, by appointment.",
      aboutText: "One vehicle at a time, photographed before and after, with honest advice about what the paint actually needs.",
      points: ["Mobile service available", "Before/after photos", "Ceramic-certified installer", "Limited slots per day"],
      contactText: "Send the year, make, and condition and we will recommend a package.",
      ctaHeadline: "Ready to book a slot?",
      ctaText: "We take a limited number of vehicles per day.",
      badgeValue: "5 yr", badgeLabel: "Coating warranty",
    },
  },
  {
    key: "mainstreet",
    name: "Main Street",
    category: "Local Service",
    layout: "service-pro",
    theme: THEMES.water,
    keywords: [],
    description: "Neutral fallback used when a niche has no dedicated template.",
    content: {
      eyebrow: "Trusted local service",
      headline: "{{business}} — dependable {{categoryLower}} in {{city}}.",
      subheadline: "Straightforward pricing, careful work, and a real person on the other end of the phone.",
      cta: "Call today",
      servicesHeadline: "What we help with.",
      services: [
        { title: "Free estimates", text: "Tell us what you need and we will tell you what it costs before any work starts." },
        { title: "Quality work", text: "Experienced hands, proper materials, and a job finished the way we would want it done." },
        { title: "Local support", text: "We work in this area every day and stand behind everything we build or repair." },
      ],
      aboutHeadline: "Built on repeat customers.",
      aboutText: "Most of our work comes from referrals. That only happens when the job is done right the first time.",
      points: ["Free estimates", "Licensed & insured", "Locally owned", "Satisfaction guaranteed"],
      contactText: "Call, text, or email — whatever is easiest.",
      ctaHeadline: "Have a project in mind?",
      ctaText: "Get a free, no-pressure estimate.",
      badgeValue: "Local", badgeLabel: "Owner operated",
    },
  },
]);

export const FALLBACK_TEMPLATE_KEY = "mainstreet";

export function templateByKey(key) {
  return TEMPLATE_CATALOG.find((item) => item.key === key)
    || TEMPLATE_CATALOG.find((item) => item.key === FALLBACK_TEMPLATE_KEY);
}

/** Scores a catalogue entry against a niche/category string. */
export function scoreTemplateMatch(entry, niche = "") {
  const value = String(niche).toLowerCase();
  if (!value) return 0;
  if (entry.category.toLowerCase() === value) return 100;
  let score = 0;
  for (const keyword of entry.keywords) {
    if (value.includes(keyword)) score = Math.max(score, 80);
  }
  if (!score && value.includes(entry.category.toLowerCase().split(" ")[0])) score = 60;
  return score;
}
