import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  RegulatoryDocument,
  RegulatoryDocumentRepository,
} from "@ringee/database";
import {
  OwnershipContext,
  TelephonyService,
  UploadFactory,
} from "@ringee/platform";

/** Shape returned to clients — never exposes the internal storage url/key. */
export interface RegulatoryDocumentDto {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: Date;
}

function toDto(doc: RegulatoryDocument): RegulatoryDocumentDto {
  return {
    id: doc.id,
    filename: doc.filename,
    contentType: doc.contentType,
    size: doc.size,
    createdAt: doc.createdAt,
  };
}

function ownerFolder(ctx: OwnershipContext): string {
  return ctx.organizationId
    ? `organizations/${ctx.organizationId}`
    : `users/${ctx.userId}`;
}

/** Filesystem-safe version of a user-supplied filename. */
function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

/**
 * Manages the reusable bucket of regulatory documents stored in Ringee's own
 * object storage (R2/local), scoped to the active workspace. Documents live in
 * Ringee and are only forwarded to Telnyx lazily on submission — the Telnyx
 * document id is cached so a document reused across number requests is uploaded
 * to the carrier just once.
 */
@Injectable()
export class RegulatoryDocumentService {
  private readonly logger = new Logger(RegulatoryDocumentService.name);
  private readonly storage = UploadFactory.createStorage();

  constructor(
    private readonly repo: RegulatoryDocumentRepository,
    private readonly telephonyService: TelephonyService,
  ) {}

  async list(ctx: OwnershipContext): Promise<RegulatoryDocumentDto[]> {
    const docs = await this.repo.findByOwner(ctx);
    return docs.map(toDto);
  }

  /** Stores an uploaded file in the workspace bucket (does not touch Telnyx). */
  async upload(
    ctx: OwnershipContext,
    file: { buffer: Buffer; filename: string; contentType: string },
  ): Promise<RegulatoryDocumentDto> {
    const safeName = sanitizeFilename(file.filename);
    const extension = safeName.includes(".")
      ? safeName.split(".").pop()!
      : "bin";
    const storageKey = `${ownerFolder(ctx)}/regulatory-documents/${randomUUID()}-${safeName}`;

    const url = await this.storage.uploadBuffer(
      storageKey,
      file.buffer,
      file.contentType,
      extension,
    );

    const doc = await this.repo.create(ctx, {
      filename: file.filename,
      contentType: file.contentType,
      size: file.buffer.length,
      storageKey,
      url,
    });

    return toDto(doc);
  }

  /** Resolves a document id (scoped to owner) into a row, or throws. */
  async getOwnedOrThrow(
    ctx: OwnershipContext,
    id: string,
  ): Promise<RegulatoryDocument> {
    const doc = await this.repo.findOwnedById(ctx, id);
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  /**
   * Returns the Telnyx document id for a stored document, uploading the file
   * from Ringee storage to Telnyx on first use. The file is uploaded to Telnyx
   * with its Ringee storage key as the filename, and the resulting id is cached.
   */
  async resolveTelnyxDocumentId(doc: RegulatoryDocument): Promise<string> {
    if (doc.telnyxDocumentId) return doc.telnyxDocumentId;

    const buffer = await this.storage.downloadBuffer(doc.storageKey);
    const { documentId } = await this.telephonyService.uploadDocument({
      buffer,
      filename: doc.storageKey,
      contentType: doc.contentType,
    });

    await this.repo.update(doc.id, { telnyxDocumentId: documentId });
    return documentId;
  }

  /** Deletes a document from the bucket (storage + row), scoped to owner. */
  async delete(ctx: OwnershipContext, id: string): Promise<void> {
    const doc = await this.repo.findOwnedById(ctx, id);
    if (!doc) throw new NotFoundException("Document not found");

    try {
      await this.storage.removeFile(doc.storageKey);
    } catch (err) {
      // Don't block deletion of the DB row if the object is already gone.
      this.logger.warn(
        `Could not remove stored object ${doc.storageKey}: ${(err as Error).message}`,
      );
    }

    await this.repo.delete(doc.id);
  }

  /** Guards a document is owned by the workspace before linking it elsewhere. */
  async assertOwned(ctx: OwnershipContext, id: string): Promise<void> {
    const doc = await this.repo.findOwnedById(ctx, id);
    if (!doc) {
      throw new ForbiddenException(
        "Document does not belong to this workspace",
      );
    }
  }
}
