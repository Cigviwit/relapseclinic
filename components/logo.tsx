export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return <span className={'logo' + (light ? ' logo-light' : '')}>
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden><rect width="32" height="32" rx="9" fill="currentColor" /><path d="M7 17h4.5l2.5-6 4 11 2.5-5H25" fill="none" stroke="var(--logo-ink, #fff)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    {!compact && <span className="logo-text">Relapse<b>Clinic</b></span>}
  </span>;
}
