import { describe, expect, it } from "vitest";
import {
  baseLanguage,
  curateVoices,
  CURATED_VOICES_PER_LOCALE,
  type RawProviderVoice,
} from "./voices.catalog";

/**
 * Fixtures mirror what the provider actually returns: thousands of voices
 * across old model tiers, unsupported languages and non-hosted providers.
 */
const voice = (over: Partial<RawProviderVoice>): RawProviderVoice => ({
  id: "Telnyx.Ultra.1",
  name: "Carolina - Friendly Guide",
  label: "Warm, approachable presence.",
  language: "es-MX",
  accent: "Mexican",
  gender: "Female",
  provider: "telnyx",
  model_id: "Ultra",
  hosted: true,
  ...over,
});

describe("curateVoices", () => {
  it("keeps conversational-tier voices in supported languages", () => {
    const curated = curateVoices([voice({})]);
    expect(curated).toHaveLength(1);
    expect(curated[0]).toEqual({
      id: "Telnyx.Ultra.1",
      displayName: "Carolina",
      description: "Warm, approachable presence.",
      language: "es",
      locale: "es-MX",
      accent: "Mexican",
      gender: "female",
    });
  });

  it("drops older model tiers and unsupported languages", () => {
    const curated = curateVoices([
      voice({ id: "a", model_id: "KokoroTTS" }),
      voice({ id: "b", language: "ar-EG" }),
      voice({ id: "c", model_id: undefined }),
    ]);
    expect(curated).toEqual([]);
  });

  it("drops voices the provider does not host", () => {
    expect(curateVoices([voice({ hosted: false })])).toEqual([]);
  });

  it("falls back to the name's suffix when the provider gives no description", () => {
    const [curated] = curateVoices([voice({ label: null })]);
    expect(curated?.displayName).toBe("Carolina");
    expect(curated?.description).toBe("Friendly Guide");
  });

  it("caps each locale so one language cannot flood the picker", () => {
    const many = Array.from({ length: CURATED_VOICES_PER_LOCALE + 5 }, (_, i) =>
      voice({ id: `voice-${i}`, name: `Voice ${i}` }),
    );
    expect(curateVoices(many)).toHaveLength(CURATED_VOICES_PER_LOCALE);
  });

  it("orders deterministically, since the list is a picker", () => {
    const curated = curateVoices([
      voice({ id: "2", name: "Zoe", language: "en-US" }),
      voice({ id: "1", name: "Ana", language: "en-US" }),
      voice({ id: "3", name: "Bruno", language: "es-MX" }),
    ]);
    expect(curated.map((v) => v.id)).toEqual(["1", "2", "3"]);
  });

  it("treats a bare language as its own base language", () => {
    expect(baseLanguage("es")).toBe("es");
    expect(baseLanguage("pt-BR")).toBe("pt");
  });
});
