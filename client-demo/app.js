const calls = Object.freeze([
  {
    id: "call-1",
    caller: "Jessica Miller",
    phone: "(720) 555-0184",
    when: "Today, 9:42 AM",
    duration: "3m 18s",
    outcome: "booked",
    outcomeLabel: "Inspection booked",
    reason: "Roof replacement estimate",
    summary: "Jessica requested an estimate after noticing missing shingles. Michael collected the property details and booked an inspection for Monday morning.",
    address: "1842 Oakridge Lane, Denver",
    urgency: "Standard",
    appointment: "Mon, Aug 25 · 9:00 AM",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. How can I help today?"],
      ["Caller", "We lost some shingles in the storm and I would like someone to take a look."],
      ["Michael", "I can help schedule an inspection. Is there active leaking or water coming inside?"],
      ["Caller", "No active leak, just the missing shingles."],
      ["Michael", "Thank you. I have Monday at 9:00 AM available. Would that work?"],
    ],
  },
  {
    id: "call-2",
    caller: "Thomas Reed",
    phone: "(303) 555-0147",
    when: "Today, 8:16 AM",
    duration: "2m 04s",
    outcome: "transfer",
    outcomeLabel: "Urgent transfer",
    reason: "Active leak after overnight storm",
    summary: "Thomas reported water entering an upstairs bedroom. Michael confirmed the address and transferred the call to the on-call team member.",
    address: "927 Willow Court, Aurora",
    urgency: "Urgent — active leak",
    appointment: "Transferred to on-call person",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. What is happening at the property?"],
      ["Caller", "Water is coming through the ceiling in an upstairs bedroom."],
      ["Michael", "I am sorry you are dealing with that. I will connect you with the on-call person now. First, what is the service address?"],
      ["Caller", "927 Willow Court in Aurora."],
    ],
  },
  {
    id: "call-3",
    caller: "Amanda Chen",
    phone: "(720) 555-0129",
    when: "Yesterday, 6:31 PM",
    duration: "2m 46s",
    outcome: "booked",
    outcomeLabel: "Inspection booked",
    reason: "Hail damage inspection",
    summary: "Amanda called after a hailstorm. Michael qualified the request and scheduled a Thursday afternoon inspection.",
    address: "3114 Elm Street, Lakewood",
    urgency: "Standard",
    appointment: "Thu, Aug 28 · 1:30 PM",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. How can I help?"],
      ["Caller", "We had heavy hail and I want the roof checked before I call insurance."],
      ["Michael", "Absolutely. I can arrange an inspection. Are you seeing any active leaking?"],
      ["Caller", "No, nothing inside right now."],
    ],
  },
  {
    id: "call-4",
    caller: "Robert Hayes",
    phone: "(303) 555-0192",
    when: "Yesterday, 3:08 PM",
    duration: "1m 37s",
    outcome: "message",
    outcomeLabel: "Message taken",
    reason: "Asked about an existing estimate",
    summary: "Robert asked for an update on an existing estimate. Michael captured his contact information and sent the message to the office.",
    address: "Not requested",
    urgency: "Routine follow-up",
    appointment: "Office callback requested",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. How can I help today?"],
      ["Caller", "I am checking on an estimate from last week."],
      ["Michael", "I can pass that to the office. May I have your name and the best callback number?"],
    ],
  },
  {
    id: "call-5",
    caller: "Luis Martinez",
    phone: "(720) 555-0166",
    when: "Tue, 11:54 AM",
    duration: "2m 12s",
    outcome: "answered",
    outcomeLabel: "Question answered",
    reason: "Service-area question",
    summary: "Luis asked whether Summit Roofing serves Castle Rock. Michael confirmed the listed service area and offered to schedule an inspection.",
    address: "Castle Rock, CO",
    urgency: "Not assessed",
    appointment: "Caller will check schedule",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. What can I help with?"],
      ["Caller", "Do you come as far south as Castle Rock?"],
      ["Michael", "Yes, Castle Rock is inside the current service area. Would you like to schedule an inspection?"],
    ],
  },
  {
    id: "call-6",
    caller: "Caller not supplied",
    phone: "Number unavailable",
    when: "Mon, 7:22 PM",
    duration: "1m 05s",
    outcome: "message",
    outcomeLabel: "Message taken",
    reason: "Commercial repair inquiry",
    summary: "An after-hours caller asked about a commercial repair. The caller did not provide a name, so the record preserves that limitation.",
    address: "Not supplied",
    urgency: "Not confirmed",
    appointment: "No appointment booked",
    transcript: [
      ["Michael", "Thanks for calling Summit Roofing. How can I help?"],
      ["Caller", "I need someone to call me about a commercial roof repair."],
      ["Michael", "I can take a message for the commercial team. May I have your name and callback number?"],
      ["Caller", "I will call back tomorrow."],
    ],
  },
]);

const bookings = Object.freeze([
  { day: "25", month: "Aug", name: "Jessica Miller", reason: "Roof replacement estimate", address: "1842 Oakridge Lane, Denver", time: "9:00 AM" },
  { day: "26", month: "Aug", name: "Daniel Brooks", reason: "Leak inspection", address: "4421 Adams Way, Thornton", time: "11:30 AM" },
  { day: "28", month: "Aug", name: "Amanda Chen", reason: "Hail damage inspection", address: "3114 Elm Street, Lakewood", time: "1:30 PM" },
  { day: "29", month: "Aug", name: "Megan Foster", reason: "Roof replacement estimate", address: "7618 Pine View, Arvada", time: "10:00 AM" },
]);

const ranges = Object.freeze({
  7: { calls: 24, handled: 22, answerRate: "92%", booked: 6, messages: 4, transfers: 2, answered: 8, missed: 2 },
  30: { calls: 86, handled: 79, answerRate: "92%", booked: 19, messages: 13, transfers: 6, answered: 41, missed: 7 },
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));

function safeParam(name, fallback, max = 60) {
  const value = new URLSearchParams(window.location.search).get(name)?.trim();
  return value && value.length <= max ? value : fallback;
}

const businessName = safeParam("business", "Summit Roofing");
const agentName = safeParam("agent", "Michael", 30);
const personalize = (value) => String(value ?? "")
  .replaceAll("Summit Roofing", businessName)
  .replaceAll("Michael", agentName);
const displayText = (value) => escapeHtml(personalize(value));
const currentHour = new Date().getHours();
const greeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = businessName; });
document.querySelectorAll("[data-agent-name]").forEach((node) => { node.textContent = agentName; });
document.querySelectorAll("[data-agent-initial]").forEach((node) => { node.textContent = agentName.charAt(0).toUpperCase(); });
document.querySelector("[data-page-title]").textContent = `${greeting}, ${businessName}.`;

function statusPill(call) {
  return `<span class="status-pill status-pill--${call.outcome}">${displayText(call.outcomeLabel)}</span>`;
}

function callRow(call) {
  const initial = call.caller === "Caller not supplied" ? "?" : call.caller.charAt(0);
  return `
    <button class="call-row" type="button" data-call-id="${escapeHtml(call.id)}" aria-label="Open ${displayText(call.caller)} call details">
      <span class="caller"><span class="caller-avatar">${escapeHtml(initial)}</span><span><strong>${displayText(call.caller)}</strong><small>${displayText(call.phone)} · ${displayText(call.when)}</small></span></span>
      <span class="call-summary"><strong>${displayText(call.reason)}</strong><small>${displayText(call.summary)}</small></span>
      ${statusPill(call)}
      <span class="call-duration">${displayText(call.duration)}</span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
}

function renderCalls() {
  document.querySelector("[data-recent-calls]").innerHTML = calls.slice(0, 4).map(callRow).join("");
  const query = document.querySelector("#call-search").value.trim().toLowerCase();
  const outcome = document.querySelector("#outcome-filter").value;
  const visible = calls.filter((call) => {
    const matchesSearch = !query || `${call.caller} ${call.phone} ${call.reason} ${call.summary}`.toLowerCase().includes(query);
    return matchesSearch && (outcome === "all" || call.outcome === outcome);
  });
  document.querySelector("[data-all-calls]").innerHTML = visible.map(callRow).join("");
  document.querySelector("[data-call-empty]").hidden = visible.length > 0;
}

function renderBookings() {
  document.querySelector("[data-bookings]").innerHTML = bookings.map((booking) => `
    <div class="booking-row">
      <span class="booking-date"><strong>${escapeHtml(booking.day)}</strong><small>${escapeHtml(booking.month)}</small></span>
      <span class="booking-info"><strong>${escapeHtml(booking.name)} · ${escapeHtml(booking.reason)}</strong><span>${escapeHtml(booking.address)}</span></span>
      <span class="booking-time">${escapeHtml(booking.time)}</span>
    </div>`).join("");
}

function selectView(view) {
  document.querySelectorAll("[data-view]").forEach((section) => {
    const active = section.dataset.view === view;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (view === "calls") document.querySelector("[data-page-subtitle]").textContent = "See what each caller needed, what was captured, and how the call ended.";
  else if (view === "bookings") document.querySelector("[data-page-subtitle]").textContent = "Review the appointments your receptionist confirmed on the connected calendar.";
  else document.querySelector("[data-page-subtitle]").textContent = "Here is what your receptionist handled while your team stayed focused on the job.";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateRange(days) {
  const values = ranges[days] || ranges[7];
  document.querySelectorAll("[data-call-count]").forEach((node) => { node.textContent = values.calls; });
  document.querySelectorAll("[data-booking-count]").forEach((node) => { node.textContent = values.booked; });
  Object.entries(values).forEach(([key, value]) => {
    document.querySelectorAll(`[data-metric="${key}"], [data-outcome="${key}"]`).forEach((node) => { node.textContent = value; });
  });
  document.querySelectorAll(".outcome-list progress").forEach((progress) => { progress.max = values.calls; });
  ["booked", "answered", "messages", "transfers", "missed"].forEach((key) => {
    const progress = document.querySelector(`[data-outcome="${key}"]`)?.parentElement?.querySelector("progress");
    if (progress) progress.value = values[key];
  });
}

function openCall(callId) {
  const call = calls.find((item) => item.id === callId);
  if (!call) return;
  document.querySelector("#dialog-title").textContent = call.caller;
  document.querySelector("[data-dialog-body]").innerHTML = `
    <div class="dialog-summary"><h3>${displayText(call.reason)}</h3><p>${displayText(call.summary)}</p></div>
    <dl class="detail-grid">
      <div><dt>Outcome</dt><dd>${statusPill(call)}</dd></div>
      <div><dt>When</dt><dd>${displayText(call.when)} · ${displayText(call.duration)}</dd></div>
      <div><dt>Caller</dt><dd>${displayText(call.phone)}</dd></div>
      <div><dt>Urgency</dt><dd>${displayText(call.urgency)}</dd></div>
      <div><dt>Property</dt><dd>${displayText(call.address)}</dd></div>
      <div><dt>Next step</dt><dd>${displayText(call.appointment)}</dd></div>
    </dl>
    <div class="transcript"><h3>Transcript preview</h3>${call.transcript.map(([speaker, line]) => `<p class="transcript-line${speaker === "Caller" ? " transcript-line--caller" : ""}"><strong>${displayText(speaker)}</strong><span>${displayText(line)}</span></p>`).join("")}</div>`;
  document.querySelector("#call-dialog").showModal();
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-target]");
  if (viewButton) selectView(viewButton.dataset.viewTarget);
  const callButton = event.target.closest("[data-call-id]");
  if (callButton) openCall(callButton.dataset.callId);
  if (event.target.closest("[data-dialog-close]")) document.querySelector("#call-dialog").close();
});

document.querySelector("#call-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector("#call-search").addEventListener("input", renderCalls);
document.querySelector("#outcome-filter").addEventListener("change", renderCalls);
document.querySelector("#range-select").addEventListener("change", (event) => updateRange(event.target.value));

renderCalls();
renderBookings();
updateRange("7");
