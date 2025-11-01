const mongoose = require('mongoose');

// Medical Record Schema
// Represents the clinical notes and outcomes captured by the nurse/doctor during a visit

const prescriptionSchema = new mongoose.Schema(
  {
    medicine: { type: String, default: '' },
    dosage: { type: String, default: '' },
    duration: { type: String, default: '' }
  },
  { _id: false }
);

const medicalRecordSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true
    },
    doctorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    patientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null
    },
    nurseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Visit info
    patientAge: { type: Number, default: null },
    address: { type: String, default: '' },
    additionalServiceIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
      }
    ],

    // Notes
    nurseNote: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    conclusion: { type: String, default: '' },

    // Prescription
    prescription: { type: prescriptionSchema, default: {} },

    // Follow-up
    followUpDate: { type: Date, default: null },
    followUpAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null
    },
    status: {
      type: String,
      enum: ['Draft', 'Finalized'],
      default: 'Draft'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema, 'medicalrecords');


