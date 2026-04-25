import React from 'react';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from '@ringee/frontend-shared/components/ui/navigation-menu';
import { NavigationMenuProps } from '@radix-ui/react-navigation-menu';
import { cn } from '@ringee/frontend-shared/lib/utils';
import Link from 'next/link';

const ListItem = React.forwardRef<
  React.ElementRef<'a'>,
  React.ComponentPropsWithoutRef<'a'> & { title: string }
>(({ className, title, children, href, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          href={href || '#'}
          className={cn(
            'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground block space-y-1 rounded-md p-3 leading-none no-underline transition-colors outline-none select-none',
            className
          )}
          {...props}
        >
          <div className='mb-1 text-sm leading-none font-medium'>{title}</div>
          <p className='text-muted-foreground line-clamp-2 text-sm leading-snug'>
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';

export const NavMenu = ({
  orientation = 'horizontal',
  ...props
}: NavigationMenuProps) => (
  <NavigationMenu orientation={orientation} {...props}>
    <NavigationMenuList
      className={cn(
        'gap-2 space-x-0',
        orientation === 'vertical'
          ? 'w-full flex-col items-start gap-4'
          : 'sm:gap-6'
      )}
    >
      <NavigationMenuItem
        className={cn(orientation === 'vertical' && 'w-full')}
      >
        {orientation === 'horizontal' ? (
          <>
            <NavigationMenuTrigger className='bg-transparent px-2 sm:px-4'>
              Product
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className='grid w-[280px] gap-3 p-4 sm:w-[400px] md:w-[500px] md:grid-cols-2 lg:w-[600px]'>
                <li className='row-span-4 hidden md:block'>
                  <NavigationMenuLink asChild>
                    <Link
                      href='#open-source'
                      className='from-muted/50 to-muted flex h-full w-full flex-col justify-end rounded-md bg-gradient-to-b p-6 no-underline outline-none select-none focus:shadow-md'
                    >
                      <div className='mt-4 mb-2 text-lg font-medium'>
                        Ringee
                      </div>
                      <p className='text-muted-foreground text-sm leading-tight'>
                        The modern open-source communication platform designed
                        for growth.
                      </p>
                    </Link>
                  </NavigationMenuLink>
                </li>
                <ListItem href='#features' title='Features'>
                  Explore our core features and capabilities.
                </ListItem>
                <ListItem href='#campaigns' title='Campaigns'>
                  Preview and progressive dialers for outbound teams.
                </ListItem>
                <ListItem href='#find-leads' title='Find leads & enrich'>
                  Apollo.io and Prospeo.io — prospecting, built in.
                </ListItem>
                <ListItem href='#integrations' title='CRM Integrations'>
                  Attio, Odoo — and more on the way.
                </ListItem>
                <ListItem href='#comparison' title='Comparison'>
                  See how we compare against the competition.
                </ListItem>
                <ListItem href='#pricing' title='Pricing'>
                  Flexible pricing for teams of all sizes.
                </ListItem>
              </ul>
            </NavigationMenuContent>
          </>
        ) : (
          <div className='mt-2 flex w-full flex-col gap-2'>
            <span className='text-muted-foreground px-2 text-sm font-semibold'>
              Product
            </span>
            <div className='border-border/40 mt-1 ml-2 flex flex-col gap-2 border-l pl-4'>
              <Link href='#features' className='py-1 text-base font-medium'>
                Features
              </Link>
              <Link href='#campaigns' className='py-1 text-base font-medium'>
                Campaigns
              </Link>
              <Link href='#find-leads' className='py-1 text-base font-medium'>
                Find leads &amp; enrich
              </Link>
              <Link href='#integrations' className='py-1 text-base font-medium'>
                CRM Integrations
              </Link>
              <Link href='#comparison' className='py-1 text-base font-medium'>
                Comparison
              </Link>
              <Link href='#pricing' className='py-1 text-base font-medium'>
                Pricing
              </Link>
            </div>
          </div>
        )}
      </NavigationMenuItem>

      <NavigationMenuItem
        className={cn(orientation === 'vertical' && 'w-full')}
      >
        <NavigationMenuLink asChild>
          <Link
            href='/blog'
            className={cn(
              'block',
              orientation === 'vertical'
                ? 'px-2 py-2 text-base font-medium'
                : 'px-2 py-2 sm:px-4'
            )}
          >
            Blog
          </Link>
        </NavigationMenuLink>
      </NavigationMenuItem>

      <NavigationMenuItem
        className={cn(orientation === 'vertical' && 'w-full')}
      >
        <NavigationMenuLink asChild>
          <Link
            href='https://docs.ringee.io'
            target='_blank'
            className={cn(
              'block',
              orientation === 'vertical'
                ? 'px-2 py-2 text-base font-medium'
                : 'px-2 py-2 sm:px-4'
            )}
          >
            Docs for Developers
          </Link>
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
