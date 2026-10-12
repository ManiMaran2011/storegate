import { describe, expect, it } from "vitest";
import { complete, LlmError, retryDelayMs } from "../src/agent/llm.js";

const cfg = { baseUrl: "http://llm.test", model: "m", timeoutMs: 5000 };
const sse = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

describe("llm client rate limiting", () => {
  it("waits out a 429 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return calls === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } }) : sse("hello");
    };
    const out = await complete(cfg, [{ role: "user", content: "hi" }], [], () => {}, undefined, fetchImpl);
    expect(out.text).toBe("hello");
    expect(calls).toBe(2);
  });

  it("gives up with a friendly error after repeated 429s", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
    };
    const err = await complete(cfg, [{ role: "user", content: "hi" }], [], () => {}, undefined, fetchImpl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).status).toBe(429);
    expect(calls).toBe(3);
  });

  it("caps long Retry-After values and backs off when the header is missing", () => {
    expect(retryDelayMs("120", 1)).toBe(15_000);
    expect(retryDelayMs(null, 2)).toBe(4000);
    expect(retryDelayMs("0", 1)).toBe(250);
  });
});

describe("llm client request body", () => {
  it("sends reasoning_effort only when configured", async () => {
    const bodies: any[] = [];
    const fetchImpl: typeof fetch = async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return sse("ok");
    };
    await complete(cfg, [{ role: "user", content: "hi" }], [], () => {}, undefined, fetchImpl);
    await complete({ ...cfg, reasoningEffort: "none" }, [{ role: "user", content: "hi" }], [], () => {}, undefined, fetchImpl);
    expect(bodies[0]).not.toHaveProperty("reasoning_effort");
    expect(bodies[1].reasoning_effort).toBe("none");
  });
});
