'use client';

import { useEffect, useState, useRef } from 'react';
import { renderMermaid, THEMES } from 'beautiful-mermaid';

type ThemeName = keyof typeof THEMES;

interface MermaidDiagramProps {
  chart: string;
  theme?: ThemeName;
  className?: string;
}

export default function MermaidDiagram({ chart, theme = 'zinc-light', className = '' }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const result = await renderMermaid(chart.trim(), {
          ...THEMES[theme],
          font: 'Inter',
        });
        if (!cancelled) {
          setSvg(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setSvg(null);
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [chart, theme]);

  if (error) {
    return (
      <div className={`rounded-2xl border border-red-200 bg-red-50/50 p-6 text-[13px] text-red-600 ${className}`}>
        Diagram error: {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`rounded-2xl border border-gray-100 bg-gray-50/30 p-8 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-gray-200/60" />
          <div className="h-32 w-full rounded-lg bg-gray-100/80" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-gray-100 shadow-soft overflow-x-auto bg-white p-4 sm:p-6 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
