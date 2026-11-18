# RelapseClinic

Clinic management for small dental clinics: appointments, patient records, prescriptions, billing and follow-ups. This glossary currently covers taking X-rays directly from a sensor.

## Language

**Sensor**:
The physical intraoral imaging device placed in the patient's mouth during an X-ray exposure.
_Avoid_: RVG, device, X-ray machine

**Capture Station**:
The clinic PC a Sensor is plugged into.
_Avoid_: Sensor PC, client, workstation

**Sensor Software**:
The vendor's own Windows application that runs a Sensor and keeps its images.
_Avoid_: NanoPix (also the Sensor's name), driver, viewer

**Capture**:
One image taken from a Sensor. Once saved to a patient, it is a Patient File of kind X-ray.
_Avoid_: Scan, shot, acquisition

**Capture Session**:
The time one patient stays selected for Captures on a Capture Station, ending when staff finish or the selection expires.
_Avoid_: Sitting, visit, appointment

**Unassigned Capture**:
A Capture that has not been saved to any patient.
_Avoid_: Orphan image, inbox item

**Patient File**:
A stored document on a patient's record, such as an X-ray, a paper prescription, a report or a consent form.
_Avoid_: Attachment, upload
