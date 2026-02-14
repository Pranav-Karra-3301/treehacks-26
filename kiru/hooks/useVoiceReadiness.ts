import { useState, useEffect } from 'react';
import { checkVoiceReadiness } from '../lib/api';

export function useVoiceReadiness() {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    checkVoiceReadiness()
      .then((r) => {
        if (!r.can_dial_live) {
          const issues: string[] = [];
          if (!r.twilio_configured) issues.push('Twilio not configured');
          if (!r.llm_ready) issues.push('LLM not ready');
          if (!r.deepgram_configured) issues.push('Deepgram not configured');
          setWarning(issues.join(', ') || 'Voice system not ready');
        }
      })
      .catch(() => {});
  }, []);

  return warning;
}
