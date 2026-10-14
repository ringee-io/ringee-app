import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const source = new URL(
  '../src/features/ai-voice-agents/automations/store.ts',
  import.meta.url
);
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const native = createRequire(source);

function fixture() {
  const values = new Map();
  const sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const reload = () => {
    const exports = {};
    new Function('require', 'exports', 'window', compiled)(native, exports, {
      sessionStorage
    });
    return exports.useVoiceAgentsRail;
  };
  return { reload, values };
}

test('drafts remain with their user and workspace across reloads and workspace switches', () => {
  const { reload } = fixture();
  const first = reload();
  first.getState().hydrate('user:org-a');
  first
    .getState()
    .setDraft(
      'reminders',
      { calendarIds: ['calendar-a'], callerNumberId: 'number-a' },
      'user:org-a'
    );
  const second = reload();
  second.getState().hydrate('user:org-b');
  assert.deepEqual(second.getState().drafts, {});
  second
    .getState()
    .setDraft('reminders', { calendarIds: ['calendar-b'] }, 'user:org-b');
  second.getState().setDraft('reminders', null, 'user:org-a');
  assert.deepEqual(second.getState().drafts.reminders, {
    calendarIds: ['calendar-b']
  });
  second
    .getState()
    .setDraft('receptionist', { name: 'Stale response' }, 'user:org-a');
  assert.equal(second.getState().drafts.receptionist, undefined);
  second.getState().hydrate('user:org-a');
  assert.equal(second.getState().drafts.reminders.callerNumberId, 'number-a');
  second.getState().hydrate('another-user:org-a');
  assert.deepEqual(second.getState().drafts, {});
  second.getState().hydrate(null);
  assert.equal(second.getState().summary, null);
  assert.equal(second.getState().open, false);
});

test('an old workspace response cannot repopulate the summary after switching', () => {
  const rail = fixture().reload();
  rail.getState().hydrate('user:org-a');
  rail.getState().setSummary({ operational: 5 }, 'user:org-a');
  rail.getState().hydrate('user:org-b');
  rail.getState().setSummary({ operational: 99 }, 'user:org-a');
  assert.equal(rail.getState().summary, null);
  rail.getState().setSummary({ operational: 1 }, 'user:org-b');
  assert.equal(rail.getState().summary.operational, 1);
});

test('legacy drafts without an owner are discarded', () => {
  const { reload, values } = fixture();
  values.set(
    'ringee.voiceAgentsRail',
    JSON.stringify({
      drafts: { reminders: { callerNumberId: 'unknown-owner' } }
    })
  );
  const rail = reload();
  rail.getState().hydrate('user:org-b');
  assert.deepEqual(rail.getState().drafts, {});
  assert.equal(values.has('ringee.voiceAgentsRail'), false);
});
