'use client';

import { useEffect, useState, useRef } from 'react';
import { renderMermaid } from 'beautiful-mermaid';

// High-contrast theme on white
const diagramTheme = {
  bg: '#FFFFFF',
  fg: '#18181B',
  line: '#71717a',
  accent: '#27272a',
  muted: '#52525b',
  surface: '#f4f4f5',
  border: '#a1a1aa',
};

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

function makeResponsive(svgString: string): string {
  // Pad the viewBox so nothing gets clipped at edges
  const vbMatch = svgString.match(/viewBox="([^"]*)"/);
  let processed = svgString;

  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/).map(Number);
    if (parts.length === 4) {
      const padX = 20;
      const padY = 40;
      const newVb = `${parts[0] - padX} ${parts[1] - padX} ${parts[2] + padX * 2} ${parts[3] + padY * 2}`;
      processed = processed.replace(/viewBox="[^"]*"/, `viewBox="${newVb}"`);
    }
  }

  // Make SVG responsive: width 100%, height auto (preserves aspect ratio via viewBox)
  processed = processed
    .replace(/<svg([^>]*)width="[^"]*"/, '<svg$1width="100%"')
    .replace(/<svg([^>]*)height="[^"]*"/, '<svg$1height="auto"');

  return processed;
}

export default function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const result = await renderMermaid(chart.trim(), {
          ...diagramTheme,
          font: 'Inter',
        });
        if (!cancelled) {
          setSvg(makeResponsive(result));
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
  }, [chart]);

  if (error) {
    return (
      <div className={`rounded-2xl border border-red-200 bg-red-50/50 p-6 text-[13px] text-red-600 ${className}`}>
        Diagram error: {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`rounded-2xl border border-gray-200 bg-gray-50/50 p-8 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-gray-200/60" />
          <div className="h-48 w-full rounded-lg bg-gray-100/80" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-gray-200 shadow-soft overflow-x-auto bg-white p-6 sm:p-8 flex items-center justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
