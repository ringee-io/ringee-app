import KanbanViewPage from '@/features/kanban/components/kanban-view-page';

export const metadata = {
  title: 'Sales Pipeline — Visualize and Organize Leads | Ringee',
  description:
    'Manage your sales pipeline visually with Ringee. Organize leads, track calls, and move deals through every stage with clarity and efficiency.'
};

export default function Page() {
  return <KanbanViewPage />;
}
