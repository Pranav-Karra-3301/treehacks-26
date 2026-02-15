'use client';

import React from 'react';
import { Phone } from 'lucide-react';
import type { AnalysisPayload, BusinessResult } from '../../lib/types';

type Message = {
  id: string;
  role: 'user' | 'ai' | 'status' | 'analysis' | 'audio' | 'search-results';
  text: string;
  analysisData?: AnalysisPayload;
  audioTaskId?: string;
  searchResults?: BusinessResult[];
};

type MessageBubbleProps = {
  message: Message;
  AnalysisCard: React.ComponentType<{ analysis: AnalysisPayload }>;
  AudioPlayer: React.ComponentType<{ taskId: string }>;
  SearchResultCards: React.ComponentType<{
    results: BusinessResult[];
    onCall: (result: BusinessResult, phone: string) => void;
    onSkip: () => void;
    onCallAll?: (results: BusinessResult[], phones: string[]) => void;
  }>;
  onCallFromSearch: (result: BusinessResult, phone: string) => void;
  onSkipDiscovery: () => void;
  onCallAllFromSearch: (results: BusinessResult[], phones: string[]) => void;
};

const MessageBubble = React.memo(function MessageBubble({
  message,
  AnalysisCard,
  AudioPlayer,
  SearchResultCards,
  onCallFromSearch,
  onSkipDiscovery,
  onCallAllFromSearch,
}: MessageBubbleProps) {
  if (message.role === 'analysis' && message.analysisData) {
    return (
      <div className="max-w-[85%]">
        <AnalysisCard analysis={message.analysisData} />
      </div>
    );
  }

  if (message.role === 'audio' && message.audioTaskId) {
    return (
      <div className="max-w-[85%]">
        <AudioPlayer taskId={message.audioTaskId} />
      </div>
    );
  }

  if (message.role === 'search-results' && message.searchResults) {
    return (
      <div className="max-w-[85%] py-1">
        <SearchResultCards
          results={message.searchResults}
          onCall={onCallFromSearch}
          onSkip={onSkipDiscovery}
          onCallAll={onCallAllFromSearch}
        />
      </div>
    );
  }

  if (message.role === 'status') {
    return (
      <div className="flex justify-center py-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/50 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-soft">
          <Phone size={9} className="text-gray-400" />
          {message.text}
        </span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-card">
          {message.text}
        </div>
      </div>
    );
  }

  // Default: 'ai' role
  return (
    <div className="flex justify-start items-start gap-2.5">
      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center mt-0.5 shadow-soft">
        <span className="text-[10px] font-serif italic text-gray-300">k</span>
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-2.5 text-[14px] leading-relaxed text-gray-900 shadow-soft">
        {message.text}
      </div>
    </div>
  );
});

export default MessageBubble;
