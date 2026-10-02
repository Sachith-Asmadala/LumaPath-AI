import { FocusSession } from "@/features/focus/components/focus-session";

export default async function FocusPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  return <FocusSession initialTaskId={task} />;
}
