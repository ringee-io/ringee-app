import { IUploadProvider } from "./upload.interface";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";

// import mime from "mime";
import axios from "axios";

export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  /** Writes a buffer to `<uploadDirectory>/<path>` and returns a public URL. */
  async uploadBuffer(
    path: string,
    buffer: Buffer,
    _contentType: string,
    _extension: string,
  ): Promise<string> {
    const filePath = join(this.uploadDirectory, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return `${process.env.FRONTEND_URL}/uploads/${path}`;
  }

  /** Reads back a previously stored object by its key (path). */
  async downloadBuffer(key: string): Promise<Buffer> {
    return readFileSync(join(this.uploadDirectory, key));
  }

  async uploadSimple(path: string) {
    const loadImage = await axios.get(path, { responseType: "arraybuffer" });
    const contentType =
      loadImage?.headers?.["content-type"] ||
      loadImage?.headers?.["Content-Type"];

    // @ts-ignore
    // const findExtension = mime.extension(contentType)!;
    const findExtension = "";

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join("");

    const filePath = `${dir}/${randomName}.${findExtension}`;
    const publicPath = `${innerPath}/${randomName}.${findExtension}`;
    // Logic to save the file to the filesystem goes here
    writeFileSync(filePath, loadImage.data);

    return process.env.FRONTEND_URL + "/uploads" + publicPath;
  }

  /** Removes a stored object by its key (path), no-op if already gone. */
  async removeFile(key: string): Promise<void> {
    rmSync(join(this.uploadDirectory, key), { force: true });
  }
}
