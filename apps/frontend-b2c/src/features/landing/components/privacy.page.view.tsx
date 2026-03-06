import { Separator } from '@ringee/frontend-shared/components/ui/separator';

export default function PrivacyPageView() {
  return (
    <>
      <section className='text-muted-foreground mx-auto max-w-4xl px-6 py-16 text-base leading-relaxed'>
        <h1 className='text-foreground mb-4 text-4xl font-bold'>
          Privacy Policy
        </h1>
        <p className='text-muted-foreground mb-10 text-sm'>
          Last updated: November 2, 2025
        </p>

        <p className='mb-6'>
          Ringee.io (“Ringee”, “we”, “our”, “us”) provides browser-based voice
          calling services that let you make and receive calls, rent numbers,
          and manage credits. This Privacy Policy explains what information we
          collect, how we use it, and how we protect it. By using our service,
          you agree to the terms below.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          1. Data We Collect
        </h2>
        <p className='mb-3'>
          We collect the minimum amount of data required to operate the service
          effectively and securely:
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>
            <strong>Account information:</strong> email, password, and profile
            settings (such as preferred country code).
          </li>
          <li>
            <strong>Calling details:</strong> numbers dialed, duration,
            timestamps, and connection quality. Audio is recorded only if you
            enable call recording.
          </li>
          <li>
            <strong>Phone numbers:</strong> numbers you rent or verify for
            caller ID and inbound routing.
          </li>
          <li>
            <strong>Billing and payments:</strong> transaction data and partial
            card details. Payments are processed securely via third-party
            providers; Ringee never stores full card numbers.
          </li>
          <li>
            <strong>Usage data:</strong> login times, IP address, and actions in
            your dashboard. This helps detect fraud and maintain stability.
          </li>
        </ul>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          2. How We Use This Information
        </h2>
        <p className='mb-3'>
          We process collected data only to operate, secure, and improve
          Ringee.io:
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>To connect and manage calls and phone numbers.</li>
          <li>To process payments and maintain accurate billing records.</li>
          <li>To detect and prevent fraudulent or abusive use.</li>
          <li>To monitor call quality and improve service reliability.</li>
          <li>To comply with telecom regulations and applicable law.</li>
        </ul>
        <p className='mb-6'>
          We never sell your personal data or use it for third-party
          advertising.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          3. When We Share Data
        </h2>
        <p className='mb-3'>
          We share information only when it’s required for the service to work
          or by law:
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>
            <strong>Telecom carriers:</strong> to connect your calls to external
            phone networks.
          </li>
          <li>
            <strong>Payment processors:</strong> to handle credit purchases and
            prevent fraud.
          </li>
          <li>
            <strong>Legal obligations:</strong> we may provide limited account
            or call data when required by a lawful request.
          </li>
        </ul>
        <p className='text-foreground mb-6 font-medium'>
          Ringee.io does not sell or rent your data to any third party — ever.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          4. Call and Usage Records
        </h2>
        <p className='mb-3'>
          We store essential call data for billing and compliance:
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>Numbers involved in the call</li>
          <li>Call start and end time</li>
          <li>Duration and connection status</li>
        </ul>
        <p className='mb-3'>
          This data allows us to ensure accurate billing, detect abuse, and
          comply with telecommunications laws. Call recordings (if enabled) are
          stored encrypted and can be deleted from your dashboard.
        </p>
        <p className='mb-6'>
          We keep records only as long as needed for legal, billing, or security
          reasons.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          5. Your Rights
        </h2>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>
            <strong>Access:</strong> view your usage, call logs, and billing
            history anytime.
          </li>
          <li>
            <strong>Correction:</strong> update account info such as your email
            or verified numbers.
          </li>
          <li>
            <strong>Deletion:</strong> request deletion of your recordings or
            account. Certain data may remain for compliance.
          </li>
          <li>
            <strong>Export:</strong> request an export of your call or billing
            data in a portable format.
          </li>
        </ul>
        <p className='mb-6'>
          To exercise any of these rights, contact us at{' '}
          <a
            href='mailto:hello@ringee.io'
            className='text-primary underline underline-offset-4'
          >
            hello@ringee.io
          </a>
          .
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          6. Security
        </h2>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>All sensitive data is encrypted in transit and at rest.</li>
          <li>
            Payment data is handled exclusively by certified processors (Stripe,
            PayPal).
          </li>
          <li>
            Internal access is strictly limited and regularly audited for
            safety.
          </li>
        </ul>
        <p className='mb-6'>
          While no system is completely immune to risk, we continuously update
          our security practices to protect your information.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          7. Pay-As-You-Go Model
        </h2>
        <p className='mb-6'>
          Ringee.io does not use recurring subscriptions. You only pay for the
          minutes and numbers you use. Your call and payment history is retained
          so you can view invoices and credit usage at any time.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          8. Contact Us
        </h2>
        <p className='mb-6'>
          If you have questions or need help regarding your data or account,
          please reach out to our support team:
        </p>
        <p className='mb-6'>
          Email:{' '}
          <a
            href='mailto:hello@ringee.io'
            className='text-primary underline underline-offset-4'
          >
            hello@ringee.io
          </a>
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          9. Updates to This Policy
        </h2>
        <p className='mb-6'>
          We may update this Privacy Policy if our practices or legal
          obligations change. The latest version will always be available on
          this page, and significant updates will be announced via email or
          in-app notification.
        </p>

        <p className='text-muted-foreground mt-12 text-sm'>
          Thank you for trusting Ringee.io — we’re committed to keeping your
          communications secure and transparent.
        </p>
      </section>
    </>
  );
}
