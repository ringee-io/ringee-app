'use client';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@ringee/frontend-shared/components/ui/tabs';
import { ScriptEditor } from './script-editor';

export function SettingsOverviewView() {
  return (
    <Tabs defaultValue='guion' className='w-full'>
      <TabsList>
        <TabsTrigger value='guion'>Guion</TabsTrigger>
      </TabsList>

      <TabsContent value='guion' className='mt-6'>
        <ScriptEditor />
      </TabsContent>
    </Tabs>
  );
}
