import { NewsletterInterface } from "../newsletter.interface";

export class EmailEmptyProvider implements NewsletterInterface {
  name = "empty";
  // No newsletter configured: a no-op, and the subscriber's email is not logged.
  async register(_email: string) {}
}
