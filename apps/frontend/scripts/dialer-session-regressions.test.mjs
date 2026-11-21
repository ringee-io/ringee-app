import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const base = 'apps/frontend/src/features/dialer/';
const first = '2026-11-21T10:00:00.000Z';
const second = '2026-11-21T10:01:00.000Z';
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(setImmediate);
};

// Runs the real hooks and Zustand actions with deterministic effects and I/O,
// following the frontend's existing hook regression-test convention.
function fixture(t) {
  let active;
  const hooks = {
    useRef: (current) => active.slot(() => ({ current })),
    useCallback: (fn) => fn,
    useEffect: (fn, deps) => {
      const entry = active.slot(() => ({ deps: null, cleanup: null }));
      if (entry.deps && deps.every((d, i) => Object.is(d, entry.deps[i])))
        return;
      active.pending.push(() => {
        entry.cleanup?.();
        entry.deps = deps;
        entry.cleanup = fn();
      });
    }
  };
  function component(fn) {
    const slots = [];
    return {
      render: () => {
        let index = 0;
        active = { pending: [], slot: (init) => (slots[index++] ??= init()) };
        const value = fn();
        for (const run of active.pending) run();
        return value;
      },
      unmount: () => {
        for (const entry of slots) entry.cleanup?.();
      }
    };
  }
  const requests = [];
  const notices = [];
  let beat = { status: 'offline', startedAt: first, endedAt: null };
  const api = {
    post: async (url, body) => {
      requests.push({ method: 'POST', url, body });
      if (url.endsWith('/events-ticket')) return { ticket: 'ticket' };
      if (url.endsWith('/heartbeat')) return beat;
      return {
        id: 'session',
        status: 'offline',
        startedAt: first,
        dialerMode: 'progressive',
        awaitingEvents: true
      };
    },
    delete: async (url) => {
      requests.push({ method: 'DELETE', url });
    },
    patch: async (url) => {
      requests.push({ method: 'PATCH', url });
      return { status: 'ready' };
    }
  };
  const timers = new Map();
  t.mock.method(globalThis, 'setInterval', (fn) => {
    const id = timers.size + 1;
    timers.set(id, fn);
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));
  const streams = [];
  class EventSource {
    listeners = new Map();
    closed = false;
    constructor(url) {
      this.url = url;
      streams.push(this);
    }
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    }
    emit(type, data) {
      this.listeners.get(type)?.({ data: JSON.stringify(data) });
    }
    close() {
      this.closed = true;
    }
  }
  const previousEventSource = Object.getOwnPropertyDescriptor(
    globalThis,
    'EventSource'
  );
  Object.defineProperty(globalThis, 'EventSource', {
    configurable: true,
    writable: true,
    value: EventSource
  });
  t.after(() => {
    if (previousEventSource)
      Object.defineProperty(globalThis, 'EventSource', previousEventSource);
    else delete globalThis.EventSource;
  });
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  const cache = new Map();
  const overrides = {
    react: hooks,
    sonner: {
      toast: { error: (m) => notices.push(m), success: (m) => notices.push(m) }
    },
    'next-intl': { useTranslations: () => (key) => key },
    '@ringee/frontend-shared/hooks/use.api': { useApi: () => api },
    '@ringee/frontend-shared/lib/api': { ApiError },
    '@/features/security/store/concurrent-call.store': {
      notifyConcurrentCall: () => {}
    },
    zustand: {
      create: (init) => {
        let state;
        const store = (selector) => selector(state);
        store.getState = () => state;
        state = init((next) => {
          state = {
            ...state,
            ...(typeof next === 'function' ? next(state) : next)
          };
        }, store.getState);
        return store;
      }
    }
  };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText;
    const native = createRequire(file);
    new Function('require', 'module', 'exports', js)(
      (name) => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (!name.startsWith('.')) return native(name);
        return load(path.resolve(path.dirname(file), name + '.ts'));
      },
      module,
      module.exports
    );
    return module.exports;
  }
  overrides['@ringee/dialer-core/engine'] = load(
    'packages/dialer-core/src/engine/state-map.ts'
  );
  const session = load(
    base + 'store/dialer-session.store.ts'
  ).useDialerSessionStore;
  const lead = load(base + 'store/dialer-lead.store.ts').useDialerLeadStore;
  const call = load(base + 'store/dialer-call.store.ts').useDialerCallStore;
  const useSession = load(
    base + 'hooks/use-dialer-session.ts'
  ).useDialerSession;
  const useEvents = load(base + 'hooks/use-dialer-events.ts').useDialerEvents;
  const workspace = component(() => useSession('campaign'));
  const dials = [];
  const events = component(() =>
    useEvents(session.getState().sessionId, (data) => dials.push(data))
  );
  t.after(() => {
    workspace.unmount();
    events.unmount();
  });
  return {
    api,
    ApiError,
    requests,
    notices,
    streams,
    dials,
    session,
    lead,
    call,
    workspace,
    events,
    heartbeat: async (value) => {
      beat = value;
      for (const fn of timers.values()) fn();
      await settle();
    }
  };
}

test('start requests are deduplicated and opt in to waiting for the event stream', async (t) => {
  const f = fixture(t);
  const hook = f.workspace.render();
  await Promise.all([hook.startSession(), hook.startSession()]);
  assert.equal(
    f.requests.filter((r) => r.url === '/dialer/sessions').length,
    1
  );
  assert.equal(f.requests[0].body.waitForEvents, true);
  assert.equal(f.session.getState().awaitingEvents, true);
});

test('a failed stop keeps the active session visible and reports its error', async (t) => {
  const f = fixture(t);
  await f.workspace.render().startSession();
  f.api.delete = async () => {
    throw new Error('stop failed');
  };
  assert.equal(await f.workspace.render().endSession(), false);
  assert.equal(f.session.getState().sessionId, 'session');
  assert.ok(f.notices.includes('stop failed'));
  f.api.delete = async () => {};
});

test('unmount cleanup names the owned incarnation and cannot clear its replacement', async (t) => {
  const f = fixture(t);
  await f.workspace.render().startSession();
  f.session
    .getState()
    .setSession('session', 'campaign', 'progressive', second, true);
  f.workspace.unmount();
  await settle();
  assert.ok(
    f.requests.some(
      (r) => r.method === 'DELETE' && r.url.includes(encodeURIComponent(first))
    )
  );
  assert.equal(f.session.getState().startedAt, second);
});

test('heartbeats distinguish an unattached stream from an ended session and reconcile pauses', async (t) => {
  const f = fixture(t);
  await f.workspace.render().startSession();
  f.workspace.render();
  await f.heartbeat({ status: 'offline', startedAt: first, endedAt: null });
  assert.equal(f.session.getState().sessionId, 'session');
  f.session.getState().setAwaitingEvents(false);
  await f.heartbeat({ status: 'paused', startedAt: first, endedAt: null });
  assert.equal(f.session.getState().status, 'paused');
  await f.heartbeat({ status: 'offline', startedAt: first, endedAt: second });
  assert.equal(f.session.getState().sessionId, null);
});

test('event setup acknowledges the connected session and ignores retired incarnations', async (t) => {
  const f = fixture(t);
  f.session
    .getState()
    .setSession('session', 'campaign', 'progressive', second, true);
  f.events.render();
  await settle();
  const stream = f.streams[0];
  assert.ok(stream.url.includes(encodeURIComponent(second)));
  stream.emit('session.state', {
    status: 'offline',
    reason: 'taken_over',
    sessionStartedAt: first
  });
  stream.emit('call.initiate', { attemptId: 'old', sessionStartedAt: first });
  assert.equal(f.session.getState().startedAt, second);
  assert.equal(f.dials.length, 0);
  stream.emit('session.connected', {
    status: 'ready',
    sessionStartedAt: second
  });
  assert.equal(f.session.getState().awaitingEvents, false);
  stream.emit('session.waiting', {
    reason: 'no_eligible_leads',
    sessionStartedAt: second
  });
  assert.equal(f.session.getState().waitingReason, 'no_eligible_leads');
  stream.emit('lead.assigned', {
    id: 'lead',
    attemptId: 'new',
    contact: {},
    sessionStartedAt: second
  });
  stream.emit('call.initiate', { attemptId: 'new', sessionStartedAt: second });
  assert.equal(f.session.getState().waitingReason, null);
  assert.equal(f.lead.getState().currentLead.id, 'lead');
  assert.equal(f.dials.length, 1);
});

test('reusing a session ID reconnects the event stream for the new incarnation', async (t) => {
  const f = fixture(t);
  f.session
    .getState()
    .setSession('session', 'campaign', 'progressive', first, true);
  f.events.render();
  await settle();
  f.session
    .getState()
    .setSession('session', 'campaign', 'progressive', second, true);
  f.events.render();
  await settle();
  assert.equal(f.streams[0].closed, true);
  assert.equal(f.streams.length, 2);
});

test('a heartbeat or resume response cannot overwrite a newer dial event', async (t) => {
  const f = fixture(t);
  await f.workspace.render().startSession();
  f.workspace.render();
  f.session.getState().setAwaitingEvents(false);
  f.session.getState().setStatus('ready');
  f.api.post = async () => {
    f.session.getState().setStatus('dialing');
    return { status: 'ready', startedAt: first, endedAt: null };
  };
  await f.heartbeat({});
  assert.equal(f.session.getState().status, 'dialing');
  f.session.getState().setStatus('paused');
  f.api.patch = async () => {
    f.session.getState().setStatus('dialing');
    return { status: 'ready' };
  };
  await f.workspace.render().resumeSession();
  assert.equal(f.session.getState().status, 'dialing');
});

test('a call arriving during stop retains its screen and hang-up control', async (t) => {
  const f = fixture(t);
  await f.workspace.render().startSession();
  f.api.delete = async () => {
    f.call.getState().begin('leg', 'attempt');
  };
  assert.equal(await f.workspace.render().endSession(), false);
  assert.equal(f.session.getState().sessionId, 'session');
  assert.equal(f.call.getState().callId, 'leg');
});

test('a reconnect snapshot cannot regress call events already received', async (t) => {
  const f = fixture(t);
  f.session.getState().setSession('session', 'campaign', 'progressive', first);
  f.events.render();
  await settle();
  const stream = f.streams[0];
  stream.emit('session.state', { status: 'dialing', sessionStartedAt: first });
  stream.emit('session.connected', {
    status: 'ready',
    snapshotStale: true,
    sessionStartedAt: first
  });
  assert.equal(f.session.getState().status, 'dialing');
});
