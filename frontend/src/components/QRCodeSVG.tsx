import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeSVGProps {
  value: string;
  size?: number;
  /** Optional human label under the code */
  label?: string;
}

/**
 * Real QR code (ISO/IEC 18004) via the `qrcode` package — scannable by phone cameras
 * and the PlaySmart gate scanner when the payload is a booking / pass id.
 */
export default function QRCodeSVG({ value, size = 180 }: QRCodeSVGProps) {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const payload = String(value || '').trim();
    if (!payload) {
      setDataUrl('');
      setError('Missing pass payload');
      return;
    }

    let cancelled = false;
    setError('');

    QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: Math.max(128, size * 2), // render hi-res then scale down in CSS
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setDataUrl('');
          setError(e?.message || 'Failed to generate QR');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="flex flex-col justify-center items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-inner">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`QR code for ${value}`}
          width={size}
          height={size}
          className="max-w-full rounded-lg"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center bg-slate-50 text-[10px] text-slate-400 font-mono rounded-lg"
          style={{ width: size, height: size }}
        >
          {error || 'Generating QR…'}
        </div>
      )}
    </div>
  );
}
