import { useState, useCallback, useEffect, useRef } from 'react';
import { listTasks } from '../lib/api';
import type { TaskSummary } from '../lib/types';

export function usePastTasks() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    listTasks()
      .then((data) => {
        if (mountedRef.current) setTasks(data);
      })
      .catch(() => {})
      .finally(() => {
        fetchingRef.current = false;
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tasks, loading, refresh };
}
