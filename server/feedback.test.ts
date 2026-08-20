import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitFeedback, isFeedbackEnabled, initFeedback } from "./feedback.js";

/** fetch를 가로채 Discord 호출을 흉내낸다 */
function mockFetch(impl: (url: string, init?: RequestInit) => Partial<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ name: "테스트훅" }), ...impl(url, init) } as Response;
  }) as typeof fetch;
  return calls;
}

describe("피드백", () => {
  beforeEach(() => { vi.unstubAllEnvs(); });

  it("웹훅이 없으면 기능이 꺼진다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "");
    await initFeedback();
    expect(isFeedbackEnabled()).toBe(false);
    const r = await submitFeedback({ sentiment: "good" }, "1.1.1.1");
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("웹훅이 404면 기능을 켜지 않는다 — 죽은 훅으로 거짓 성공을 알리지 않는다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/hook");
    mockFetch(() => ({ ok: false, status: 404 }));
    await initFeedback();
    expect(isFeedbackEnabled()).toBe(false);
  });

  it("유효한 웹훅이면 기능이 켜지고 제출이 성공한다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/hook");
    const calls = mockFetch(() => ({ ok: true, status: 200 }));
    await initFeedback();
    expect(isFeedbackEnabled()).toBe(true);

    const r = await submitFeedback(
      { sentiment: "bad", message: "버그가 있어요", roomId: "R1", nickname: "앨리스" },
      "2.2.2.2",
    );
    expect(r).toEqual({ ok: true });
    const post = calls.find((c) => c.init?.method === "POST");
    const body = JSON.parse(String(post!.init!.body));
    expect(body.content).toContain("😞");
    expect(body.content).toContain("버그가 있어요");
    expect(body.content).toContain("앨리스");
  });

  it("같은 IP는 쿨다운에 걸린다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/hook");
    mockFetch(() => ({ ok: true, status: 200 }));
    await initFeedback();
    expect(await submitFeedback({ sentiment: "good" }, "3.3.3.3")).toEqual({ ok: true });
    expect(await submitFeedback({ sentiment: "good" }, "3.3.3.3")).toMatchObject({ status: 429 });
    // 다른 IP는 영향받지 않는다
    expect(await submitFeedback({ sentiment: "good" }, "4.4.4.4")).toEqual({ ok: true });
  });

  it("유효하지 않은 본문은 거부한다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/hook");
    mockFetch(() => ({ ok: true, status: 200 }));
    await initFeedback();
    expect(await submitFeedback({ sentiment: "화남" }, "5.5.5.5")).toMatchObject({ status: 400 });
    expect(await submitFeedback({}, "6.6.6.6")).toMatchObject({ status: 400 });
  });

  it("백틱을 막아 Discord 코드블록 탈출을 방지한다", async () => {
    vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.test/hook");
    const calls = mockFetch(() => ({ ok: true, status: 200 }));
    await initFeedback();
    await submitFeedback({ sentiment: "good", message: "```javascript" }, "7.7.7.7");
    const post = calls.find((c) => c.init?.method === "POST");
    expect(String(post!.init!.body)).not.toContain("```");
  });
});
