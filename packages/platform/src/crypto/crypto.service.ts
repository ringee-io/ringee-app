// src/common/crypto.service.ts
import { Injectable, OnModuleInit } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "crypto";

/**
 * Requisitos en .env:
 *   APP_ENCRYPTION_SECRET=una-frase-secreta-muy-larga
 *
 * NOTA: Idealmente la secret viene de un KMS (AWS KMS, GCP KMS, Vault).
 */

@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly secret: string;
  private readonly key: Buffer; // clave derivada para AES-256

  constructor() {
    this.secret = apiConfiguration.APP_ENCRYPTION_SECRET;

    // Clave global derivada desde APP_ENCRYPTION_SECRET (solo para cifrado general)
    this.key = scryptSync(this.secret, "ringee_salt_v1", 32);
  }

  onModuleInit(): void {
    // noop
  }

  /**
   * Clave correcta dependiendo del contexto.
   * - Si no se pasa secret → usa la global (APP_ENCRYPTION_SECRET)
   * - Si se pasa secret hex → úsala DIRECTAMENTE como key AES-256
   */
  private getKey(secret?: string): Buffer {
    if (!secret) {
      return this.key; // Clave global para JSON encryption
    }

    // User/org encryption keys YA SON 32 bytes en hex: NO LAS DERIVES
    return Buffer.from(secret, "hex");
  }

  // -------------------- JSON encryption (app-level) --------------------

  encrypt(data: Record<string, any>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const json = JSON.stringify(data);

    const encrypted = Buffer.concat([
      cipher.update(json, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
  }

  decrypt(encoded: string): Record<string, any> {
    const raw = Buffer.from(encoded, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  // -------------------- BUFFER encryption (recordings) --------------------

  encryptBuffer(data: Buffer, secret?: string): Buffer {
    const key = this.getKey(secret); // <-- AHORA SÍ TOMA LA encryptionKey REAL
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: IV (12) + Tag (16) + Encrypted Data
    return Buffer.concat([iv, tag, encrypted]);
  }

  decryptBuffer(data: Buffer, secret?: string): Buffer {
    const key = this.getKey(secret);
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
