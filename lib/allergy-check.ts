import type { Allergy } from './patient-record.ts';

/**
 * A prompt for the prescriber, not a safety guarantee. It catches the common medicines and Indian brand names
 * used in dental practice, but cannot know every brand, so finding nothing does not mean a medicine is safe.
 */
type Group = { name: string; terms: string[]; related?: string };
const groups: Group[] = [
  { name: 'penicillins', related: 'cephalosporins', terms: ['penicillin', 'amoxicillin', 'amoxycillin', 'amoxy', 'ampicillin', 'cloxacillin', 'flucloxacillin', 'dicloxacillin', 'piperacillin', 'clavulan', 'augmentin', 'clavam', 'moxikind', 'novamox', 'mox', 'amox', 'moxclav', 'megaclox'] },
  { name: 'cephalosporins', related: 'penicillins', terms: ['cephalosporin', 'cephalexin', 'cefalexin', 'cefixime', 'cefuroxime', 'cefadroxil', 'cefpodoxime', 'ceftriaxone', 'cefdinir', 'taxim', 'zifi', 'phexin'] },
  { name: 'NSAIDs (anti-inflammatory painkillers)', terms: ['nsaid', 'nsaids', 'painkiller', 'painkillers', 'ibuprofen', 'diclofenac', 'aceclofenac', 'ketorolac', 'naproxen', 'nimesulide', 'aspirin', 'mefenamic', 'etoricoxib', 'piroxicam', 'brufen', 'ibugesic', 'combiflam', 'voveran', 'zerodol', 'hifenac', 'ketorol', 'dolokind', 'nise', 'meftal', 'ecosprin', 'disprin'] },
  { name: 'paracetamol', terms: ['paracetamol', 'acetaminophen', 'dolo', 'crocin', 'calpol', 'combiflam', 'zerodol-p', 'dolokind-plus'] },
  { name: 'macrolides', terms: ['macrolide', 'azithromycin', 'erythromycin', 'clarithromycin', 'roxithromycin', 'azithral', 'azee'] },
  { name: 'sulfa medicines', terms: ['sulfa', 'sulpha', 'sulfonamide', 'sulfamethoxazole', 'cotrimoxazole', 'co-trimoxazole', 'septran', 'bactrim'] },
  { name: 'nitroimidazoles', terms: ['metronidazole', 'ornidazole', 'tinidazole', 'flagyl', 'metrogyl'] },
  { name: 'fluoroquinolones', terms: ['quinolone', 'ciprofloxacin', 'ofloxacin', 'levofloxacin', 'norfloxacin', 'moxifloxacin', 'cifran', 'oflox'] },
  { name: 'tetracyclines', terms: ['tetracycline', 'doxycycline', 'minocycline'] },
  { name: 'lincosamides', terms: ['clindamycin', 'lincomycin', 'dalacin'] },
  { name: 'local anaesthetics', terms: ['anaesthetic', 'anesthetic', 'lidocaine', 'lignocaine', 'xylocaine', 'articaine', 'bupivacaine', 'prilocaine'] },
  { name: 'opioid painkillers', terms: ['opioid', 'tramadol', 'codeine', 'ultracet', 'tramazac'] },
];

/** "Dolo-650" and "Dolo650" are both also read as "dolo": strengths are usually written straight onto the name. */
const words = (text: string) => (text.toLowerCase().match(/[a-z0-9-]+/g) || []).flatMap(w => [w, ...w.split('-'), w.replace(/[-\d]+$/, '')]).filter(Boolean);
const mentions = (text: string, term: string) => words(text).some(w => w === term || (term.length >= 5 && w.startsWith(term)));
const groupsOf = (text: string) => groups.filter(g => g.terms.some(t => mentions(text, t)));
/** "Penicillin" as a whole word, or "amoxicillin" when the allergy says "amoxicillin 500". Too-short words are ignored. */
const sameSubstance = (medicine: string, substance: string) => words(substance).filter(w => w.length >= 4).some(w => mentions(medicine, w));

export type AllergyConflict = { medicine: string; substance: string; severity: Allergy['severity']; reason: string; strength: 'same' | 'group' | 'related' };

export function allergyConflicts(medicines: { name: string }[], allergies: Allergy[]): AllergyConflict[] {
  const out: AllergyConflict[] = [];
  for (const { name } of medicines) {
    const medicine = name.trim();
    if (!medicine) continue;
    const medicineGroups = groupsOf(medicine);
    for (const allergy of allergies) {
      const allergyGroups = groupsOf(allergy.substance);
      const shared = allergyGroups.find(g => medicineGroups.includes(g));
      const related = allergyGroups.find(g => g.related && medicineGroups.some(m => m.name === g.related));
      const base = { medicine, substance: allergy.substance, severity: allergy.severity };
      if (sameSubstance(medicine, allergy.substance)) out.push({ ...base, strength: 'same', reason: `contains ${allergy.substance}` });
      else if (shared) out.push({ ...base, strength: 'group', reason: `is one of the ${shared.name}, the same family as ${allergy.substance}` });
      else if (related) out.push({ ...base, strength: 'related', reason: `may cross-react: ${allergy.substance} is one of the ${related.name}` });
    }
  }
  return out;
}

/** Warnings the prescriber has not yet reviewed. Changing a medicine brings its warning back. */
export const unreviewedConflicts = (conflicts: AllergyConflict[], reviewed: string[] = []) => conflicts.filter(c => !reviewed.includes(c.medicine));
