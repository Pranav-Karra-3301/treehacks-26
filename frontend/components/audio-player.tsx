'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2 } from 'lucide-react';
import { getAudioUrl, getRecordingMetadata } from '../lib/api';

const ease = [0.16, 1, 0.3, 1] as const;
const AUDIO_SIDES: Array<'mixed' | 'outbound' | 'inbound'> = ['mixed', 'outbound', 'inbound'];
const MAX_RETRIES = 5;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ taskId }: { taskId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [sideIndex, setSideIndex] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [checkedMeta, setCheckedMeta] = useState(false);
  const [audioExists, setAudioExists] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const side = AUDIO_SIDES[sideIndex] ?? 'mixed';
  const src = getAudioUrl(taskId, side);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Reset on taskId change
  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setError(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setRetryCount(0);
    setSideIndex(0);
    setReloadTick(0);
    setCheckedMeta(false);
    setAudioExists(null);
  }, [taskId]);

  // Pre-check: does this recording actually have audio files?
  useEffect(() => {
    if (checkedMeta) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await getRecordingMetadata(taskId);
        if (cancelled) return;
        const files = meta.files ?? {};
        const hasAudio = Object.values(files).some(
          (f) => typeof f === 'object' && f !== null && 'exists' in f && (f as { exists: boolean; size_bytes: number }).exists && (f as { exists: boolean; size_bytes: number }).size_bytes > 100,
        );
        setAudioExists(hasAudio);
      } catch {
        // Metadata check failed — optimistically try loading audio
        if (!cancelled) setAudioExists(true);
      } finally {
        if (!cancelled) setCheckedMeta(true);
      }
    })();
    return () => { cancelled = true; };
  }, [taskId, checkedMeta]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => {
      const d = audio.duration;
      if (d && Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onLoadedData = () => setError(null);
    const onError = () => {
      setPlaying(false);
      if (sideIndex < AUDIO_SIDES.length - 1) {
        setSideIndex((prev) => Math.min(prev + 1, AUDIO_SIDES.length - 1));
        return;
      }
      setRetryCount((prev) => {
        if (prev >= MAX_RETRIES) {
          setError('Recording unavailable.');
          return prev;
        }
        setError('Recording is still processing.');
        // Add jitter (1-3s) to prevent synchronized retry storms across multiple players
        const jitter = 1000 + Math.random() * 2000;
        retryTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setSideIndex(0);
          setReloadTick((t) => t + 1);
          setError(null);
        }, jitter);
        return prev + 1;
      });
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadeddata', onLoadedData);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // If metadata already loaded before listeners attached (cache / fast load),
    // seed duration and currentTime immediately.
    if (audio.readyState >= 1 && audio.duration && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
    if (!audio.paused) {
      setCurrentTime(audio.currentTime);
    }

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadeddata', onLoadedData);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // Re-run whenever the <audio> element is recreated (key = taskId-side-reloadTick)
  }, [sideIndex, taskId, reloadTick]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
    setPlaying(!playing);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Waiting for metadata check
  if (!checkedMeta) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
        <p className="text-[12px] text-gray-400">Checking recording...</p>
      </div>
    );
  }

  // No audio files exist — show immediately without retrying
  if (audioExists === false) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500">No recording available.</p>
          <button
            type="button"
            onClick={() => {
              setCheckedMeta(false);
              setAudioExists(null);
              setRetryCount(0);
              setSideIndex(0);
              setReloadTick((prev) => prev + 1);
              setError(null);
            }}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    const gavUp = retryCount >= MAX_RETRIES;
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500">
            {error}{gavUp ? '' : ' Retrying automatically...'}
          </p>
          <button
            type="button"
            onClick={() => {
              setRetryCount(0);
              setSideIndex(0);
              setReloadTick((prev) => prev + 1);
              setError(null);
            }}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-800"
          >
            Retry now
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease }}
      className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 flex items-center gap-3"
    >
      <audio key={`${taskId}-${side}-${reloadTick}`} ref={audioRef} preload="metadata" src={src} />

      <button
        onClick={togglePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white shadow-soft transition-all duration-150 hover:bg-gray-700 active:scale-[0.93]"
      >
        {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className="h-1.5 rounded-full bg-gray-200 cursor-pointer group relative"
          onClick={seek}
        >
          <div
            className="h-full rounded-full bg-gray-900 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400 tabular-nums">{formatTime(currentTime)}</span>
          <div className="flex items-center gap-1 text-gray-400">
            <Volume2 size={10} />
            <span className="text-[10px] font-medium">Call Recording ({side})</span>
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums">{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
    </motion.div>
  );
}
