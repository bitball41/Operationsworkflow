import { assertEquals } from "jsr:@std/assert@1.0.18";
import { verifySignature } from "./index.ts";

async function signature(body: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const value = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v0=${value}`;
}

Deno.test("accepts a current ElevenLabs HMAC and rejects a forged one", async () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_test" } });
  const secret = "test_webhook_secret";
  const timestamp = Math.floor(Date.now() / 1000);
  assertEquals(await verifySignature(body, await signature(body, secret, timestamp), secret), true);
  assertEquals(await verifySignature(`${body} `, await signature(body, secret, timestamp), secret), false);
});

Deno.test("rejects replayed webhook signatures outside the allowed age", async () => {
  const body = "{}";
  const secret = "test_webhook_secret";
  const timestamp = Math.floor(Date.now() / 1000) - (31 * 60);
  assertEquals(await verifySignature(body, await signature(body, secret, timestamp), secret), false);
});
