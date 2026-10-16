/**
 * Frontend crypto utilities for decrypting recordings.
 * Compatible with backend AES-256-GCM implementation.
 * Format: [IV (12 bytes)] + [Tag (16 bytes)] + [Encrypted Data]
 */

import type { ApiClient } from "./api";

/**
 * Convert a 64-char hex string (32 bytes) into a CryptoKey usable for AES-GCM.
 */
async function deriveKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(
    hexKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
}

/**
 * Decrypt a buffer shaped as:
 *   IV (12 bytes) | AuthTag (16 bytes) | Ciphertext
 */
export async function decryptRecording(
  encryptedData: ArrayBuffer,
  hexKey: string,
): Promise<Uint8Array> {
  const data = new Uint8Array(encryptedData);

  // Extract IV (12 bytes)
  const iv = data.slice(0, 12);

  // Extract Auth Tag (16 bytes)
  const tag = data.slice(12, 28);

  // Extract Ciphertext (remaining bytes)
  const ciphertext = data.slice(28);

  // WebCrypto expects ciphertext + tag appended
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(tag, ciphertext.length);

  // Derive actual AES-256-GCM key
  const key = await deriveKey(hexKey);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertextWithTag,
  );

  return new Uint8Array(decrypted);
}

/**
 * Get encryption key for the current user/org from backend.
 */
export async function fetchEncryptionKey(api: ApiClient): Promise<string> {
  const data = await api.get<{ key: string }>("/encryption/key");
  return data.key;
}

/**
 * Download + decrypt an encrypted recording into an mp3 Blob.
 */
export async function fetchDecryptedRecording(
  recordingUrl: string,
  api: ApiClient,
): Promise<Blob> {
  const key = await fetchEncryptionKey(api);

  const response = await fetch(recordingUrl);
  if (!response.ok) {
    throw new Error("Failed to download recording");
  }
  const encryptedData = await response.arrayBuffer();

  const decryptedData = await decryptRecording(encryptedData, key);

  const arrayBuffer = decryptedData.buffer.slice(
    decryptedData.byteOffset,
    decryptedData.byteOffset + decryptedData.byteLength,
  );

  return new Blob([new Uint8Array(arrayBuffer)] as any, {
    type: "audio/mpeg",
  });
}

/**
 * Download + decrypt an encrypted recording, returning a Blob URL
 * to be used as the `src` attribute for an audio player.
 */
export async function decryptRecordingToBlob(
  recordingUrl: string,
  api: ApiClient,
): Promise<string> {
  return URL.createObjectURL(await fetchDecryptedRecording(recordingUrl, api));
}

/**
 * Save a recording as a playable mp3. The stored object is ciphertext, so a
 * plain `<a href download>` to it saves an unplayable file — and the browser
 * ignores `download` on a cross-origin link anyway. Pass `decryptedUrl` when a
 * player already holds the decrypted Blob URL, to skip a second download.
 */
export async function downloadRecording(
  recordingUrl: string,
  api: ApiClient,
  fileName: string,
  decryptedUrl?: string | null,
): Promise<void> {
  if (decryptedUrl) {
    clickDownloadLink(decryptedUrl, fileName);
    return;
  }

  const objectUrl = URL.createObjectURL(
    await fetchDecryptedRecording(recordingUrl, api),
  );
  clickDownloadLink(objectUrl, fileName);
  // Safari reads the URL after click() has returned: revoking it right away
  // can cancel the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function clickDownloadLink(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  // Firefox only follows a link that is in the document.
  document.body.appendChild(link);
  link.click();
  link.remove();
}
