/// <reference types="node" />

/**
 * Seeds the offer catalogue.
 *
 * Every offer here is pure configuration — the same JSON the backoffice writes
 * — so this file is a convenience for bootstrapping environments, not a place
 * where offer behaviour lives. Re-running it is safe: offers are upserted by
 * slug.
 *
 *   npx dotenv -e ../../.env -- npx ts-node prisma/seeds/offers.seed.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedOffer {
  slug: string;
  data: Omit<Prisma.OfferUncheckedCreateInput, "slug">;
}

const OFFERS: SeedOffer[] = [
  {
    slug: "customer-review",
    data: {
      name: "Customer review reward",
      internalName: "Trustpilot review — launch",
      title: "Earn Ringee credits for your review",
      description: "Share your experience and get credits on your account.",
      status: "ACTIVE",
      placement: "TOP_BANNER",
      priority: 100,
      audienceType: "BOTH",

      // Two gates for organizations: the team must have real usage, and the
      // individual member must have contributed to it. Freelancers get the
      // single personal threshold.
      eligibilityConfig: {
        personal: {
          all: [{ field: "user.totalCalls", operator: "gte", value: 300 }],
        },
        organization: {
          workspace: {
            all: [
              { field: "organization.totalCalls", operator: "gte", value: 300 },
            ],
          },
          member: {
            all: [{ field: "user.totalCalls", operator: "gte", value: 50 }],
          },
        },
      },

      // Nothing here says "Trustpilot" to the engine: it is a URL submission
      // restricted to a domain. Swapping the domain retargets the offer.
      actionConfig: {
        type: "EXTERNAL_URL_SUBMISSION",
        field: "url",
        allowedDomains: ["trustpilot.com"],
        unique: true,
        // Where the user goes to do the thing, before pasting the result back.
        href: "https://www.trustpilot.com/review/ringee.io",
        hrefLabel: "Write your review",
        fieldLabel: "Link to your review",
        // The permalink of THEIR review (/reviews/<id>) — not the page where
        // reviews are written (/review/ringee.io), which is what `href` is.
        fieldPlaceholder:
          "https://www.trustpilot.com/reviews/6a8471be88e1d6f606c9f0e9",
        helpText:
          "Write your review, then open it and copy its link as shown above. We verify it before releasing your credits.",
        helpImage: "/trustpilot-review-link.png",
        helpImageAlt:
          "Trustpilot review with the share menu open, showing where to copy the review link",
        submitLabel: "Submit review",
      },

      rewardConfig: {
        personal: {
          type: "CREDIT",
          amount: 10,
          currency: "USD",
          destination: "PERSONAL_WORKSPACE",
        },
        organization: {
          type: "CREDIT",
          amount: 5,
          currency: "USD",
          destination: "ORGANIZATION",
        },
      },

      displayConfig: {
        personal: {
          title: "Earn ${{rewardAmount}} in Ringee credits",
          description: "You've unlocked a new Ringee offer.",
          ctaLabel: "Claim ${{rewardAmount}}",
        },
        organization: {
          title: "Earn up to ${{potentialReward}} in Ringee credits",
          description:
            "{{remainingParticipants}} team members are currently eligible.",
          ctaLabel: "View offer",
        },
      },

      frequencyConfig: {
        mode: "ONCE_PER_USER",
        dismissible: true,
        showAgainAfterHours: 168,
      },

      maxClaimsPerUser: 1,
      requiresApproval: true,
    },
  },
];

async function main(): Promise<void> {
  for (const offer of OFFERS) {
    const saved = await prisma.offer.upsert({
      where: { slug: offer.slug },
      create: { ...offer.data, slug: offer.slug },
      update: offer.data,
    });
    console.log(`✔ offer "${saved.slug}" (${saved.status}) → ${saved.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
