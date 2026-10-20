/** سقف پیوستِ جلسه / صورت‌جلسه / دستورجلسه — هم‌تراز با `settings.MAX_UPLOAD_BYTES`. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '۱۰ مگابایت';

/** اگر فایل از سقف بزرگ‌تر باشد پیام خطا برمی‌گرداند، وگرنه null. */
export function uploadSizeError(file: File | null | undefined): string | null {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `حجم فایل نباید از ${MAX_UPLOAD_LABEL} بیشتر باشد.`;
  }
  return null;
}
