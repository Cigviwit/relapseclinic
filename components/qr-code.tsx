import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M'); qr.addData(value); qr.make();
    const size = qr.getModuleCount();
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
    return { size, path };
  }, [value]);
  return <svg className="upi-qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={label}><rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fff" /><path d={path} fill="#000" /></svg>;
}
