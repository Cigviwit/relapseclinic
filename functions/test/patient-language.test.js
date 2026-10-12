const test = require('node:test');
const assert = require('node:assert/strict');
const { appointmentMessage, msg91Payload } = require('../reminder-logic');
const templates = require('../bilingual-templates.json');
const bilingualConfig = require('../bilingual-config.json');

const appointment = { doctorId: 'd1', date: '2026-10-10', time: '16:30' };
const patient = { name: 'Aarav Sharma', phone: '+918888888888' };
const clinic = { name: 'Greenleaf Clinic', phone: '+919876543210', doctors: [{ id: 'd1', name: 'Dr. Priya Nair' }] };
const config = {
  integratedNumber: '+919999999999', namespace: 'clinic', language: 'en',
  appointmentTemplate: 'english_appointment', missedTemplate: 'english_missed',
  bilingualTemplates: bilingualConfig,
};

test('legacy and English patients retain the existing template and parameter count', () => {
  for (const language of [undefined, 'en']) {
    const result = appointmentMessage(config, appointment, { ...patient, language }, clinic, 'booked');
    assert.equal(result.templateName, 'english_appointment');
    assert.equal(result.language, 'en');
    assert.equal(result.values.length, 6);
    assert.equal(appointmentMessage(config, appointment, { ...patient, language }, clinic, 'missed_day_one').values.length, 5);
  }
});

for (const language of ['mr', 'hi']) {
  test(`${language}: every automatic slot uses one English-first bilingual template`, () => {
    for (const slot of ['booked', 'two_days_before', 'appointment_day', 'missed_day_one', 'missed_day_seven']) {
      const missed = slot.startsWith('missed_');
      const result = appointmentMessage(config, appointment, { ...patient, language }, clinic, slot);
      const body = templates[language][missed ? 'missed' : 'appointment'];
      assert.equal(result.templateName, body.name);
      const payload = msg91Payload({ ...config, language: result.language }, patient.phone,
        result.templateName, result.values, 'delivery1');
      assert.equal(payload.payload.template.language.code, config.bilingualTemplates[language].language);
      assert.equal(payload.payload.template.to_and_components.length, 1);
      const components = payload.payload.template.to_and_components[0].components;
      assert.equal(Object.keys(components).length, missed ? 10 : 12);
      const placeholders = [...body.body.matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1]));
      assert.deepEqual(placeholders, Array.from({ length: result.values.length }, (_, i) => i + 1));
      assert.ok(body.body.length <= 1024);
      const rendered = body.body.replace(/\{\{(\d+)\}\}/g, (_, index) => components[`body_${index}`].value);
      const paragraphs = rendered.split('\n\n');
      assert.equal(paragraphs.length, 2);
      assert.match(paragraphs[0], /^Hello Aarav Sharma,/);
      assert.match(paragraphs[0], /10 October 2026/);
      assert.match(paragraphs[1], /10\/10\/2026/);
      assert.ok(paragraphs[1].includes(patient.name));
      assert.ok(paragraphs[1].includes(clinic.name));
      assert.ok(paragraphs[1].includes(clinic.doctors[0].name));
      assert.ok(paragraphs[1].includes(clinic.phone));
      if (!missed) assert.match(paragraphs[1], /16:30/);
      else {
        assert.equal(components.body_7.value, clinic.name);
        assert.equal(components.body_8.value, clinic.doctors[0].name);
      }
      assert.doesNotMatch(rendered, /\{\{/);
    }
  });
}

test('updated patient preference is used for subsequent messages', () => {
  assert.equal(appointmentMessage(config, appointment, { ...patient, language: 'mr' }, clinic, 'booked').preference, 'mr');
  assert.equal(appointmentMessage(config, appointment, { ...patient, language: 'hi' }, clinic, 'appointment_day').preference, 'hi');
});

test('verified MSG91 names work without changing the existing English secret', () => {
  const englishOnly = { ...config, bilingualTemplates: undefined };
  for (const language of ['mr', 'hi']) {
    const message = appointmentMessage(englishOnly, appointment, { ...patient, language }, clinic, 'booked');
    assert.equal(message.templateName, `clinic_appointment_en_${language}_v1`);
    assert.equal(message.language, language);
    assert.equal(message.values.length, 12);
    assert.equal(appointmentMessage(englishOnly, appointment, { ...patient, language }, clinic, 'missed_day_one').templateName,
      `clinic_missed_visit_en_${language}_v1`);
  }
});

test('invalid overrides and unsupported preferences fail before contacting the provider', () => {
  const incomplete = { ...config, bilingualTemplates: { hi: { appointmentTemplate: 'example' } } };
  assert.throws(() => appointmentMessage(incomplete, appointment, { ...patient, language: 'hi' }, clinic, 'booked'), /language code/);
  assert.throws(() => appointmentMessage(config, appointment, { ...patient, language: 'invalid' }, clinic, 'booked'), /Unsupported/);
});
