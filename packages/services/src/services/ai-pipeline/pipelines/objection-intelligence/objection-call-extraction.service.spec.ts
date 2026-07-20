/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dynamicClusterKey,
  parseSemanticObjections,
  validateSemanticObjections,
} from "./objection-semantic";

describe("dynamic objection extraction helpers", () => {
  it("preserves validated multilingual semantic evidence", () => {
    const parsed = parseSemanticObjections([
      {
        clusterKey: "presupuesto_congelado",
        label: "Presupuesto congelado",
        underlyingConcern: "No puede comprometer gasto este trimestre",
        evidenceExcerpt: "No tenemos presupuesto hasta septiembre",
        sellerResponseExcerpt: "Podemos comenzar después del verano",
        resolution: "handled",
        confidence: 0.94,
      },
    ]);

    assert.deepEqual(parsed, [
      {
        clusterKey: "presupuesto_congelado",
        label: "Presupuesto congelado",
        underlyingConcern: "No puede comprometer gasto este trimestre",
        evidenceExcerpt: "No tenemos presupuesto hasta septiembre",
        sellerResponseExcerpt: "Podemos comenzar después del verano",
        resolution: "handled",
        confidence: 0.94,
      },
    ]);
  });

  it("creates stable keys for Latin and non-Latin labels", () => {
    assert.equal(
      dynamicClusterKey("Presupuesto congelado"),
      "presupuesto_congelado",
    );
    const japanese = dynamicClusterKey("予算が凍結されています");
    assert.match(japanese, /^objection_[a-z0-9]+$/);
    assert.equal(japanese, dynamicClusterKey("予算が凍結されています"));
  });

  it("ignores malformed stored objections", () => {
    assert.deepEqual(
      parseSemanticObjections([
        null,
        { clusterKey: "missing_evidence", label: "Missing evidence" },
      ]),
      [],
    );
  });

  it("rejects invented evidence and removes an invented seller quote", () => {
    const catalog = new Map<string, string>();
    const transcript = [
      "Contact: No tenemos presupuesto hasta septiembre",
      "Agent: Podemos retomar la conversación ese mes",
    ].join("\n");
    const parsed = validateSemanticObjections(
      {
        objections: [
          {
            clusterKey: "",
            label: "Presupuesto aplazado",
            underlyingConcern: "El gasto está bloqueado temporalmente",
            evidenceExcerpt: "No tenemos presupuesto hasta septiembre",
            sellerResponseExcerpt: "Le garantizo un descuento del 50%",
            resolution: "handled",
            confidence: 0.91,
          },
          {
            clusterKey: "",
            label: "Integración inexistente",
            underlyingConcern: "Necesita Salesforce",
            evidenceExcerpt: "No se integra con Salesforce",
            resolution: "killed",
            confidence: 0.99,
          },
        ],
      },
      catalog,
      transcript,
    );

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.label, "Presupuesto aplazado");
    assert.equal(parsed[0]?.sellerResponseExcerpt, undefined);
  });
});
