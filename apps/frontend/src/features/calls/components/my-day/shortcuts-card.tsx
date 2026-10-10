import { useTranslations } from 'next-intl';
import { Kbd } from './kbd';

/** The page's keys, next to what they do. */
export function ShortcutsCard() {
  const t = useTranslations('calls.myDay.shortcuts');
  const rows: { label: string; keys: string[] }[] = [
    { label: t('callNext'), keys: ['N'] },
    { label: t('search'), keys: ['/'] },
    { label: t('keypad'), keys: ['K'] },
    { label: t('list'), keys: ['L'] },
    { label: t('skip'), keys: ['S'] },
    { label: t('move'), keys: ['↑', '↓'] },
    { label: t('callResult'), keys: ['Enter'] },
    { label: t('clear'), keys: ['Esc'] }
  ];

  return (
    <section
      aria-labelledby='my-day-shortcuts-title'
      className='bg-card space-y-2.5 rounded-xl border p-4 sm:p-5'
    >
      <h2 id='my-day-shortcuts-title' className='text-base font-semibold'>
        {t('title')}
      </h2>
      <dl className='space-y-2'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='flex items-center justify-between gap-3 text-sm'
          >
            <dt>{row.label}</dt>
            <dd className='flex shrink-0 gap-1'>
              {row.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className='text-muted-foreground text-[12.5px]'>{t('hint')}</p>
    </section>
  );
}
