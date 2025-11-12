const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
  patientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  doctorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true },
  status: { type: String, default: "Sent" }, 
  readAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("ChatMessage", chatMessageSchema,'chatmessages');
