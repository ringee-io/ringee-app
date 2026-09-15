import Image from 'next/image';

import { cn } from '@ringee/frontend-shared/lib/utils';
import styles from './calling-hero.module.css';

/** Both theme variants use native lazy loading so only the visible one loads. */
export function OperatorPortrait({
  operator,
  label
}: {
  operator: 'human' | 'robot';
  label: string;
}) {
  return (
    <figure className={cn(styles.operator, styles[operator])}>
      <div className={styles.portrait}>
        <Image
          src={`/hero/${operator}-white.png`}
          alt=''
          fill
          sizes='(min-width: 1440px) 360px, (min-width: 1024px) 26vw, (min-width: 640px) 300px, 46vw'
          className='object-contain object-bottom dark:hidden'
        />
        <Image
          src={`/hero/${operator}-dark.png`}
          alt=''
          fill
          sizes='(min-width: 1440px) 360px, (min-width: 1024px) 26vw, (min-width: 640px) 300px, 46vw'
          className='hidden object-contain object-bottom dark:block'
        />
      </div>
      <figcaption className={styles.operatorLabel}>
        <span aria-hidden className={styles.operatorDot} />
        {label}
      </figcaption>
    </figure>
  );
}
