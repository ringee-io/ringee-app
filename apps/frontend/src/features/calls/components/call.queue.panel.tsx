'use client';
// import { Button } from '@ringee/frontend-shared/components/ui/button';
// import { useTelnyxStore } from '../store/telnyx.store';
// import { cn } from '@ringee/frontend-shared/lib/utils';

export function CallQueuePanel() {
  // Ejemplo local (puedes reemplazar por useTelnyxStore().queue)
  // const queue = [
  //   {
  //     id: '1',
  //     state: 'active',
  //     answer: () => {},
  //     hangup: () => {},
  //     options: { callerName: 'Anna Smith', callerNumber: '+18295551010' },
  //   },
  //   {
  //     id: '2',
  //     state: 'ringing',
  //     answer: () => {},
  //     hangup: () => {},
  //     options: { callerName: 'Carlos Jimenez', callerNumber: '+18095552020' },
  //   },
  // ];

  // if (!queue.length) return null;

  // return (
  //   <div
  //     className={cn(
  //       'fixed bottom-6 right-6 z-[9999] w-full max-w-xs sm:max-w-sm md:max-w-md',
  //       'rounded-xl border border-border/40 bg-white/90 dark:bg-neutral-900/80',
  //       'shadow-2xl backdrop-blur-lg transition-all'
  //     )}
  //   >
  //     <div className="border-b border-border/20 px-4 py-2">
  //       <h4 className="text-center text-sm font-semibold tracking-wide text-foreground/90">
  //         📥 Call Queue
  //       </h4>
  //     </div>

  //     <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
  //       {queue.map((q) => {
  //         const isActive = q.state === 'active';
  //         return (
  //           <div
  //             key={q.id}
  //             className={cn(
  //               'flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all',
  //               isActive
  //                 ? 'border-green-500 bg-gradient-to-r from-green-500/10 to-emerald-400/10'
  //                 : 'border-border/30 hover:border-border/60 hover:bg-muted/40'
  //             )}
  //           >
  //             <div className="flex flex-col">
  //               <span
  //                 className={cn(
  //                   'font-semibold',
  //                   isActive ? 'text-green-600 dark:text-emerald-400' : ''
  //                 )}
  //               >
  //                 {q.options?.callerName || q.options?.callerNumber}
  //               </span>
  //               <span className="text-muted-foreground text-[11px]">
  //                 {q.options?.callerNumber}
  //               </span>
  //               <span
  //                 className={cn(
  //                   'mt-0.5 text-[10px]',
  //                   isActive
  //                     ? 'text-green-500 dark:text-emerald-400'
  //                     : 'text-muted-foreground/70'
  //                 )}
  //               >
  //                 {isActive ? 'On Call' : 'Ringing...'}
  //               </span>
  //             </div>

  //             <div className="flex gap-1">
  //               {!isActive && (
  //                 <Button
  //                   size="sm"
  //                   className="h-7 bg-green-600 text-white hover:bg-green-700"
  //                   onClick={() => q.answer?.()}
  //                 >
  //                   Contestar
  //                 </Button>
  //               )}
  //               <Button
  //                 size="sm"
  //                 variant="destructive"
  //                 className="h-7"
  //                 onClick={() => q.hangup?.()}
  //               >
  //                 {isActive ? 'Colgar' : 'Rechazar'}
  //               </Button>
  //             </div>
  //           </div>
  //         );
  //       })}
  //     </div>
  //   </div>
  // );

  return null;
}
