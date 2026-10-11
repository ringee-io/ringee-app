import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/features/calls/components/call-quality-monitor.tsx'
);

// Exercise the real component with an effect scheduler. Provider calls and
// localized rendering are stubs; subscription cleanup and state remain real.
function fixture() {
  let cursor = 0;
  let stateWrites = 0;
  const cells = [];
  const pending = [];
  const subscriptions = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      cells[index] ??= { value: initial };
      return [
        cells[index].value,
        (value) => {
          stateWrites += 1;
          cells[index].value =
            typeof value === 'function' ? value(cells[index].value) : value;
        }
      ];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = cells[index];
      if (
        previous &&
        deps.every((dep, i) => Object.is(dep, previous.deps[i]))
      ) {
        return;
      }
      pending.push(() => {
        previous?.cleanup?.();
        cells[index] = { deps, cleanup: effect() };
      });
    }
  };
  const overrides = {
    react,
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props })
    },
    '@ringee/dialer-core/engine': {
      monitorCallQuality(call, callback) {
        const subscription = { call, callback, stops: 0 };
        subscriptions.push(subscription);
        return () => {
          subscription.stops += 1;
        };
      }
    },
    '@ringee/dialer-ui': { CallQualityIndicator: 'quality-readout' },
    'next-intl': {
      useTranslations: () => (key, values) =>
        values?.quality ? `${key}:${values.quality}` : (values?.value ?? key),
      useFormatter: () => ({ number: (value) => String(value) })
    }
  };
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
  new Function('require', 'module', 'exports', js)(
    (name) => {
      assert.ok(
        Object.hasOwn(overrides, name),
        `Unexpected dependency: ${name}`
      );
      return overrides[name];
    },
    module,
    module.exports
  );
  return {
    subscriptions,
    get stateWrites() {
      return stateWrites;
    },
    render(props) {
      cursor = 0;
      const output = module.exports.CallQualityMonitor(props);
      while (pending.length) pending.shift()();
      return output;
    },
    unmount() {
      for (const cell of cells) cell.cleanup?.();
    }
  };
}

function call(id) {
  return {
    id,
    state: 'active',
    hangup() {
      assert.fail('A quality readout must never control the call');
    }
  };
}

function sample(rating, rttMs) {
  return {
    timestamp: 1,
    rttMs,
    jitterMs: 2,
    packetLossPercent: 0,
    outboundRttMs: null,
    outboundJitterMs: null,
    outboundPacketLossPercent: null,
    rating
  };
}

test('quality monitoring starts only for a connected call and stays local', () => {
  const f = fixture();
  const activeCall = call('a');
  assert.equal(f.render({ call: activeCall, connected: false }), null);
  assert.equal(f.subscriptions.length, 0);

  const waiting = f.render({ call: activeCall, connected: true });
  assert.equal(waiting.props.statusText, 'status:unknown');
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.subscriptions[0].call, activeCall);

  f.subscriptions[0].callback(sample('good', 40));
  const measured = f.render({ call: activeCall, connected: true });
  assert.equal(measured.props.tone, 'positive');
  assert.equal(measured.props.metrics[0].value, '40');
  assert.equal(measured.props.metrics[3].value, 'unavailable');
  assert.equal(f.subscriptions.length, 1);
  f.unmount();
  assert.equal(f.subscriptions[0].stops, 1);
});

test('changing calls clears the previous reading and rejects late samples', () => {
  const f = fixture();
  const first = call('a');
  const second = call('b');
  f.render({ call: first, connected: true });
  f.subscriptions[0].callback(sample('good', 40));
  f.render({ call: first, connected: true });

  const next = f.render({ call: second, connected: true });
  assert.equal(next.props.statusText, 'status:unknown');
  assert.equal(f.subscriptions[0].stops, 1);
  assert.equal(f.subscriptions[1].call, second);
  const writes = f.stateWrites;
  f.subscriptions[0].callback(sample('poor', 900));
  assert.equal(f.stateWrites, writes);

  f.subscriptions[1].callback(sample('fair', 180));
  const fresh = f.render({ call: second, connected: true });
  assert.equal(fresh.props.statusText, 'status:fair');
  assert.equal(fresh.props.metrics[0].value, '180');
  f.unmount();
  assert.equal(f.subscriptions[1].stops, 1);
});

test('ending or disconnecting a call stops monitoring and hides its metrics', () => {
  const f = fixture();
  const activeCall = call('a');
  f.render({ call: activeCall, connected: true });
  f.subscriptions[0].callback(sample('poor', 400));
  assert.equal(f.render({ call: activeCall, connected: false }), null);
  assert.equal(f.subscriptions[0].stops, 1);
  const writes = f.stateWrites;
  f.subscriptions[0].callback(sample('good', 20));
  assert.equal(f.stateWrites, writes);

  const resumed = f.render({ call: activeCall, connected: true });
  assert.equal(resumed.props.statusText, 'status:unknown');
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.render({ call: null, connected: false }), null);
  assert.equal(f.subscriptions[1].stops, 1);
  f.unmount();
  assert.equal(f.subscriptions[1].stops, 1);
});

test('unmounting rejects a pending provider sample without updating state', () => {
  const f = fixture();
  f.render({ call: call('a'), connected: true });
  f.unmount();
  assert.equal(f.subscriptions[0].stops, 1);
  const writes = f.stateWrites;
  f.subscriptions[0].callback(sample('good', 30));
  assert.equal(f.stateWrites, writes);
});
