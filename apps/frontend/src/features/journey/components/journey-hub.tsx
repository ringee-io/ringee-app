'use client';

import { useOrganization, useUser } from '@clerk/nextjs';
import { IconBuilding, IconUser } from '@tabler/icons-react';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { useJourneyCopy } from '../lib/copy';
import type { JourneyOverview } from '../types';

/**
 * The centre of the map: the workspace itself.
 *
 * Every thread leaves this circle, so it has to be unmistakably *the account* —
 * the organization's own logo, or the person's avatar on a personal workspace.
 * A generic glyph in the middle would turn a personal map into an org chart of
 * nobody.
 *
 * The ring is journey completion as the program defines it: the required track
 * plus the elective tracks the workspace has to choose. Not "nodes done" — a
 * workspace that skips three whole tracks on purpose is not 40% of anything,
 * and the summary above the map says so in words.
 */
export function JourneyHub({
  data,
  size,
  style
}: {
  data: JourneyOverview;
  /** Diameter in px; the layout owns it so the threads meet the edge exactly. */
  size: number;
  style?: React.CSSProperties;
}) {
  const { t } = useJourneyCopy();
  const { organization } = useOrganization();
  const { user } = useUser();

  const isOrg = data.workspaceType === 'organization';
  const name =
    (isOrg ? organization?.name : (user?.fullName ?? user?.username)) ??
    t(isOrg ? 'hub.organization' : 'hub.personal');
  const image = isOrg ? organization?.imageUrl : user?.imageUrl;

  const { completion } = data;
  const needed = completion.requiredTotal + completion.electiveRequired;
  const done =
    completion.requiredComplete +
    Math.min(completion.electiveComplete, completion.electiveRequired);
  const percent = needed ? Math.round((done / needed) * 100) : 0;

  const avatar = Math.round(size * 0.42);

  return (
    <div
      style={{ ...style, width: size, height: size }}
      className='pointer-events-none absolute z-10 select-none'
    >
      {/* The completion ring. Conic gradient — no chart library for one arc. */}
      <div
        aria-hidden='true'
        className='text-foreground/70 absolute inset-0 rounded-full'
        style={{
          background: `conic-gradient(from -90deg, currentColor ${percent * 3.6}deg, color-mix(in srgb, currentColor 12%, transparent) 0deg)`
        }}
      />
      <div className='bg-card absolute inset-[5px] rounded-full border shadow-sm' />

      <div className='absolute inset-0 flex flex-col items-center justify-center px-3 text-center'>
        <span
          aria-hidden='true'
          className='bg-muted ring-background flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2'
          style={{ width: avatar, height: avatar }}
        >
          {image ? (
            // Clerk serves these from its own CDN already sized; next/image
            // would add a loader round-trip for a 60px avatar.
            <img
              src={image}
              alt=''
              width={avatar}
              height={avatar}
              className='size-full object-cover'
            />
          ) : isOrg ? (
            <IconBuilding className='text-muted-foreground size-1/2' />
          ) : (
            <IconUser className='text-muted-foreground size-1/2' />
          )}
        </span>

        <p
          className={cn(
            'mt-1.5 line-clamp-2 leading-tight font-semibold',
            size < 130 ? 'text-[10px]' : 'text-[11px]'
          )}
          title={name}
        >
          {name}
        </p>
        <p className='text-muted-foreground mt-0.5 text-[10px] tabular-nums'>
          {t('hub.complete', { percent })}
        </p>
      </div>

      {/* The map is decorative to a screen reader; this is not. */}
      <p className='sr-only'>{t('hub.aria', { name, percent })}</p>
    </div>
  );
}
