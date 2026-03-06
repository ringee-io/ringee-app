export interface IUploadProvider {
  uploadSimple(path: string): Promise<string>;
  removeFile(filePath: string): Promise<void>;
  uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
    extension: string,
  ): Promise<string>;
}
