import { useRef, useCallback, useEffect } from 'react';
import { createCallSocket } from '../lib/api';
import type { CallEvent } from '../lib/types';

export function useWebSocket(onEvent: (event: CallEvent) => void) {
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(
    (sessionId: string) => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      const socket = createCallSocket(sessionId, onEvent);
      socket.onclose = () => {};
      socketRef.current = socket;
    },
    [onEvent],
  );

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  return { connect, disconnect };
}
