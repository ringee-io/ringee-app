import { IUploadProvider } from "./upload.interface";
import { mkdirSync, unlink, writeFileSync } from "fs";

// import mime from "mime";
import axios from "axios";

export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) { }

  uploadBuffer(
    path: string,
    buffer: Buffer,
    contentType: string,
    extension: string,
  ): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async uploadSimple(path: string) {
    const loadImage = await axios.get(path, { responseType: "arraybuffer" });
    const contentType =
      loadImage?.headers?.["content-type"] ||
      loadImage?.headers?.["Content-Type"];

    // @ts-ignore
    // const findExtension = mime.extension(contentType)!;
    const findExtension = '';

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

  async removeFile(filePath: string): Promise<void> {
    // Logic to remove the file from the filesystem goes here
    return new Promise((resolve, reject) => {
      unlink(filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
