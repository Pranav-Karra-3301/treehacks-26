'use client';

import React from 'react';
import { Phone } from 'lucide-react';
import type {
  AnalysisPayload,
  CallStatus,
  MultiCallSummaryPayload,
  MultiCallPriceComparison,
} from '../../lib/types';

type MultiCallEventStatus = CallStatus | 'connected' | 'disconnected' | 'media_connected' | 'mark';
type MultiCallTranscriptEntry = {
  id: string;
  role: 'agent' | 'caller' | 'status';
  text: string;
};
type MultiCallState = {
  taskId: string;
  sessionId: string | null;
  status: MultiCallEventStatus;
  transcript: MultiCallTranscriptEntry[];
  thinking: boolean;
  analysis: AnalysisPayload | null;
  analysisState: 'idle' | 'loading' | 'ready' | 'error';
  analysisError: string | null;
};
type MultiCallTargetMeta = {
  phone: string;
  source: 'manual' | 'exa';
  title: string | null;
  url: string | null;
  snippet: string | null;
};
type MultiSummaryState = 'idle' | 'loading' | 'ready' | 'error';

const MULTI_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  dialing: 'Dialing',
  connected: 'Connected',
  media_connected: 'Media connected',
  active: 'Active',
  disconnected: 'Disconnected',
  ended: 'Ended',
  failed: 'Failed',
  mark: 'Marker',
};

type MultiCallStatusProps = {
  multiCallEntries: Array<[string, MultiCallState]>;
  multiTargetEntries: Array<{ phone: string; target: MultiCallTargetMeta }>;
  multiCallTargets: Record<string, MultiCallTargetMeta>;
  multiSummary: MultiCallSummaryPayload | null;
  multiSummaryState: MultiSummaryState;
  multiSummaryError: string | null;
  multiSummaryTaskIds: string[];
  phase: string;
  personalHandoffNumber: string;
  multiDtmfInputs: Record<string, string>;
  objective: string;
  formatPhone: (phone: string) => string;
  normalizePhone: (raw: string) => string | null;
  onLoadMultiSummary: (taskIds: string[], objective: string, force?: boolean) => void | Promise<void>;
  onTransferToPersonal: (callTaskId: string, phoneLabel?: string) => void | Promise<void>;
  onSendDtmf: (callTaskId: string, digits: string, phoneLabel?: string) => void | Promise<void>;
  onStopCall: (callTaskId: string, phoneLabel?: string) => void | Promise<void>;
  onSetPersonalHandoffNumber: (value: string) => void;
  onSetMultiDtmfInputs: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onCallBackFromSummary: (item: MultiCallPriceComparison) => void;
  AudioPlayer: React.ComponentType<{ taskId: string }>;
};

const MultiCallStatus = React.memo(function MultiCallStatus({
  multiCallEntries,
  multiTargetEntries,
  multiCallTargets,
  multiSummary,
  multiSummaryState,
  multiSummaryError,
  multiSummaryTaskIds,
  phase,
  personalHandoffNumber,
  multiDtmfInputs,
  objective,
  formatPhone,
  normalizePhone,
  onLoadMultiSummary,
  onTransferToPersonal,
  onSendDtmf,
  onStopCall,
  onSetPersonalHandoffNumber,
  onSetMultiDtmfInputs,
  onCallBackFromSummary,
  AudioPlayer,
}: MultiCallStatusProps) {
  const allCallsDone = multiCallEntries.every(
    ([, s]) => s.status === 'ended' || s.status === 'failed',
  );

  return (
    <div className="pt-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        Concurrent conversations
      </div>
      {/* Call Targets — above call cards */}
      <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-soft">
        <div className="text-[12px] font-semibold text-gray-900">Call Targets</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {multiTargetEntries.map(({ phone, target }) => (
            <div key={`target-${phone}`} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[11.5px] font-semibold text-gray-800">
                  {target.title ? target.title : formatPhone(phone)}
                </div>
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-600">
                  {target.source === 'exa' ? 'Exa' : 'Manual'}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-600">{formatPhone(phone)}</div>
              {target.url ? (
                <a
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-[10.5px] text-blue-600 hover:text-blue-700"
                >
                  {target.url}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {/* Call cards */}
      <div className="grid gap-3 md:grid-cols-2 mb-3">
        {multiCallEntries.map(([phone, state]) => {
          const callTarget = multiCallTargets[phone];
          const statusLabel = MULTI_STATUS_LABEL[state.status] ?? state.status;
          const statusClass =
            state.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : state.status === 'ended'
                ? 'bg-gray-100 text-gray-600 border-gray-200'
                : state.status === 'failed'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200';
          const canControlThisCall = Boolean(
            state.taskId
            && (state.status === 'dialing'
              || state.status === 'connected'
              || state.status === 'media_connected'
              || state.status === 'active'),
          );

          return (
            <div key={phone} className="rounded-2xl border border-gray-200 bg-white shadow-soft overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-gray-900">
                    {callTarget?.title ? callTarget.title : formatPhone(phone)}
                  </div>
                  <div className="text-[10.5px] text-gray-500">{formatPhone(phone)}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass}`}>
                    {statusLabel}
                  </span>
                  {canControlThisCall && state.taskId ? (
                    <button
                      type="button"
                      onClick={() => { void onStopCall(state.taskId, phone); }}
                      className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700 active:scale-[0.96] transition-all duration-150"
                    >
                      Stop
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="h-56 overflow-y-auto px-3 py-2 space-y-1.5">
                {state.transcript.length === 0 ? (
                  <div className="text-[12px] text-gray-400">Waiting for call events...</div>
                ) : (
                  state.transcript.map((entry) => (
                    <div key={entry.id}>
                      {entry.role === 'status' ? (
                        <div className="flex justify-center">
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] text-gray-500">
                            {entry.text}
                          </span>
                        </div>
                      ) : entry.role === 'caller' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-gray-900 px-2.5 py-1.5 text-[12px] text-white">
                            {entry.text}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-start">
                          <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-900">
                            {entry.text}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {state.thinking ? (
                  <div className="flex justify-start">
                    <div className="rounded-xl rounded-tl-sm border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
                      Thinking...
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                {canControlThisCall && state.taskId ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white overflow-hidden">
                      <input
                        value={personalHandoffNumber}
                        onChange={(e) => onSetPersonalHandoffNumber(e.target.value)}
                        placeholder="Your #"
                        className="w-[80px] bg-transparent px-2 py-1 text-[10.5px] text-gray-800 placeholder-gray-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => { void onTransferToPersonal(state.taskId, phone); }}
                        disabled={!normalizePhone(personalHandoffNumber)}
                        className="shrink-0 rounded-full bg-gray-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all duration-150"
                      >
                        Transfer
                      </button>
                    </div>
                    <div className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white overflow-hidden">
                      <input
                        value={multiDtmfInputs[phone] ?? ''}
                        onChange={(e) => {
                          const next = e.target.value;
                          onSetMultiDtmfInputs((prev) => ({ ...prev, [phone]: next }));
                        }}
                        placeholder="DTMF"
                        className="w-[70px] bg-transparent px-2 py-1 text-[10.5px] text-gray-800 placeholder-gray-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const digits = multiDtmfInputs[phone] ?? '';
                          void onSendDtmf(state.taskId, digits, phone);
                          onSetMultiDtmfInputs((prev) => ({ ...prev, [phone]: '' }));
                        }}
                        disabled={!(multiDtmfInputs[phone] ?? '').trim()}
                        className="shrink-0 rounded-full bg-gray-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400 transition-all duration-150"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ) : null}
                {state.taskId && state.status === 'ended' && state.transcript.length > 1 ? (
                  <AudioPlayer taskId={state.taskId} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {/* Combined Decision Summary — only shown after all calls complete */}
      {allCallsDone ? (
      <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold text-gray-900">Combined Decision Summary</div>
          {multiSummaryState === 'ready' && multiSummary?.recommended_phone ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              Best: {formatPhone(multiSummary.recommended_phone)}
            </span>
          ) : null}
        </div>
        {multiSummaryState === 'loading' ? (
          <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            Building one detailed recommendation across all calls...
          </div>
        ) : null}
        {multiSummaryState === 'idle' ? (
          <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] text-gray-500">
            Summary will be generated when all calls complete.
          </div>
        ) : null}
        {multiSummaryState === 'error' ? (
          <div className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
            <div className="text-[12px] text-red-700">
              Combined summary unavailable: {multiSummaryError ? multiSummaryError : 'Unknown error'}
            </div>
            {multiSummaryTaskIds.length > 0 ? (
              <button
                type="button"
                onClick={() => { void onLoadMultiSummary(multiSummaryTaskIds, objective, true); }}
                className="mt-2 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                Retry summary
              </button>
            ) : null}
          </div>
        ) : null}
        {multiSummary && multiSummaryState === 'ready' ? (
          <div className="mt-2 space-y-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Recommendation</div>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-800">{multiSummary.recommended_option}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-gray-600">{multiSummary.decision_rationale}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Cross-call Summary</div>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-gray-700">{multiSummary.overall_summary}</p>
            </div>
            {multiSummary.price_comparison?.length > 0 ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Price + Terms</div>
                <div className="mt-1 space-y-2">
                  {multiSummary.price_comparison.map((item) => (
                    <div key={item.task_id} className="rounded-lg border border-gray-100 bg-white px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11.5px] font-semibold text-gray-800">
                          {item.vendor ? item.vendor : formatPhone(item.phone || '')}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">{item.confidence} confidence</span>
                          {item.phone && phase === 'ended' ? (
                            <button
                              type="button"
                              onClick={() => onCallBackFromSummary(item)}
                              className="flex items-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-medium text-white transition-all duration-150 hover:bg-gray-700 active:scale-[0.96]"
                            >
                              <Phone size={10} strokeWidth={2.5} />
                              Call back
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-600">
                        Prices: {item.quoted_prices?.length ? item.quoted_prices.join(' | ') : 'Not captured'}
                      </div>
                      {item.location ? (
                        <div className="mt-0.5 text-[11px] text-gray-600">Location: {item.location}</div>
                      ) : null}
                      {item.discounts?.length > 0 ? (
                        <div className="mt-0.5 text-[11px] text-gray-600">Discounts: {item.discounts.join(' | ')}</div>
                      ) : null}
                      {item.fees?.length > 0 ? (
                        <div className="mt-0.5 text-[11px] text-gray-600">Fees: {item.fees.join(' | ')}</div>
                      ) : null}
                      {item.constraints?.length > 0 ? (
                        <div className="mt-0.5 text-[11px] text-gray-600">Constraints: {item.constraints.join(' | ')}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {multiSummary.important_facts?.length > 0 ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Important Facts</div>
                <div className="mt-1 space-y-1">
                  {multiSummary.important_facts.map((fact, idx) => (
                    <div key={`fact-${idx}`} className="text-[11.5px] text-gray-700">{'\u2022'} {fact}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
});

export default MultiCallStatus;
