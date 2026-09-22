import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, doc } from "firebase/firestore";

const firebaseConfig = {
  projectId: "relapse-clinic-db",
  appId: "1:321362413920:web:1b5d48771d9e36f433b605",
  storageBucket: "relapse-clinic-db.firebasestorage.app",
  apiKey: "AIzaSyDSb_ZpWETP9-DXsVFLGz2f_Nyu3ME8qq0",
  authDomain: "relapse-clinic-db.firebaseapp.com",
  messagingSenderId: "321362413920",
  measurementId: "G-JMMN8TRPG4",
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// Simple seed data
const date = new Date().toISOString().slice(0, 10);
const clinics = [
  {
    id: 'greenleaf',
    name: 'Greenleaf Clinic',
    address: 'Indiranagar, Bengaluru',
    phone: '+918000000001',
    timezone: 'Asia/Kolkata',
    opens: '09:00',
    closes: '19:00',
    doctors: [
      { id: 'priya', name: 'Dr. Priya Nair', specialty: 'General Physician' },
      { id: 'arjun', name: 'Dr. Arjun Mehta', specialty: 'Pediatrician' }
    ]
  },
  {
    id: 'lakeside',
    name: 'Lakeside Medical Centre',
    address: 'Whitefield, Bengaluru',
    phone: '+918000000002',
    timezone: 'Asia/Kolkata',
    opens: '08:00',
    closes: '18:00',
    doctors: [
      { id: 'neha', name: 'Dr. Neha Shah', specialty: 'General Physician' }
    ]
  }
];

const names = ['Aarav Sharma', 'Meera Iyer', 'Rohan Patel', 'Ananya Rao', 'Vikram Desai', 'Diya Kapoor', 'Kabir Singh', 'Ishita Menon'];
const patients = names.map((name, i) => ({
  id: 'p' + i,
  clinicId: 'greenleaf',
  name,
  phone: '+9180000001' + String(i).padStart(2, '0'),
  consent: i !== 6
}));
patients.push({
  id: 'lake-p',
  clinicId: 'lakeside',
  name: 'Sana Verma',
  phone: '+918000000200',
  consent: true
});

const appointments = names.map((_, i) => ({
  id: 'a' + i,
  clinicId: 'greenleaf',
  patientId: 'p' + i,
  doctorId: i % 3 === 2 ? 'arjun' : 'priya',
  date,
  time: ['09:00', '09:30', '10:00', '10:30', '11:15', '14:00', '15:30', '16:00'][i],
  duration: 30,
  reason: i % 3 === 2 ? 'Pediatric consultation' : i % 2 ? 'Follow-up visit' : 'General consultation',
  status: i < 2 ? 'completed' : 'scheduled'
}));

const reminders = [0, 1, 2, 3].map(i => ({
  id: 'r' + i,
  clinicId: 'greenleaf',
  patientId: 'p' + i,
  date,
  time: '09:00',
  message: `Hello ${names[i].split(' ')[0]}, this is a friendly reminder to schedule your follow-up visit. Please call us to find a time that works for you.`,
  status: 'scheduled'
}));

async function run() {
  console.log('Checking existing clinics in Firestore...');
  const snap = await getDocs(collection(firestore, 'clinics'));
  console.log(`Found ${snap.size} existing clinic documents.`);

  if (snap.empty) {
    console.log('Seeding initial documents into Firestore...');
    const batch = writeBatch(firestore);

    batch.set(doc(firestore, 'app_state', 'general'), { activeClinicId: 'greenleaf' });

    for (const c of clinics) {
      batch.set(doc(firestore, 'clinics', c.id), c);
    }
    for (const p of patients) {
      batch.set(doc(firestore, 'patients', p.id), p);
    }
    for (const a of appointments) {
      batch.set(doc(firestore, 'appointments', a.id), a);
    }
    for (const r of reminders) {
      batch.set(doc(firestore, 'reminders', r.id), r);
    }

    await batch.commit();
    console.log('Successfully seeded Firestore database relapse-clinic-db!');
  } else {
    console.log('Database already has clinics, skipping initial seed.');
  }
}

run().catch(err => {
  console.error('Seed script error:', err);
  process.exit(1);
});
