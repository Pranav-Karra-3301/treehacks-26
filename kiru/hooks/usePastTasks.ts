import { useState, useCallback, useEffect } from 'react';
import { listTasks } from '../lib/api';
import type { TaskSummary } from '../lib/types';

export function usePastTasks() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);

  const refresh = useCallback(() => {
    listTasks().then(setTasks).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, refresh };
}
