import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

type RateRow = {
  iso: string;
  country: string;
  description: string | null;
  rate: number;
};

type GroupedCountry = {
  name: string;
  iso: string;
  mobile: number[];
  landline: number[];
};

@Injectable()
export class TelnyxRatePerMinuteRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly EXCLUDED_KEYWORDS = [
    "premium",
    "special",
    "voip",
    "rural",
    "satellite",
    "high cost",
    "shared cost",
    "toll free",
    "uan",
    "paging",
    "personal number",
    "special services",
  ];

  private normalizeDescription(description: string | null | undefined): string {
    return (description || "").trim().toLowerCase();
  }

  private shouldExclude(description: string): boolean {
    return this.EXCLUDED_KEYWORDS.some((keyword) =>
      description.includes(keyword),
    );
  }

  private isMobile(description: string): boolean {
    return description.includes("mobile") || description.includes("cellular");
  }

  private isLandline(description: string): boolean {
    return (
      description.includes("fixed") ||
      description.includes("landline") ||
      description.includes("local")
    );
  }

  private getMultiplier(): number {
    const raw = process.env.CALL_PROFIT_MARGIN;
    const parsed = raw ? parseFloat(raw) : 1;

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private applyRateAdjustments(rate: number, multiplier: number): number {
    if (!Number.isFinite(rate)) return 0.012;
    if (rate === 0) return 0.012;
    if (!rate) return 0.012;

    return rate * multiplier;
  }

  private calcStats(rates: number[]) {
    if (!rates.length) {
      return { min: 0.012, max: 0.012, avg: 0.012 };
    }

    const multiplier = this.getMultiplier();
    const adjusted = rates.map((rate) =>
      this.applyRateAdjustments(rate, multiplier),
    );

    const min = Math.min(...adjusted);
    const max = Math.max(...adjusted);
    const avg =
      adjusted.reduce((sum, value) => sum + value, 0) / adjusted.length;

    return {
      min: parseFloat(min.toFixed(4)),
      max: parseFloat(max.toFixed(4)),
      avg: parseFloat(avg.toFixed(4)),
    };
  }

  private classifyRows(rows: RateRow[]) {
    const grouped: Record<string, GroupedCountry> = {};

    for (const row of rows) {
      const iso = row.iso;
      const name = row.country;
      const desc = this.normalizeDescription(row.description);
      const rate = row.rate;

      if (!iso || !name || !Number.isFinite(rate)) continue;
      if (this.shouldExclude(desc)) continue;

      if (!grouped[name]) {
        grouped[name] = {
          name,
          iso,
          mobile: [],
          landline: [],
        };
      }

      if (this.isMobile(desc)) {
        grouped[name].mobile.push(rate);
        continue;
      }

      if (this.isLandline(desc)) {
        grouped[name].landline.push(rate);
        continue;
      }

      // Si no cae claramente en mobile o landline, lo ignoramos
      // para no contaminar el promedio con rutas ambiguas.
    }

    return grouped;
  }

  private buildCountryRate(country: GroupedCountry) {
    const mobileStats = this.calcStats(country.mobile);
    const landlineStats = this.calcStats(country.landline);

    return {
      countryCode: country.iso,
      countryName: country.name,
      currency: "USD",
      mobileMinRatePerMinute: mobileStats.min,
      mobileMaxRatePerMinute: mobileStats.max,
      mobileAvgRatePerMinute: mobileStats.avg,
      landlineMinRatePerMinute: landlineStats.min,
      landlineMaxRatePerMinute: landlineStats.max,
      landlineAvgRatePerMinute: landlineStats.avg,
      provider: "telnyx",
      updatedAt: new Date(),
    };
  }

  async getRates(): Promise<any[]> {
    const rows = await this.prisma.telnyxRatePerMinute.findMany({
      select: {
        iso: true,
        country: true,
        description: true,
        rate: true,
      },
    });

    const grouped = this.classifyRows(rows);
    const result = Object.values(grouped).map((country) =>
      this.buildCountryRate(country),
    );

    return result.sort((a, b) => {
      if (a.countryCode === "US") return -1;
      if (b.countryCode === "US") return 1;
      return a.countryName.localeCompare(b.countryName);
    });
  }

  async getRateByCountry(codeOrName: string): Promise<any | null> {
    const q = codeOrName.trim();

    const rows = await this.prisma.telnyxRatePerMinute.findMany({
      where: {
        OR: [
          { iso: { equals: q, mode: "insensitive" } },
          { country: { equals: q, mode: "insensitive" } },
        ],
      },
      select: {
        iso: true,
        country: true,
        description: true,
        rate: true,
      },
    });

    if (!rows.length) return null;

    const grouped = this.classifyRows(rows);
    const firstCountry = Object.values(grouped)[0];

    if (!firstCountry) return null;

    return this.buildCountryRate(firstCountry);
  }
}
