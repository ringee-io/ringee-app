'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@clerk/nextjs';
import { useOrgRole } from '@ringee/frontend-shared/hooks/use-org-role';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@ringee/frontend-shared/components/ui/alert-dialog';
import { IconInfoCircle, IconLoader2, IconX } from '@tabler/icons-react';
import { useInfraApi } from '../api';
import { useInfraStore } from '../store/infra.store';
import {
  getNodeActions,
  type NodeActionKey,
  type OnResourceCreated
} from '../lib/node-config';
import { buildAdjacency, nodeReadiness } from '../lib/readiness';
import { setupSteps, type SetupActionKey } from '../lib/setup-steps';
import type { InfraTemplate } from '../lib/templates';
import type {
  InfraEdge,
  InfraNode,
  InfraOverview,
  InfrastructureResourceType
} from '../types';
import { ResourceNode, type ResourceNodeData } from './resource-node';
import { ResourceInspector } from './resource-inspector';
import { CanvasContextMenu } from './canvas-context-menu';
import { NodeContextMenu } from './node-context-menu';
import { AddResourceModal } from './add-resource-modal';
import { EmptyState } from './empty-state';
import { InfraWelcome } from './infra-welcome';
import { SetupChecklist } from './setup-checklist';
import { PendingChangesBar } from './pending-changes-bar';

const nodeTypes = { resource: ResourceNode };
const PENDING_KEY = 'infra.pendingCheckout';
const HINT_KEY = 'infra.hintDismissed';
const WELCOME_KEY = 'infra.welcomeSeen';
const CHECKLIST_KEY = 'infra.checklistDismissed';
const TEMPLATE_KEY = 'infra.templateLabel';

/** Human, hover-only sentence describing a relationship edge. */
function edgeSentence(
  edge: InfraEdge,
  nodesById: Map<string, InfraNode>
): string {
  const source = nodesById.get(edge.source)?.name ?? 'This resource';
  const target = nodesById.get(edge.target)?.name ?? 'another resource';
  if (edge.status === 'BROKEN') {
    return 'This connection is broken — one side was removed.';
  }
  const sentence = ((): string => {
    switch (edge.type) {
      case 'ASSIGNED_TO':
        return `${source} is assigned to ${target}`;
      case 'USES':
        return `${source} is used by ${target}`;
      case 'ROUTES_TO':
        return `Calls to ${source} route to ${target}`;
      case 'BELONGS_TO':
        return `${source} is in ${target}`;
      case 'OWNS':
        return `${source} owns ${target}`;
      case 'MEMBER_OF':
        return `${source} is a member of ${target}`;
      case 'TRIGGERS':
        return `${source} triggers ${target}`;
      default:
        return `${source} is connected to ${target}`;
    }
  })();
  return edge.applied ? sentence : `${sentence} · draft`;
}

/** Hex per resource type for the minimap dots (matches RESOURCE_META accents). */
const MINIMAP_COLOR: Record<InfrastructureResourceType, string> = {
  TEAM_MEMBER: '#0ea5e9',
  PHONE_NUMBER: '#10b981',
  SIP_DEVICE: '#8b5cf6',
  CAMPAIGN: '#f59e0b',
  NUMBER_POOL: '#14b8a6',
  ROUTING_RULE: '#f97316',
  INTEGRATION: '#d946ef'
};

function toFlowNodes(
  nodes: InfraNode[],
  edges: InfraEdge[],
  hasOrg: boolean
): Node[] {
  const adj = buildAdjacency(nodes, edges);
  return nodes.map((n) => ({
    id: n.id,
    type: 'resource',
    position: n.position,
    data: {
      node: n,
      readiness: nodeReadiness(n, adj.get(n.id), hasOrg)
    } satisfies ResourceNodeData
  }));
}

/**
 * Edges carry no inline label — the relationship "story" is revealed on hover
 * (see the floating tip in the canvas), keeping a busy graph readable. Colour +
 * dash + animation still encode active / draft / broken at a glance.
 */
function toFlowEdges(edges: InfraEdge[], hoveredId: string | null): Edge[] {
  return edges.map((e) => {
    const dashed = e.status !== 'ACTIVE';
    const broken = e.status === 'BROKEN';
    const hovered = e.id === hoveredId;
    const stroke = broken
      ? 'var(--destructive)'
      : e.status === 'ACTIVE'
        ? 'var(--primary)'
        : 'var(--border)';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.status === 'ACTIVE',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: stroke
      },
      style: {
        strokeWidth: hovered ? 2.5 : 1.5,
        strokeDasharray: dashed ? '6 4' : undefined,
        stroke
      },
      data: { edge: e }
    } satisfies Edge;
  });
}

export function InfraCanvas() {
  const api = useInfraApi();
  const reduce = useReducedMotion();
  const { isOrgAdmin, hasOrg } = useOrgRole();
  const { orgId, isLoaded: authLoaded } = useAuth();
  const canMutate = !hasOrg || isOrgAdmin;

  const { screenToFlowPosition, fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rawNodes, setRawNodes] = useState<InfraNode[]>([]);
  const [rawEdges, setRawEdges] = useState<InfraEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(true);
  const [welcomeSeen, setWelcomeSeen] = useState(true);
  const [checklistDismissed, setChecklistDismissed] = useState(true);
  const [templateLabel, setTemplateLabel] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [edgeTip, setEdgeTip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const {
    selectedNodeId,
    inspectorTab,
    menu,
    contextSwitching,
    addRequest,
    select,
    closeInspector,
    setTab,
    openMenu,
    closeMenu,
    setCredentials,
    setContextSwitching,
    resetForContext,
    clearAddRequest
  } = useInfraStore();

  const [addModal, setAddModal] = useState<{
    open: boolean;
    type: InfrastructureResourceType | null;
    position: { x: number; y: number } | null;
  }>({ open: false, type: null, position: null });
  const [edgeToDelete, setEdgeToDelete] = useState<InfraEdge | null>(null);
  const checkoutHandled = useRef(false);

  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeSeen(true);
    // Seeing the welcome counts as learning the hint — don't stack nudges.
    setHintDismissed(true);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const dismissChecklist = useCallback(() => {
    setChecklistDismissed(true);
    try {
      localStorage.setItem(CHECKLIST_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      setHintDismissed(localStorage.getItem(HINT_KEY) === '1');
      setWelcomeSeen(localStorage.getItem(WELCOME_KEY) === '1');
      setChecklistDismissed(localStorage.getItem(CHECKLIST_KEY) === '1');
      setTemplateLabel(localStorage.getItem(TEMPLATE_KEY));
    } catch {
      setHintDismissed(false);
      setWelcomeSeen(true);
    }
  }, []);

  // Raw overview → derived flow nodes/edges live in the effects below, so
  // readiness recomputes when relationships change and edge hover restyles
  // without a refetch.
  const applyOverview = useCallback((data: InfraOverview) => {
    setRawNodes(data.nodes);
    setRawEdges(data.edges);
  }, []);

  useEffect(() => {
    setNodes(toFlowNodes(rawNodes, rawEdges, hasOrg));
  }, [rawNodes, rawEdges, hasOrg, setNodes]);

  useEffect(() => {
    setEdges(toFlowEdges(rawEdges, hoveredEdgeId));
  }, [rawEdges, hoveredEdgeId, setEdges]);

  const refetch = useCallback(async () => {
    try {
      const data = await api.getOverview();
      applyOverview(data);
      setError(null);
    } catch {
      setError('Could not load your architecture.');
    }
  }, [api, applyOverview]);

  // ── Load (and reload on workspace switch) ───────────────────────────────────
  // Keyed on `orgId`: switching the active organization (or back to personal)
  // re-issues the Clerk token, so refetching here returns the new workspace's
  // architecture. All canvas-local UI state is reset so nothing leaks across
  // workspaces.
  useEffect(() => {
    if (!authLoaded) return;
    let cancelled = false;

    resetForContext();
    setAddModal({ open: false, type: null, position: null });
    setEdgeToDelete(null);
    setNodes([]);
    setEdges([]);
    setRawNodes([]);
    setRawEdges([]);
    setLoading(true);
    setError(null);

    api
      .getOverview()
      .then((data) => {
        if (cancelled) return;
        applyOverview(data);
        setError(null);
      })
      .catch(() => !cancelled && setError('Could not load your architecture.'))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setContextSwitching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    authLoaded,
    orgId,
    api,
    applyOverview,
    resetForContext,
    setContextSwitching,
    setNodes,
    setEdges
  ]);

  // ── Topbar "Add resource" → open the matching create/link surface ───────────
  useEffect(() => {
    if (!addRequest) return;
    setAddModal({ open: true, type: addRequest.type, position: null });
    dismissHint();
    clearAddRequest();
  }, [addRequest, clearAddRequest, dismissHint]);

  // ── Returning from Stripe Checkout ──────────────────────────────────────────
  useEffect(() => {
    if (checkoutHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    checkoutHandled.current = true;

    const clean = () => window.history.replaceState({}, '', '/infra/overview');

    if (checkout === 'cancelled') {
      toast.info('Checkout cancelled.');
      sessionStorage.removeItem(PENDING_KEY);
      clean();
      return;
    }

    const sessionId = params.get('session_id');
    let pending: { phoneNumber?: string; x?: number; y?: number } | null = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    } catch {
      pending = null;
    }
    const phoneNumber = params.get('number') || pending?.phoneNumber;
    const position =
      pending && pending.x != null && pending.y != null
        ? { x: pending.x, y: pending.y }
        : undefined;

    if (!sessionId || !phoneNumber) {
      clean();
      return;
    }

    let attempts = 0;
    const tryComplete = async () => {
      attempts++;
      try {
        const res = await api.phoneComplete(sessionId, phoneNumber, position);
        if (res.ready && res.resourceId) {
          sessionStorage.removeItem(PENDING_KEY);
          toast.success('Number added to your workspace.');
          await refetch();
          select(res.resourceId, 'overview');
          clean();
          return;
        }
      } catch {
        // ignore — retry below
      }
      if (attempts < 6) {
        setTimeout(tryComplete, 2500);
      } else {
        toast.message(
          'Payment received — your number is being provisioned and will appear shortly.'
        );
        clean();
        await refetch();
      }
    };
    tryComplete();
  }, [api, refetch, select]);

  const selectedNode = useMemo(
    () => rawNodes.find((n) => n.id === selectedNodeId) ?? null,
    [rawNodes, selectedNodeId]
  );

  const draftCount = useMemo(
    () => rawEdges.filter((e) => !e.applied && e.status !== 'BROKEN').length,
    [rawEdges]
  );

  const nodesById = useMemo(
    () => new Map(rawNodes.map((n) => [n.id, n])),
    [rawNodes]
  );

  const setup = useMemo(
    () => setupSteps(rawNodes, rawEdges, hasOrg),
    [rawNodes, rawEdges, hasOrg]
  );

  const firstOfType = useCallback(
    (t: InfrastructureResourceType) =>
      rawNodes.find((n) => n.type === t) ?? null,
    [rawNodes]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_e, node) => {
      if (!canMutate) return;
      api
        .updatePosition(node.id, node.position.x, node.position.y)
        .catch(() => undefined);
    },
    [api, canMutate]
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!canMutate) {
        toast.error('Only workspace admins can change connections.');
        return;
      }
      try {
        const result = await api.createConnection(
          connection.source,
          connection.target
        );
        toast[result.applied ? 'success' : 'info'](result.message);
        await refetch();
      } catch {
        toast.error('Could not create that connection.');
      }
    },
    [api, canMutate, refetch]
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!canMutate) return;
      dismissHint();
      const flow = screenToFlowPosition({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY
      });
      openMenu({
        kind: 'pane',
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
        flowX: flow.x,
        flowY: flow.y
      });
    },
    [canMutate, dismissHint, openMenu, screenToFlowPosition]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      openMenu({
        kind: 'node',
        x: event.clientX,
        y: event.clientY,
        flowX: 0,
        flowY: 0,
        nodeId: node.id
      });
    },
    [openMenu]
  );

  const runTransition = useCallback(
    async (node: InfraNode, to: 'active' | 'paused') => {
      try {
        await api.updateConfiguration(node.id, { transition: to });
        toast.success(
          to === 'active' ? 'Campaign started.' : 'Campaign paused.'
        );
        await refetch();
      } catch (err) {
        toast.error(
          (err as { message?: string })?.message ?? 'Could not change status.'
        );
      }
    },
    [api, refetch]
  );

  const handleNodeAction = useCallback(
    async (key: NodeActionKey, node: InfraNode) => {
      const action = getNodeActions(node.type, { hasOrg }).find(
        (a) => a.key === key
      );
      if (action?.tab) {
        select(node.id, action.tab);
        return;
      }
      if (!canMutate) {
        toast.error('Only workspace admins can change the canvas.');
        return;
      }
      switch (key) {
        case 'remove':
          try {
            await api.hide(node.id);
            toast.success(`Removed “${node.name}” from the canvas.`);
            if (selectedNodeId === node.id) closeInspector();
            await refetch();
          } catch {
            toast.error('Could not remove that node.');
          }
          return;
        case 'start':
          await runTransition(node, 'active');
          return;
        case 'pause':
          await runTransition(node, 'paused');
          return;
        // Dangerous actions route to the inspector tab that owns their confirm.
        case 'delete':
          select(node.id, 'settings');
          return;
        case 'release':
          select(node.id, 'billing');
          return;
        case 'regenerate':
          select(node.id, 'credentials');
          return;
      }
    },
    [
      api,
      canMutate,
      closeInspector,
      hasOrg,
      refetch,
      runTransition,
      select,
      selectedNodeId
    ]
  );

  const handleCreated = useCallback<OnResourceCreated>(
    (resourceId, opts) => {
      if (opts?.credentials) setCredentials(resourceId, opts.credentials);
      void refetch().then(() => {
        if (opts?.multiple) {
          fitView({ duration: 300 });
        } else {
          select(resourceId, opts?.tab ?? 'overview');
        }
      });
    },
    [fitView, refetch, select, setCredentials]
  );

  const handleLinked = useCallback(
    async (resourceIds: string[]) => {
      await refetch();
      if (resourceIds.length === 1) {
        select(resourceIds[0]);
      } else {
        fitView({ duration: 300 });
      }
    },
    [fitView, refetch, select]
  );

  const confirmDeleteEdge = useCallback(async () => {
    if (!edgeToDelete) return;
    try {
      await api.deleteConnection(edgeToDelete.id);
      toast.success('Connection removed.');
      await refetch();
    } catch {
      toast.error('Could not remove that connection.');
    } finally {
      setEdgeToDelete(null);
    }
  }, [api, edgeToDelete, refetch]);

  const closeAddModal = useCallback(
    () => setAddModal({ open: false, type: null, position: null }),
    []
  );

  const openCreate = useCallback(
    (type: InfrastructureResourceType) =>
      setAddModal({ open: true, type, position: null }),
    []
  );

  // Setup-checklist step → the right add flow, or jump to the node + tab that
  // completes it (reuses the existing create/inspector surfaces).
  const handleStepAction = useCallback(
    (key: SetupActionKey) => {
      switch (key) {
        case 'add_member':
          openCreate('TEAM_MEMBER');
          return;
        case 'add_number':
          openCreate('PHONE_NUMBER');
          return;
        case 'add_campaign':
          openCreate('CAMPAIGN');
          return;
        case 'add_sip':
          openCreate('SIP_DEVICE');
          return;
        case 'assign_agents': {
          const c = firstOfType('CAMPAIGN');
          if (c) select(c.id, 'agents');
          else openCreate('CAMPAIGN');
          return;
        }
        case 'connect_number_campaign': {
          const c = firstOfType('CAMPAIGN');
          if (c) select(c.id, 'numbers');
          else openCreate('CAMPAIGN');
          return;
        }
        case 'connect_number_device': {
          const num = firstOfType('PHONE_NUMBER');
          if (num) select(num.id, 'routing');
          else openCreate('PHONE_NUMBER');
          return;
        }
        case 'start_calling': {
          const c = firstOfType('CAMPAIGN');
          if (c) select(c.id, 'overview');
          else
            toast.info('Add a number, then open the dialer to start calling.');
          return;
        }
      }
    },
    [firstOfType, openCreate, select]
  );

  const handleTemplate = useCallback((template: InfraTemplate) => {
    setTemplateLabel(template.label);
    setChecklistDismissed(false);
    try {
      localStorage.setItem(TEMPLATE_KEY, template.label);
      localStorage.setItem(CHECKLIST_KEY, '0');
    } catch {
      // ignore
    }
    if (template.firstAdd) {
      setAddModal({ open: true, type: template.firstAdd, position: null });
    }
  }, []);

  const handleEdgeEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const raw = rawEdges.find((r) => r.id === edge.id);
      if (!raw) return;
      setHoveredEdgeId(edge.id);
      setEdgeTip({
        x: event.clientX,
        y: event.clientY,
        text: edgeSentence(raw, nodesById)
      });
    },
    [rawEdges, nodesById]
  );

  const handleEdgeMove = useCallback((event: React.MouseEvent) => {
    setEdgeTip((t) => (t ? { ...t, x: event.clientX, y: event.clientY } : t));
  }, []);

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdgeId(null);
    setEdgeTip(null);
  }, []);

  const menuNode = useMemo(
    () =>
      menu?.kind === 'node'
        ? (rawNodes.find((n) => n.id === menu.nodeId) ?? null)
        : null,
    [menu, rawNodes]
  );

  const busy = loading || contextSwitching;
  const showWelcome = !welcomeSeen && !busy && !error;
  const showChecklist =
    !busy &&
    !error &&
    !showWelcome &&
    rawNodes.length > 0 &&
    canMutate &&
    !setup.complete &&
    !checklistDismissed;
  // The generic "right-click to add" nudge only surfaces once the guided
  // checklist is out of the way (setup done or dismissed).
  const showHint =
    !hintDismissed &&
    !busy &&
    !error &&
    rawNodes.length > 0 &&
    canMutate &&
    !showChecklist &&
    !showWelcome;

  return (
    <div className='relative h-full w-full'>
      <motion.div
        className='absolute inset-0'
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onNodeClick={(_e, node) => select(node.id)}
          onPaneClick={() => closeMenu()}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeClick={(_e, edge) => {
            const raw = rawEdges.find((r) => r.id === edge.id);
            if (raw && canMutate) setEdgeToDelete(raw);
          }}
          onEdgeMouseEnter={handleEdgeEnter}
          onEdgeMouseMove={handleEdgeMove}
          onEdgeMouseLeave={handleEdgeLeave}
          nodesConnectable={canMutate}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          className='bg-background'
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.3}
            color='var(--border)'
          />
          <Controls
            showInteractive={false}
            className='[&_button]:!border-border [&_button]:!bg-card [&_button]:!text-muted-foreground !rounded-lg !border !shadow-md'
          />
          <MiniMap
            pannable
            zoomable
            className='!right-4 !bottom-4 !m-0 overflow-hidden !rounded-xl !border'
            style={{ width: 168, height: 112 }}
            bgColor='transparent'
            maskColor='color-mix(in oklch, var(--background) 70%, transparent)'
            nodeColor={(n) =>
              MINIMAP_COLOR[(n.data as ResourceNodeData)?.node?.type] ??
              'var(--muted-foreground)'
            }
            nodeStrokeWidth={0}
            nodeBorderRadius={4}
          />
        </ReactFlow>
      </motion.div>

      <AnimatePresence>
        {!busy && !error && rawNodes.length === 0 ? (
          <EmptyState
            key='empty'
            hasOrg={hasOrg}
            onAdd={(type) => {
              dismissHint();
              setAddModal({ open: true, type, position: null });
            }}
            onTemplate={handleTemplate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {busy ? (
          <motion.div
            key='busy'
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className='bg-background/70 absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm'
          >
            <div className='bg-card/90 flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-lg ring-1 ring-white/5'>
              <IconLoader2 className='text-primary size-4 animate-spin' />
              <p className='text-sm font-medium'>
                {contextSwitching
                  ? 'Switching workspace…'
                  : 'Loading architecture…'}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <div className='bg-background/60 absolute inset-0 z-10 flex items-center justify-center'>
          <p className='text-destructive text-sm'>{error}</p>
        </div>
      ) : null}

      <PendingChangesBar draftCount={draftCount} />

      <AnimatePresence>
        {showWelcome ? (
          <InfraWelcome key='welcome' onDismiss={dismissWelcome} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showChecklist ? (
          <SetupChecklist
            key='checklist'
            state={setup}
            templateLabel={templateLabel}
            onStepAction={handleStepAction}
            onDismiss={dismissChecklist}
          />
        ) : null}
      </AnimatePresence>

      {edgeTip ? (
        <div
          className='bg-card/95 pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-lg ring-1 ring-white/5 backdrop-blur'
          style={{ left: edgeTip.x, top: edgeTip.y }}
        >
          {edgeTip.text}
        </div>
      ) : null}

      <AnimatePresence>
        {showHint ? (
          <motion.div
            key='hint'
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className='pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2'
          >
            <div className='bg-card/90 text-muted-foreground pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs shadow-md ring-1 ring-white/5 backdrop-blur'>
              <IconInfoCircle className='size-3.5 shrink-0' />
              <span>
                Right-click anywhere or use{' '}
                <span className='text-foreground font-medium'>
                  Add resource
                </span>{' '}
                to build your calling architecture.
              </span>
              <button
                type='button'
                onClick={dismissHint}
                aria-label='Dismiss hint'
                className='hover:text-foreground ml-1 transition-colors'
              >
                <IconX className='size-3.5' />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {menu?.kind === 'pane' ? (
        <CanvasContextMenu
          x={menu.x}
          y={menu.y}
          hasOrg={hasOrg}
          onAdd={(type) =>
            setAddModal({
              open: true,
              type,
              position: { x: menu.flowX, y: menu.flowY }
            })
          }
          onLink={() =>
            setAddModal({
              open: true,
              type: null,
              position: { x: menu.flowX, y: menu.flowY }
            })
          }
          onFitView={() => fitView({ duration: 300 })}
          onClose={closeMenu}
        />
      ) : null}

      {menu?.kind === 'node' && menuNode ? (
        <NodeContextMenu
          x={menu.x}
          y={menu.y}
          node={menuNode}
          hasOrg={hasOrg}
          onAction={(key) => handleNodeAction(key, menuNode)}
          onClose={closeMenu}
        />
      ) : null}

      <ResourceInspector
        node={selectedNode}
        tab={inspectorTab}
        hasOrg={hasOrg}
        onTabChange={setTab}
        onClose={closeInspector}
        onRefetch={refetch}
        nodes={rawNodes}
        edges={rawEdges}
        onOpenCreate={openCreate}
        canMutate={canMutate}
      />

      <AddResourceModal
        open={addModal.open}
        type={addModal.type}
        position={addModal.position}
        hasOrg={hasOrg}
        onClose={closeAddModal}
        onCreated={handleCreated}
        onLinked={handleLinked}
      />

      <AlertDialog
        open={!!edgeToDelete}
        onOpenChange={(o) => !o && setEdgeToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this connection?</AlertDialogTitle>
            <AlertDialogDescription>
              {edgeToDelete?.applied
                ? 'This reflects a real relationship in your workspace. Removing it will update the underlying resources.'
                : 'This draft connection will be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteEdge}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
