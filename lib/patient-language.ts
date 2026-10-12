export const patientLanguages = [
  { value: 'en', label: 'English only' },
  { value: 'mr', label: 'English + Marathi (मराठी)' },
  { value: 'hi', label: 'English + Hindi (हिन्दी)' },
] as const;

export type PatientLanguage = typeof patientLanguages[number]['value'];

export function patientLanguage(value?: string): PatientLanguage {
  return patientLanguages.find(language => language.value === value)?.value || 'en';
}

export function patientLanguageLabel(value?: string) {
  return patientLanguages.find(language => language.value === patientLanguage(value))!.label;
}
