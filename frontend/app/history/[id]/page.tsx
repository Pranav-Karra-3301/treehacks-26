import { getTask, getTaskAnalysis } from '@/lib/api';
import { BACKEND_API_URL } from '@/lib/config';

type Params = { id: string };

async function loadData(id: string) {
  const task = await getTask(id);
  const analysis = await getTaskAnalysis(id);
  return { task, analysis };
}

export default async function CallDetailPage({ params }: { params: Params }) {
  const { task, analysis } = await loadData(params.id);

  return (
    <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <article className="card p-4">
        <h2 className="text-xl font-bold">Call Detail</h2>
        <p className="text-sm text-[var(--muted)]">{task.objective}</p>
        <div className="mt-4">
          <p className="text-sm">Status: {task.status}</p>
          <p className="text-sm">Outcome: {task.outcome}</p>
          <p className="text-sm">Duration: {task.duration_seconds}s</p>
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Post-call Analysis</h3>
          <pre className="mt-2 h-56 overflow-auto rounded bg-[var(--panel-soft)] p-3 text-xs">{JSON.stringify(analysis, null, 2)}</pre>
        </div>
      </article>
      <article className="card p-4">
        <h3 className="font-semibold">Task Metadata</h3>
        <p className="mt-2 text-sm">Phone: {task.target_phone}</p>
        <p className="text-sm">Context: {task.context}</p>
        <div className="mt-3 space-y-1 text-sm">
          <a href={`${BACKEND_API_URL}/api/tasks/${task.id}/audio?side=mixed`} className="block text-[var(--accent)]">Download mixed audio</a>
          <a href={`${BACKEND_API_URL}/api/tasks/${task.id}/audio?side=inbound`} className="block text-[var(--accent)]">Download inbound audio</a>
          <a href={`${BACKEND_API_URL}/api/tasks/${task.id}/audio?side=outbound`} className="block text-[var(--accent)]">Download outbound audio</a>
        </div>
      </article>
    </section>
  );
}
