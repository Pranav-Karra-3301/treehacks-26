import Link from 'next/link';
import { listTasks } from '@/lib/api';
import type { TaskSummary } from '@/lib/types';

async function getTasks(): Promise<TaskSummary[]> {
  return listTasks();
}

export default async function HistoryPage() {
  const tasks = await getTasks();

  return (
    <section className="card p-4">
      <h2 className="text-xl font-bold">Call History</h2>
      <div className="mt-4 grid gap-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No calls yet.</p>
        ) : (
          tasks.map((task) => (
            <article key={task.id} className="card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{task.objective}</p>
                  <p className="text-sm text-[var(--muted)]">{task.target_phone}</p>
                </div>
                <span className="text-xs">{task.status}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">Created: {task.created_at}</p>
              <div className="mt-2">
                <Link className="text-sm font-semibold text-[var(--accent)]" href={`/history/${task.id}`}>
                  View details
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
