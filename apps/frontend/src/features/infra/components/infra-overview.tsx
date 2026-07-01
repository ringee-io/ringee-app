'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { InfraCanvas } from './infra-canvas';

export function InfraOverview() {
  return (
    <ReactFlowProvider>
      <InfraCanvas />
    </ReactFlowProvider>
  );
}
