/**
 * The assistant loop.
 *
 * The old flow sent one request, ran whatever tools came back, and stopped.
 * Tool results were appended to the transcript as messages with no `text`,
 * which the provider adapter then filtered out — so the model never saw what
 * its own tools returned, never wrote a final answer, and could not chain two
 * steps together. Asking it to do anything real produced a raw tool card and
 * silence.
 *
 * This runs the actual loop: call the model, run the tools it asked for, feed
 * the results back, repeat until it answers or the step budget runs out.
 */
import { uid } from "../../core/utils.js";
import { buildContext } from "./context.js";
import { runAssistantTurn } from "./provider.js";
import { aiPermissionMode, runTool, toolSchema } from "./tools.js";

/** Enough for discover -> save -> build -> publish -> draft -> send, plus slack. */
export const MAX_STEPS = 8;

/**
 * @param {object} options
 * @param {Array} options.transcript Provider-neutral history, oldest first.
 * @param {(entry: object) => void} [options.onEntry] Called as each entry is produced.
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.maxSteps]
 * @returns {Promise<{entries: Array, steps: number, stopped: string}>}
 */
export async function runAgentLoop({ transcript, onEntry, signal, maxSteps = MAX_STEPS } = {}) {
  const history = [...transcript];
  const entries = [];
  let steps = 0;
  const permissionMode = aiPermissionMode();

  const push = (entry) => {
    history.push(entry);
    entries.push(entry);
    onEntry?.(entry);
  };

  while (steps < maxSteps) {
    steps += 1;

    const turn = await runAssistantTurn({
      transcript: history,
      /* Rebuilt every step: a tool that just created a lead or sent an email
         has changed the workspace the next step reasons about. */
      context: buildContext(),
      tools: toolSchema(permissionMode),
      signal,
    });

    const calls = turn.toolCalls || [];
    push({
      id: uid(),
      role: "assistant",
      text: turn.text || "",
      toolCalls: calls,
      model: turn.model,
      at: new Date().toISOString(),
    });

    if (!calls.length) return { entries, steps, stopped: "answered" };

    for (const call of calls) {
      if (signal?.aborted) return { entries, steps, stopped: "aborted" };
      const result = await runTool(call.name, call.args || {}, { permissionMode });
      push({
        id: uid(),
        role: "tool",
        toolCallId: call.id,
        tool: call.name,
        args: call.args || {},
        result,
        at: new Date().toISOString(),
      });
    }
  }

  /* Out of steps with tools still pending. Say so rather than leaving the last
     tool card as if it were the answer. */
  push({
    id: uid(),
    role: "system",
    text: `Stopped after ${maxSteps} steps. The work so far is saved — ask again to continue.`,
    at: new Date().toISOString(),
  });
  return { entries, steps, stopped: "max_steps" };
}
