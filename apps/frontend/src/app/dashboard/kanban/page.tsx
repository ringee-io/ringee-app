import KanbanViewPage from '@/features/kanban/components/kanban-view-page';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('contacts.kanban');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default function Page() {
  return <KanbanViewPage />;
}
