/**
 * Prescription pad presets per specialty: which sections the builder shows,
 * and the quick-pick lists that make writing a prescription a few clicks.
 */
export type Specialty = 'dental' | 'general' | 'pediatric' | 'dermatology';
export type PadStyle = 'classic' | 'band' | 'minimal';
export type RxPad = { specialty: Specialty; style: PadStyle; accent: string; tagline: string; footer: string; paper: 'A5' | 'A4' };

type Section = 'vitals' | 'history' | 'complaints' | 'teeth' | 'findings' | 'diagnosis' | 'procedures' | 'plan';
export type SpecialtyPreset = {
  label: string; sections: Section[];
  labels: Partial<Record<Section, string>>;
  vitals: ('bp' | 'pulse' | 'temp' | 'weight' | 'spo2')[];
  diagnoses: string[]; procedures: string[]; plans: string[]; history: string[];
  medicines: string[]; advice: string[];
};

export const specialties: Record<Specialty, SpecialtyPreset> = {
  dental: {
    label: 'Dental',
    sections: ['history', 'complaints', 'teeth', 'findings', 'diagnosis', 'procedures', 'plan', 'vitals'],
    labels: { complaints: 'Chief complaint', findings: 'Clinical findings', procedures: 'Treatment done today', plan: 'Treatment advised' },
    vitals: ['bp'],
    history: ['Diabetic', 'Hypertensive', 'On blood thinners', 'Cardiac patient', 'Pregnant', 'Asthma', 'Thyroid', 'Allergic to penicillin', 'Allergic to NSAIDs', 'Smoker', 'Tobacco chewer'],
    diagnoses: ['Dental caries', 'Deep caries', 'Irreversible pulpitis', 'Reversible pulpitis', 'Periapical abscess', 'Chronic apical periodontitis', 'Gingivitis', 'Chronic periodontitis', 'Pericoronitis', 'Impacted third molar', 'Dentin hypersensitivity', 'Fractured tooth', 'Mobile tooth', 'Missing tooth', 'Malocclusion', 'Aphthous ulcer'],
    procedures: ['Oral prophylaxis (scaling & polishing)', 'Composite restoration', 'GIC restoration', 'Temporary filling', 'RCT – access opening', 'RCT – BMP', 'RCT – obturation', 'Extraction', 'Surgical extraction', 'Pulpectomy', 'Crown preparation', 'Crown cementation', 'Incision & drainage', 'Fluoride application', 'Pit & fissure sealant', 'IOPA X-ray taken'],
    plans: ['Root canal treatment', 'Crown', 'Extraction', 'Implant', 'Bridge', 'Scaling', 'Composite filling', 'Orthodontic consultation', 'Denture', 'OPG X-ray', 'IOPA X-ray', 'CBCT', 'Review after 1 week'],
    medicines: ['Cap Amoxicillin 500 mg', 'Tab Amoxicillin + Clavulanate 625 mg', 'Tab Metronidazole 400 mg', 'Cap Clindamycin 300 mg', 'Tab Azithromycin 500 mg', 'Tab Ibuprofen 400 mg', 'Tab Ketorolac 10 mg', 'Tab Aceclofenac + Paracetamol', 'Tab Aceclofenac + Paracetamol + Serratiopeptidase', 'Tab Diclofenac 50 mg', 'Tab Paracetamol 650 mg', 'Tab Nimesulide 100 mg', 'Tab Pantoprazole 40 mg', 'Tab Rabeprazole 20 mg', 'Chlorhexidine 0.2% mouthwash', 'Povidone-iodine 2% gargle', 'Benzydamine mouthwash', 'Choline salicylate gel (Dologel)', 'Metronidazole + Chlorhexidine gel', 'Triamcinolone oral paste', 'Potassium nitrate toothpaste', 'Desensitising toothpaste', 'Tab Vitamin B-complex'],
    advice: ['Bite firmly on the gauze for 30–45 minutes', 'Do not eat or drink for 1 hour', 'Avoid hot food and drinks for 24 hours', 'Do not spit or rinse forcefully for 24 hours', 'Apply an ice pack on the cheek, 10 minutes at a time', 'Warm salt-water rinses from tomorrow, 3–4 times a day', 'Avoid chewing on the treated side', 'Do not smoke or chew tobacco for 72 hours', 'Brush twice daily with a soft brush', 'Floss daily', 'Complete the full course of antibiotics', 'Call the clinic if bleeding or swelling increases'],
  },
  general: {
    label: 'General physician',
    sections: ['vitals', 'history', 'complaints', 'findings', 'diagnosis'],
    labels: { complaints: 'Complaints', findings: 'Examination' },
    vitals: ['bp', 'pulse', 'temp', 'weight', 'spo2'],
    history: ['Diabetic', 'Hypertensive', 'Asthma', 'Thyroid', 'Cardiac patient', 'Pregnant', 'Drug allergy'],
    diagnoses: ['Acute viral fever', 'Upper respiratory infection', 'Acute gastroenteritis', 'Hypertension', 'Type 2 diabetes', 'Acid peptic disease', 'Urinary tract infection', 'Migraine', 'Allergic rhinitis'],
    procedures: [], plans: ['CBC', 'HbA1c', 'Lipid profile', 'Thyroid profile', 'Urine routine', 'Chest X-ray', 'ECG'],
    medicines: ['Tab Paracetamol 650 mg', 'Tab Cetirizine 10 mg', 'Tab Levocetirizine 5 mg', 'Tab Montelukast 10 mg', 'Tab Pantoprazole 40 mg', 'Tab Domperidone 10 mg', 'Tab Ondansetron 4 mg', 'Tab Azithromycin 500 mg', 'Tab Amoxicillin + Clavulanate 625 mg', 'Tab Cefixime 200 mg', 'Tab Metformin 500 mg', 'Tab Amlodipine 5 mg', 'Tab Telmisartan 40 mg', 'Tab Atorvastatin 10 mg', 'Tab Vitamin D3 60000 IU', 'ORS sachet', 'Syp Ambroxol'],
    advice: ['Drink plenty of fluids', 'Take adequate rest', 'Avoid oily and spicy food', 'Steam inhalation twice daily', 'Walk 30 minutes daily', 'Complete the full course of antibiotics', 'Return immediately if symptoms worsen'],
  },
  pediatric: {
    label: 'Pediatrics',
    sections: ['vitals', 'history', 'complaints', 'findings', 'diagnosis'],
    labels: { complaints: 'Complaints', findings: 'Examination', history: 'Birth / immunisation / allergies' },
    vitals: ['weight', 'temp', 'pulse', 'spo2'],
    history: ['Immunisation up to date', 'Immunisation due', 'Preterm birth', 'Drug allergy', 'Asthma'],
    diagnoses: ['Acute viral fever', 'Upper respiratory infection', 'Acute gastroenteritis', 'Otitis media', 'Tonsillitis', 'Bronchiolitis', 'Worm infestation'],
    procedures: ['Vaccination given', 'Nebulisation'], plans: ['CBC', 'Urine routine', 'Next vaccine due'],
    medicines: ['Syp Paracetamol 250 mg/5 ml', 'Drops Paracetamol 100 mg/ml', 'Syp Ibuprofen 100 mg/5 ml', 'Syp Cetirizine 5 mg/5 ml', 'Syp Amoxicillin 250 mg/5 ml', 'Syp Amoxicillin + Clavulanate 228.5 mg/5 ml', 'Syp Azithromycin 200 mg/5 ml', 'Syp Ondansetron 2 mg/5 ml', 'ORS sachet', 'Zinc dispersible 20 mg', 'Saline nasal drops', 'Syp Albendazole 400 mg/10 ml'],
    advice: ['Give plenty of fluids', 'Continue breastfeeding', 'Sponge with lukewarm water if fever is high', 'Give ORS after every loose stool', 'Return immediately if the child is drowsy or not feeding'],
  },
  dermatology: {
    label: 'Dermatology',
    sections: ['history', 'complaints', 'findings', 'diagnosis', 'procedures'],
    labels: { complaints: 'Complaints', findings: 'Examination', procedures: 'Procedure done' },
    vitals: [],
    history: ['Diabetic', 'Thyroid', 'Pregnant', 'Drug allergy', 'Atopy'],
    diagnoses: ['Acne vulgaris', 'Tinea corporis', 'Atopic dermatitis', 'Psoriasis', 'Urticaria', 'Melasma', 'Seborrhoeic dermatitis', 'Alopecia areata', 'Scabies'],
    procedures: ['Chemical peel', 'Cryotherapy', 'Intralesional injection', 'Comedone extraction'], plans: ['KOH mount', 'Patch test', 'Skin biopsy'],
    medicines: ['Cream Clotrimazole 1%', 'Cream Luliconazole 1%', 'Tab Terbinafine 250 mg', 'Tab Itraconazole 100 mg', 'Gel Adapalene 0.1%', 'Gel Clindamycin 1%', 'Cream Mometasone 0.1%', 'Lotion Calamine', 'Tab Levocetirizine 5 mg', 'Tab Doxycycline 100 mg', 'Moisturising lotion', 'Sunscreen SPF 50', 'Lotion Permethrin 5%'],
    advice: ['Apply sunscreen every 3 hours outdoors', 'Use a gentle, soap-free cleanser', 'Keep the area dry', 'Do not share towels or clothes', 'Avoid steroid creams without advice'],
  },
};

export const padStyles: { value: PadStyle; label: string }[] = [
  { value: 'classic', label: 'Classic' }, { value: 'band', label: 'Colour band' }, { value: 'minimal', label: 'Minimal' },
];
export const padAccents = ['#0b7a6c', '#1f5fbf', '#7a3fc2', '#b2371f', '#c2410c', '#1d2939'];

export const defaultPad = (specialty: Specialty = 'dental'): RxPad => ({ specialty, style: 'classic', accent: specialty === 'dental' ? '#1f5fbf' : '#0b7a6c', tagline: '', footer: '', paper: 'A5' });

export function padFor(clinicPad: Partial<RxPad> | undefined, doctorSpecialty?: Specialty): RxPad {
  const base = { ...defaultPad(clinicPad?.specialty), ...clinicPad };
  return doctorSpecialty ? { ...base, specialty: doctorSpecialty } : base;
}

/** FDI tooth numbers, laid out as the dentist faces the patient (patient's right on the left). */
export const permanentTeeth = { upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] };
export const primaryTeeth = { upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65], lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] };

const toothNames: Record<number, string> = { 1: 'central incisor', 2: 'lateral incisor', 3: 'canine', 4: 'first premolar', 5: 'second premolar', 6: 'first molar', 7: 'second molar', 8: 'third molar' };
const primaryNames: Record<number, string> = { 1: 'central incisor', 2: 'lateral incisor', 3: 'canine', 4: 'first molar', 5: 'second molar' };
const quadrant = ['', 'upper right', 'upper left', 'lower left', 'lower right'];
export function toothName(fdi: number) {
  const q = Math.floor(fdi / 10), n = fdi % 10;
  const primary = q >= 5;
  return `${quadrant[primary ? q - 4 : q]} ${(primary ? primaryNames : toothNames)[n]}${primary ? ' (milk tooth)' : ''}`;
}
