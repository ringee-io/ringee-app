import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { IUploadProvider } from "./upload.interface";

function makeId(length: number) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export class CloudflareStorage implements IUploadProvider {
  private _client: S3Client;

  constructor(
    accountID: string,
    accessKey: string,
    secretKey: string,
    private region: string,
    private _bucketName: string,
    private _uploadUrl: string,
  ) {
    this._client = new S3Client({
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
    });

    this._client.middlewareStack.add(
      (next) =>
        async (args): Promise<any> => {
          const request: any = args.request;

          if (request?.headers) {
            delete request.headers["x-amz-checksum-crc32"];
            delete request.headers["x-amz-checksum-crc32c"];
            delete request.headers["x-amz-checksum-sha1"];
            delete request.headers["x-amz-checksum-sha256"];
          }

          return next(args);
        },
      { step: "build", name: "removeChecksumsMiddleware" },
    );
  }

  async uploadSimple(path: string): Promise<string> {
    const loadImage = await fetch(path);
    const contentType =
      loadImage.headers.get("content-type") ||
      loadImage.headers.get("Content-Type") ||
      "application/octet-stream";

    // @ts-ignore
    const extension = mime.extension(contentType) || "bin";
    const id = makeId(10);

    const params = {
      Bucket: this._bucketName,
      Key: `${id}.${extension}`,
      Body: Buffer.from(await loadImage.arrayBuffer()),
      ContentType: contentType,
      ChecksumMode: "DISABLED",
    };

    const command = new PutObjectCommand(params);
    await this._client.send(command);

    return `${this._uploadUrl}/${id}.${extension}`;
  }

  /**
   * 🔥 Subir directamente un Buffer (PDFs, imágenes generadas, etc.)
   */
  async uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType = "application/pdf",
    extension = "pdf",
  ): Promise<string> {
    const key = path;

    const command = new PutObjectCommand({
      Bucket: this._bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // ChecksumMode: 'DISABLED',
    });

    await this._client.send(command);

    return `${this._uploadUrl}/${key}`;
  }

  /**
   * 🗑️ Borrar archivo (Opcional)
   */
  async removeFile(filePath: string): Promise<void> {
    // Si necesitas delete, lo habilito aquí.
    throw new Error("Method not implemented.");
  }
}
