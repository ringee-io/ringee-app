import { generateSEOMetadata } from '@/lib/seo-utils';
import { productSchema, breadcrumbSchema } from '@/lib/schema-utils';
import Link from 'next/link';
import { Button } from '@ringee/frontend-shared/components/ui/button';
import { Phone, Check, Users, Search, Tag } from 'lucide-react';
import { IconAddressBook } from '@tabler/icons-react';

export const metadata = generateSEOMetadata({
  title: 'Contact Management - Organize Your Contacts',
  description:
    'Manage all your contacts in one place. Quick dial, add notes, view call history per contact, and organize with tags. Built for efficient communication.',
  canonical: '/features/contacts',
  keywords: [
    'contact management',
    'phone contacts',
    'business contacts',
    'contact organization',
    'CRM contacts',
    'VoIP contacts'
  ]
});

const features = [
  {
    icon: Users,
    title: 'Centralized Contacts',
    description: 'All your contacts in one place, accessible from any device.'
  },
  {
    icon: Search,
    title: 'Quick Search',
    description: 'Find any contact instantly with powerful search.'
  },
  {
    icon: Tag,
    title: 'Tags & Notes',
    description: 'Organize contacts with tags and add notes for context.'
  }
];

const benefits = [
  'One-click calling from your contact list',
  'View complete call history per contact',
  'Import contacts from other platforms',
  'Share contacts with team members',
  'Sync across all your devices'
];

export default function ContactsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productSchema({
              name: 'Contacts by Phone by Ringee.io',
              description: 'Contact management built for efficient communication.'
            })
          )
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: 'Home', url: '/' },
              { name: 'Features', url: '/features' },
              { name: 'Contacts', url: '/features/contacts' }
            ])
          )
        }}
      />

      <div className="container mx-auto max-w-6xl py-20 px-4">
        <nav className="text-sm text-muted-foreground mb-8">
          <Link href="/features" className="hover:text-primary">Features</Link>
          <span className="mx-2">/</span>
          <span>Contacts</span>
        </nav>

        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-4">
            <IconAddressBook className="h-4 w-4" />
            Feature
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Contact Management Made Simple
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
            Keep all your contacts organized and accessible. Add notes, view
            call history, and dial anyone with a single click.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Get started free
            </Button>
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {features.map((feature) => (
            <div key={feature.title} className="bg-card border rounded-xl p-6 text-center">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mb-20">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Why You'll Love It</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-3 bg-card border rounded-lg p-4">
                <div className="bg-green-500/10 p-1 rounded-full shrink-0">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center bg-primary/5 border border-primary/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Organize your contacts today
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Sign up and start managing your contacts more effectively.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Phone className="h-4 w-4" />
              Start calling now
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
