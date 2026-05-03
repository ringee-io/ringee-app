import { Injectable, Logger } from "@nestjs/common";
import { createPublicKey, KeyObject, verify as cryptoVerify } from "crypto";
import { apiConfiguration } from "@ringee/configuration";

/**
 * Verifies Telnyx webhook signatures (Ed25519).
 *
 * Telnyx signs webhooks per https://developers.telnyx.com/docs/api/v2/overview#webhooks-and-callbacks
 * - `telnyx-signature-ed25519`: base64-encoded 64-byte Ed25519 signature.
 * - `telnyx-timestamp`: unix epoch seconds.
 * - Signed payload: `<timestamp>|<rawBody>`.
 * - Public key: base64-encoded 32-byte raw Ed25519 public key, configured in
 *   the Telnyx dashboard and exposed as `TELNYX_PUBLIC_KEY`.
 */
@Injectable()
export class TelnyxWebhookVerifier {
  private readonly logger = new Logger(TelnyxWebhookVerifier.name);
  private cachedKey: KeyObject | null = null;

  /**
   * @param signatureHeader  Value of `telnyx-signature-ed25519`.
   * @param timestampHeader  Value of `telnyx-timestamp` (epoch seconds).
   * @param rawBody          The exact raw body bytes (or string) Telnyx posted.
   * @returns true on valid signature & fresh timestamp; false otherwise.
   */
  verify(
    signatureHeader: string | undefined | null,
    timestampHeader: string | undefined | null,
    rawBody: Buffer | string,
  ): boolean {
    if (!signatureHeader || !timestampHeader) {
      this.logger.warn("Missing Telnyx signature or timestamp header");
      return false;
    }

    const tolerance = apiConfiguration.TELNYX_WEBHOOK_TOLERANCE_SECONDS;
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts)) return false;
    const ageSec = Math.abs(Date.now() / 1000 - ts);
    if (ageSec > tolerance) {
      this.logger.warn(`Telnyx webhook outside tolerance: ${ageSec}s`);
      return false;
    }

    const key = this.getPublicKey();
    if (!key) {
      // No public key configured — fail closed.
      return false;
    }

    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const signed = Buffer.concat([
      Buffer.from(`${timestampHeader}|`),
      body,
    ]);

    let signature: Buffer;
    try {
      signature = Buffer.from(signatureHeader, "base64");
    } catch {
      return false;
    }

    try {
      // crypto.verify with `null` algorithm uses the key's algorithm (Ed25519).
      return cryptoVerify(null, signed, key, signature);
    } catch (err) {
      this.logger.warn(`Telnyx signature verify error: ${(err as Error).message}`);
      return false;
    }
  }

  private getPublicKey(): KeyObject | null {
    if (this.cachedKey) return this.cachedKey;
    const raw = apiConfiguration.TELNYX_PUBLIC_KEY;
    if (!raw) {
      this.logger.warn("TELNYX_PUBLIC_KEY is not configured");
      return null;
    }

    try {
      // Try as raw 32-byte SPKI material (most common Telnyx form).
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) {
        // Wrap raw 32-byte key into SPKI/DER for Ed25519.
        // SPKI prefix for Ed25519 (id-Ed25519 = 1.3.101.112).
        const spkiPrefix = Buffer.from(
          "302a300506032b6570032100",
          "hex",
        );
        const der = Buffer.concat([spkiPrefix, decoded]);
        this.cachedKey = createPublicKey({
          key: der,
          format: "der",
          type: "spki",
        });
        return this.cachedKey;
      }

      // Fallback: assume PEM was provided.
      this.cachedKey = createPublicKey({
        key: raw,
        format: "pem",
      });
      return this.cachedKey;
    } catch (err) {
      this.logger.error(
        `Failed to parse TELNYX_PUBLIC_KEY: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
