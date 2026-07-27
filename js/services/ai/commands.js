/**
 * Deterministic commands.
 *
 * A few exact words run real operations without a model, so the code-word
 * workflow ("go") works today. Anything else is left to the AI provider — the
 * assistant never invents an answer.
 */
import { runTool } from "./tools.js";

const COMMANDS = [
  {
    match: /^(go|start|run|start outreach|start automation|begin)$/i,
    tool: "start_automation",
    label: "Start automation",
    input: () => ({}),
  },
  {
    match: /^(go|start|run)\s+(\d{1,3})$/i,
    tool: "start_automation",
    label: "Start automation with a batch size",
    input: (matches) => ({ batchTarget: Number(matches[2]) }),
  },
  {
    match: /^(stop|halt|pause|stop automation|stop outreach)$/i,
    tool: "stop_automation",
    label: "Stop automation",
    input: () => ({}),
  },
  {
    match: /^(status|what needs my attention\??|attention|today)$/i,
    tool: "get_status",
    label: "Status",
    input: () => ({}),
  },
  {
    match: /^(next|next lead|who'?s next\??)$/i,
    tool: "get_next_lead",
    label: "Next lead",
    input: () => ({}),
  },
  {
    match: /^(revenue|money|how much did i make\??)$/i,
    tool: "get_revenue",
    label: "Revenue",
    input: () => ({}),
  },
  {
    match: /^(inbox|replies|unread)$/i,
    tool: "get_inbox",
    label: "Unread replies",
    input: () => ({ unread_only: true }),
  },
  {
    match: /^(sync|sync inbox|check email|check mail)$/i,
    tool: "sync_inbox",
    label: "Sync the Outlook inbox",
    input: () => ({}),
  },
  {
    /* "find plumbers in austin, tx" — the way this day actually starts, with
       no model involved and no form to fill in. */
    match: /^find\s+(?:(\d{1,3})\s+)?(.+?)\s+in\s+(.+)$/i,
    tool: "discover_leads",
    label: "Find leads",
    input: (matches) => ({
      business_type: matches[2].trim(),
      location: matches[3].trim(),
      ...(matches[1] ? { limit: Number(matches[1]) } : {}),
    }),
  },
];

export function matchCommand(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  for (const command of COMMANDS) {
    const matches = value.match(command.match);
    if (matches) return { ...command, input: command.input(matches) };
  }
  return null;
}

export async function runCommand(command) {
  const result = await runTool(command.tool, command.input);
  return { tool: command.tool, input: command.input, result };
}

export const COMMAND_HINTS = Object.freeze([
  { command: "find 25 plumbers in Austin, TX", detail: "Search Google Places and save the leads" },
  { command: "go", detail: "Start the outreach batch" },
  { command: "go 10", detail: "Start with a batch of 10" },
  { command: "stop", detail: "Stop after the current lead" },
  { command: "status", detail: "What needs attention right now" },
  { command: "next", detail: "Show the next best lead" },
  { command: "sync", detail: "Pull new replies from Outlook" },
]);
