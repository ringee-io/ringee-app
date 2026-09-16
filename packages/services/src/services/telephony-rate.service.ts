import { Injectable } from "@nestjs/common";
import { apiConfiguration } from "@ringee/configuration";
import { TelnyxRatePerMinuteRepository } from "@ringee/database";
import { TelephonyCountryRate } from "@ringee/platform";

import { summarizeCountryRates } from "./country-rate.util";

/**
 * Per-country calling prices, as shown in the dashboard's rate calculator and
 * on the public country pages.
 *
 * These are read from Ringee's own imported rate deck, NOT from the carrier at
 * request time — the table is refreshed out of band. Distinct from
 * `TelephonyService.getRates()`, which asks the provider directly.
 *
 * The customer price is the deck's cost × `CALL_PROFIT_MARGIN`, the same
 * multiplier call settlement applies (BILL-013), so a quote and a charge can
 * never drift apart.
 */
@Injectable()
export class TelephonyRateService {
  constructor(
    private readonly ratePerMinuteRepository: TelnyxRatePerMinuteRepository,
  ) {}

  async listRates(): Promise<TelephonyCountryRate[]> {
    const routes = await this.ratePerMinuteRepository.findRoutes();
    return summarizeCountryRates(routes, apiConfiguration.CALL_PROFIT_MARGIN);
  }

  async findRateByCountry(
    codeOrName: string,
  ): Promise<TelephonyCountryRate | null> {
    const routes = await this.ratePerMinuteRepository.findRoutes(codeOrName);
    const [rate] = summarizeCountryRates(
      routes,
      apiConfiguration.CALL_PROFIT_MARGIN,
    );
    return rate ?? null;
  }
}
