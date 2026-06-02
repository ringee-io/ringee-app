import { RenderClient } from "./RenderClient";

export default async function RenderPage({
  params,
}: {
  params: Promise<{ component: string }>;
}) {
  const { component } = await params;
  return (
    <main className="min-h-dvh bg-background">
      <RenderClient component={component} />
    </main>
  );
}
