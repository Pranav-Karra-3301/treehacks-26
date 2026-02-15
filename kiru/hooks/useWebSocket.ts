import { useRef, useCallback, useEffect } from 'react';
import { createCallSocket } from '../lib/api';
import type { CallEvent } from '../lib/types';

export function useWebSocket(onEvent: (event: CallEvent) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep the ref current without causing reconnections
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback((sessionId: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    const socket = createCallSocket(sessionId, (event) => {
      onEventRef.current(event);
    });
    socket.onclose = () => {};
    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  return { connect, disconnect };
}
