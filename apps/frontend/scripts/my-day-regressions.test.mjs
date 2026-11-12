// Exercise the real hooks and event handlers with deterministic API/hook state.
// This needs no browser, provider credentials, or extra test dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const frontend = 'apps/frontend/src/';

function loader(overrides) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true
      }
    }).outputText;
    const native = createRequire(file);
    new Function('require', 'module', 'exports', js)(
      (name) => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (!name.startsWith('.')) return native(name);
        const base = path.resolve(path.dirname(file), name);
        const resolved = [base + '.ts', base + '.tsx', base + '/index.ts'].find(
          (candidate) => fs.existsSync(candidate)
        );
        return load(resolved);
      },
      module,
      module.exports
    );
    return module.exports;
  }
  return load;
}

const simpleHooks = {
  useState: (value) => [value, () => {}],
  useRef: (current) => ({ current }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn()
};
const intl = {
  useTranslations: () => (key) => key,
  useNow: () => new Date('2026-10-10T15:00:00Z')
};

function builderFixture() {
  const requests = [];
  let members = 0;
  let exists = false;
  let countFails = false;
  let completionFails = false;
  const api = {
    post: async (url) => {
      requests.push(url);
      if (url === '/contact-lists') {
        exists = true;
        return { list: { id: 'first', name: 'My list' } };
      }
      if (url.startsWith('/onboarding/')) {
        if (completionFails) throw new Error('Completion failed');
        return { completed: true, rewardGranted: 1 };
      }
      members++;
      return { added: true };
    },
    get: async () => {
      if (countFails) throw new Error('Count failed');
      return { contactCount: members };
    },
    delete: async (url) => {
      requests.push(`DELETE ${url}`);
      if (!url.endsWith('/empty') || members === 0) exists = false;
    }
  };
  const load = loader({
    react: simpleHooks,
    'next-intl': intl,
    '@ringee/frontend-shared/hooks/use.api': { useApi: () => api },
    '@/features/ai-voice-agents/lib/api-error': {
      describeApiError: (e) => e.message
    },
    '@/features/contact/components/csv-import-fields': {
      appendCsvFormat: (body, format) => {
        if (format !== 'ringee') body.append('format', format);
      }
    }
  });
  const { useFirstListBuilder } = load(
    frontend + 'features/onboarding/hooks/use.first.list.builder.ts'
  );
  return {
    builder: useFirstListBuilder(),
    requests,
    exists: () => exists,
    failCount: (value) => {
      countFails = value;
    },
    failCompletion: (value) => {
      completionFails = value;
    }
  };
}

test('closing after a failed count read keeps the saved contacts and list', async () => {
  const f = builderFixture();
  f.failCount(true);
  await assert.rejects(
    f.builder.build('My list', {
      source: 'typed',
      people: [{ name: 'Ana', phoneNumber: '+14155550100' }]
    }),
    /Count failed/
  );
  await f.builder.discard();
  assert.equal(f.exists(), true);
});

test('failed completion stays failed and retries only the original completion', async () => {
  const f = builderFixture();
  const people = { source: 'contacts', contactIds: ['ana'] };
  f.failCompletion(true);
  await assert.rejects(f.builder.build('My list', people), /Completion failed/);
  f.failCompletion(false);
  const result = await f.builder.build('My list', people);
  assert.equal(result.ok, true);
  assert.equal(result.rewardGranted, 1);
  assert.deepEqual(f.requests, [
    '/contact-lists',
    '/contact-lists/first/contacts',
    '/onboarding/first-list/first',
    '/onboarding/first-list/first'
  ]);
  await f.builder.discard();
  assert.equal(f.exists(), true);
});

function inputIn(tree) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === 'input') return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children.flat() : [children]) {
    const input = inputIn(child);
    if (input) return input;
  }
  return null;
}

test('Enter ignores stale search results and calls a current match', async () => {
  for (const query of ['Bea', 'Ana']) {
    const states = [
      true,
      0,
      {
        term: 'Ana',
        hits: [
          { id: 'ana', name: 'Ana', phoneNumber: '+14155550100', company: null }
        ]
      },
      []
    ];
    const load = loader({
      react: {
        ...simpleHooks,
        forwardRef: (fn) => fn,
        useEffect: () => {},
        useId: () => 'search',
        useImperativeHandle: () => {},
        useState: () => [states.shift(), () => {}]
      },
      'react/jsx-runtime': {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props })
      },
      'next-intl': intl,
      '@ringee/frontend-shared/hooks/use.api': { useApi: () => ({}) },
      '@ringee/frontend-shared/lib/utils': { cn: () => '' },
      // Shared components resolve to .tsx sources Node cannot load here.
      '@ringee/frontend-shared/components/ui/kbd': { Kbd: () => null },
      '@ringee/dialer-core/phone': { normalize: () => null }
    });
    const { CallSearch } = load(
      frontend + 'features/calls/components/my-day/call-search.tsx'
    );
    const calls = [];
    const tree = CallSearch(
      {
        query,
        region: 'US',
        onQueryChange: () => {},
        onDial: async (number) => {
          calls.push(number);
          return true;
        }
      },
      null
    );
    inputIn(tree).props.onKeyDown({ key: 'Enter', preventDefault: () => {} });
    await Promise.resolve();
    assert.deepEqual(calls, query === 'Ana' ? ['+14155550100'] : []);
  }
});

test('assignment loads all membership pages, including the current user on the last page', async () => {
  const pages = [];
  const members = Array.from({ length: 201 }, (_, i) => ({
    publicUserData: { userId: `user-${i}`, firstName: `Person ${i}` }
  }));
  const cells = [];
  const effects = [];
  const load = loader({
    react: {
      useState: (value) => {
        const index = cells.length;
        cells.push(value);
        return [
          value,
          (next) => {
            cells[index] = next;
          }
        ];
      },
      useEffect: (fn) => effects.push(fn)
    },
    '@clerk/nextjs': {
      useOrganization: () => ({
        isLoaded: true,
        organization: {
          getMemberships: async ({ initialPage = 1, pageSize = 10 } = {}) => {
            pages.push(initialPage);
            return {
              data: members.slice(
                (initialPage - 1) * pageSize,
                initialPage * pageSize
              ),
              total_count: members.length
            };
          }
        }
      }),
      useUser: () => ({ user: { id: 'user-200' } })
    },
    './use.api': {
      useApi: () => ({
        get: async (url) =>
          url
            .split('ids=')[1]
            .split(',')
            .map((clerkId) => ({ clerkId, id: `db-${clerkId}` }))
      })
    }
  });
  const { useOrgMembers } = load(
    'packages/frontend-shared/src/hooks/use-org-members.ts'
  );
  useOrgMembers();
  effects.forEach((effect) => effect());
  await new Promise(setImmediate);
  assert.deepEqual(pages, [1, 2, 3]);
  assert.equal(cells[0].length, 201);
  assert.equal(cells[0].at(-1).isCurrentUser, true);
  assert.equal(cells[1], true);
});

test('recovered completion does not mark setup done until the server confirms it', async () => {
  const cells = [
    { completed: false, reward: 0, pendingListId: 'original' },
    false
  ];
  let index = 0;
  let fail = true;
  const requests = [];
  const load = loader({
    react: {
      ...simpleHooks,
      useEffect: () => {},
      useState: () => {
        const current = index++;
        return [
          cells[current],
          (value) => {
            cells[current] = value;
          }
        ];
      }
    },
    '@ringee/frontend-shared/hooks/use.api': {
      useApi: () => ({
        post: async (url) => {
          requests.push(url);
          if (fail) throw new Error('Unavailable');
          return { completed: true, rewardGranted: 1 };
        }
      })
    }
  });
  const { useFirstListOnboarding } = load(
    frontend + 'features/onboarding/hooks/use.first.list.onboarding.ts'
  );
  const state = useFirstListOnboarding();
  await assert.rejects(state.completePending(), /Unavailable/);
  assert.equal(cells[0].completed, false);
  fail = false;
  await state.completePending();
  assert.equal(cells[0].completed, true);
  assert.deepEqual(requests, [
    '/onboarding/first-list/original',
    '/onboarding/first-list/original'
  ]);
});

// ---------------------------------------------------------------------------
// The first-call prompt My day opens on its own (useFirstCallPrompt).
// ---------------------------------------------------------------------------

/** A tiny hook runtime: state, refs and effects that re-run on changed deps. */
function hookRuntime() {
  const cells = [];
  const refs = [];
  const deps = [];
  const cleanups = [];
  let cursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let pending = [];
  const react = {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in cells)) cells[index] = initial;
      return [
        cells[index],
        (next) => {
          cells[index] = typeof next === 'function' ? next(cells[index]) : next;
        }
      ];
    },
    useRef: (current) => {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current };
      return refs[index];
    },
    useEffect: (fn, list) => {
      const index = effectCursor++;
      const before = deps[index];
      if (
        !before ||
        !list ||
        list.some((value, i) => !Object.is(value, before[i]))
      ) {
        deps[index] = list;
        pending.push([index, fn]);
      }
    }
  };
  const render = (hook, props) => {
    cursor = 0;
    refCursor = 0;
    effectCursor = 0;
    pending = [];
    hook(props);
    for (const [index, fn] of pending) {
      cleanups[index]?.();
      cleanups[index] = fn() ?? undefined;
    }
  };
  return { react, render };
}

/** The browser around the hook: storage, open dialogs, timers, call state. */
function promptPage(storage, call = { live: false }) {
  const runtime = hookRuntime();
  const timers = [];
  const page = { overlay: false, timers };
  globalThis.window = {
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {}
  };
  globalThis.document = {
    querySelector: () => (page.overlay ? {} : null)
  };
  globalThis.localStorage = storage;
  const store = (state) => (selector) => selector(state());
  const load = loader({
    react: runtime.react,
    '@/features/dialer/store/dialer-session.store': {
      useDialerSessionStore: store(() => ({ sessionId: null }))
    },
    '../store/call.store': {
      useCallStore: store(() => ({ postCallPhase: false }))
    },
    '../store/dialer.store': {
      useDialerStore: store(() => ({ dialingNumber: null }))
    },
    '../store/inbound-offers.store': {
      useInboundOffersStore: store(() => ({ presented: {} }))
    },
    '../store/telnyx.store': {
      useTelnyxStore: store(() => ({
        activeCall: call.live ? { state: 'active' } : null
      }))
    }
  });
  const prompt = load(
    frontend + 'features/calls/hooks/use.first.call.prompt.ts'
  );
  const opened = [];
  const base = {
    workspace: { userId: 'user_1', orgId: null },
    loaded: true,
    hasWork: false,
    numberInHand: false,
    onOpen: () => opened.push(true)
  };
  page.prompt = prompt;
  page.opened = opened;
  page.show = (props = {}) =>
    runtime.render(prompt.useFirstCallPrompt, { ...base, ...props });
  return page;
}

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value))
  };
}

function withBrowserGlobals(run) {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage
  };
  try {
    return run();
  } finally {
    Object.assign(globalThis, saved);
  }
}

test('first-call prompt: work in hand wins, nothing is decided while loading', () => {
  const { prompt } = withBrowserGlobals(() => promptPage(memoryStorage()));
  const { firstCallPromptStep } = prompt;
  const clear = {
    loaded: true,
    hasWork: false,
    numberInHand: false,
    callSeen: false,
    overlayOpen: false
  };
  assert.equal(firstCallPromptStep(clear), 'open');
  assert.equal(firstCallPromptStep({ ...clear, loaded: false }), 'wait');
  assert.equal(firstCallPromptStep({ ...clear, overlayOpen: true }), 'wait');
  assert.equal(firstCallPromptStep({ ...clear, hasWork: true }), 'skip');
  assert.equal(
    firstCallPromptStep({ ...clear, loaded: false, numberInHand: true }),
    'skip'
  );
  assert.equal(
    firstCallPromptStep({ ...clear, loaded: false, callSeen: true }),
    'skip'
  );
});

test('first-call prompt: a new account sees it once, and not again after a reload', () =>
  withBrowserGlobals(() => {
    const storage = memoryStorage();
    const first = promptPage(storage);
    first.show({ loaded: false });
    assert.equal(first.opened.length, 0, 'waits for everything to load');
    first.show();
    first.show();
    assert.equal(first.opened.length, 1);
    assert.ok(
      storage.values.has('ringee:first-call-prompt:user_1:personal'),
      'remembered per user and workspace'
    );

    // Dismissed, then the page reloads: same browser, fresh page.
    const reloaded = promptPage(storage);
    reloaded.show();
    assert.equal(reloaded.opened.length, 0);

    // Another workspace of the same person is its own first time.
    const org = promptPage(storage);
    org.show({ workspace: { userId: 'user_1', orgId: 'org_1' } });
    assert.equal(org.opened.length, 1);
  }));

test('first-call prompt: an account with work continues, and keeps it for later', () =>
  withBrowserGlobals(() => {
    const storage = memoryStorage();
    const page = promptPage(storage);
    page.show({ hasWork: true });
    // The queue empties during the visit: still nothing in the way.
    page.show({ hasWork: false });
    assert.equal(page.opened.length, 0);
    assert.equal(storage.values.size, 0, 'nothing remembered');
  }));

test('first-call prompt: never over another dialog, but opens once it closes', () =>
  withBrowserGlobals(() => {
    const page = promptPage(memoryStorage());
    page.overlay = true;
    page.show();
    assert.equal(page.opened.length, 0);
    assert.equal(page.timers.length, 1, 'looks again shortly');
    page.overlay = false;
    page.timers.shift()();
    page.show();
    assert.equal(page.opened.length, 1);
  }));

test('first-call prompt: a number to call or a call in this visit keeps it away', () =>
  withBrowserGlobals(() => {
    const storage = memoryStorage();
    const linked = promptPage(storage);
    linked.show({ loaded: false, numberInHand: true });
    linked.show({ numberInHand: false });
    assert.equal(linked.opened.length, 0);

    const call = { live: true };
    const onCall = promptPage(storage, call);
    onCall.show({ loaded: false });
    call.live = false; // hung up and wrapped up before the page settled
    onCall.show();
    assert.equal(onCall.opened.length, 0);
    assert.equal(storage.values.size, 0, 'left for a later visit');
  }));

test('first-call prompt: without storage it still opens only once per page', () =>
  withBrowserGlobals(() => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    };
    const page = promptPage(broken);
    page.show();
    page.show({ hasWork: false });
    assert.equal(page.opened.length, 1);
  }));
