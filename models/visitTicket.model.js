const mongoose = require('mongoose');

const visitTicketSchema = new mongoose.Schema({
    appointmentId : {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true
    },
    patientName : {
        type : String,
        required: true
    },
    patientGender : {
        type : String,
        required : true,
    },
    patientAge : {
        type : Number,
        required : true,
    },
    phoneNumber : {
        type : String,
    },
    address : {
        type : String,
        default : null,
    },
    doctor : {
        type : String,
        default : null,
    },
    date : {
        type : Date,
        default : null,
    },
    service : [{
        serviceId :  {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Service',
            required: true
        },
        serviceName : {
            type : String,
            required : true
        },
        category : {
            type : String,
            required : true
        },
        price : {
            type : Number,
            default : 0
        },
        discount : {
            type : Number,
            default : 0
        },
        total : {
            type : Number,
            default : 0
        },
    }],
    totalAmount : {
        type : Number,
        default : 0,
    },
    diagnosis : {
        type : String,
        default : ''
    },
    prescriptions : [{
    medicine: { type: String, default: '' },
    dosage: { type: String, default: '' },
    duration: { type: String, default: '' }
    }],
    type: {
    type: String,
    default: 'Examination',
  },
}, {
    timestamps: true
});


module.exports = mongoose.model('VisitTicket', visitTicketSchema, 'visittickets');