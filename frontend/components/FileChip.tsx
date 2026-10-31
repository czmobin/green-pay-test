'use client';
/**
 * چیپِ پیوستِ قابل‌کلیک — فایل واقعی را با JWT از API باز/دانلود می‌کند.
 * قبلاً بعضی جاها فقط toast دمو بود.
 */
import React, { useState } from 'react';
import { openAttachment, UnauthorizedError } from '@/lib/api';
import { IconPaperclip } from './Icons';

export default function FileChip({
  fileName,
  fileUrl,
  onError,
}: {
  fileName: string;
  fileUrl?: string | null;
  onError?: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!fileUrl) {
    return (
      <span className="file-chip" title={fileName}>
        <IconPaperclip size={12} />{fileName}
      </span>
    );
  }

  const open = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await openAttachment(fileUrl, fileName);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onError?.('نشست شما منقضی شده است.');
      } else {
        onError?.(err instanceof Error ? err.message : 'بازکردن فایل ناموفق بود');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="file-chip file-chip-link"
      title={busy ? 'در حال آماده‌سازی…' : `بازکردن ${fileName}`}
      disabled={busy}
      onClick={open}
    >
      <IconPaperclip size={12} />{fileName}
    </button>
  );
}
