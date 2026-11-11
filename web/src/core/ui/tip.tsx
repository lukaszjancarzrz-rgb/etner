import { useState, type ReactNode } from 'react';

/**
 * Dymek z wartością nad wykresem (jak w Excelu): element z `data-tip="Nagłówek\nlinia"` pokazuje dymek przy kursorze
 * i jest podświetlony; na telefonie po dotknięciu. Jeden nasłuch na cały wykres.
 */
export function Tips({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ x: number; y: number; w: number; text: string } | null>(null);
  const show = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest('[data-tip]');
    if (!el) return setT(null);
    const r = e.currentTarget.getBoundingClientRect();
    setT({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, text: el.getAttribute('data-tip')! });
  };
  const [head, ...lines] = t?.text.split('\n') ?? [];
  return (
    <div className="relative [&_[data-tip]]:transition-opacity [&_[data-tip]:hover]:opacity-70" onPointerMove={show} onPointerDown={show} onPointerLeave={() => setT(null)}>
      {children}
      {t && (
        <div aria-hidden className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-[4px] border border-line bg-card px-3 py-2 text-sm shadow-overlay"
          style={{ top: Math.max(0, t.y - 12), left: t.x, transform: `translate(${t.x > t.w / 2 ? 'calc(-100% - 12px)' : '12px'}, -100%)` }}>
          <p className="font-bold">{head}</p>
          {lines.map((l) => <p key={l} className="tabular-nums">{l}</p>)}
        </div>
      )}
    </div>
  );
}
