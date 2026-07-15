import { Type } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export type BillingInterval = "month" | "year";

export class CreateCreditCheckoutDto {
  @IsNumber()
  @Min(0.5, { message: "Amount must be at least $0.50" })
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;

  /**
   * Consent to save the card used at checkout for future one-click recharges.
   * Defaults to false server-side; only ever true when the user leaves the
   * consent checkbox checked. Ignored by the saved-card recharge endpoint.
   */
  @IsOptional()
  @IsBoolean()
  savePaymentMethod?: boolean;

  /**
   * Email the Stripe receipt for this top-up is sent to (custom checkout).
   * Defaults to the caller's account email on the client; editable in the form.
   */
  @IsOptional()
  @IsEmail()
  invoiceEmail?: string;
}

/** Change the billing email on the customer (and, if given, a live top-up). */
export class UpdateBillingEmailDto {
  @IsEmail()
  email!: string;

  /** Optional one-time PaymentIntent whose `receipt_email` to update too. */
  @IsOptional()
  @IsString()
  paymentIntentId?: string;
}

/**
 * Apply (or, with a blank `code`, clear) a customer-facing promotion code on a
 * live one-time credit top-up PaymentIntent. Only the CHARGE is reduced — the
 * credited face amount is preserved — so the user pays less for the same credit.
 */
export class ApplyCreditCouponDto {
  @IsString()
  paymentIntentId!: string;

  /** Promotion code as typed by the user; empty string removes the discount. */
  @IsString()
  code!: string;
}

/**
 * Toggle whether the card used on a live one-time top-up is saved for future
 * one-click recharges. Updates the PaymentIntent's `setup_future_usage` in place
 * (no recreation), so the entered card details are preserved.
 */
export class UpdateSavePreferenceDto {
  @IsString()
  paymentIntentId!: string;

  @IsBoolean()
  savePaymentMethod!: boolean;
}

export class CostInformationDto {
  @IsNumber()
  @Min(0)
  monthlyCost!: number;

  @IsString()
  currency!: string;

  @IsNumber()
  @Min(0)
  upfrontCost!: number;
}

export class CreateMonthlyCreditSubscriptionDto {
  @IsNumber()
  @Min(0.5, { message: "Monthly amount must be at least $0.50" })
  amount!: number;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;

  /**
   * Email the recurring Stripe invoices are delivered to (custom checkout).
   * Defaults to the caller's account email on the client; editable in the form.
   */
  @IsOptional()
  @IsEmail()
  invoiceEmail?: string;
}

export class CreateAutoReloadSetupDto {
  @IsNumber()
  @Min(0.5, { message: "Reload amount must be at least $0.50" })
  reloadAmount!: number;

  @IsNumber()
  @Min(1, { message: "Threshold must be at least $1" })
  threshold!: number;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

/**
 * Config-only enable of balance-drop auto-reload. Unlike the old
 * `CreateAutoReloadSetupDto` flow, this does NOT charge the card at setup — it
 * reuses the customer's saved payment method and only charges (off-session)
 * when the balance later drops below the threshold. `consent` must be `true`:
 * it is a SEPARATE, explicit authorization from the one-time "save card"
 * consent, and the server rejects the request without it.
 */
export class EnableAutoReloadDto {
  @IsNumber()
  @Min(1, { message: "Threshold must be at least $1" })
  threshold!: number;

  @IsNumber()
  @Min(0.5, { message: "Reload amount must be at least $0.50" })
  reloadAmount!: number;

  @IsBoolean()
  @Equals(true, {
    message: "You must authorize automatic charges to enable auto-reload.",
  })
  consent!: boolean;
}

/** Edit the amount of an active monthly credit-funding subscription. */
export class UpdateMonthlyFundDto {
  @IsNumber()
  @Min(0.5, { message: "Monthly amount must be at least $0.50" })
  amount!: number;
}

/** Start an embedded `mode:"setup"` session to save/replace a card (no charge). */
export class CreateCardSetupDto {
  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

export class UpdateAutoReloadSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoReloadEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  autoReloadThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  autoReloadAmount?: number;
}

export class RequestCreditDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  workspace?: string;
}

export class CreateOrganizationCheckoutDto {
  /**
   * Billing cadence the user picked for the organization plan. Defaults to
   * "month" when omitted so older clients (and the compact upgrade button)
   * keep working unchanged.
   */
  @IsOptional()
  @IsIn(["month", "year"])
  billingInterval?: BillingInterval;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}

export class CreatePhoneCheckoutDto {
  @IsString()
  numberId!: string;

  /**
   * IGNORED server-side. The checkout price is resolved authoritatively from
   * the provider in `createPhoneCheckout`; this field is kept only optional for
   * backward compatibility with older clients that still send it. Do NOT read
   * it to price anything — that is the price-tampering vector this replaced.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CostInformationDto)
  costInformation?: CostInformationDto;

  @IsOptional()
  @IsString()
  frontendOrigin?: string;
}
