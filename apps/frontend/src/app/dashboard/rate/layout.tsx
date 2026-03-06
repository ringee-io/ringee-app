import PageContainer from '@/components/layout/page-container';
import { Heading } from '@ringee/frontend-shared/components/ui/heading';
import { Separator } from '@ringee/frontend-shared/components/ui/separator';
import { cn } from '@ringee/frontend-shared/lib/utils';
import { IconPlus } from '@tabler/icons-react';
import { Button, buttonVariants } from '@ringee/frontend-shared/components/ui/button';
import { CreditPopover } from '@/features/credit/components/credit.popover';

export default function RateLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <PageContainer scrollable={false}>
      <div className='flex flex-1 flex-col space-y-4'>
        <div className='flex items-start justify-between'>
          <Heading title='Rate' description='Rate Calculator for your team' />

          <CreditPopover
            children={
              <Button
                className={cn(
                  buttonVariants(),
                  'cursor-pointer text-xs md:text-sm'
                )}
              >
                <IconPlus className='mr-2 h-4 w-4' />
                Buy Credits
              </Button>
            }
          />
        </div>

        <Separator />
        {children}
      </div>
    </PageContainer>
  );
}
