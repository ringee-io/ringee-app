/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OfferAdminService } from "./offer-admin.service";

function makeService(params: {
  offer?: { id: string; slug: string; name: string } | null;
  participations?: number;
}) {
  const deleted: string[] = [];

  const offers = {
    async findByIdOrSlug() {
      return params.offer === undefined
        ? { id: "offer-1", slug: "an-offer", name: "An offer" }
        : params.offer;
    },
    async delete(id: string) {
      deleted.push(id);
    },
  };

  const participations = {
    async countByOffer() {
      return params.participations ?? 0;
    },
  };

  return {
    deleted,
    service: new OfferAdminService(
      offers as never,
      participations as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("OfferAdminService.remove", () => {
  it("deletes an offer nobody has touched", async () => {
    const { service, deleted } = makeService({ participations: 0 });
    assert.deepEqual(await service.remove("offer-1"), { deleted: true });
    assert.deepEqual(deleted, ["offer-1"]);
  });

  it("refuses to delete an offer with participations", async () => {
    // Participations cascade with the offer, taking the reward audit trail
    // with them — archiving is the correct way to retire a live offer.
    const { service, deleted } = makeService({ participations: 3 });
    await assert.rejects(service.remove("offer-1"), /cannot be deleted/i);
    await assert.rejects(service.remove("offer-1"), /archive it instead/i);
    assert.deepEqual(deleted, []);
  });

  it("404s on an unknown offer", async () => {
    const { service } = makeService({ offer: null });
    await assert.rejects(service.remove("nope"), /not found/i);
  });
});
