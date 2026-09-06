/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VoiceCloneReadingSampleService } from "./voice-clone-reading-sample.service";

const CTX = { userId: "user-1", organizationId: "org-1" };
const GENERATED =
  "¡Hola! El río refleja una luz brillante. ¿Escuchas los pájaros esta mañana? Mi pequeña casa se siente tranquila y alegre hoy.";

function build(
  options: { cached?: string; generation?: string; redisFails?: boolean } = {},
) {
  const stored = new Map<string, string>();
  if (options.cached) {
    stored.set("ai-voice-agent:clone-reading-sample:v1:es", options.cached);
  }
  let generations = 0;
  const writes: Array<{ key: string; value: string; ttl: number | undefined }> =
    [];
  const service = new VoiceCloneReadingSampleService(
    {
      get: () => ({
        summarize: async () => {
          generations++;
          return { summary: options.generation ?? GENERATED };
        },
      }),
    } as never,
    {
      get: async (key: string) => {
        if (options.redisFails) throw new Error("redis unavailable");
        return stored.get(key);
      },
      set: async (key: string, value: string, ttl: number) => {
        writes.push({ key, value, ttl });
        stored.set(key, value);
      },
    } as never,
  );
  return { service, generations: () => generations, writes };
}

describe("voice clone reading samples", () => {
  it("generates once and caches the passage for thirty days", async () => {
    const h = build();
    const [first, second] = await Promise.all([
      h.service.get(CTX, "es"),
      h.service.get(CTX, "es"),
    ]);
    assert.deepEqual(first, { language: "es", text: GENERATED });
    assert.deepEqual(second, first);
    assert.equal(h.generations(), 1);
    assert.deepEqual(h.writes, [
      {
        key: "ai-voice-agent:clone-reading-sample:v1:es",
        value: GENERATED,
        ttl: 30 * 24 * 60 * 60 * 1000,
      },
    ]);
    assert.deepEqual(await h.service.get(CTX, "es"), first);
    assert.equal(h.generations(), 1);
  });

  it("reuses a valid Redis entry without calling the model", async () => {
    const h = build({ cached: GENERATED });
    assert.equal((await h.service.get(CTX, "es")).text, GENERATED);
    assert.equal(h.generations(), 0);
    assert.equal(h.writes.length, 0);
  });

  it("returns the localized fallback when Redis cannot safely cache generation", async () => {
    const h = build({ redisFails: true });
    const result = await h.service.get(CTX, "es");
    assert.match(result.text, /Me llamo Clara/);
    assert.equal(h.generations(), 0);
  });

  it("falls back when the model returns an invalid passage", async () => {
    const h = build({ generation: "Too short" });
    const result = await h.service.get(CTX, "es");
    assert.match(result.text, /Me llamo Clara/);
    assert.equal(h.generations(), 1);
    assert.equal(h.writes.length, 0);
  });

  it("rejects unsupported languages and personal workspaces", async () => {
    const h = build();
    await assert.rejects(h.service.get(CTX, "ja"), /supported voice language/);
    await assert.rejects(
      h.service.get({ userId: "personal" }, "es"),
      /organization/,
    );
    assert.equal(h.generations(), 0);
  });
});
