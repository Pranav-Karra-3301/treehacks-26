import { useState, useRef, useCallback, useEffect } from 'react';
import {
  createTask,
  startCall,
  stopCall,
  getTaskAnalysis,
  getTaskTranscript,
  getTask,
  searchResearch,
} from '../lib/api';
import type {
  CallEvent,
  CallStatus,
  AnalysisPayload,
  BusinessResult,
} from '../lib/types';
import { useWebSocket } from './useWebSocket';
import { useLocation } from './useLocation';
import { usePastTasks } from './usePastTasks';

export type Message = {
  id: string;
  role: 'user' | 'ai' | 'status' | 'analysis' | 'audio' | 'search-results';
  text: string;
  analysisData?: AnalysisPayload;
  audioTaskId?: string;
  searchResults?: BusinessResult[];
};

export type ConversationPhase =
  | 'objective'
  | 'discovery'
  | 'phone'
  | 'connecting'
  | 'active'
  | 'ended';

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChatMachine() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' },
  ]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ConversationPhase>('objective');
  const [typing, setTyping] = useState(false);
  const [objective, setObjective] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('pending');
  const [researchContext, setResearchContext] = useState('');
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<BusinessResult[]>([]);

  const analysisLoadedRef = useRef(false);
  const thinkingBufferRef = useRef('');
  const endedProcessedRef = useRef(false);

  const userLocation = useLocation();
  const { tasks: pastTasks, loading: pastTasksLoading, refresh: refreshPastTasks } = usePastTasks();

  // ── Helpers ─────────────────────────────────────────────────
  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: genId() }]);
  }, []);

  const aiReply = useCallback(
    (text: string, delay = 700) => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        addMessage({ role: 'ai', text });
      }, delay);
    },
    [addMessage],
  );

  // ── Analysis loader ─────────────────────────────────────────
  const loadAnalysis = useCallback(
    async (tid: string) => {
      if (analysisLoadedRef.current) return;
      analysisLoadedRef.current = true;
      try {
        const data = await getTaskAnalysis(tid);
        setMessages((prev) => [
          ...prev,
          { id: `analysis-${Date.now()}`, role: 'analysis', text: '', analysisData: data },
          { id: `audio-${Date.now()}`, role: 'audio', text: '', audioTaskId: tid },
        ]);
        setAnalysisLoaded(true);
      } catch {
        analysisLoadedRef.current = false;
      }
    },
    [],
  );

  // ── WebSocket event handler ─────────────────────────────────
  const handleCallEvent = useCallback(
    (event: CallEvent) => {
      switch (event.type) {
        case 'call_status': {
          const status = event.data.status;
          setCallStatus(status);
          if (status === 'dialing') {
            addMessage({ role: 'status', text: 'Dialing...' });
          } else if (status === 'active') {
            addMessage({ role: 'status', text: 'Connected' });
            setPhase('active');
          } else if (status === 'ended') {
            if (endedProcessedRef.current) break; // skip duplicate
            endedProcessedRef.current = true;
            addMessage({ role: 'status', text: 'Call ended' });
            addMessage({ role: 'ai', text: 'The call has ended. Preparing your analysis...' });
            setPhase('ended');
          } else if (status === 'failed') {
            const errorData = event.data as { status: CallStatus; error?: string };
            addMessage({
              role: 'status',
              text: `Call failed${errorData.error ? `: ${errorData.error}` : ''}`,
            });
            setPhase('ended');
          }
          break;
        }
        case 'transcript_update': {
          const { speaker, content } = event.data;
          if (speaker === 'agent') {
            addMessage({ role: 'ai', text: content });
          } else {
            addMessage({ role: 'status', text: `Receiver: ${content}` });
          }
          setTyping(false);
          break;
        }
        case 'agent_thinking': {
          setTyping(true);
          thinkingBufferRef.current += event.data.delta;
          break;
        }
        case 'strategy_update': {
          const tactics = event.data.tactics;
          if (tactics && tactics.length > 0) {
            addMessage({ role: 'status', text: `Strategy: ${tactics.join(', ')}` });
          }
          break;
        }
        case 'analysis_ready': {
          const tid = event.data.task_id;
          if (tid) loadAnalysis(tid);
          break;
        }
      }
    },
    [addMessage, loadAnalysis],
  );

  const { connect: connectWs, disconnect: disconnectWs } = useWebSocket(handleCallEvent);

  // ── Fallback: load analysis 5s after call ends ──────────────
  useEffect(() => {
    if (phase === 'ended' && taskId && !analysisLoadedRef.current) {
      const timer = setTimeout(() => loadAnalysis(taskId), 5000);
      return () => clearTimeout(timer);
    }
  }, [phase, taskId, loadAnalysis]);

  // ── Start negotiation ───────────────────────────────────────
  const startNegotiation = useCallback(
    async (phone: string) => {
      setPhase('connecting');
      addMessage({ role: 'status', text: 'Setting up your negotiation...' });

      try {
        const task = await createTask({
          target_phone: phone,
          objective,
          task_type: 'custom',
          style: 'collaborative',
          ...(researchContext && { context: researchContext }),
          ...(userLocation && { location: userLocation }),
        });
        setTaskId(task.id);
        refreshPastTasks();

        const callResult = await startCall(task.id);

        if (!callResult.ok) {
          addMessage({
            role: 'ai',
            text: `Could not start the call: ${callResult.message}. Please try again.`,
          });
          setPhase('objective');
          return;
        }

        const sid = callResult.session_id;
        if (sid) {
          setSessionId(sid);
          connectWs(sid);
          addMessage({
            role: 'ai',
            text: "Starting your negotiation now. I'll update you in real-time as the call progresses.",
          });
        } else {
          addMessage({ role: 'ai', text: 'Call initiated. Waiting for connection...' });
          setPhase('active');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        addMessage({ role: 'ai', text: `Something went wrong: ${errorMsg}. Please try again.` });
        setPhase('objective');
      }
    },
    [objective, researchContext, userLocation, addMessage, connectWs, refreshPastTasks],
  );

  // ── End call ────────────────────────────────────────────────
  const handleEndCall = useCallback(async () => {
    if (!taskId) return;
    try {
      const result = await stopCall(taskId);
      if (result.ok) {
        addMessage({ role: 'status', text: 'Ending call...' });
      } else {
        addMessage({ role: 'ai', text: result.message || 'Could not end the call.' });
      }
    } catch {
      addMessage({ role: 'ai', text: 'Could not end the call. It may have already ended.' });
    }
  }, [taskId, addMessage]);

  // ── New negotiation ─────────────────────────────────────────
  const handleNewNegotiation = useCallback(() => {
    disconnectWs();
    setMessages([{ id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' }]);
    setInput('');
    setPhase('objective');
    setTyping(false);
    setObjective('');
    setPhoneNumber('');
    setTaskId(null);
    setSessionId(null);
    setCallStatus('pending');
    setResearchContext('');
    setAnalysisLoaded(false);
    setDiscoveryResults([]);
    analysisLoadedRef.current = false;
    thinkingBufferRef.current = '';
    endedProcessedRef.current = false;
    refreshPastTasks();
  }, [disconnectWs, refreshPastTasks]);

  // ── Call from search ────────────────────────────────────────
  const handleCallFromSearch = useCallback(
    (result: BusinessResult, phone: string) => {
      setPhoneNumber(phone);
      addMessage({ role: 'user', text: `Call ${result.title || phone}` });
      const snippet = result.snippet || '';
      const extra = `Selected business: ${result.title || 'Unknown'}\n${snippet}`;
      setResearchContext((prev) => (prev ? `${prev}\n\n${extra}` : extra));
      startNegotiation(phone);
    },
    [addMessage, startNegotiation],
  );

  // ── Skip discovery ──────────────────────────────────────────
  const handleSkipDiscovery = useCallback(() => {
    setPhase('phone');
    addMessage({ role: 'user', text: 'I have my own number' });
    aiReply("No problem. What's the phone number I should call?", 500);
  }, [addMessage, aiReply]);

  // ── Load past chat ──────────────────────────────────────────
  const loadPastChat = useCallback(
    async (id: string) => {
      disconnectWs();
      const newMessages: Message[] = [];

      try {
        const [task, transcriptRes] = await Promise.all([
          getTask(id),
          getTaskTranscript(id).catch(() => null),
        ]);

        setTaskId(id);
        setObjective(task.objective || '');
        setPhoneNumber(task.target_phone || '');
        setCallStatus('pending');
        setSessionId(null);
        setResearchContext('');
        setTyping(false);
        setDiscoveryResults([]);
        thinkingBufferRef.current = '';

        newMessages.push({ id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' });
        if (task.objective) {
          newMessages.push({ id: `obj-${Date.now()}`, role: 'user', text: task.objective });
        }
        if (task.target_phone) {
          newMessages.push({
            id: `ai-phone-${Date.now()}`,
            role: 'ai',
            text: "Got it. What's the phone number I should call?",
          });
          newMessages.push({ id: `phone-${Date.now()}`, role: 'user', text: task.target_phone });
        }

        if (transcriptRes?.turns?.length) {
          newMessages.push({ id: `status-connected-${Date.now()}`, role: 'status', text: 'Connected' });
          for (const turn of transcriptRes.turns) {
            const msgId = `t-${Date.now()}-${Math.random()}`;
            if (turn.speaker === 'agent') {
              newMessages.push({ id: msgId, role: 'ai', text: turn.content });
            } else {
              newMessages.push({ id: msgId, role: 'status', text: `Receiver: ${turn.content}` });
            }
          }
          newMessages.push({ id: `status-ended-${Date.now()}`, role: 'status', text: 'Call ended' });
        }

        try {
          const analysis = await getTaskAnalysis(id);
          newMessages.push({
            id: `analysis-${Date.now()}`,
            role: 'analysis',
            text: '',
            analysisData: analysis,
          });
          newMessages.push({ id: `audio-${Date.now()}`, role: 'audio', text: '', audioTaskId: id });
          setAnalysisLoaded(true);
          analysisLoadedRef.current = true;
        } catch {
          setAnalysisLoaded(false);
          analysisLoadedRef.current = false;
        }

        setMessages(newMessages);
        setPhase('ended');
      } catch {
        // If loading fails, stay where we are
      }
    },
    [disconnectWs],
  );

  // ── Call again (same objective + phone) ─────────────────────
  const handleCallAgain = useCallback(() => {
    disconnectWs();
    setMessages([
      { id: 'welcome', role: 'ai', text: 'What would you like me to negotiate?' },
      { id: `obj-${Date.now()}`, role: 'user', text: objective },
      { id: `ai-phone-${Date.now()}`, role: 'ai', text: "Got it. What's the phone number I should call?" },
      { id: `phone-${Date.now()}`, role: 'user', text: phoneNumber },
    ]);
    setInput('');
    setTyping(false);
    setTaskId(null);
    setSessionId(null);
    setCallStatus('pending');
    setResearchContext('');
    setAnalysisLoaded(false);
    setDiscoveryResults([]);
    analysisLoadedRef.current = false;
    thinkingBufferRef.current = '';
    endedProcessedRef.current = false;
    startNegotiation(phoneNumber);
  }, [disconnectWs, objective, phoneNumber, startNegotiation]);

  // ── Handle send ─────────────────────────────────────────────
  function looksLikePhone(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 10;
  }

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || typing) return;

    addMessage({ role: 'user', text });
    setInput('');

    if (phase === 'objective') {
      setObjective(text);

      if (looksLikePhone(text)) {
        const digits = text.replace(/[^\d+]/g, '');
        const phone = digits.length >= 10 ? digits : text;
        setPhoneNumber(phone);

        const searchQuery = userLocation ? `${text} near ${userLocation}` : text;
        searchResearch(searchQuery)
          .then((res) => {
            if (res.ok && res.count > 0) {
              const snippets = res.results
                .filter((r) => r.snippet)
                .map((r) => `${r.title ?? ''}: ${r.snippet}`)
                .join('\n');
              setResearchContext(snippets);
            }
          })
          .catch(() => {});

        startNegotiation(phone);
        return;
      }

      setTyping(true);
      const searchQuery = userLocation ? `${text} near ${userLocation}` : text;
      searchResearch(searchQuery)
        .then((res) => {
          setTyping(false);

          if (res.ok && res.count > 0) {
            const snippets = res.results
              .filter((r) => r.snippet)
              .map((r) => `${r.title ?? ''}: ${r.snippet}`)
              .join('\n');
            setResearchContext(snippets);

            const withPhones = res.results.filter(
              (r) => r.phone_numbers && r.phone_numbers.length > 0,
            );

            if (withPhones.length > 0) {
              setDiscoveryResults(res.results);
              addMessage({
                role: 'ai',
                text: `I found ${withPhones.length} business${withPhones.length === 1 ? '' : 'es'} you can call directly. Pick one, or enter your own number.`,
              });
              addMessage({ role: 'search-results', text: '', searchResults: res.results });
              setPhase('discovery');
              return;
            }

            addMessage({
              role: 'status',
              text: `Found ${res.count} relevant result${res.count === 1 ? '' : 's'} for context`,
            });
          }

          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        })
        .catch(() => {
          setTyping(false);
          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        });
    } else if (phase === 'discovery') {
      if (looksLikePhone(text)) {
        setPhoneNumber(text);
        startNegotiation(text);
      } else {
        setPhase('phone');
        aiReply("What's the phone number I should call?", 400);
      }
    } else if (phase === 'phone') {
      setPhoneNumber(text);
      startNegotiation(text);
    } else if (phase === 'active') {
      aiReply("I'm currently on the call negotiating. I'll keep you posted on progress.", 400);
    }
  }, [
    input,
    typing,
    phase,
    userLocation,
    addMessage,
    aiReply,
    startNegotiation,
  ]);

  // ── Derived state ───────────────────────────────────────────
  const inputDisabled = phase === 'connecting';
  const isOnCall = phase === 'active' || (phase === 'connecting' && callStatus === 'active');
  const showPostCall = phase === 'ended' && analysisLoaded;
  const canCallAgain = showPostCall && !!objective && !!phoneNumber;

  const placeholderText = inputDisabled
    ? 'Setting up your negotiation...'
    : phase === 'discovery'
      ? 'Or type a phone number...'
      : phase === 'phone'
        ? 'Enter the phone number...'
        : phase === 'active'
          ? 'Send a note...'
          : phase === 'ended'
            ? 'Negotiation complete'
            : 'Describe what you want to negotiate...';

  return {
    messages,
    input,
    setInput,
    phase,
    typing,
    isOnCall,
    showPostCall,
    canCallAgain,
    inputDisabled,
    placeholderText,
    pastTasks,
    pastTasksLoading,
    refreshPastTasks,
    handleSend,
    handleEndCall,
    handleNewNegotiation,
    handleCallFromSearch,
    handleSkipDiscovery,
    handleCallAgain,
    loadPastChat,
    taskId,
  };
}
