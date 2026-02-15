'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2 } from 'lucide-react';
import { getAudioUrl, getTaskRecordingFiles } from '../lib/api';

const ease = [0.16, 1, 0.3, 1] as const;
const AUDIO_SIDES = ['mixed', 'outbound', 'inbound'] as const;
type AudioSide = typeof AUDIO_SIDES[number];
const MAX_RECORDING_POLL_RETRIES = 20;

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
  const [audioReady, setAudioReady] = useState(false);
  const [availableSides, setAvailableSides] = useState<AudioSide[]>([...AUDIO_SIDES]);
  const [sideIndex, setSideIndex] = useState(0);
  const [probeTick, setProbeTick] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const side = availableSides[sideIndex] ?? 'mixed';
  const src = getAudioUrl(taskId, side);

  function deriveAvailableSides(
    files: Record<string, { exists: boolean; size_bytes: number }>,
  ): AudioSide[] {
    const found = new Set<AudioSide>();
    Object.entries(files).forEach(([fileName, stat]) => {
      if (!stat?.exists || (stat.size_bytes ?? 0) <= 0) return;
      const lower = fileName.toLowerCase();
      if (lower.includes('mixed')) found.add('mixed');
      if (lower.includes('outbound')) found.add('outbound');
      if (lower.includes('inbound')) found.add('inbound');
    });
    return AUDIO_SIDES.filter((candidate) => found.has(candidate));
  }

  useEffect(() => {
    setError(null);
    setAudioReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setRetryCount(0);
    setAvailableSides([...AUDIO_SIDES]);
    setSideIndex(0);
    setProbeTick(0);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const files = await getTaskRecordingFiles(taskId);
        if (cancelled) return;
        const resolvedSides = deriveAvailableSides(files.files ?? {});
        if (resolvedSides.length > 0) {
          setAvailableSides(resolvedSides);
          setSideIndex(0);
          setAudioReady(true);
          setError(null);
          return;
        }
      } catch {
        // keep waiting
      }
      if (!cancelled) {
        setAudioReady(false);
        setError('Recording is still processing.');
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [probeTick, taskId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioReady) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onLoadedData = () => setError(null);
    const onError = () => {
      setPlaying(false);
      if (sideIndex < availableSides.length - 1) {
        setSideIndex((prev) => Math.min(prev + 1, availableSides.length - 1));
        return;
      }
      setError('Recording is still processing.');
      setAudioReady(false);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('loadeddata', onLoadedData);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('loadeddata', onLoadedData);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioReady, availableSides.length, sideIndex]);

  useEffect(() => {
    if (audioReady) return;
    if (retryCount >= MAX_RECORDING_POLL_RETRIES) {
      setError('Recording unavailable for this call.');
      return;
    }
    const timer = window.setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setProbeTick((prev) => prev + 1);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [audioReady, retryCount]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || error || !audioReady) return;
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

  if (error) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-gray-500">
            {error}
            {retryCount < MAX_RECORDING_POLL_RETRIES ? ' Retrying automatically...' : ''}
          </p>
          <button
            type="button"
            onClick={() => {
              setRetryCount(0);
              setSideIndex(0);
              setProbeTick((prev) => prev + 1);
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
      <audio key={`${taskId}-${side}-${probeTick}`} ref={audioRef} preload="metadata" src={audioReady ? src : undefined} />

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
