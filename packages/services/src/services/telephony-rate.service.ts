import { Injectable } from "@nestjs/common";
import { TelnyxRatePerMinuteRepository } from "@ringee/database";
import { TelephonyCountryRate } from "@ringee/platform";

/**
 * Per-country calling rates as shown on the public pricing page.
 *
 * These are read from Ringee's own cached table, NOT from the carrier at
 * request time — the table is refreshed out of band. Distinct from
 * `TelephonyService.getRates()`, which asks the provider directly.
 */
@Injectable()
export class TelephonyRateService {
  constructor(
    private readonly ratePerMinuteRepository: TelnyxRatePerMinuteRepository,
  ) {}

  listRates(): Promise<TelephonyCountryRate[]> {
    return this.ratePerMinuteRepository.getRates();
  }

  findRateByCountry(codeOrName: string): Promise<TelephonyCountryRate | null> {
    return this.ratePerMinuteRepository.getRateByCountry(codeOrName);
  }
}
