export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  removeFile(filePath: string): Promise<void>;
  uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
    extension: string,
  ): Promise<string>;
  /**
   * Reads a previously uploaded object back into memory by its storage key
   * (the `path` passed to `uploadBuffer`). Used when a stored file must be
   * forwarded to a third party (e.g. a regulatory document sent to Telnyx).
   */
  downloadBuffer(key: string): Promise<Buffer>;
}
