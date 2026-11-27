/// <reference types="node" />
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Module, Optional, type INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DispatchModule, ProviderDispatchService } from "@ringee/platform";
import { AppModule } from "./app.module";

/**
 * The API places calls (the dialer, the public API, MCP, webhooks), so it must
 * reach the Telnyx outbound pacing (CPS-001). The classes that dial take
 * `ProviderDispatchService` as `@Optional()`, so that a script or a test can
 * build them alone; the price is that a root which fails to wire it would dial
 * unpaced instead of refusing to start. (Today the dispatch admin services in
 * `ServicesModule` still stop such a root at boot; this does not rely on that.)
 * This resolves the API's real module graph and asserts that every class that
 * declares the dispatch service is wired to the one in `DispatchModule`. The
 * worker has the same check in its own app (`apps/orchestrator`): each process
 * owns its module instance and shares the budget through Redis, so one root's
 * wiring says nothing about the other's.
 *
 * Nest's preview mode resolves each constructor dependency but runs no
 * constructor, factory or lifecycle hook: nothing connects to Redis, PostgreSQL
 * or Temporal, and the dialer loop that `AppModule.onApplicationBootstrap`
 * starts stays stopped.
 */

interface GraphEdge {
  metadata: {
    sourceModuleName: string;
    sourceClassName: string;
    targetModuleName: string;
    targetClassName: string;
  };
}

interface NestInternals {
  container: {
    serializedGraph: { toJSON(): { edges: Record<string, GraphEdge> } };
    getModules(): Map<
      string,
      {
        name: string;
        metatype: unknown;
        providers: Map<unknown, { metatype?: unknown }>;
      }
    >;
  };
}

const resolve = (root: unknown) =>
  NestFactory.createApplicationContext(root as never, {
    preview: true,
    snapshot: true,
    logger: false,
    // Throw an unresolved dependency instead of exiting the process with no message.
    abortOnError: false,
  });

function inspect(app: INestApplicationContext) {
  const { container } = app as unknown as NestInternals;
  const modules = [...container.getModules().values()];
  const wired = new Set(
    Object.values(container.serializedGraph.toJSON().edges)
      .filter(
        ({ metadata }) =>
          metadata.targetModuleName === DispatchModule.name &&
          metadata.targetClassName === ProviderDispatchService.name,
      )
      .map(
        ({ metadata }) =>
          `${metadata.sourceModuleName}.${metadata.sourceClassName}`,
      ),
  );
  // Every provider whose constructor declares the dispatch service.
  const consumers = modules.flatMap((module) =>
    [...module.providers.values()]
      .map((wrapper) => wrapper.metatype)
      .filter(
        (type): type is new (...args: never[]) => unknown =>
          typeof type === "function" &&
          (
            (Reflect.getMetadata("design:paramtypes", type) as
              | unknown[]
              | undefined) ?? []
          ).includes(ProviderDispatchService),
      )
      .map((type) => `${module.name}.${type.name}`),
  );
  return {
    consumers,
    unwired: consumers.filter((consumer) => !wired.has(consumer)),
    dispatchModules: modules.filter(
      (module) => module.metatype === DispatchModule,
    ),
    providers: modules.filter((module) =>
      module.providers.has(ProviderDispatchService),
    ),
  };
}

describe("the API's module graph", () => {
  let app: INestApplicationContext;
  before(async () => {
    app = await resolve(AppModule);
  });
  after(() => app.close());

  it("registers the outbound dispatch module, once, with one dispatch service", () => {
    const { dispatchModules, providers } = inspect(app);
    assert.equal(dispatchModules.length, 1);
    assert.equal(providers.length, 1);
    assert.equal(providers[0]?.name, DispatchModule.name);
  });

  it("wires every class that declares the dispatch service to that one", () => {
    const { consumers, unwired } = inspect(app);
    // Without these the scan below proves nothing: they are what dials.
    for (const dialer of [
      "TelnyxModule.TelnyxClient",
      "ServicesModule.CallService",
      "ServicesModule.VoiceAgentCallService",
      "ServicesModule.DialerOrchestrationService",
    ]) {
      assert.ok(
        consumers.includes(dialer),
        `${dialer} no longer declares the dispatch service`,
      );
    }
    assert.deepEqual(unwired, []);
  });
});

describe("what this check can see", () => {
  class Dialer {
    constructor(@Optional() readonly dispatch?: ProviderDispatchService) {}
  }
  @Module({ providers: [Dialer] })
  class RootWithoutDispatch {}
  @Module({ imports: [DispatchModule], providers: [Dialer] })
  class RootWithDispatch {}

  it("reports an optional consumer that nothing wires, the failure that boots silently", async () => {
    const app = await resolve(RootWithoutDispatch);
    try {
      assert.deepEqual(inspect(app).unwired, ["RootWithoutDispatch.Dialer"]);
    } finally {
      await app.close();
    }
  });

  it("and is satisfied once the dispatch module is part of the root", async () => {
    const app = await resolve(RootWithDispatch);
    try {
      const { consumers, unwired } = inspect(app);
      assert.deepEqual(consumers, ["RootWithDispatch.Dialer"]);
      assert.deepEqual(unwired, []);
    } finally {
      await app.close();
    }
  });
});
