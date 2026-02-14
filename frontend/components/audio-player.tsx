'use client';

import { useState } from 'react';
import { Mic } from 'lucide-react';
import { getAudioUrl } from '../lib/api';

export default function AudioPlayer({ taskId }: { taskId: string }) {
  const [error, setError] = useState(false);
  const src = getAudioUrl(taskId, 'mixed');

  if (error) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-soft">
        <p className="text-[13px] text-gray-400">Recording unavailable</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3 shadow-soft space-y-2">
      <div className="flex items-center gap-2 text-gray-500">
        <Mic size={14} />
        <span className="text-[13px] font-medium">Call Recording</span>
      </div>
      <audio
        controls
        preload="metadata"
        className="w-full"
        src={src}
        onError={() => setError(true)}
      />
    </div>
  );
}
