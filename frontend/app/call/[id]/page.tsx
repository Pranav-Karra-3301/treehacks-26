'use client';

import { useEffect, useMemo, useState } from 'react';
import { createCallSocket } from '@/lib/api';
import { getTask, stopCall } from '@/lib/api';
import type { TaskDetail, CallEvent, TranscriptEntry } from '@/lib/types';
import { useRouter, useParams } from 'next/navigation';

export default function CallMonitorPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [status, setStatus] = useState('connecting');
  const [thinking, setThinking] = useState('');

  useEffect(() => {
    let socket: WebSocket;
    let mounted = true;

    getTask(taskId).then((nextTask) => {
      if (!mounted) return;
      setTask(nextTask);
    });

    socket = createCallSocket(taskId, (event: CallEvent) => {
      if (event.type === 'call_status') {
        const statusValue = String((event.data as { status?: string }).status || 'connected');
        setStatus(statusValue);
      }
      if (event.type === 'transcript_update') {
        const payload = event.data as { speaker?: 'caller' | 'agent'; content?: string; created_at?: string };
        if (payload.speaker && payload.content) {
          setTranscripts((prev) => [
            ...prev,
            { speaker: payload.speaker!, content: payload.content!, created_at: new Date().toISOString() },
          ]);
        }
      }
      if (event.type === 'agent_thinking') {
        setThinking((prev) => prev + String((event.data as { delta?: string }).delta || ''));
      }
    });

    return () => {
      mounted = false;
      socket?.close();
    };
  }, [taskId]);

  const grouped = useMemo(() => transcripts.slice(-40), [transcripts]);

  async function endCall() {
    await stopCall(taskId);
    setStatus('ended');
    router.push('/history');
  }

  return (
    <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Live Call Monitor</h2>
            <p className="text-sm text-[var(--muted)]">Task {taskId}</p>
          </div>
          <div className="text-sm">Status: <span className="font-semibold">{status}</span></div>
        </div>
        <div className="mt-4 card p-3">
          <div className="text-sm text-[var(--muted)]">LLM Draft Stream</div>
          <pre className="mt-2 h-20 overflow-auto text-xs">{thinking}</pre>
        </div>
        <div className="mt-4 card p-3">
          <div className="transcript-scroll space-y-2">
            {grouped.map((entry, idx) => (
              <p
                key={`${entry.created_at}-${idx}`}
                className={entry.speaker === 'agent' ? 'text-[var(--accent-soft)]' : 'text-[var(--accent)]'}
              >
                <span className="font-semibold">[{entry.speaker}]</span> {entry.content}
              </p>
            ))}
          </div>
        </div>
        <button className="btn mt-4" onClick={endCall}>End Call</button>
      </div>
      <div className="card p-4">
        <h3 className="font-semibold">Task Snapshot</h3>
        {task ? (
          <div className="mt-3 space-y-2 text-sm">
            <p><span className="text-[var(--muted)]">Objective:</span> {task.objective}</p>
            <p><span className="text-[var(--muted)]">Phone:</span> {task.target_phone}</p>
            <p><span className="text-[var(--muted)]">Outcome:</span> {task.outcome}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">Loading task details…</p>
        )}
      </div>
    </section>
  );
}
