'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2 } from 'lucide-react';
import { getAudioUrl } from '../lib/api';

const ease = [0.16, 1, 0.3, 1] as const;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ taskId }: { taskId: string }) {
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const src = getAudioUrl(taskId, 'mixed');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    const onError = () => setError(true);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
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
        <p className="text-[12px] text-gray-400">Recording unavailable</p>
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
      <audio ref={audioRef} preload="metadata" src={src} />

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
            <span className="text-[10px] font-medium">Call Recording</span>
          </div>
          <span className="text-[10px] text-gray-400 tabular-nums">{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>
    </motion.div>
  );
}
