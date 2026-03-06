import { create } from 'zustand';

export type Rate = {
  countryCode: string;
  countryName: string;
  currency: string;
  mobileAvgRatePerMinute: number;
  landlineAvgRatePerMinute: number;
  provider: string;
  updatedAt: string;
};

type RateStore = {
  rates: Rate[];
  setRates: (rates: Rate[]) => void;
  getRateByCountry: (code: string) => Rate | undefined;
};

export const useRateStore = create<RateStore>((set, get) => ({
  rates: [],
  setRates: (rates) => set({ rates }),
  getRateByCountry: (code) => get().rates.find((r) => r.countryCode === code)
}));
