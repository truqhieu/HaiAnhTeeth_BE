const message = new ChatMessage({
  appointmentId,
  patientUserId: appointment.patientUserId,  // Từ appointment
  doctorUserId: appointment.replacedDoctorUserId || appointment.doctorUserId,  // Từ appointment
  senderId,
  receiverId,
  content: content.trim(),
  status: 'Sent'
});
