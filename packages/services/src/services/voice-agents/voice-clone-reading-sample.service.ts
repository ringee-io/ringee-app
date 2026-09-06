import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiProviderRegistry,
  CURATED_VOICE_LANGUAGES,
  RedisService,
  type OwnershipContext,
} from "@ringee/platform";
import { assertVoiceAgentAccess } from "./voice-agent-access";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = "v1";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
};

/** Used only when Redis or the configured model is unavailable. */
const FALLBACK_SAMPLES: Record<string, string> = {
  en: "Hello! My name is Clara, and I live near the river. Did you hear the birds at sunrise? Tomorrow may bring rain, but today feels wonderful!",
  es: "¡Hola! Me llamo Clara y vivo en una casa cerca del río. ¿Sabías que los pájaros cantan diferente al amanecer? Hoy hace calor, pero mañana podría llover. Si tienes tiempo, podemos tomar un café juntos. ¡Estaría genial!",
  pt: "Olá! Meu nome é Clara e moro perto do rio. Você ouviu os pássaros ao amanhecer? Amanhã pode chover, mas hoje está um dia maravilhoso!",
  fr: "Bonjour ! Je m'appelle Clara et j'habite près de la rivière. Avez-vous entendu les oiseaux ce matin ? Demain il pleuvra peut-être, mais aujourd'hui est magnifique !",
  de: "Hallo! Ich heiße Clara und wohne in der Nähe des Flusses. Hast du heute Morgen die Vögel gehört? Morgen regnet es vielleicht, aber heute ist es wunderschön!",
  it: "Ciao! Mi chiamo Clara e vivo vicino al fiume. Hai sentito gli uccelli questa mattina? Domani potrebbe piovere, ma oggi è una giornata meravigliosa!",
};

export interface VoiceCloneReadingSample {
  language: string;
  text: string;
}

/** Generates one reusable, phonetically varied recording script per language. */
@Injectable()
export class VoiceCloneReadingSampleService {
  private readonly logger = new Logger(VoiceCloneReadingSampleService.name);
  private readonly memory = new Map<
    string,
    { text: string; expiresAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly providers: AiProviderRegistry,
    private readonly redis: RedisService,
  ) {}

  async get(
    ctx: OwnershipContext,
    language: string,
  ): Promise<VoiceCloneReadingSample> {
    assertVoiceAgentAccess(ctx);
    const normalizedLanguage = language.trim().toLowerCase();
    if (!CURATED_VOICE_LANGUAGES.some((item) => item === normalizedLanguage)) {
      throw new BadRequestException("Choose a supported voice language.");
    }

    const memoryEntry = this.memory.get(normalizedLanguage);
    if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
      return { language: normalizedLanguage, text: memoryEntry.text };
    }

    const existing = this.inFlight.get(normalizedLanguage);
    const request = existing ?? this.load(normalizedLanguage);
    if (!existing) this.inFlight.set(normalizedLanguage, request);
    try {
      return { language: normalizedLanguage, text: await request };
    } finally {
      if (this.inFlight.get(normalizedLanguage) === request) {
        this.inFlight.delete(normalizedLanguage);
      }
    }
  }

  private async load(language: string): Promise<string> {
    const key = `ai-voice-agent:clone-reading-sample:${CACHE_VERSION}:${language}`;
    try {
      const cached = await this.redis.get<string>(key);
      if (cached && this.isValid(cached)) {
        this.remember(language, cached, CACHE_TTL_MS);
        return cached;
      }
    } catch (error) {
      this.logger.warn(
        `Reading sample cache unavailable for ${language}: ${this.message(error)}`,
      );
      return this.useFallback(language);
    }

    let text: string;
    try {
      const provider = this.providers.get(apiConfiguration.AI_PROVIDER);
      const response = await provider.summarize({
        system: [
          "Create a natural reference passage for cloning a human voice.",
          "Return only one plain-text paragraph in the requested language.",
          "Use 18 to 22 words so it can be read clearly in about 5 to 10 seconds.",
          "Include varied sounds, one question and one exclamation.",
          "Do not include a heading, quotation marks, markdown, instructions or unsafe content.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: `Language: ${LANGUAGE_NAMES[language]}`,
          },
        ],
      });
      text = this.normalize(response.summary);
      if (!this.isValid(text)) {
        throw new Error(
          "The generated passage was outside the accepted length",
        );
      }
    } catch (error) {
      this.logger.warn(
        `Reading sample generation failed for ${language}: ${this.message(error)}`,
      );
      return this.useFallback(language);
    }

    this.remember(language, text, CACHE_TTL_MS);
    try {
      await this.redis.set(key, text, CACHE_TTL_MS);
    } catch (error) {
      this.logger.warn(
        `Reading sample could not be cached for ${language}: ${this.message(error)}`,
      );
    }
    return text;
  }

  private normalize(value: string): string {
    return value
      .trim()
      .replace(/^\*+|\*+$/g, "")
      .replace(/^["“](.*)["”]$/, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isValid(value: string): boolean {
    const words = value.trim().split(/\s+/).filter(Boolean).length;
    return (
      value.length >= 60 && value.length <= 400 && words >= 14 && words <= 34
    );
  }

  private useFallback(language: string): string {
    const text = FALLBACK_SAMPLES[language]!;
    this.remember(language, text, FAILURE_TTL_MS);
    return text;
  }

  private remember(language: string, text: string, ttlMs: number): void {
    this.memory.set(language, { text, expiresAt: Date.now() + ttlMs });
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
