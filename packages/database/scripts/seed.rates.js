import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const filePath = path.resolve("./global_rates.csv");

async function importRates() {
  const results = [];

  console.log("📦 Importando datos desde:", filePath);

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
      const record = {
        iso: row["ISO"]?.trim() || row["ISO Country Code"]?.trim() || "",
        country: row["Country"]?.trim() || "",
        originationPrefixes: row["Origination Prefixes"] || null,
        destinationPrefixes: row["Destination Prefixes"] || null,
        description: row["Description"] || null,
        interval1: row["Interval 1"] ? parseInt(row["Interval 1"]) : null,
        intervalN: row["Interval N"] ? parseInt(row["Interval N"]) : null,
        rate: parseFloat(row["Rate USD"] || row["Rate"]),
      };

      results.push(record);
    })
    .on("end", async () => {
      console.log(`✅ ${results.length} registros cargados del CSV`);

      for (const chunk of chunkArray(results, 100)) {
        await prisma.telnyxRatePerMinute.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }

      console.log("🎯 Importación completada correctamente.");
      await prisma.$disconnect();
    });
}

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

importRates().catch(async (err) => {
  console.error("❌ Error al importar:", err);
  await prisma.$disconnect();
  process.exit(1);
});
