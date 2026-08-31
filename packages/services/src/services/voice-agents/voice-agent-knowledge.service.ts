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
  AiVoiceAgentKnowledgeSourceWithAgent,
  AiVoiceAgentKnowledgeStatus,
  AiVoiceAgentRepository,
  AiVoiceAgentStatus,
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

/** One entry of the workspace's reusable knowledge, as the picker shows it. */
export interface KnowledgeLibraryEntry {
  id: string;
  kind: AiVoiceAgentKnowledgeKind;
  label: string;
  sourceUrl: string | null;
  status: AiVoiceAgentKnowledgeStatus;
  createdAt: Date;
  agentId: string;
  agentName: string;
  /** True when this agent already has a copy, so the picker can say so. */
  alreadyAdded: boolean;
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
    const agent = await this.agents.require(ctx, agentId);
    const sources = await this.repository.listKnowledgeSources(agentId);
    const { refreshed, resynced } = await this.refreshPending(
      ctx,
      agentId,
      sources,
    );

    // A source can sit at `ready` while the assistant still does not point at
    // its store. The re-sync that attaches it runs exactly once — on the read
    // that flips the status — so a provider failure at that moment strands the
    // knowledge for good: the status never changes again, nothing retries, and
    // the agent keeps answering as if the document had never been added.
    // Retrying here is what makes that recoverable without re-uploading.
    const usable = refreshed.some(
      (source) => source.status === AiVoiceAgentKnowledgeStatus.ready,
    );
    if (!resynced && usable && agent.status === AiVoiceAgentStatus.error) {
      await this.agents.resync(ctx, agentId);
    }

    return refreshed;
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

  /**
   * Everything the workspace has already uploaded, on any agent, so a document
   * can be put on a second agent without hunting down the original file. The
   * agent's own sources are excluded — they are already on the page — and each
   * entry carries whether an identical copy is present, because re-adding the
   * same PDF twice only makes the retrieval worse.
   */
  async library(
    ctx: OwnershipContext,
    agentId: string,
  ): Promise<KnowledgeLibraryEntry[]> {
    await this.agents.require(ctx, agentId);
    const all = await this.repository.listKnowledgeSourcesForOwner(ctx);

    const mine = all.filter((source) => source.agentId === agentId);
    const taken = new Set(mine.map((source) => this.identity(source)));

    return all
      .filter((source) => source.agentId !== agentId)
      .map((source) => ({
        id: source.id,
        kind: source.kind,
        label: source.label,
        sourceUrl: source.sourceUrl,
        status: source.status,
        createdAt: source.createdAt,
        agentId: source.agentId,
        agentName: source.agent.name,
        alreadyAdded: taken.has(this.identity(source)),
      }));
  }

  /**
   * Puts an existing source on this agent as a copy of its own.
   *
   * A copy, not a shared reference: every agent owns its store, and deleting
   * the agent deletes the bucket — pointing two agents at one bucket would let
   * one deletion silently empty the other agent's knowledge.
   */
  async reuse(
    ctx: OwnershipContext,
    agentId: string,
    sourceId: string,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    await this.agents.require(ctx, agentId);
    const origin = await this.repository.findKnowledgeSourceForOwner(
      ctx,
      sourceId,
    );
    if (!origin) throw new NotFoundException("Knowledge source not found");
    if (origin.agentId === agentId) {
      throw new BadRequestException("This agent already has that source.");
    }

    const existing = await this.repository.listKnowledgeSources(agentId);
    const identity = this.identity(origin);
    if (existing.some((source) => this.identity(source) === identity)) {
      throw new BadRequestException("This agent already has that source.");
    }

    if (origin.kind === AiVoiceAgentKnowledgeKind.url) {
      if (!origin.sourceUrl) {
        throw new BadRequestException("That page has no address to re-index.");
      }
      return this.addUrl(ctx, agentId, {
        url: origin.sourceUrl,
        label: origin.label,
      });
    }

    if (origin.kind === AiVoiceAgentKnowledgeKind.text) {
      if (!origin.content) {
        throw new BadRequestException("That note has no text left to copy.");
      }
      return this.addText(ctx, agentId, {
        label: origin.label,
        content: origin.content,
      });
    }

    return this.copyDocument(ctx, agentId, origin);
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

  /**
   * What makes two sources "the same" to a person: a page is its address, a
   * document or a note is its title. Ids differ on every copy, so they cannot
   * answer this.
   */
  private identity(source: AiVoiceAgentKnowledgeSource): string {
    return source.kind === AiVoiceAgentKnowledgeKind.url
      ? `url:${source.sourceUrl ?? source.label}`
      : `${source.kind}:${source.label.trim().toLowerCase()}`;
  }

  /**
   * Copies an uploaded file into this agent's own store. The bytes only live at
   * the provider, so they are read back out of the original bucket rather than
   * asking the user for the file again.
   */
  private async copyDocument(
    ctx: OwnershipContext,
    agentId: string,
    origin: AiVoiceAgentKnowledgeSourceWithAgent,
  ): Promise<AiVoiceAgentKnowledgeSource> {
    if (!origin.providerBucket || !origin.providerFileName) {
      throw new BadRequestException(
        "That document is no longer stored, so it cannot be reused. Upload it again.",
      );
    }

    const document = await this.provider
      .readKnowledgeDocument(origin.providerBucket, origin.providerFileName)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Could not read ${origin.providerFileName} from ${origin.providerBucket}: ${message}`,
        );
        throw new BadRequestException(
          "That document could not be read back. Upload it again.",
        );
      });

    const store = await this.ensureStore(agentId);
    const fileName = this.fileName(origin.label, "bin");
    await this.provider.putKnowledgeDocument(
      store,
      fileName,
      document.body,
      document.contentType,
    );

    const source = await this.repository.createKnowledgeSource({
      agentId,
      kind: origin.kind,
      label: origin.label,
      providerBucket: store,
      providerFileName: fileName,
      status: AiVoiceAgentKnowledgeStatus.processing,
    });

    return this.startIndexing(ctx, agentId, source, () =>
      this.provider.indexKnowledgeStore(store),
    );
  }

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
  ): Promise<{
    refreshed: AiVoiceAgentKnowledgeSource[];
    resynced: boolean;
  }> {
    const pending = sources.filter(
      (source) =>
        source.embeddingTaskId &&
        (source.status === AiVoiceAgentKnowledgeStatus.pending ||
          source.status === AiVoiceAgentKnowledgeStatus.processing),
    );
    if (pending.length === 0) return { refreshed: sources, resynced: false };

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

    return {
      refreshed: sources.map((source) => refreshed.get(source.id) ?? source),
      resynced: anyBecameReady,
    };
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
