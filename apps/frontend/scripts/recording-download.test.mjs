// A downloaded recording must be the decrypted mp3, never the stored
// ciphertext. The fixture encrypts exactly as the backend's
// `CryptoService.encryptBuffer` does, so a format drift on either side fails
// here instead of saving unplayable files.
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

function load(relative, globals = {}) {
  const source = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const exports = {};
  const names = Object.keys(globals);
  new Function('require', 'exports', ...names, compiled)(
    createRequire(source),
    exports,
    ...names.map((name) => globals[name])
  );
  return exports;
}

/** IV (12) | auth tag (16) | ciphertext, as `CryptoService.encryptBuffer`. */
function encryptLikeBackend(plain, hexKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function browser({ stored }) {
  const clicks = [];
  const created = [];
  const revoked = [];
  const timers = [];
  const fetched = [];
  const globals = {
    fetch: async (url) => {
      fetched.push(url);
      if (!stored) return { ok: false, arrayBuffer: async () => null };
      const bytes = new Uint8Array(stored);
      return { ok: true, arrayBuffer: async () => bytes.buffer };
    },
    document: {
      createElement: () => {
        const link = {
          inDocument: false,
          click() {
            clicks.push({
              href: link.href,
              download: link.download,
              inDocument: link.inDocument
            });
          },
          remove() {
            link.inDocument = false;
          }
        };
        return link;
      },
      body: {
        appendChild: (link) => {
          link.inDocument = true;
        }
      }
    },
    URL: {
      createObjectURL: (blob) => {
        created.push(blob);
        return `blob:recording-${created.length}`;
      },
      revokeObjectURL: (url) => revoked.push(url)
    },
    setTimeout: (callback, ms) => timers.push({ callback, ms })
  };
  return { globals, clicks, created, revoked, timers, fetched };
}

const hexKey = randomBytes(32).toString('hex');
const api = {
  get: async (path) => {
    assert.equal(path, '/encryption/key');
    return { key: hexKey };
  }
};
const plain = Buffer.from('ID3 pretend mp3 frames '.repeat(64));

test('a stored recording is saved decrypted, as an mp3, under the given name', async () => {
  const page = browser({ stored: encryptLikeBackend(plain, hexKey) });
  const { downloadRecording } = load(
    '../../../packages/frontend-shared/src/lib/crypto.ts',
    page.globals
  );

  await downloadRecording(
    'https://storage.example/rec.bin',
    api,
    'ringee-recording.mp3'
  );

  assert.deepEqual(page.fetched, ['https://storage.example/rec.bin']);
  assert.equal(page.created.length, 1);
  const saved = page.created[0];
  assert.equal(saved.type, 'audio/mpeg');
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), plain);
  assert.deepEqual(page.clicks, [
    {
      href: 'blob:recording-1',
      download: 'ringee-recording.mp3',
      inDocument: true
    }
  ]);

  // Released later, not on click: Safari reads the URL after click() returns.
  assert.deepEqual(page.revoked, []);
  assert.equal(page.timers.length, 1);
  page.timers[0].callback();
  assert.deepEqual(page.revoked, ['blob:recording-1']);
});

test('a copy a player already decrypted is saved without downloading it again', async () => {
  const page = browser({ stored: null });
  const { downloadRecording } = load(
    '../../../packages/frontend-shared/src/lib/crypto.ts',
    page.globals
  );

  await downloadRecording(
    'https://storage.example/rec.bin',
    api,
    'ringee-recording.mp3',
    'blob:already-playing'
  );

  assert.deepEqual(page.fetched, []);
  assert.deepEqual(page.created, []);
  // The player owns that URL and revokes it when it closes.
  assert.deepEqual(page.timers, []);
  assert.deepEqual(page.clicks, [
    {
      href: 'blob:already-playing',
      download: 'ringee-recording.mp3',
      inDocument: true
    }
  ]);
});

test('a recording that cannot be fetched or decrypted saves nothing', async () => {
  const unreachable = browser({ stored: null });
  const fromUnreachable = load(
    '../../../packages/frontend-shared/src/lib/crypto.ts',
    unreachable.globals
  );
  await assert.rejects(
    fromUnreachable.downloadRecording('https://storage.example/x', api, 'x.mp3')
  );
  assert.deepEqual(unreachable.clicks, []);

  const otherKey = encryptLikeBackend(plain, randomBytes(32).toString('hex'));
  const wrongKey = browser({ stored: otherKey });
  const fromWrongKey = load(
    '../../../packages/frontend-shared/src/lib/crypto.ts',
    wrongKey.globals
  );
  await assert.rejects(
    fromWrongKey.downloadRecording('https://storage.example/x', api, 'x.mp3')
  );
  assert.deepEqual(wrongKey.clicks, []);
});

test('the file name names both sides and the local time of the call', () => {
  const { recordingFileName } = load(
    '../src/features/recordings/lib/recording-file-name.ts'
  );
  const at = new Date(2026, 9, 15, 9, 5).toISOString();

  assert.equal(
    recordingFileName({
      from: '+1 (809) 555-0100',
      to: '+14155550123',
      at,
      callId: 'call-1'
    }),
    'ringee-recording-18095550100-14155550123-2026-10-15-0905.mp3'
  );
  assert.equal(
    recordingFileName({ from: '+18095550100', to: null, at: 'not a date' }),
    'ringee-recording-18095550100.mp3'
  );
  assert.equal(
    recordingFileName({ callId: 'call-1' }),
    'ringee-recording-call-1.mp3'
  );
});
