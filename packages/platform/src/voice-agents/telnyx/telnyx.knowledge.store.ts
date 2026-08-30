import { Injectable, Logger } from "@nestjs/common";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { apiConfiguration } from "@ringee/configuration";

/**
 * The object store behind an agent's knowledge base.
 *
 * Telnyx Cloud Storage is S3-compatible and authenticates with the same API
 * key used everywhere else, so this reuses the SDK the recording store already
 * depends on rather than adding a second HTTP client. Path-style addressing is
 * required — the provider does not serve virtual-host buckets.
 */
@Injectable()
export class TelnyxKnowledgeStore {
  private readonly logger = new Logger(TelnyxKnowledgeStore.name);
  private readonly client: S3Client;

  constructor() {
    const region = apiConfiguration.AI_VOICE_AGENT_STORAGE_REGION;
    this.client = new S3Client({
      region,
      endpoint: `https://${region}.telnyxstorage.com`,
      credentials: {
        accessKeyId: apiConfiguration.TELNYX_API_KEY,
        secretAccessKey: apiConfiguration.TELNYX_API_KEY,
      },
      forcePathStyle: true,
    });
  }

  /** Idempotent: an existing bucket is the state the caller asked for. */
  async createBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (this.isAlreadyOwned(error)) return;
      throw error;
    }
  }

  async putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  /**
   * Removes the bucket and everything in it. Used when an agent is deleted —
   * a bucket left behind keeps costing storage and keeps the customer's
   * documents alive at the provider.
   */
  async deleteBucket(bucket: string): Promise<void> {
    try {
      let token: string | undefined;
      do {
        const listed = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: token,
          }),
        );
        for (const object of listed.Contents ?? []) {
          if (object.Key) await this.deleteObject(bucket, object.Key);
        }
        token = listed.NextContinuationToken;
      } while (token);

      await this.client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (this.isMissing(error)) return;
      this.logger.warn(
        `Could not delete knowledge bucket ${bucket}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  private isAlreadyOwned(error: unknown): boolean {
    const name = (error as { name?: string })?.name ?? "";
    return name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists";
  }

  private isMissing(error: unknown): boolean {
    const name = (error as { name?: string })?.name ?? "";
    return name === "NoSuchBucket" || name === "NotFound";
  }
}
