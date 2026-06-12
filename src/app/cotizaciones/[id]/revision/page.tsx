import { RevisionScreen } from "./revision-screen";

export default async function RevisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RevisionScreen id={id} />;
}
