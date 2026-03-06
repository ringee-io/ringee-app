import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList
} from '@ringee/frontend-shared/components/ui/navigation-menu';
import { NavigationMenuProps } from '@radix-ui/react-navigation-menu';
import Link from 'next/link';

export const NavMenu = (props: NavigationMenuProps) => (
  <NavigationMenu {...props}>
    <NavigationMenuList className='gap-6 space-x-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start'>
      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='#features'>Features</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='#comparison'>Comparison</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='#pricing'>Pricing</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='/blog'>Blog</Link>
        </NavigationMenuLink>
      </NavigationMenuItem>
      {/* <NavigationMenuItem>
        <NavigationMenuLink asChild>
          <Link href='#testimonials'>Testimonials</Link>
        </NavigationMenuLink>
      </NavigationMenuItem> */}
    </NavigationMenuList>
  </NavigationMenu>
);
