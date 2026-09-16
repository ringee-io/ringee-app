/**
 * Regenerates the public number-pricing snapshot the marketing country pages
 * are built from.
 *
 *   pnpm --filter backend run generate:number-pricing
 *   -> apps/frontend/src/features/marketing/content/number-pricing.generated.json
 *
 * The prices are produced by the same server code that charges for the real
 * thing (`NumberPricingCatalogService`), so a published page and an invoice
 * cannot drift apart. The output is committed, which makes it the build input
 * of record: the marketing pages are static, need no API at build time, and
 * keep working when the carrier is unreachable.
 *
 * Run it with the environment of the deployment you are publishing prices for
 * — the margins in it end up in the snapshot (`margins`) so a stale or
 * mis-configured run is visible in review. Walking the whole carrier inventory
 * takes a few minutes and only issues read requests.
 */
import "reflect-metadata";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { DatabaseModule } from "@ringee/database";
import { TelephonyModule } from "@ringee/platform";
import {
  NumberPricingCatalogService,
  TelephonyRateService,
} from "@ringee/services";

/**
 * The smallest context that can price the catalog: the carrier adapter and the
 * rate deck, and nothing else. Booting `AppModule` would start the schedulers,
 * queues and webhooks of a running backend — a generator has no business doing
 * that.
 */
@Module({
  imports: [DatabaseModule, TelephonyModule],
  providers: [TelephonyRateService, NumberPricingCatalogService],
})
class NumberPricingModule {}

const OUTPUT_FILE = resolve(
  __dirname,
  "../../frontend/src/features/marketing/content/number-pricing.generated.json",
);

async function main() {
  const context = await NestFactory.createApplicationContext(
    NumberPricingModule,
    { logger: ["warn", "error"] },
  );

  try {
    const catalogService = context.get(NumberPricingCatalogService);

    console.log("Building the public number-pricing catalog…");
    const catalog = await catalogService.buildCatalog();

    const countriesForSale = catalog.countries.filter(
      (country) => country.offers.length > 0,
    );

    mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
    writeFileSync(
      OUTPUT_FILE,
      `${JSON.stringify({ ...catalog, countries: countriesForSale }, null, 2)}\n`,
    );

    const offers = countriesForSale.reduce(
      (total, country) => total + country.offers.length,
      0,
    );
    console.log(
      `Wrote ${countriesForSale.length} countries and ${offers} number types ` +
        `to ${OUTPUT_FILE}\n` +
        `Margins used — call: ${catalog.margins.call}, ` +
        `AI voice agent: ${catalog.margins.aiVoiceAgent}`,
    );
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
