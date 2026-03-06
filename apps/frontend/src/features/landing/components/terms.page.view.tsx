'use client';

import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { Navbar } from '@/features/landing/components/navbar';
import Footer from './footer';

export default function TermsPageView() {
  return (
    <>
      <Navbar />
      <section className='text-muted-foreground mx-auto max-w-4xl px-6 py-16 text-base leading-relaxed'>
        <h1 className='text-foreground mb-4 text-4xl font-bold'>
          Terms & Conditions
        </h1>
        <p className='text-muted-foreground mb-10 text-sm'>
          Last updated: November 2, 2025
        </p>

        <p className='mb-6'>
          These Terms and Conditions ("Terms") govern your access to and use of
          Ringee.io ("Ringee", "we", "our", "us") and its browser-based calling
          services. By creating an account or using our service, you agree to
          comply with these Terms.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          1. Acceptance of Terms
        </h2>
        <p className='mb-6'>
          By using Ringee.io, you confirm that you are at least 18 years old and
          have the legal authority to agree to these Terms. If you do not agree,
          you must not use our services.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          2. Permitted Use
        </h2>
        <p className='mb-3'>
          Ringee.io provides international calling and number rental services
          through a secure browser interface. You agree to use the platform only
          for lawful purposes and in compliance with all applicable regulations.
        </p>
        <p className='text-foreground mb-3 font-medium'>
          The following activities are strictly prohibited:
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>Fraudulent or deceptive calls</li>
          <li>Spam, robocalls, or mass-dialing campaigns</li>
          <li>Impersonation, harassment, or threatening behavior</li>
          <li>
            Any activity that violates local or international telecom laws
          </li>
        </ul>
        <p className='mb-6'>
          Any violation may lead to immediate account suspension, termination,
          and permanent loss of credits.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          3. Credits and Billing
        </h2>
        <p className='mb-3'>
          Ringee.io operates on a pay-as-you-go model. Calls are charged based
          on our published rates, which may vary by destination and carrier
          fees. Credits must be added in advance to make calls.
        </p>
        <p className='mb-6'>
          Rates are subject to change at any time, and updates will be reflected
          in your dashboard. Unused credits are non-refundable unless required
          by law.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          4. Call Quality and Reliability
        </h2>
        <p className='mb-6'>
          While Ringee.io strives to maintain excellent call quality and uptime,
          performance may vary depending on internet connection, network
          congestion, or third-party carrier routing. We do not guarantee
          uninterrupted service and are not responsible for issues beyond our
          control.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          5. Privacy and Data Handling
        </h2>
        <p className='mb-3'>
          We collect and store call metadata (numbers dialed, duration,
          timestamps) strictly for billing and technical purposes. Audio content
          is not stored unless you explicitly enable call recording.
        </p>
        <p className='mb-6'>
          Your use of Ringee.io is also governed by our{' '}
          <a
            href='/privacy'
            className='text-primary underline underline-offset-4'
          >
            Privacy Policy
          </a>
          , which describes how we handle your personal data and communication
          records.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          6. Emergency Calls Disclaimer
        </h2>
        <p className='mb-6'>
          Ringee.io is not a traditional phone service and cannot be used to
          contact emergency services (such as 911 or 112). Always use a regular
          telephone line or mobile carrier for emergency calls.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          7. Refund Policy
        </h2>
        <p className='mb-3'>
          We want you to be satisfied with our service. If you experience
          issues, please contact our support team within 14 days of your
          purchase.
        </p>
        <ul className='mb-6 list-disc space-y-2 pl-6'>
          <li>Refunds are available for unused credit balances.</li>
          <li>Refunds are not issued for consumed or expired credits.</li>
          <li>
            Users found violating these Terms (e.g., spam, illegal activity) are
            ineligible for refunds.
          </li>
          <li>
            We may offer replacement credits for failed or incomplete calls
            caused by system errors.
          </li>
        </ul>
        <p className='mb-6'>
          Refunds are processed within 5–7 business days through the original
          payment method.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          8. Account Termination
        </h2>
        <p className='mb-6'>
          Ringee.io reserves the right to suspend or terminate accounts that
          violate these Terms, abuse the service, or pose a security or
          compliance risk. Termination may result in loss of access to your
          account, numbers, and remaining credits.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          9. Limitation of Liability
        </h2>
        <p className='mb-6'>
          To the fullest extent permitted by law, Ringee.io and its affiliates
          are not liable for any indirect, incidental, or consequential damages
          resulting from your use of the service. This includes service
          interruptions, lost profits, or data loss.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          10. Changes to These Terms
        </h2>
        <p className='mb-6'>
          We may update these Terms from time to time to reflect changes in our
          services or legal obligations. The latest version will always be
          available on this page. Continued use of the service after updates
          constitutes acceptance of the new Terms.
        </p>

        <Separator className='my-8' />

        <h2 className='text-foreground mb-3 text-2xl font-semibold'>
          11. Contact Us
        </h2>
        <p className='mb-6'>
          If you have questions about these Terms or the operation of our
          service, please contact:
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

        <p className='text-muted-foreground mt-12 text-sm'>
          Thank you for using Ringee.io — a smarter, more transparent way to
          connect.
        </p>
      </section>
      <Footer />
    </>
  );
}
