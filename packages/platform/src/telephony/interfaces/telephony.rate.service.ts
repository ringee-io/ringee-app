import { TelephonyCountryRate } from "./telephony.rate";

export interface TelephonyRateService {
  getRates(): Promise<TelephonyCountryRate[]>;
  getRateByCountry(codeOrName: string): Promise<TelephonyCountryRate | null>;
}
