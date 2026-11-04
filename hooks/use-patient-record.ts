import { useEffect, useState } from 'react';
import type { Repository } from '@/lib/firestore-repository';
import type { PatientNote, PatientRecord, RecordAudit } from '@/lib/patient-record';

type Subscribe<T> = (onUpdate: (value: T) => void, onError: (error: Error) => void) => () => void;
export type Live<T> = { status: 'loading'; value?: undefined } | { status: 'error'; value?: undefined } | { status: 'ready'; value: T };

/** A listener tied to `key`. Results from a previous key are never returned, so one patient's data cannot show under another. */
function useLive<T>(key: string, subscribe: Subscribe<T>): Live<T> {
  const [state, setState] = useState<{ key: string; live: Live<T> }>({ key: '', live: { status: 'loading' } });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the subscription
  useEffect(() => { if (key) return subscribe(value => setState({ key, live: { status: 'ready', value } }), () => setState({ key, live: { status: 'error' } })); }, [key]);
  return state.key === key ? state.live : { status: 'loading' };
}

const keyOf = (clinicId: string, patientId: string) => patientId ? `${clinicId}/${patientId}` : '';
export const usePatientRecord = (repo: Repository, clinicId: string, patientId: string) => useLive<PatientRecord | null>(keyOf(clinicId, patientId), (ok, fail) => repo.subscribePatientRecord(clinicId, patientId, ok, fail));
export const usePatientNotes = (repo: Repository, clinicId: string, patientId: string) => useLive<PatientNote[]>(keyOf(clinicId, patientId), (ok, fail) => repo.subscribePatientNotes(clinicId, patientId, ok, fail));
export const useRecordAudit = (repo: Repository, clinicId: string, patientId: string) => useLive<RecordAudit[]>(keyOf(clinicId, patientId), (ok, fail) => repo.subscribeRecordAudit(clinicId, patientId, ok, fail));
