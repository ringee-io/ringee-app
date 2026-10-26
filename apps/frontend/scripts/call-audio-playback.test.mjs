import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const source = new URL(
  '../../../packages/dialer-ui/src/components/active-call-modal.tsx',
  import.meta.url
);
const native = createRequire(import.meta.url);
const js = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX
  }
}).outputText;

function fixture() {
  let elapsed = 0;
  let stateIndex = 0;
  const hooks = {
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useState: (initial) => [stateIndex++ === 0 ? elapsed : initial, () => {}]
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    (name) => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return native(name);
      if (name === '@ringee/dialer-core/store') {
        return { useCallStore: () => ({ bookingPanelOpen: false }) };
      }
      if (name === '../data/context') {
        return {
          useDialer: () => ({
            data: {},
            slots: {},
            recordingSettings: { recordAllCalls: false }
          })
        };
      }
      if (name === '@ringee/frontend-shared/lib/utils') {
        return { cn: (...values) => values.filter(Boolean).join(' ') };
      }
      // Presentational children do not own the modal's audio element.
      return new Proxy({}, { get: (_target, key) => String(key) });
    },
    module,
    module.exports
  );

  function findAudio(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map(findAudio).find(Boolean) ?? null;
    if (node.type === 'audio') return node;
    return findAudio(node.props?.children);
  }

  return (remoteStream, options = {}) => {
    elapsed = options.elapsed ?? 0;
    stateIndex = 0;
    return findAudio(
      module.exports.ActiveCallModal({
        open: true,
        number: '+34910000000',
        isConnected: true,
        remoteStream,
        ...options
      })
    );
  };
}

function playbackElement() {
  const assignments = [];
  let current = null;
  return {
    assignments,
    element: {
      get srcObject() {
        return current;
      },
      set srcObject(stream) {
        // Even assigning the same stream invokes the browser's media load
        // algorithm. Count writes, rather than just checking the final value.
        assignments.push(stream);
        current = stream;
      }
    }
  };
}

test('manual/list call audio stays attached across timer and control renders', () => {
  const render = fixture();
  const stream = {};
  const { element, assignments } = playbackElement();
  let previous;
  for (let elapsed = 0; elapsed < 6; elapsed++) {
    const audio = render(stream, { elapsed, isMuted: elapsed % 2 === 1 });
    previous?.props.ref(null);
    audio.props.ref(element);
    previous = audio;
  }
  assert.deepEqual(assignments, [stream]);
});

test('a replacement stream or remounted audio element still receives audio', () => {
  const render = fixture();
  const first = {};
  const replacement = {};
  const playback = playbackElement();
  render(first).props.ref(playback.element);
  render(replacement).props.ref(playback.element);
  render(replacement, { elapsed: 1 }).props.ref(playback.element);
  assert.deepEqual(playback.assignments, [first, replacement]);

  const remounted = playbackElement();
  render(replacement).props.ref(remounted.element);
  assert.deepEqual(remounted.assignments, [replacement]);
});

test('ringing, wrap-up and hosts without a stream do not render remote audio', () => {
  const render = fixture();
  assert.equal(render({}, { isConnected: false, elapsed: 15 }), null);
  assert.equal(render({}, { isPostCall: true }), null);
  assert.equal(render(null), null);
});
