import React from 'react';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
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
            'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors',
            className
          )}
          {...props}
        >
          <div className='text-sm font-medium leading-none mb-1'>{title}</div>
          <p className='text-muted-foreground line-clamp-2 text-sm leading-snug'>
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = 'ListItem';

export const NavMenu = (props: NavigationMenuProps) => (
  <NavigationMenu {...props}>
    <NavigationMenuList className='gap-2 sm:gap-6 space-x-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start'>
      
      <NavigationMenuItem>
        <NavigationMenuTrigger className="bg-transparent px-2 sm:px-4">Product</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className='grid gap-3 p-4 w-[280px] sm:w-[400px] md:w-[500px] md:grid-cols-2 lg:w-[600px]'>
            <li className='row-span-3 hidden md:block'>
              <NavigationMenuLink asChild>
                <Link
                  href='#open-source'
                  className='from-muted/50 to-muted flex h-full w-full select-none flex-col justify-end rounded-md bg-gradient-to-b p-6 no-underline outline-none focus:shadow-md'
                >
                  <div className='mb-2 mt-4 text-lg font-medium'>
                    Ringee
                  </div>
                  <p className='text-muted-foreground text-sm leading-tight'>
                    The modern open-source communication platform designed for growth.
                  </p>
                </Link>
              </NavigationMenuLink>
            </li>
            <ListItem href='#features' title='Features'>
              Explore our core features and capabilities.
            </ListItem>
            <ListItem href='#comparison' title='Comparison'>
              See how we compare against the competition.
            </ListItem>
            <ListItem href='#pricing' title='Pricing'>
              Flexible pricing for teams of all sizes.
            </ListItem>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='/blog' className="px-2 sm:px-4 py-2 block">Blog</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>

      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='https://docs.ringee.io' target="_blank" className="px-2 sm:px-4 py-2 block">Developers</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>

    </NavigationMenuList>
  </NavigationMenu>
);
