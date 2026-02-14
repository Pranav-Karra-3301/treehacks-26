'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowLeft, Phone, RotateCcw, AlertTriangle, Plus, PanelLeftClose, PanelLeft, BarChart3 } from 'lucide-react';
import { createTask, startCall, stopCall, createCallSocket, checkVoiceReadiness, searchResearch, getTaskAnalysis, getTaskTranscript, getTask, listTasks } from '../../lib/api';
import type { CallEvent, CallStatus, AnalysisPayload, TaskSummary, CallOutcome, BusinessResult } from '../../lib/types';
import AnalysisCard from '../../components/analysis-card';
import AudioPlayer from '../../components/audio-player';
import SearchResultCards from '../../components/search-result-cards';

type Message = {
  id: string;
  role: 'user' | 'ai' | 'status' | 'analysis' | 'audio' | 'search-results';
  text: string;
  analysisData?: AnalysisPayload;
  audioTaskId?: string;
  searchResults?: BusinessResult[];
};

type ConversationPhase = 'objective' | 'discovery' | 'phone' | 'connecting' | 'active' | 'ended';

const ease = [0.16, 1, 0.3, 1] as const;

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      text: 'What would you like me to negotiate?',
    },
  ]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<ConversationPhase>('objective');
  const [typing, setTyping] = useState(false);
  const [objective, setObjective] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('pending');
  const [readinessWarning, setReadinessWarning] = useState<string | null>(null);
  const [researchContext, setResearchContext] = useState('');
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pastTasks, setPastTasks] = useState<TaskSummary[]>([]);
  const [discoveryResults, setDiscoveryResults] = useState<BusinessResult[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const thinkingBufferRef = useRef('');
  const analysisLoadedRef = useRef(false);

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [phase]);

  // Fetch past tasks on mount
  const refreshPastTasks = useCallback(() => {
    listTasks().then(setPastTasks).catch(() => {});
  }, []);

  useEffect(() => {
    refreshPastTasks();
  }, [refreshPastTasks]);

  // Voice readiness check on mount
  useEffect(() => {
    checkVoiceReadiness()
      .then((r) => {
        if (!r.can_dial_live) {
          const issues: string[] = [];
          if (!r.twilio_configured) issues.push('Twilio not configured');
          if (!r.llm_ready) issues.push('LLM not ready');
          if (!r.deepgram_configured) issues.push('Deepgram not configured');
          setReadinessWarning(issues.join(', ') || 'Voice system not ready');
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }]);
  }

  function aiReply(text: string, delay = 700) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      addMessage({ role: 'ai', text });
    }, delay);
  }

  // Fetch and insert analysis + audio messages
  const loadAnalysis = useCallback(async (tid: string) => {
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
  }, []);

  // Handle incoming WebSocket events
  const handleCallEvent = useCallback((event: CallEvent) => {
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
          addMessage({ role: 'status', text: 'Call ended' });
          addMessage({ role: 'ai', text: 'The call has ended. Preparing your analysis...' });
          setPhase('ended');
        } else if (status === 'failed') {
          const errorData = event.data as { status: CallStatus; error?: string };
          addMessage({ role: 'status', text: `Call failed${errorData.error ? `: ${errorData.error}` : ''}` });
          setPhase('ended');
        }
        break;
      }
      case 'transcript_update': {
        const { speaker, content } = event.data;
        if (speaker === 'agent') {
          addMessage({ role: 'ai', text: content });
        } else {
          addMessage({ role: 'status', text: `Rep: ${content}` });
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
  }, [loadAnalysis]);

  // Fallback: load analysis 5s after call ends if event never arrived
  useEffect(() => {
    if (phase === 'ended' && taskId && !analysisLoadedRef.current) {
      const timer = setTimeout(() => {
        loadAnalysis(taskId);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [phase, taskId, loadAnalysis]);

  // Connect WebSocket when we have a session ID
  const connectWebSocket = useCallback((sid: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    const socket = createCallSocket(sid, handleCallEvent);
    socket.onclose = () => {};
    socketRef.current = socket;
  }, [handleCallEvent]);

  async function startNegotiation(phone: string) {
    setPhase('connecting');
    addMessage({ role: 'status', text: 'Setting up your negotiation...' });

    try {
      const task = await createTask({
        target_phone: phone,
        objective: objective,
        task_type: 'custom',
        style: 'collaborative',
        ...(researchContext && { context: researchContext }),
      });
      setTaskId(task.id);
      refreshPastTasks();

      const callResult = await startCall(task.id);

      if (!callResult.ok) {
        addMessage({ role: 'ai', text: `Could not start the call: ${callResult.message}. Please try again.` });
        setPhase('objective');
        return;
      }

      const sid = callResult.session_id;
      if (sid) {
        setSessionId(sid);
        connectWebSocket(sid);
        addMessage({ role: 'ai', text: `Starting your negotiation now. I'll update you in real-time as the call progresses.` });
      } else {
        addMessage({ role: 'ai', text: 'Call initiated. Waiting for connection...' });
        setPhase('active');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addMessage({ role: 'ai', text: `Something went wrong: ${errorMsg}. Please try again.` });
      setPhase('objective');
    }
  }

  async function handleEndCall() {
    if (taskId) {
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
    }
  }

  function handleNewNegotiation() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
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
    refreshPastTasks();
  }

  function handleCallFromSearch(result: BusinessResult, phone: string) {
    setPhoneNumber(phone);
    addMessage({ role: 'user', text: `Call ${result.title || phone}` });
    // Enrich context with this specific result
    const snippet = result.snippet || '';
    const extra = `Selected business: ${result.title || 'Unknown'}\n${snippet}`;
    setResearchContext((prev) => (prev ? `${prev}\n\n${extra}` : extra));
    startNegotiation(phone);
  }

  function handleSkipDiscovery() {
    setPhase('phone');
    addMessage({ role: 'user', text: 'I have my own number' });
    aiReply("No problem. What's the phone number I should call?", 500);
  }

  async function loadPastChat(id: string) {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

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
        newMessages.push({ id: `ai-phone-${Date.now()}`, role: 'ai', text: "Got it. What's the phone number I should call?" });
        newMessages.push({ id: `phone-${Date.now()}`, role: 'user', text: task.target_phone });
      }

      if (transcriptRes?.turns?.length) {
        newMessages.push({ id: `status-connected-${Date.now()}`, role: 'status', text: 'Connected' });
        for (const turn of transcriptRes.turns) {
          const msgId = `t-${Date.now()}-${Math.random()}`;
          if (turn.speaker === 'agent') {
            newMessages.push({ id: msgId, role: 'ai', text: turn.content });
          } else {
            newMessages.push({ id: msgId, role: 'status', text: `Rep: ${turn.content}` });
          }
        }
        newMessages.push({ id: `status-ended-${Date.now()}`, role: 'status', text: 'Call ended' });
      }

      try {
        const analysis = await getTaskAnalysis(id);
        newMessages.push({ id: `analysis-${Date.now()}`, role: 'analysis', text: '', analysisData: analysis });
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
      // If loading fails, just stay where we are
    }
  }

  function looksLikePhone(text: string): boolean {
    const digits = text.replace(/\D/g, '');
    return digits.length >= 10;
  }

  function handleSend() {
    const text = input.trim();
    if (!text || typing) return;

    addMessage({ role: 'user', text });
    setInput('');

    if (phase === 'objective') {
      setObjective(text);

      // Show typing while researching
      setTyping(true);

      searchResearch(text)
        .then((res) => {
          setTyping(false);

          if (res.ok && res.count > 0) {
            // Build research context from all results
            const snippets = res.results
              .filter((r) => r.snippet)
              .map((r) => `${r.title ?? ''}: ${r.snippet}`)
              .join('\n');
            setResearchContext(snippets);

            // Check if any results have phone numbers
            const withPhones = res.results.filter((r) => r.phone_numbers && r.phone_numbers.length > 0);

            if (withPhones.length > 0) {
              setDiscoveryResults(res.results);
              addMessage({
                role: 'ai',
                text: `I found ${withPhones.length} business${withPhones.length === 1 ? '' : 'es'} you can call directly. Pick one, or enter your own number.`,
              });
              addMessage({
                role: 'search-results',
                text: '',
                searchResults: res.results,
              });
              setPhase('discovery');
              return;
            }

            // Results but no phone numbers — fall through to phone phase
            addMessage({ role: 'status', text: `Found ${res.count} relevant result${res.count === 1 ? '' : 's'} for context` });
          }

          // Default: ask for phone
          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        })
        .catch(() => {
          setTyping(false);
          // Research failed/disabled — ask for phone
          setPhase('phone');
          addMessage({ role: 'ai', text: "Got it. What's the phone number I should call?" });
        });
    } else if (phase === 'discovery') {
      // In discovery, if user types a phone number, use it
      if (looksLikePhone(text)) {
        setPhoneNumber(text);
        startNegotiation(text);
      } else {
        // Treat as a new search or just move to phone phase
        setPhase('phone');
        aiReply("What's the phone number I should call?", 400);
      }
    } else if (phase === 'phone') {
      setPhoneNumber(text);
      startNegotiation(text);
    } else if (phase === 'active') {
      aiReply("I'm currently on the call negotiating. I'll keep you posted on progress.", 400);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    handleSend();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const inputDisabled = phase === 'connecting';
  const isOnCall = phase === 'active' || (phase === 'connecting' && callStatus === 'active');
  const showNewNegotiation = phase === 'ended' && analysisLoaded;

  const outcomeDot: Record<CallOutcome, string> = {
    success: 'bg-emerald-500', partial: 'bg-amber-500', failed: 'bg-red-500', walkaway: 'bg-red-500', unknown: 'bg-gray-300',
  };

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

  return (
    <div className="flex h-screen bg-[#fafaf9]">
      {/* ── Left Sidebar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="shrink-0 h-full bg-white border-r border-gray-200/60 flex flex-col overflow-hidden"
          >
            {/* Sidebar header */}
            <div className="px-3 pt-3.5 pb-2 shrink-0">
              <button
                onClick={handleNewNegotiation}
                className="w-full flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] font-medium text-gray-700 shadow-soft hover:shadow-card hover:border-gray-300 active:scale-[0.98] transition-all duration-150"
              >
                <Plus size={14} />
                New negotiation
              </button>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <div className="px-2 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent</span>
              </div>
              {pastTasks.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">No past negotiations</p>
              ) : (
                <div className="space-y-0.5">
                  {pastTasks.map((t) => {
                    const isActive = t.id === taskId;
                    const dot = outcomeDot[t.outcome] ?? 'bg-gray-300';
                    return (
                      <button
                        key={t.id}
                        onClick={() => loadPastChat(t.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 text-[13px] transition-all duration-150 group ${
                          isActive
                            ? 'bg-gray-100 text-gray-900 shadow-soft'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                        title={t.objective}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot} transition-colors`} />
                          <span className="truncate flex-1 font-medium">{t.objective || 'Untitled'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 ml-3.5">
                          <span className="text-[10px] text-gray-400">{t.outcome}</span>
                          {t.duration_seconds > 0 && (
                            <span className="text-[10px] text-gray-300">{t.duration_seconds < 60 ? `${t.duration_seconds}s` : `${Math.floor(t.duration_seconds / 60)}m`}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar footer */}
            <div className="shrink-0 border-t border-gray-100 px-3 py-2.5 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors duration-150">
                <BarChart3 size={13} />
                Dashboard
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between bg-white/80 backdrop-blur-xl border-b border-gray-200/60 px-5 py-3 shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600"
              >
                <PanelLeft size={16} />
              </button>
            )}
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all duration-150 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-[17px] tracking-tight text-gray-950 font-serif italic">kiru</span>
          </div>
          <div className="flex items-center gap-3">
            {isOnCall && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease }}
                className="flex items-center gap-2"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-600">On call</span>
              </motion.div>
            )}
            {isOnCall && (
              <button
                onClick={handleEndCall}
                className="rounded-full bg-red-50 px-3.5 py-1.5 text-[12px] font-medium text-red-600 transition-all duration-150 hover:bg-red-100 active:scale-[0.97]"
              >
                End call
              </button>
            )}
          </div>
        </header>

        {/* Readiness warning banner */}
        {readinessWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-100 px-4 py-2"
          >
            <AlertTriangle size={13} className="text-amber-500" />
            <span className="text-[12px] text-amber-700">{readinessWarning} &mdash; calls may run in dry-run mode</span>
          </motion.div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-8 space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  {msg.role === 'analysis' && msg.analysisData ? (
                    <AnalysisCard analysis={msg.analysisData} />
                  ) : msg.role === 'audio' && msg.audioTaskId ? (
                    <AudioPlayer taskId={msg.audioTaskId} />
                  ) : msg.role === 'search-results' && msg.searchResults ? (
                    <div className="py-1">
                      <SearchResultCards
                        results={msg.searchResults}
                        onCall={handleCallFromSearch}
                        onSkip={handleSkipDiscovery}
                      />
                    </div>
                  ) : msg.role === 'status' ? (
                    <div className="flex justify-center py-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/50 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-soft">
                        <Phone size={9} className="text-gray-400" />
                        {msg.text}
                      </span>
                    </div>
                  ) : msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-card">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start items-start gap-2.5">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center mt-0.5 shadow-soft">
                        <span className="text-[10px] font-serif italic text-gray-300">k</span>
                      </div>
                      <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-2.5 text-[14px] leading-relaxed text-gray-900 shadow-soft">
                        {msg.text}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {typing && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
                className="flex justify-start items-start gap-2.5"
              >
                <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center mt-0.5 shadow-soft">
                  <span className="text-[10px] font-serif italic text-gray-300">k</span>
                </div>
                <div className="rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-3 shadow-soft">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-bounce-dot"
                        style={{ animationDelay: `${i * 0.16}s` }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Post-call actions */}
            {showNewNegotiation && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease }}
                className="flex justify-center gap-2.5 pt-3"
              >
                {objective && phoneNumber && (
                  <button
                    onClick={() => {
                      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
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
                      startNegotiation(phoneNumber);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 shadow-soft transition-all duration-150 hover:shadow-card hover:border-gray-300 active:scale-[0.97]"
                  >
                    <Phone size={13} />
                    Call again
                  </button>
                )}
                <button
                  onClick={handleNewNegotiation}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-[12.5px] font-medium text-gray-700 shadow-soft transition-all duration-150 hover:shadow-card hover:border-gray-300 active:scale-[0.97]"
                >
                  <RotateCcw size={13} />
                  New negotiation
                </button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-200/60 bg-white/80 backdrop-blur-xl px-5 py-3.5">
          <form onSubmit={onSubmit} className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-soft transition-all duration-200 focus-within:border-gray-300 focus-within:shadow-card">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholderText}
                disabled={inputDisabled || phase === 'ended'}
                rows={1}
                className="flex-1 resize-none bg-transparent text-[14px] text-gray-900 placeholder-gray-400 outline-none disabled:text-gray-400"
                style={{ maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || inputDisabled || typing || phase === 'ended'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-soft transition-all duration-150 hover:bg-gray-700 hover:shadow-card active:scale-[0.93] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
