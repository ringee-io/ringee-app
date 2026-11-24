import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const native = createRequire(import.meta.url);
const copy = JSON.parse(
  fs.readFileSync(
    new URL('../src/i18n/locales/en/calls.json', import.meta.url),
    'utf8'
  )
).workspace;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const sameDeps = (a, b) =>
  a &&
  b &&
  a.length === b.length &&
  a.every((value, i) => Object.is(value, b[i]));

/** Run the real component/hook with controlled async responses and React hooks. */
function harness(file, exported, overrides) {
  const states = [];
  const effects = [];
  let cursor = 0;
  let dirty = true;
  let args = [];
  let value;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      states[index] ??= {
        value: typeof initial === 'function' ? initial() : initial
      };
      return [
        states[index].value,
        (next) => {
          const result =
            typeof next === 'function' ? next(states[index].value) : next;
          if (!Object.is(result, states[index].value)) dirty = true;
          states[index].value = result;
        }
      ];
    },
    useRef(initial) {
      const index = cursor++;
      states[index] ??= { current: initial };
      return states[index];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!sameDeps(states[index]?.deps, deps))
        states[index] = { deps, value: fn() };
      return states[index].value;
    },
    useCallback(fn, deps) {
      return hooks.useMemo(() => fn, deps);
    },
    useEffect(run, deps) {
      const index = cursor++;
      if (sameDeps(states[index]?.deps, deps)) return;
      const previous = states[index];
      states[index] = { deps };
      effects.push(() => {
        previous?.cleanup?.();
        states[index].cleanup = run();
      });
    }
  };
  const js = ts.transpileModule(
    fs.readFileSync(new URL(file, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    (name) => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return native(name);
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === '@ringee/frontend-shared/lib/utils')
        return { cn: (...values) => values.filter(Boolean).join(' ') };
      return new Proxy({}, { get: (_target, key) => String(key) });
    },
    module,
    module.exports
  );
  const render = (...next) => {
    if (next.length) args = next;
    cursor = 0;
    dirty = false;
    value = module.exports[exported](...args);
    while (effects.length) effects.shift()();
    return value;
  };
  return {
    render,
    async settle() {
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        if (dirty) render();
      }
      return value;
    }
  };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree))
    return tree.flatMap((item) => nodes(item, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...nodes(tree.props?.children, predicate)
  ];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree && typeof tree === 'object') return text(tree.props?.children);
  return typeof tree === 'string' ? tree : '';
}
function button(tree, label) {
  const found = nodes(
    tree,
    (node) => ['button', 'Button'].includes(node.type) && text(node) === label
  )[0];
  assert.ok(found, `Button missing: ${label}`);
  return found.props;
}
function postCall(saveCallOutcome) {
  let closed = 0;
  const notifications = [];
  const store = {
    outcome: 'interested',
    outcomeNote: 'Agreed to send the proposal Friday.',
    meetingBooked: false,
    callbackScheduled: false,
    callDuration: 134,
    callContactName: 'Maria',
    callContactId: 'contact',
    callId: 'call',
    callSessionId: 'session',
    callPhoneNumber: '+13125550187',
    setOutcome: (outcome) => {
      store.outcome = outcome;
    },
    setOutcomeNote: (note) => {
      store.outcomeNote = note;
    }
  };
  const value = {
    data: { saveCallOutcome },
    slots: {},
    labels: { workspace: copy, followUpPreparing: 'Saving…' },
    notify: (...args) => notifications.push(args)
  };
  const h = harness(
    '../../../packages/dialer-ui/src/components/post-call-view.tsx',
    'PostCallView',
    {
      '@ringee/dialer-core/store': { useCallStore: () => store },
      '../data/context': { useDialer: () => value }
    }
  );
  const props = {
    layout: 'workspace',
    onClose: () => {
      closed++;
    }
  };
  return { ...h, store, notifications, props, closed: () => closed };
}

test('Skip saves in-call notes and accepts only one submission before closing', async () => {
  const request = deferred();
  const writes = [];
  const h = postCall((input) => {
    writes.push(input);
    return request.promise;
  });
  const skip = button(h.render(h.props), copy.skip);
  const first = skip.onClick();
  await skip.onClick();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    callId: 'call',
    callSessionId: 'session',
    outcomeNote: h.store.outcomeNote
  });
  assert.equal(h.closed(), 0);
  request.resolve();
  await first;
  assert.equal(h.closed(), 1);
});

test('failed save or skip preserves the note and selected outcome for retry', async () => {
  for (const label of [copy.save, copy.skip]) {
    const h = postCall(async () => {
      throw new Error('offline');
    });
    await button(h.render(h.props), label).onClick();
    const tree = await h.settle();
    assert.equal(h.closed(), 0);
    assert.equal(h.store.outcome, 'interested');
    assert.equal(h.store.outcomeNote, 'Agreed to send the proposal Friday.');
    assert.ok(nodes(tree, (node) => node.props?.role === 'alert').length);
    assert.equal(button(tree, copy.interested)['aria-pressed'], true);
    assert.equal(button(tree, label).disabled, false);
  }
});

test('wrap-up cannot save or skip while its meeting is being committed', async () => {
  const writes = [];
  const h = postCall(async (input) => {
    writes.push(input);
  });
  const tree = h.render({ ...h.props, pending: true });
  for (const label of [copy.save, copy.skip]) {
    const control = button(tree, label);
    assert.equal(control.disabled, true);
    await control.onClick();
  }
  assert.equal(writes.length, 0);
  assert.equal(h.closed(), 0);
});

function availability() {
  const requests = [];
  const api = {
    get: (url) => {
      const request = deferred();
      requests.push({ ...request, url });
      return request.promise;
    }
  };
  const h = harness(
    '../src/features/meetings/components/calendar/use-meetings-data.ts',
    'useOpenSlots',
    {
      '@ringee/frontend-shared/hooks/use.api': { useApi: () => api },
      './calendar-utils': {
        browserTimeZone: () => 'America/New_York',
        dateKey: (date) => date.toISOString().slice(0, 10)
      }
    }
  );
  const args = {
    calendarId: 'sales',
    date: new Date('2027-01-04T12:00:00Z'),
    duration: 30
  };
  return { ...h, requests, args };
}

test('changing calendar, day or duration immediately hides earlier times and ignores late replies', async () => {
  for (const patch of [
    { calendarId: 'demos' },
    { duration: 60 },
    { date: new Date('2027-01-05T12:00:00Z') }
  ]) {
    const h = availability();
    h.render(h.args);
    const next = h.render({ ...h.args, ...patch });
    assert.deepEqual(next.slots, []);
    assert.equal(next.loading, true);
    h.requests[1].resolve([
      { time: '14:00', available: true },
      { time: '15:00', available: false }
    ]);
    const current = await h.settle();
    assert.deepEqual(current.slots, ['14:00']);
    assert.equal(current.allSlots.length, 2);
    h.requests[0].resolve([{ time: '09:00', available: true }]);
    assert.deepEqual((await h.settle()).slots, ['14:00']);
  }
});

test('disabling availability invalidates an in-flight reply; failures offer no invented times', async () => {
  const h = availability();
  h.render(h.args);
  assert.deepEqual(h.render({ ...h.args, enabled: false }).slots, []);
  h.requests[0].resolve([{ time: '09:00', available: true }]);
  assert.deepEqual((await h.settle()).slots, []);
  h.render(h.args);
  h.requests[1].reject(new Error('calendar offline'));
  const failed = await h.settle();
  assert.equal(failed.failed, true);
  assert.deepEqual(failed.slots, []);
});
