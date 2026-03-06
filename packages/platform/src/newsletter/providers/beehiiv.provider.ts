import { NewsletterInterface } from "../newsletter.interface";

export class BeehiivProvider implements NewsletterInterface {
  name = "beehiiv";
  async register(email: string) {
    try {
      const body = {
        email,
        reactivate_existing: false,
        send_welcome_email: true,
        utm_source: "ringee_platform",
      };

      await fetch(
        `https://api.beehiiv.com/v2/publications/${process.env.BEEHIIVE_PUBLICATION_ID}/subscriptions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${process.env.BEEHIIVE_API_KEY}`,
          },
          body: JSON.stringify(body),
        },
      );
    } catch (error) {
      console.error("Error registering to Beehiiv newsletter:", error);
    }
  }
}
