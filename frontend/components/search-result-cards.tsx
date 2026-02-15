'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Phone, ArrowRight, Globe } from 'lucide-react';
import type { BusinessResult } from '../lib/types';

type Props = {
  results: BusinessResult[];
  onCall: (result: BusinessResult, phone: string) => void;
  onSkip: () => void;
  onCallAll?: (results: BusinessResult[], phones: string[]) => void;
  onSearchMore?: () => void;
};

/** Strip markdown artifacts, image refs, nav junk from Exa snippets. */
function cleanSnippet(raw: string): string {
  return raw
    .replace(/!\[.*?\]/g, '')          // ![alt] image refs
    .replace(/\[!\[.*?\]\]/g, '')      // [![nested]]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/\[([^\]]*)\]/g, '$1')    // [text] → text
    .replace(/#{1,6}\s*/g, '')         // ## headings
    .replace(/\*{1,3}/g, '')           // bold/italic markers
    .replace(/\s{2,}/g, ' ')           // collapse whitespace
    .replace(/^[\s|*#\-]+/, '')        // leading junk
    .trim();
}

/** Format +1XXXXXXXXXX to (XXX) XXX-XXXX */
function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

/** Extract domain from URL for display */
function displayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Get Google favicon URL for a domain */
function faviconUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

/** Generate a deterministic pastel color from a string */
function initialColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 88%)`;
}

/** Favicon with colored-initial fallback */
function BizIcon({ url, title }: { url?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const src = url ? faviconUrl(url) : null;
  const letter = (title || '?')[0].toUpperCase();

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={28}
        height={28}
        unoptimized
        className="rounded-md object-contain shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 text-[13px] font-semibold"
      style={{ backgroundColor: initialColor(title), color: 'rgba(0,0,0,0.5)' }}
    >
      {letter}
    </div>
  );
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function SearchResultCards({ results, onCall, onSkip, onCallAll, onSearchMore }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  
  const withPhone = results.filter((r) => r.phone_numbers.length > 0);
  const display = (withPhone.length > 0 ? withPhone : results).slice(0, 4);
  const callableResults = display.filter((r) => r.phone_numbers.length > 0);
  
  const toggleSelect = (index: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  };

  const handleCallSelected = () => {
    if (!onCallAll) return;
    const selectedResults = Array.from(selected)
      .map(i => callableResults[i])
      .filter(Boolean);
    const phones = selectedResults.map(r => r.phone_numbers[0]);
    onCallAll(selectedResults, phones);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {display.map((result, i) => {
          const phone = result.phone_numbers[0] ?? null;
          const domain = result.url ? displayDomain(result.url) : '';
          const isSelected = selected.has(i);
          const canSelect = !!phone;

          return (
            <motion.button
              key={result.url ?? i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease }}
              onClick={() => canSelect && toggleSelect(i)}
              disabled={!canSelect}
              className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-all duration-150 ${
                isSelected
                  ? 'bg-gray-900 border-2 border-gray-900 shadow-card'
                  : 'bg-white border-2 border-gray-100 hover:border-gray-200 hover:shadow-soft'
              } ${!canSelect ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Selection indicator */}
              <div className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-white border-white'
                  : 'border-gray-300 bg-white'
              }`}>
                {isSelected ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : null}
              </div>

              {/* Favicon */}
              <BizIcon url={result.url ?? undefined} title={result.title || 'Untitled'} />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-[14px] font-medium leading-snug ${
                    isSelected ? 'text-white' : 'text-gray-900'
                  }`}>
                    {result.title || 'Untitled'}
                  </span>
                  {domain ? (
                    <a
                      href={result.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 flex items-center gap-1 text-[11px] transition-colors ${
                        isSelected
                          ? 'text-gray-300 hover:text-white'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Globe size={9} />
                      <span className="hidden sm:inline">{domain}</span>
                    </a>
                  ) : null}
                </div>
                {phone ? (
                  <p className={`mt-0.5 text-[13px] tabular-nums font-medium ${
                    isSelected ? 'text-gray-200' : 'text-gray-600'
                  }`}>
                    {formatPhone(phone)}
                  </p>
                ) : null}
              </div>
            </motion.button>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: display.length * 0.05 + 0.08, duration: 0.25 }}
        className="flex items-center justify-center gap-2.5 pt-2 flex-wrap"
      >
        {callableResults.length > 0 && onCallAll ? (
          <button
            onClick={handleCallSelected}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white transition-all duration-150 hover:bg-gray-700 active:scale-[0.96] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            <Phone size={12} strokeWidth={2.5} />
            {selected.size > 0 ? `Call Selected (${selected.size})` : 'Select to call'}
          </button>
        ) : null}
        {onSearchMore ? (
          <>
            <span className="text-[12px] text-gray-300">·</span>
            <button
              onClick={onSearchMore}
              className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              Search for more
              <ArrowRight size={12} />
            </button>
          </>
        ) : null}
        <span className="text-[12px] text-gray-300">·</span>
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
        >
          I have my own number
          <ArrowRight size={12} />
        </button>
      </motion.div>
    </div>
  );
}
