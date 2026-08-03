'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import { cn } from '@ringee/frontend-shared/lib/utils';
import type {
  AuthState,
  DialerState,
  RingeeCall
} from '@ringee/dialer-sdk/types';
// Type-only: erased at build time, so the Telnyx-backed engine is never bundled.
import type { RingeeDialer } from '@ringee/dialer-sdk/ringee-dialer';
import type { DialerModel } from '@ringee/dialer-sdk/ui/dialer-model';
import type { ShadowMount } from '@ringee/dialer-sdk/ui/shadow-root';

/**
 * Real Dialer SDK UI, running on the marketing site.
 *
 * These demos render the *production* components — the same `CardView`,
 * `BarView`, Shadow DOM mount, styles, and copy that ship in
 * `@ringee/dialer-sdk` — driven by the package's `MockDialer`, which stands in
 * for the backend and WebRTC. Nothing here is a screenshot or a hand-built
 * lookalike, and nothing touches the network. Same approach as
 * `apps/sdk-playground/ui-gallery`.
 *
 * Only the view layer is imported (never `ui/factory`, which pulls in the
 * headless dialer and the Telnyx engine), and the chunk is fetched lazily as
 * the demo approaches the viewport, so a marketing visit never downloads the
 * calling stack.
 */

type SdkUi = Awaited<ReturnType<typeof loadSdkUi>>;
type Surface = 'floating' | 'bar';

const DEMO_CONTACT = {
  name: 'Morgan Reed',
  number: '+13055550142',
  contactId: 'crm-contact-294'
};

async function loadSdkUi() {
  const [model, card, bar, shadow, strings, icons, demo] = await Promise.all([
    import('@ringee/dialer-sdk/ui/dialer-model'),
    import('@ringee/dialer-sdk/ui/card-view'),
    import('@ringee/dialer-sdk/ui/bar-view'),
    import('@ringee/dialer-sdk/ui/shadow-root'),
    import('@ringee/dialer-sdk/ui/strings'),
    import('@ringee/dialer-sdk/ui/icons'),
    import('@ringee/dialer-sdk/demo/mock-dialer')
  ]);
  return {
    DialerModel: model.DialerModel,
    CardView: card.CardView,
    BarView: bar.BarView,
    createShadowMount: shadow.createShadowMount,
    resolveStrings: strings.resolveStrings,
    icon: icons.icon,
    MockDialer: demo.MockDialer,
    DEMO_AGENT: demo.DEMO_AGENT,
    DEMO_CALLER_IDS: demo.DEMO_CALLER_IDS
  };
}

/** Fetch the SDK UI chunk once the demo is within ~a screen of the viewport. */
function useSdkUi(ref: RefObject<HTMLElement | null>): SdkUi | null {
  const [ui, setUi] = useState<SdkUi | null>(null);

  useEffect(() => {
    if (ui) return;
    const node = ref.current;
    if (!node) return;

    let cancelled = false;
    const load = () => {
      void loadSdkUi().then((loaded) => {
        if (!cancelled) setUi(loaded);
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [ref, ui]);

  return ui;
}

/** The site's resolved theme, as an SDK `colorScheme`. */
function useSdkScheme(): 'light' | 'dark' {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}

/** Keeps a mounted surface on the site's theme without re-creating it. */
function useMountTheme(
  mountRef: RefObject<ShadowMount | null>,
  mounted: boolean
): RefObject<'light' | 'dark'> {
  const scheme = useSdkScheme();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;

  useEffect(() => {
    mountRef.current?.setTheme({ colorScheme: scheme });
  }, [mountRef, scheme, mounted]);

  return schemeRef;
}

/** Placeholder with roughly the footprint of the mounted UI, shown while loading. */
function StageSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'border-border/60 bg-muted/40 w-full animate-pulse rounded-2xl border',
        className
      )}
    />
  );
}

/**
 * Interactive demo: a real dialer mounted inside a stand-in CRM window. Sign in
 * with any email and any 6-digit code, then place a simulated call.
 */
export function SdkLiveDemo({ className }: { className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShadowMount | null>(null);
  const [surface, setSurface] = useState<Surface>('floating');
  const [mounted, setMounted] = useState(false);
  const ui = useSdkUi(frameRef);
  const schemeRef = useMountTheme(mountRef, mounted);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ui || !stage) return;

    const {
      DialerModel,
      CardView,
      BarView,
      createShadowMount,
      resolveStrings,
      icon,
      MockDialer
    } = ui;

    const mock = new MockDialer({ mode: 'interactive' });
    const model = new DialerModel(mock as unknown as RingeeDialer, {
      strings: resolveStrings('en'),
      allowHold: true,
      workspaceName: 'Acme CRM'
    });
    const mount = createShadowMount(stage, { colorScheme: schemeRef.current });
    mount.host.style.width = '100%';
    mountRef.current = mount;

    let teardownView: () => void;

    if (surface === 'bar') {
      const bar = new BarView(model);
      mount.root.appendChild(bar.el);
      teardownView = () => bar.destroy();
    } else {
      // The same stack the floating chrome uses: panel above, launcher below.
      const holder = document.createElement('div');
      holder.className = 'rg-floating';
      holder.setAttribute('data-side', 'right');
      holder.style.position = 'static';
      holder.style.width = '100%';

      const card = new CardView(model, {});
      card.el.style.width = '100%';
      holder.appendChild(card.el);

      const launcher = document.createElement('button');
      launcher.type = 'button';
      launcher.className = 'rg-launcher';
      launcher.title = model.s.launcherClose;
      launcher.setAttribute('aria-label', model.s.launcherClose);
      launcher.appendChild(icon('phone', 24));
      launcher.addEventListener('click', () => {
        const opening = card.el.hidden;
        card.el.hidden = !opening;
        const label = opening ? model.s.launcherClose : model.s.launcherOpen;
        launcher.title = label;
        launcher.setAttribute('aria-label', label);
      });
      holder.appendChild(launcher);

      mount.root.appendChild(holder);
      teardownView = () => card.destroy();
    }

    void mock.initialize();
    setMounted(true);

    return () => {
      teardownView();
      model.destroy();
      mount.destroy();
      mountRef.current = null;
      void mock.destroy();
      setMounted(false);
    };
  }, [ui, surface, schemeRef]);

  return (
    <div
      ref={frameRef}
      className={cn(
        'border-border/70 bg-card overflow-hidden rounded-2xl border shadow-sm',
        className
      )}
    >
      {/* Host application chrome */}
      <div className='border-border/60 bg-muted/40 flex items-center gap-2 border-b px-4 py-3'>
        <span className='h-2.5 w-2.5 rounded-full bg-red-400/70' />
        <span className='h-2.5 w-2.5 rounded-full bg-amber-400/70' />
        <span className='h-2.5 w-2.5 rounded-full bg-emerald-400/70' />
        <span className='text-muted-foreground ml-2 font-mono text-xs'>
          crm.example.com
        </span>
      </div>

      <div className='border-border/60 flex items-center gap-1 border-b px-3 py-2'>
        {(
          [
            ['floating', 'Floating panel'],
            ['bar', 'Inline bar']
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type='button'
            onClick={() => setSurface(value)}
            aria-pressed={surface === value}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              surface === value
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dotted stage stands in for the host page the dialer floats over. */}
      <div className='p-4 sm:p-5'>
        <div
          className={cn(
            'flex rounded-xl bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.07)_1px,transparent_0)] [background-size:16px_16px] p-4 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]',
            surface === 'floating'
              ? 'justify-center sm:justify-end'
              : 'justify-center'
          )}
        >
          <div
            ref={stageRef}
            className={cn(
              'flex w-full',
              surface === 'floating' ? 'max-w-[340px]' : 'max-w-full'
            )}
          />
          {!mounted ? (
            <StageSkeleton
              className={cn(
                surface === 'floating' ? 'h-[24rem] max-w-[340px]' : 'h-16'
              )}
            />
          ) : null}
        </div>
      </div>

      <p className='text-muted-foreground border-border/60 border-t px-4 py-3 text-xs text-pretty'>
        The real SDK UI, simulated end to end — no backend, no WebRTC. Use any
        email, then any 6-digit code, then place a call.
      </p>
    </div>
  );
}

type FrozenTile = {
  label: string;
  note: string;
  surface: Surface;
  /** Dialer state the tile freezes (applied before the model is built). */
  auth: AuthState;
  state: DialerState;
  /** Extra model state the screen needs (contact, active call, …). */
  patch?: (model: DialerModel, ui: SdkUi) => void;
};

function demoCall(ui: SdkUi, answered: boolean): RingeeCall {
  return {
    id: 'call_demo',
    to: DEMO_CONTACT.number,
    from: ui.DEMO_CALLER_IDS[0]!.phoneNumber,
    direction: 'outbound',
    state: answered ? 'active' : 'ringing',
    startedAt: new Date(Date.now() - 130000),
    answeredAt: answered ? new Date(Date.now() - 125000) : null,
    endedAt: null,
    durationSeconds: 0,
    muted: false,
    held: false
  };
}

const TILES: FrozenTile[] = [
  {
    label: 'Sign in',
    note: 'The agent identifies their Ringee account',
    surface: 'floating',
    auth: 'anonymous',
    state: 'uninitialized'
  },
  {
    label: 'Ready to dial',
    note: 'Contact, number, and caller ID',
    surface: 'floating',
    auth: 'authenticated',
    state: 'ready',
    patch: (model) => {
      model.contact = DEMO_CONTACT;
      model.number = DEMO_CONTACT.number;
    }
  },
  {
    label: 'In call',
    note: 'Timer, mute, hold, keypad, hang up',
    surface: 'floating',
    auth: 'authenticated',
    state: 'active',
    patch: (model, ui) => {
      model.contact = DEMO_CONTACT;
      model.number = DEMO_CONTACT.number;
      model.activeCall = demoCall(ui, true);
    }
  },
  {
    label: 'Inline bar, mid-call',
    note: 'The same dialer inside a toolbar or sidebar',
    surface: 'bar',
    auth: 'authenticated',
    state: 'active',
    patch: (model, ui) => {
      model.contact = DEMO_CONTACT;
      model.number = DEMO_CONTACT.number;
      model.activeCall = demoCall(ui, true);
    }
  }
];

/** One frozen state of the real UI, rendered into its own Shadow DOM mount. */
function FrozenTileCard({ tile, ui }: { tile: FrozenTile; ui: SdkUi | null }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShadowMount | null>(null);
  const [mounted, setMounted] = useState(false);
  const schemeRef = useMountTheme(mountRef, mounted);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ui || !stage) return;

    const {
      DialerModel,
      CardView,
      BarView,
      createShadowMount,
      resolveStrings,
      MockDialer,
      DEMO_AGENT,
      DEMO_CALLER_IDS
    } = ui;

    // Preset the dialer before the model reads it — a static mock emits nothing.
    const mock = new MockDialer({ mode: 'static' });
    mock.presetAuth(tile.auth).presetState(tile.state);

    const model = new DialerModel(mock as unknown as RingeeDialer, {
      strings: resolveStrings('en'),
      allowHold: true,
      workspaceName: 'Acme CRM'
    });
    model.agent = DEMO_AGENT;
    model.callerIds = DEMO_CALLER_IDS;
    tile.patch?.(model, ui);

    const mount = createShadowMount(stage, { colorScheme: schemeRef.current });
    mount.host.style.width = '100%';
    mountRef.current = mount;

    let teardownView: () => void;
    if (tile.surface === 'bar') {
      const bar = new BarView(model);
      mount.root.appendChild(bar.el);
      teardownView = () => bar.destroy();
    } else {
      const card = new CardView(model, {});
      card.el.style.width = '100%';
      card.el.style.animation = 'none';
      mount.root.appendChild(card.el);
      teardownView = () => card.destroy();
    }
    setMounted(true);

    return () => {
      teardownView();
      model.destroy();
      mount.destroy();
      mountRef.current = null;
      setMounted(false);
    };
  }, [tile, ui, schemeRef]);

  const isBar = tile.surface === 'bar';

  return (
    <figure
      className={cn(
        'border-border/70 bg-muted/20 m-0 flex flex-col gap-4 rounded-2xl border p-4',
        isBar && 'sm:col-span-2'
      )}
    >
      <div
        className={cn(
          'flex flex-1 justify-center rounded-xl bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.07)_1px,transparent_0)] [background-size:16px_16px] p-3 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]',
          isBar ? 'items-center' : 'items-start'
        )}
      >
        <div
          ref={stageRef}
          className={cn('flex w-full', isBar ? 'max-w-3xl' : 'max-w-[340px]')}
        />
        {!mounted ? (
          <StageSkeleton
            className={cn(isBar ? 'h-16 max-w-3xl' : 'h-72 max-w-[340px]')}
          />
        ) : null}
      </div>
      <figcaption className='flex flex-col gap-1'>
        <span className='text-sm font-semibold'>{tile.label}</span>
        <span className='text-muted-foreground text-xs'>{tile.note}</span>
      </figcaption>
    </figure>
  );
}

/** Grid of frozen, real-UI states — the screens you get without building any. */
export function SdkStateGallery({ className }: { className?: string }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const ui = useSdkUi(gridRef);

  return (
    <div ref={gridRef} className={cn('grid gap-5 sm:grid-cols-2', className)}>
      {TILES.map((tile) => (
        <FrozenTileCard key={tile.label} tile={tile} ui={ui} />
      ))}
    </div>
  );
}
