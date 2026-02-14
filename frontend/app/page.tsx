import NewTaskForm from '@/components/new-task-form';

export default function HomePage() {
  return (
    <section className="card p-6 animate-pop">
      <h2 className="text-xl font-bold">New Negotiation Task</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Fill in the task details and start a live phone negotiation session.
      </p>
      <div className="mt-4">
        <NewTaskForm />
      </div>
    </section>
  );
}
