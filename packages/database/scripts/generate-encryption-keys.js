import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function generateKey() {
    return randomBytes(32).toString("hex"); // 256-bit key
}

async function main() {
    console.log("🔐 Generating encryption keys...");

    // 1. USERS WITHOUT KEY
    const usersWithoutKey = await prisma.user.findMany({
        where: { encryptionKey: null },
        select: { id: true },
    });

    console.log(`Users without key: ${usersWithoutKey.length}`);

    for (const user of usersWithoutKey.slice(0, 100)) {
        await prisma.user.update({
            where: { id: user.id },
            data: { encryptionKey: generateKey() },
        });
    }

    // 2. ORGANIZATIONS WITHOUT KEY
    const orgsWithoutKey = await prisma.organization.findMany({
        where: { encryptionKey: null },
        select: { id: true },
    });

    console.log(`Organizations without key: ${orgsWithoutKey.length}`);

    for (const org of orgsWithoutKey.slice(0, 100)) {
        await prisma.organization.update({
            where: { id: org.id },
            data: { encryptionKey: generateKey() },
        });
    }

    console.log("✅ Finished generating encryption keys.");
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
