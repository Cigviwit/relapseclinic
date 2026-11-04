export type PatientFile = { id: string; clinicId: string; patientId: string; name: string; kind: string; contentType: string; size: number; note?: string; createdBy: string; createdAt: string; removedAt?: string };
export const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;
export const fileKinds = [{ value: 'xray', label: 'X-ray' }, { value: 'report', label: 'Report' }, { value: 'consent', label: 'Consent form' }, { value: 'photo', label: 'Clinical photo' }, { value: 'other', label: 'Other' }] as const;

export const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const fromBase64 = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0));

/** Reads a chosen file as base64 without building a giant string one character at a time. */
export const toBase64Async = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('That file could not be read.'));
  reader.readAsDataURL(file);
});

export function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
