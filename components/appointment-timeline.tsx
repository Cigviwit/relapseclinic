import { Check, Clock3, AlertCircle } from 'lucide-react';
import { type Appointment, addDays } from '@/lib/clinic';
import { type MessageDelivery } from '@/lib/firestore-repository';

const labels: Record<string, string> = {
  booked: 'Booking confirmation',
  two_days_before: 'Two day reminder',
  appointment_day: 'Appointment day reminder',
  missed_day_one: 'Missed visit follow-up',
  missed_day_seven: 'Seven day follow-up',
};

function timestamp(record?: MessageDelivery) {
  const date = record?.updatedAt?.toDate?.() ?? record?.createdAt?.toDate?.();
  return date ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : null;
}

export function AppointmentTimeline({ appointment, deliveries, consent }: {
  appointment: Appointment; deliveries: MessageDelivery[]; consent: boolean;
}) {
  const records = deliveries.filter(item => item.appointmentId === appointment.id &&
    item.patientId === appointment.patientId && item.appointmentDate === appointment.date &&
    item.appointmentTime === appointment.time);
  const slots = ['booked', 'two_days_before', 'appointment_day',
    ...(appointment.status === 'missed' ? ['missed_day_one', 'missed_day_seven'] : [])];
  const steps = slots.map(slot => ({ slot, record: records.find(item => item.slot === slot) }));
  return <section className="appointment-tracker" aria-label="WhatsApp appointment timeline">
    <h3>WhatsApp timeline</h3>
    <p className="muted">Message attempts for this appointment</p>
    {!consent && <p className="tracker-note">WhatsApp consent is not recorded for this patient.</p>}
    <ol className="tracker-steps">{steps.map(({ slot, record }) => {
      const state = record?.status === 'accepted' ? 'done' : record?.status === 'failed' || record?.status === 'unknown' ? 'issue' : record?.status === 'sending' ? 'current' : 'pending';
      const schedule = slot === 'booked' ? 'When booked' : slot === 'two_days_before' ? addDays(appointment.date, -2) + ' · 8:00 AM' : slot === 'appointment_day' ? appointment.date + ' · 8:00 AM' : slot === 'missed_day_one' ? 'When marked missed' : addDays(appointment.date, 7) + ' · 8:00 AM';
      const detail = record?.status === 'accepted' ? 'Accepted by MSG91' : record?.status === 'failed' ? 'Message failed' : record?.status === 'unknown' ? 'Delivery outcome unknown' : record?.status === 'sending' ? 'Sending' : appointment.status === 'cancelled' || appointment.status === 'completed' ? 'No message recorded' : 'Pending';
      return <li key={slot} className={`tracker-step ${state}`}><span className="tracker-marker">{state === 'done' ? <Check size={14}/> : state === 'issue' ? <AlertCircle size={15}/> : <Clock3 size={14}/>}</span><div><strong>{labels[slot]}</strong><small>{detail} · {timestamp(record) ?? schedule}</small>{record?.error && <span className="tracker-error">{record.error}</span>}</div></li>;
    })}</ol>
    <p className="tracker-footnote">Accepted means the provider received the request; patient delivery is not confirmed.</p>
  </section>;
}
