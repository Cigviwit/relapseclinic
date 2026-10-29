import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, validateAppointment, validateReminder, messaging, reminderStatus, normalizePhone, zonedNow, validateClinic, repository } from '../lib/clinic.ts';
test('booking blocks overlaps but permits adjacent slots and different doctors',()=>{const db=seed();const a={...db.appointments[0],id:'new',status:'scheduled'};assert.throws(()=>validateAppointment(db,a),/already has/);assert.doesNotThrow(()=>validateAppointment(db,{...a,time:'10:00'}));assert.doesNotThrow(()=>validateAppointment(db,{...a,doctorId:'arjun'}));assert.throws(()=>validateAppointment(db,{...a,time:'09:15'}),/already has/)});
test('rescheduling ignores itself and cancelled appointments release the slot',()=>{const db=seed();assert.doesNotThrow(()=>validateAppointment(db,db.appointments[2]));db.appointments[0].status='cancelled';assert.doesNotThrow(()=>validateAppointment(db,{...db.appointments[0],id:'new',status:'scheduled'}))});
test('clinic hours include duration, and incomplete bookings are rejected',()=>{const db=seed(),a={...db.appointments[0],id:'new'};assert.throws(()=>validateAppointment(db,{...a,time:'08:45'}),/clinic hours/);assert.throws(()=>validateAppointment(db,{...a,time:'18:45'}),/clinic hours/);assert.throws(()=>validateAppointment(db,{...a,duration:0}),/duration/);assert.throws(()=>validateAppointment(db,{...a,patientId:''}),/Choose/)});
test('cross-clinic patients and doctors cannot be booked',()=>{const db=seed(),a={...db.appointments[0],id:'new'};assert.throws(()=>validateAppointment(db,{...a,patientId:'lake-p'}),/Choose/);assert.throws(()=>validateAppointment(db,{...a,doctorId:'neha'}),/Choose/)});
test('consent is required at scheduling and again at send time',()=>{const db=seed(),r=db.reminders[0];assert.doesNotThrow(()=>validateReminder(db,r));db.patients[0].consent=false;assert.throws(()=>validateReminder(db,r),/consent/);assert.throws(()=>messaging.simulate(db,r),/consent/)});
test('simulations preserve clinic identity and cannot be sent twice',()=>{const db=seed(),r=messaging.simulate(db,db.reminders[0]);assert.equal(r.status,'simulated-sent');assert.ok(r.sentMessage.includes(db.clinics[0].name));assert.ok(r.sentMessage.includes(db.clinics[0].phone));assert.throws(()=>messaging.simulate(db,r),/Only scheduled/);assert.equal(db.reminders[0].status,'scheduled')});
test('reminder due status uses clinic timezone including date rollover',()=>{const db=seed(),c=db.clinics[0],r={...db.reminders[0],date:'2026-09-23',time:'00:10'};assert.equal(reminderStatus(r,c,new Date('2026-09-22T18:45:00Z')),'due');assert.equal(reminderStatus(r,c,new Date('2026-09-22T18:30:00Z')),'scheduled');assert.deepEqual(zonedNow('America/New_York',new Date('2026-09-22T00:00:00Z')),{date:'2026-09-21',time:'20:00'})});
test('phone normalization supports Indian and international numbers',()=>{assert.equal(normalizePhone('98765 43210'),'+919876543210');assert.equal(normalizePhone('+1 (202) 555-0123'),'+12025550123');assert.throws(()=>normalizePhone('abc'));assert.throws(()=>normalizePhone('123'))});
test('clinic rejects invalid hours, timezone and missing doctors',()=>{const c=seed().clinics[0];assert.throws(()=>validateClinic({...c,closes:'08:00'}));assert.throws(()=>validateClinic({...c,timezone:'invalid'}));assert.throws(()=>validateClinic({...c,doctors:[]}));assert.doesNotThrow(()=>validateClinic(c))});
test('repository round trips independent clinic records and detects broken data',()=>{let raw=null;globalThis.localStorage={getItem:()=>raw,setItem:(_,v)=>{raw=v}};const db=seed();db.activeClinicId='lakeside';repository.save(db);assert.deepEqual(repository.load(),db);raw='broken';assert.throws(()=>repository.load());raw=JSON.stringify({version:2});assert.throws(()=>repository.load())});
import { computeImpact } from '../lib/impact.ts';
test('impact counts accepted messages and missed visits rebooked after a follow-up',()=>{
 const ap=(id,patientId,date,status)=>({id,clinicId:'c',patientId,doctorId:'d',date,time:'10:00',duration:30,reason:'',status});
 const appts=[ap('m1','p1','2026-10-01','missed'),ap('r1','p1','2026-10-10','scheduled'),ap('m2','p2','2026-10-02','missed'),ap('m3','p3','2026-10-03','missed'),ap('x3','p3','2026-10-20','cancelled')];
 const del=(appointmentId,slot,status='accepted')=>({appointmentId,patientId:'',slot,status});
 const r=computeImpact(appts,[del('m1','missed_day_one'),del('m2','missed_day_one'),del('m3','missed_day_one','failed'),del('r1','two_days_before')]);
 assert.equal(r.messagesSent,3);assert.equal(r.missedVisits,3);assert.equal(r.followedUp,2);assert.equal(r.rebooked,1);assert.equal(r.recoveredVisits,1);
 assert.equal(computeImpact(appts,[del('m1','missed_day_one')],{from:'2026-10-05',to:'2026-10-31'}).missedVisits,0);
});
import { unresolvedVisits } from '../lib/unresolved.ts';
test('unresolved queue lists only past scheduled visits, oldest first',()=>{
 const ap=(id,date,time,status)=>({id,clinicId:'c',patientId:'p',doctorId:'d',date,time,duration:30,reason:'',status});
 const q=unresolvedVisits([ap('a','2026-10-27','11:00','scheduled'),ap('b','2026-10-27','09:00','scheduled'),ap('c','2026-10-27','10:00','completed'),ap('d','2026-10-27','10:30','missed'),ap('e','2026-10-27','12:00','cancelled'),ap('f','2026-10-28','09:00','scheduled'),ap('g','2026-10-25','15:00','scheduled')],'2026-10-28');
 assert.deepEqual(q.map(a=>a.id),['g','b','a']);
});
import { frequencyText, medicineInstruction, prescriptionMessage, whatsappUrl, validatePrescription, cleanPrescription, blankPrescription } from '../lib/prescription.ts';
test('prescription dosage reads in English, Hindi and Marathi',()=>{
 assert.equal(frequencyText('1-0-1'),'morning, night');
 assert.equal(frequencyText('1-1-1-1'),'morning, afternoon, evening, night');
 assert.equal(frequencyText('SOS'),'only when needed');
 assert.equal(frequencyText('2 puffs'),'2 puffs');
 const m={id:'m',name:'Tab X',frequency:'1-0-1',timing:'after',days:'5',notes:''};
 assert.equal(medicineInstruction(m),'morning, night · after food · 5 days');
 assert.equal(medicineInstruction(m,'hi'),'सुबह, रात · खाने के बाद · 5 दिन');
 assert.equal(medicineInstruction({...m,days:'1',timing:''},'mr'),'सकाळी, रात्री · 1 दिवस');
});
test('prescription WhatsApp message and link',()=>{
 const db=seed(),c=db.clinics[0],p={...db.patients[0],language:'mr'},rx={...blankPrescription(c,'2026-10-29',p.id,'priya'),diagnosis:'Viral fever',advice:'Rest\n- Fluids',followUp:'2026-11-03',medicines:[{id:'m',name:'Tab Paracetamol 650 mg',frequency:'1-1-1',timing:'after',days:'3',notes:'If fever'},{id:'e',name:' ',frequency:'1-0-1',timing:'after',days:'5',notes:''}]};
 const msg=prescriptionMessage(rx,c,p,c.doctors[0]);
 assert.match(msg,/\*Greenleaf Clinic\*/);assert.match(msg,/1\. \*Tab Paracetamol 650 mg\*/);assert.match(msg,/सकाळी, दुपारी, रात्री/);
 assert.match(msg,/• Rest\n• Fluids/);assert.match(msg,/Follow-up:\* Tue, 3 Nov,? 2026/);assert.doesNotMatch(msg,/2\. /);
 assert.ok(whatsappUrl('+91 98765-43210','a b&c').startsWith('https://wa.me/919876543210?text=a%20b%26c'));
 assert.equal(cleanPrescription(rx).medicines.length,1);
});
test('prescription validation',()=>{
 const db=seed(),c=db.clinics[0],rx=blankPrescription(c,'2026-10-29','p0','priya');
 assert.throws(()=>validatePrescription(rx,db.patients,c.doctors),/at least one/);
 const ok={...rx,medicines:[{...rx.medicines[0],name:'Tab X'}]};
 assert.doesNotThrow(()=>validatePrescription(ok,db.patients,c.doctors));
 assert.throws(()=>validatePrescription({...ok,patientId:'lake-p'},db.patients,c.doctors),/patient/);
 assert.throws(()=>validatePrescription({...ok,followUp:'2026-10-01'},db.patients,c.doctors),/Follow-up/);
});
import { freeSlots, dayBuckets } from '../lib/schedule.ts';
test('free slots skip busy times, clinic hours and the past',()=>{
 const db=seed(),c=db.clinics[0],date='2030-01-01';
 const ap=(id,time,duration,status='scheduled')=>({id,clinicId:c.id,patientId:'p0',doctorId:'priya',date,time,duration,reason:'',status});
 const s=freeSlots([ap('a','09:00',30),ap('b','10:00',15,'cancelled')],c,'priya',date,30);
 assert.equal(s[0],'09:30');assert.ok(s.includes('10:00'));assert.equal(s.at(-1),'18:30');
 assert.ok(freeSlots([ap('a','09:00',30)],c,'priya',date,30,'a').includes('09:00'));
 assert.deepEqual(freeSlots([],c,'priya','2026-09-22',30,undefined,15,new Date('2026-09-22T12:00:00Z')).slice(0,1),['17:45']);
 const b=dayBuckets([ap('x','09:00',30),ap('y','10:00',30),ap('z','11:00',30),ap('w','08:00',30,'completed')],'10:10');
 assert.deepEqual([b.overdue.map(a=>a.id),b.current.map(a=>a.id),b.upcoming.map(a=>a.id),b.seen.length],[['x'],['y'],['z'],1]);
});
