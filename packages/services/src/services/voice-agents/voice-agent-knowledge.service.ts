import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  AiVoiceAgentKnowledgeKind,
  AiVoiceAgentKnowledgeSource,
  AiVoiceAgentKnowledgeStatus,
  AiVoiceAgentRepository,
} from "@ringee/database";
import {
  VoiceAgentProviderService,
  type OwnershipContext,
  type VoiceAgentEmbeddingStatus,
} from "@ringee/platform";
import { requirePublicUrl } from "./public-url";
import { VoiceAgentService } from "./voice-agent.service";
import { voiceAgentKnowledgeStoreName } from "./voice-agent.types";

/** Document types a user may add, and how they are stored. */
const DOCUMENT_TYPES: Record<string, AiVoiceAgentKnowledgeKind> = {
  "application/pdf": AiVoiceAgentKnowledgeKind.pdf,
  "text/plain": AiVoiceAgentKnowledgeKind.txt,
  "text/markdown": AiVoiceAgentKnowledgeKind.txt,
  "application/msword": AiVoiceAgentKnowledgeKind.docx,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    AiVoiceAgentKnowledgeKind.docx,
};

export interface AddKnowledgeUrlInput {
  url: string;
  label?: string;
}

export interface AddKnowledgeTextInput {
  label: string;
  content: string;
}

export interface AddKnowledgeDocumentInput {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

/**
 * Per-agent knowledge (§7).
 *
 * Each agent gets its own store at the provider, and the retrieval tool is
 * attached only once a source has finished indexing — an agent pointed at an
 * empty or half-built index answers worse than one with no knowledge at all.
 * Indexing is asynchronous, so a source is `pending` until the provider says
 * otherwise and the agent is re-synced when that changes.
 */
@Injectable()
export class VoiceAgentKnowledgeService {
  private readonly logger = new Logger(VoiceAgentKnowledgeService.name);

  constructor(
    private readonly agents: VoiceAgentService,
    private readonly repository: AiVoiceAgentRepository,
    private readonly provider: VoiceAgentProviderService,
  ) {}

  async list(
    ctx: OwnershipContext,
    agentId: string,
  ): Promise<AiVoiceAgentKnowledgeSource[]> {
    await this.agents.require(ctx, agentId);
    const sources = await this.repository.listKnowledgeSources(agentId);
    return this.refreshPending(ctx, agentId, sources);
  }

  async addUrl(
    ctx: OwnershipContext,
    agentId: string,
    input: AddKnowledgeUrlInput,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    const agent = await this.agents.require(ctx, agentId);
    const url = requirePublicUrl(input.url);
    const store = await this.ensureStore(agentId);

    const source = await this.repository.createKnowledgeSource({
      agentId: agent.id,
      kind: AiVoiceAgentKnowledgeKind.url,
      label: input.label?.trim() || url.hostname + url.pathname,
      sourceUrl: url.href,
      providerBucket: store,
      status: AiVoiceAgentKnowledgeStatus.processing,
    });

    return this.startIndexing(ctx, agentId, source, () =>
      this.provider.indexKnowledgeUrl(store, url.href),
    );
  }

  async addText(
    ctx: OwnershipContext,
    agentId: string,
    input: AddKnowledgeTextInput,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    const agent = await this.agents.require(ctx, agentId);
    const content = input.content?.trim();
    if (!content) throw new BadRequestException("The text is empty.");

    const store = await this.ensureStore(agentId);
    const fileName = this.fileName(input.label, "txt");
    await this.provider.putKnowledgeDocument(
      store,
      fileName,
      Buffer.from(content, "utf-8"),
      "text/plain",
    );

    const source = await this.repository.createKnowledgeSource({
      agentId: agent.id,
      kind: AiVoiceAgentKnowledgeKind.text,
      label: input.label.trim(),
      content,
      providerBucket: store,
      providerFileName: fileName,
      status: AiVoiceAgentKnowledgeStatus.processing,
    });

    return this.startIndexing(ctx, agentId, source, () =>
      this.provider.indexKnowledgeStore(store),
    );
  }

  async addDocument(
    ctx: OwnershipContext,
    agentId: string,
    input: AddKnowledgeDocumentInput,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    const agent = await this.agents.require(ctx, agentId);
    const kind = DOCUMENT_TYPES[input.contentType];
    if (!kind) {
      throw new BadRequestException(
        `${input.contentType} is not a supported document type. Upload a PDF, TXT or DOCX.`,
      );
    }
    const maxBytes =
      apiConfiguration.AI_VOICE_AGENT_MAX_DOCUMENT_MB * 1024 * 1024;
    if (input.buffer.byteLength > maxBytes) {
      throw new BadRequestException(
        `That file is larger than ${apiConfiguration.AI_VOICE_AGENT_MAX_DOCUMENT_MB} MB.`,
      );
    }

    const store = await this.ensureStore(agentId);
    const fileName = this.fileName(input.fileName, "bin");
    await this.provider.putKnowledgeDocument(
      store,
      fileName,
      input.buffer,
      input.contentType,
    );

    const source = await this.repository.createKnowledgeSource({
      agentId: agent.id,
      kind,
      label: input.fileName,
      providerBucket: store,
      providerFileName: fileName,
      status: AiVoiceAgentKnowledgeStatus.processing,
    });

    return this.startIndexing(ctx, agentId, source, () =>
      this.provider.indexKnowledgeStore(store),
    );
  }

  async remove(
    ctx: OwnershipContext,
    agentId: string,
    sourceId: string,
  ): Promise<void> {
    await this.agents.require(ctx, agentId);
    const source = await this.repository.findKnowledgeSource(agentId, sourceId);
    if (!source) throw new NotFoundException("Knowledge source not found");

    if (source.providerBucket && source.providerFileName) {
      await this.provider
        .deleteKnowledgeDocument(source.providerBucket, source.providerFileName)
        .catch((error: unknown) => {
          // The row is what the user sees; a stranded object is a cleanup
          // problem, not a reason to refuse the removal they asked for.
          this.logger.warn(
            `Could not remove ${source.providerFileName} from ${source.providerBucket}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    await this.repository.deleteKnowledgeSource(source.id);
    await this.agents.resync(ctx, agentId);
  }

  // ── Internals ────────────────────────────────────────────────

  private async ensureStore(agentId: string): Promise<string> {
    const store = this.storeName(agentId);
    await this.provider.createKnowledgeStore(store);
    return store;
  }

  private storeName(agentId: string): string {
    return voiceAgentKnowledgeStoreName(agentId);
  }

  /**
   * Kicks off indexing and records the task. A failure here leaves the source
   * visibly `failed` with its reason rather than silently never appearing in
   * the agent's answers.
   */
  private async startIndexing(
    ctx: OwnershipContext,
    agentId: string,
    source: AiVoiceAgentKnowledgeSource,
    start: () => Promise<string>,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    try {
      const taskId = await start();
      return await this.repository.updateKnowledgeSource(source.id, {
        embeddingTaskId: taskId,
        status: AiVoiceAgentKnowledgeStatus.processing,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Could not index knowledge source ${source.id}: ${message}`,
      );
      return this.repository.setKnowledgeSourceStatus(
        source.id,
        AiVoiceAgentKnowledgeStatus.failed,
        message,
      );
    }
  }

  /**
   * Polls the provider for any source still indexing. Done on read rather than
   * on a schedule because the only person who cares is the one looking at the
   * page — and the agent is re-synced the moment a source becomes usable.
   */
  private async refreshPending(
    ctx: OwnershipContext,
    agentId: string,
    sources: AiVoiceAgentKnowledgeSource[],
  ): Promise<AiVoiceAgentKnowledgeSource[]> {
    const pending = sources.filter(
      (source) =>
        source.embeddingTaskId &&
        (source.status === AiVoiceAgentKnowledgeStatus.pending ||
          source.status === AiVoiceAgentKnowledgeStatus.processing),
    );
    if (pending.length === 0) return sources;

    let anyBecameReady = false;
    const refreshed = new Map<string, AiVoiceAgentKnowledgeSource>();

    for (const source of pending) {
      const status = await this.provider
        .getIndexingStatus(source.embeddingTaskId!)
        .catch(() => null);
      if (!status) continue;

      const mapped = this.toKnowledgeStatus(status);
      if (mapped === source.status) continue;

      refreshed.set(
        source.id,
        await this.repository.setKnowledgeSourceStatus(source.id, mapped),
      );
      if (mapped === AiVoiceAgentKnowledgeStatus.ready) anyBecameReady = true;
    }

    if (anyBecameReady) {
      // The retrieval tool only exists once there is something to retrieve, so
      // the agent has to be rebuilt when the first source lands.
      await this.agents.resync(ctx, agentId);
    }

    return sources.map((source) => refreshed.get(source.id) ?? source);
  }

  private toKnowledgeStatus(
    status: VoiceAgentEmbeddingStatus,
  ): AiVoiceAgentKnowledgeStatus {
    switch (status) {
      case "ready":
        return AiVoiceAgentKnowledgeStatus.ready;
      case "failed":
        return AiVoiceAgentKnowledgeStatus.failed;
      case "processing":
        return AiVoiceAgentKnowledgeStatus.processing;
      default:
        return AiVoiceAgentKnowledgeStatus.pending;
    }
  }

  /** Object keys must be safe and unique; the label is only a display name. */
  private fileName(label: string, fallbackExtension: string): string {
    const safe = label
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const base = safe || `source.${fallbackExtension}`;
    const stamp = Date.now().toString(36);
    return base.includes(".")
      ? base.replace(/\.([^.]+)$/, `-${stamp}.$1`)
      : `${base}-${stamp}.${fallbackExtension}`;
  }
}
