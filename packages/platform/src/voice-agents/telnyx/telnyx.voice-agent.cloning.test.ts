import { describe, expect, it, vi } from "vitest";
import { TelnyxVoiceAgentService } from "./telnyx.voice-agent.service";
import { validateVoiceCloneSample } from "../voice-clone-audio";

function wav(seconds = 5) {
  const bytes = Buffer.alloc(44 + seconds * 48000);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

function build() {
  const client = { uploadFile: vi.fn(), get: vi.fn() };
  const service = new TelnyxVoiceAgentService(client as never, {} as never);
  return { client, service };
}

const RAW = {
  id: "clone-id",
  name: "Reception",
  provider: "telnyx",
  model_id: "Ultra",
  provider_voice_id: "provider-id",
  status: "active",
};

describe("Telnyx Ultra human voice cloning", () => {
  it("uploads audio_file using Ultra and trims a 15-second WAV to ten seconds", async () => {
    const h = build();
    h.client.uploadFile.mockResolvedValue({
      data: { ...RAW, status: "pending", provider_voice_id: null },
    });
    const input = wav(15);
    const clone = await h.service.cloneVoice({
      name: "Reception",
      language: "es",
      gender: "unspecified",
      audio: input,
    });
    const [path, file, fields, options] = h.client.uploadFile.mock.calls[0]!;
    expect(path).toBe("/voice_clones/from_upload");
    expect(fields).toEqual({
      name: "Reception",
      language: "es",
      gender: "neutral",
      provider: "telnyx",
      model_id: "Ultra",
    });
    expect(options.fieldName).toBe("audio_file");
    expect(validateVoiceCloneSample(file.buffer)).toBe(10);
    expect(validateVoiceCloneSample(input)).toBe(15);
    expect(clone).toMatchObject({
      cloneId: "clone-id",
      status: "pending",
      voiceId: null,
    });
  });

  it("paginates and constructs the assistant voice ID from provider_voice_id", async () => {
    const h = build();
    h.client.get
      .mockResolvedValueOnce({ data: [RAW], meta: { total_pages: 2 } })
      .mockResolvedValueOnce({
        data: [{ ...RAW, id: "second", status: "expired" }],
        meta: { total_pages: 2 },
      });
    const clones = await h.service.listClonedVoices();
    expect(h.client.get.mock.calls[1]?.[0]).toContain("page[number]=2");
    expect(clones[0]).toMatchObject({
      voiceId: "Telnyx.Ultra.provider-id",
      status: "ready",
    });
    expect(clones[1]?.status).toBe("expired");
  });

  it("excludes private clones from the public catalogue even when hosted", async () => {
    const h = build();
    h.client.get.mockImplementation(async (path: string) =>
      path.startsWith("/voice_clones")
        ? { data: [RAW] }
        : {
            voices: [
              {
                id: "Telnyx.Ultra.provider-id",
                name: "Private",
                model_id: "Ultra",
                language: "es",
                hosted: true,
              },
              {
                id: "Telnyx.Ultra.Clara",
                name: "Clara",
                model_id: "Ultra",
                language: "es",
                hosted: true,
              },
            ],
          },
    );
    expect((await h.service.listVoices()).map((voice) => voice.id)).toEqual([
      "Telnyx.Ultra.Clara",
    ]);
  });

  it("keeps a new Ringee clone private before it appears in the clone list", async () => {
    const h = build();
    h.client.get.mockImplementation(async (path: string) =>
      path.startsWith("/voice_clones")
        ? { data: [] }
        : {
            voices: [
              {
                id: "Telnyx.Ultra.new-private",
                name: "Reception [ringee:12345678-1234-4234-8234-123456789012]",
                model_id: "Ultra",
                language: "es",
                hosted: true,
              },
            ],
          },
    );
    expect(await h.service.listVoices()).toEqual([]);
  });

  it("fails closed instead of publishing a partially checked voice catalogue", async () => {
    const h = build();
    h.client.get.mockResolvedValue({ data: [], meta: { total_pages: 101 } });
    await expect(h.service.listClonedVoices()).rejects.toThrow(
      /pagination limit/,
    );
    expect(h.client.get).toHaveBeenCalledTimes(100);
  });

  it("rejects malformed, truncated and out-of-range samples", () => {
    for (const value of [
      Buffer.alloc(0),
      wav(2),
      wav(16),
      wav().subarray(0, 100),
    ]) {
      expect(() => validateVoiceCloneSample(value)).toThrow();
    }
    const fakeRate = wav();
    fakeRate.writeUInt32LE(8000, 24);
    expect(() => validateVoiceCloneSample(fakeRate)).toThrow();
    expect(validateVoiceCloneSample(wav(3))).toBe(3);
  });
});
