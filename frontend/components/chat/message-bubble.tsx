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
    onSearchMore?: () => void;
  }>;
  onCallFromSearch: (result: BusinessResult, phone: string) => void;
  onSkipDiscovery: () => void;
  onCallAllFromSearch: (results: BusinessResult[], phones: string[]) => void;
  onSearchMore: () => void;
};

const MessageBubble = React.memo(function MessageBubble({
  message,
  AnalysisCard,
  AudioPlayer,
  SearchResultCards,
  onCallFromSearch,
  onSkipDiscovery,
  onCallAllFromSearch,
  onSearchMore,
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
          onSearchMore={onSearchMore}
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
      <div className="h-7 w-7 shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center shadow-soft bg-gray-100 mt-1">
        <img src="/favicon.png" alt="Agent" className="h-full w-full object-cover" />
      </div>
      <div className="max-w-[75%] rounded-[10px] rounded-tl-[6px] bg-white border border-gray-100 px-4 py-2.5 text-[14px] leading-relaxed text-gray-900 shadow-soft">
        {message.text}
      </div>
    </div>
  );
});

export default MessageBubble;
