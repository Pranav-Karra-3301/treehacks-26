'use client';

import { FormEvent, useState } from 'react';
import { createTask, startCall } from '@/lib/api';
import { useRouter } from 'next/navigation';

type FormValues = {
  task_type: 'bill_reduction' | 'price_negotiation' | 'custom';
  target_phone: string;
  objective: string;
  context: string;
  target_outcome: string;
  walkaway_point: string;
  agent_persona: string;
  opening_line: string;
  style: 'collaborative' | 'assertive' | 'empathetic';
};

export default function NewTaskForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({
    task_type: 'custom',
    target_phone: '',
    objective: '',
    context: '',
    target_outcome: '',
    walkaway_point: '',
    agent_persona: 'Polite but firm. My name is Alex.',
    opening_line: "Hi, I'm calling about my account and I'd like to review my current rate.",
    style: 'collaborative',
  });
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const task = await createTask(values);
      await startCall(task.id);
      router.push(`/call/${task.id}`);
    } catch (error) {
      console.error(error);
      alert('Unable to start task. Check backend connection.');
    } finally {
      setLoading(false);
    }
  }

  function setField(field: keyof FormValues, value: string) {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block space-y-1 text-sm">
        <span>Task Type</span>
        <select
          className="input w-full"
          value={values.task_type}
          onChange={(event) => setField('task_type', event.target.value)}
        >
          <option value="bill_reduction">bill_reduction</option>
          <option value="price_negotiation">price_negotiation</option>
          <option value="custom">custom</option>
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span>Target Phone</span>
        <input
          className="input w-full"
          value={values.target_phone}
          onChange={(event) => setField('target_phone', event.target.value)}
          placeholder="+1234567890"
          required
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Objective</span>
        <input
          className="input w-full"
          value={values.objective}
          onChange={(event) => setField('objective', event.target.value)}
          required
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Context</span>
        <textarea
          className="input w-full"
          rows={3}
          value={values.context}
          onChange={(event) => setField('context', event.target.value)}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span>Target Outcome</span>
          <input
            className="input w-full"
            value={values.target_outcome}
            onChange={(event) => setField('target_outcome', event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Walkaway Point</span>
          <input
            className="input w-full"
            value={values.walkaway_point}
            onChange={(event) => setField('walkaway_point', event.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span>Style</span>
        <select
          className="input w-full"
          value={values.style}
          onChange={(event) => setField('style', event.target.value)}
        >
          <option value="collaborative">collaborative</option>
          <option value="assertive">assertive</option>
          <option value="empathetic">empathetic</option>
        </select>
      </label>

      <button className="btn w-full" type="submit" disabled={loading}>
        {loading ? 'Starting…' : 'Start Call'}
      </button>
    </form>
  );
}
