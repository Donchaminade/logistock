export function LogoMark({ className = "size-8", inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill={inverted ? "#ffffff" : "#1f4fd8"} />
      <path d="M9 8v14h6" stroke={inverted ? "#1f4fd8" : "#ffffff"} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="17.5" y="15" width="6" height="7" rx="1.5" fill={inverted ? "#0b0d12" : "#ffffff"} />
      <rect x="17.5" y="8" width="6" height="5" rx="1.5" fill={inverted ? "#0b0d12" : "#ffffff"} opacity="0.55" />
    </svg>
  );
}

export function Logo({ inverted, sub }: { inverted?: boolean; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className={`text-[16px] font-bold tracking-[-0.02em] ${inverted ? "text-white" : "text-ink"}`}>MarockStock</div>
        {sub && <div className={`mt-1 text-[11px] font-medium ${inverted ? "text-white/50" : "text-subtle"}`}>{sub}</div>}
      </div>
    </div>
  );
}
