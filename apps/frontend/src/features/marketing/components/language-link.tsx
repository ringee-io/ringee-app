import { MarketingLink as Link } from './marketing-link';
import { languageAlternates, type MarketingLocale } from '../locale';
import { Container } from './primitives';

export function LanguageLink({
  path,
  locale
}: {
  path: string;
  locale: MarketingLocale;
}) {
  const enPath = locale === 'es' ? path.slice(3) : path;
  if (!languageAlternates(enPath)) return null;
  return (
    <Container className='pt-4'>
      <Link
        className='text-muted-foreground hover:text-foreground text-sm underline underline-offset-4'
        href={locale === 'es' ? enPath : `/es${enPath}`}
        hrefLang={locale === 'es' ? 'en' : 'es'}
      >
        {locale === 'es' ? 'Read in English' : 'Leer en español'}
      </Link>
    </Container>
  );
}
