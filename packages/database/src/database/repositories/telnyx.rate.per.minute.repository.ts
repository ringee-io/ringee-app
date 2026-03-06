import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class TelnyxRatePerMinuteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRates(): Promise<any[]> {
    const rows = await this.prisma.telnyxRatePerMinute.findMany({
      select: {
        iso: true,
        country: true,
        description: true,
        rate: true,
      },
    });

    const grouped: Record<
      string,
      { name: string; mobile: number[]; landline: number[]; iso: string }
    > = {};

    for (const row of rows) {
      const iso = row.iso;
      const name = row.country;
      const desc = (row.description || "").toLowerCase();
      const rate = row.rate;

      if (!iso || isNaN(rate)) continue;
      if (!grouped[name])
        grouped[name] = { name, mobile: [], landline: [], iso };

      if (desc.includes("mobile") || desc.includes("cellular")) {
        grouped[name].mobile.push(rate);
      } else if (
        desc.includes("fixed") ||
        desc.includes("landline") ||
        desc.includes("local") ||
        desc.includes("zone") ||
        desc.includes("high cost")
      ) {
        grouped[name].landline.push(rate);
      } else {
        grouped[name].landline.push(rate); // default
      }
    }

    const calcStats = (arr: number[]) => {
      if (!arr.length) return { min: 0, max: 0, avg: 0 };

      const adjusted = arr.map((v) => (v === 0 ? 0.02 : v * 1.5));

      const min = Math.min(...adjusted);
      const max = Math.max(...adjusted);
      const avg = adjusted.reduce((a, b) => a + b, 0) / adjusted.length;
      return {
        min: parseFloat(min.toFixed(4)),
        max: parseFloat(max.toFixed(4)),
        avg: parseFloat(avg.toFixed(4)),
      };
    };

    const result: any[] = Object.entries(grouped).map(
      ([name, { name: countryName, mobile, landline, iso }]) => {
        const m = calcStats(mobile);
        const l = calcStats(landline);

        return {
          countryCode: iso,
          countryName: countryName,
          currency: "USD",
          mobileMinRatePerMinute: m.min,
          mobileMaxRatePerMinute: m.max,
          mobileAvgRatePerMinute: m.avg,
          landlineMinRatePerMinute: l.min,
          landlineMaxRatePerMinute: l.max,
          landlineAvgRatePerMinute: l.avg,
          provider: "telnyx",
          updatedAt: new Date(),
        };
      },
    );

    const eeuuFirst = result.find((r) => r.countryCode === "US")!;

    eeuuFirst.mobileAvgRatePerMinute = 0.02;
    eeuuFirst.landlineAvgRatePerMinute = 0.02;

    const filtered = result.filter((r) => r.countryCode !== "US");
    const sorted = filtered.sort((a, b) =>
      a.countryName.localeCompare(b.countryName),
    );

    return [eeuuFirst, ...sorted];
  }

  async getRateByCountry(codeOrName: string): Promise<any | null> {
    const q = codeOrName.toLowerCase();

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

    const mobile = rows
      .filter((r: any) =>
        (r.description || "").toLowerCase().includes("mobile"),
      )
      .map((r: any) => r.rate);

    const landline = rows
      .filter(
        (r: any) => !(r.description || "").toLowerCase().includes("mobile"),
      )
      .map((r: any) => r.rate);

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      countryCode: rows[0].iso,
      countryName: rows[0].country,
      currency: "USD",
      mobileMinRatePerMinute: Math.min(...mobile),
      mobileMaxRatePerMinute: Math.max(...mobile),
      mobileAvgRatePerMinute: parseFloat(avg(mobile).toFixed(4)),
      landlineMinRatePerMinute: Math.min(...landline),
      landlineMaxRatePerMinute: Math.max(...landline),
      landlineAvgRatePerMinute: parseFloat(avg(landline).toFixed(4)),
      provider: "telnyx",
      updatedAt: new Date(),
    };
  }
}
