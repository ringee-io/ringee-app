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
