import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  },
  removeItem(key) {
    this.values.delete(key);
  },
};
globalThis.window = {};
globalThis.__OPERATIONS_TEST_MEMORY__ = true;

const { getState, setData, setState } = await import("../js/core/state.js");
const { syncInbox } = await import("../js/services/email/inbox.js");

function workspace() {
  return {
    leads: [
      { id: "lead-1", business_name: "Ironwood Electric", email: "hello@ironwood.example", status: "contacted", website_url: "" },
      { id: "lead-2", business_name: "Pipeworks", email: "", status: "contacted", website_url: "https://pipeworks.example" },
    ],
    emailThreads: [],
    emails: [],
    activity: [],
  };
}

function connected({ providers = { outlook: true }, outlook = { can_read_mail: true } } = {}) {
  setState({
    storage: "local",
    services: { reachable: true, providers: { ...providers }, outlook: { configured: true, connected: true, missing: [], ...outlook } },
  }, { silent: true });
}

/** Stands in for the Worker call, so the record rules are what is under test. */
function mailbox(messages) {
  return () => Promise.resolve(messages);
}

test("a reply is matched to its lead and moves them out of contacted", async () => {
  setData(workspace(), { silent: true });
  connected();

  const result = await syncInbox({ fetchMessages: mailbox([{
    id: "message-1",
    thread_id: "thread-1",
    subject: "Re: I made a website for Ironwood Electric",
    from_name: "Dana",
    from_email: "hello@ironwood.example",
    to: ["owner@example.com"],
    preview: "Looks great.",
    received_at: "2026-07-26T18:00:00Z",
    unread: true,
  }]) });

  assert.equal(result.messages, 1);
  assert.equal(result.threads, 1);

  const thread = getState().data.emailThreads[0];
  assert.equal(thread.lead_id, "lead-1");
  assert.equal(thread.is_unread, true);
  assert.equal(getState().data.emails[0].direction, "inbound");
  assert.equal(getState().data.leads.find((lead) => lead.id === "lead-1").status, "replied");
});

test("a reply from someone else at the business still finds the lead by domain", async () => {
  setData(workspace(), { silent: true });
  connected();

  await syncInbox({ fetchMessages: mailbox([{
    id: "message-2",
    thread_id: "thread-2",
    subject: "Re: your website",
    from_email: "owner@pipeworks.example",
    to: [],
    preview: "Interested.",
    received_at: "2026-07-26T18:05:00Z",
    unread: true,
  }]) });

  assert.equal(getState().data.emailThreads[0].lead_id, "lead-2");
});

test("syncing twice does not duplicate a message", async () => {
  setData(workspace(), { silent: true });
  connected();

  const message = {
    id: "message-3",
    thread_id: "thread-3",
    subject: "Hello",
    from_email: "stranger@example.com",
    to: [],
    preview: "Hi",
    received_at: "2026-07-26T18:10:00Z",
    unread: true,
  };

  await syncInbox({ fetchMessages: mailbox([message]) });
  const second = await syncInbox({ fetchMessages: mailbox([message]) });

  assert.equal(second.messages, 0);
  assert.equal(second.skipped, 1);
  assert.equal(getState().data.emails.length, 1);
  assert.equal(getState().data.emailThreads.length, 1);
});

test("a send-only mailbox says so instead of failing silently", async () => {
  setData(workspace(), { silent: true });
  connected({ outlook: { can_read_mail: false } });

  await assert.rejects(() => syncInbox(), /reconnect/i);
  assert.equal(getState().data.emailThreads.length, 0, "nothing is invented when the read scope is missing");
});

test("no Outlook connection means no inbox and no pretending", async () => {
  setData(workspace(), { silent: true });
  setState({
    services: { reachable: true, providers: { outlook: false }, outlook: { configured: true, connected: false, missing: [] } },
  }, { silent: true });

  await assert.rejects(() => syncInbox(), /no outlook mailbox is connected/i);
  assert.equal(getState().data.emailThreads.length, 0);
});
