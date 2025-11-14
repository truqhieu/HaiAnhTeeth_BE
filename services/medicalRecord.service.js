const MedicalRecord = require('../models/medicalRecord.model');
const Appointment = require('../models/appointment.model');
const Service = require('../models/service.model');

class MedicalRecordService {

  /**
   * Calculate age from date of birth
   */
  _calcAge(dob) {
    if (!dob) return null;
    try {
      const birth = new Date(dob);
      const today = new Date();
      // Tính theo UTC để tránh lệch múi giờ
      let age = today.getUTCFullYear() - birth.getUTCFullYear();
      const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) {
        age--;
      }
      return age < 0 ? 0 : age;
    } catch (_) {
      return null;
    }
  }

  /**
   * Get or create medical record for appointment
   */
  async getOrCreateMedicalRecord(appointmentId, currentUserId, currentUserRole = null) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate('doctorUserId', 'fullName')
      .populate('patientUserId', 'fullName dob address email phoneNumber gender')
      .populate('customerId', 'fullName address dob email phoneNumber gender')
      .populate('serviceId', 'serviceName price'); // Populate dịch vụ chính

    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    let record = await MedicalRecord.findOne({ appointmentId })
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    // Prefill basic info from user/customer if creating first time
    if (!record) {
      const patient = appointment.patientUserId || appointment.customerId || null;
      const patientAge = this._calcAge(patient?.dob);
      const address = patient?.address || '';

      // Tự động thêm dịch vụ chính của appointment vào additionalServiceIds nếu có
      const initialServiceIds = [];
      if (appointment.serviceId && appointment.serviceId._id) {
        initialServiceIds.push(appointment.serviceId._id);
      }

      const nurseOwnerId =
        currentUserRole === 'Nurse'
          ? currentUserId
          : appointment.inProgressByUserId ||
            appointment.checkInByUserId ||
            currentUserId;

      record = await MedicalRecord.create({
        appointmentId: appointment._id,
        doctorUserId: appointment.doctorUserId,
        patientUserId: appointment.patientUserId || null,
        customerId: appointment.customerId || null,
        nurseId: nurseOwnerId,
        patientAge,
        address,
        additionalServiceIds: initialServiceIds, // Thêm dịch vụ chính
        status: 'Draft'
      });
      // Re-fetch with populate to include services info
      record = await MedicalRecord.findById(record._id)
        .populate({ path: 'additionalServiceIds', select: 'serviceName price' });
    }

    const patient = appointment.patientUserId || appointment.customerId || null;
    const patientName = patient?.fullName || 'N/A';
    const patientAge = record.patientAge ?? this._calcAge(patient?.dob);
    const address = record.address || patient?.address || '';
    const patientDob = patient?.dob || null;
    const email = patient?.email || '';
    const phoneNumber = patient?.phoneNumber || '';
    const gender = patient?.gender || '';

    // Prepare additional services - filter out null/undefined and ensure we have valid data
    // ⭐ LƯU Ý: Không tự động thêm dịch vụ chính vào đây nữa vì bác sĩ có quyền xóa nó
    // Dịch vụ chính chỉ được thêm khi tạo record mới (đã xử lý ở trên)
    let additionalServices = [];
    
    if (record?.additionalServiceIds && Array.isArray(record.additionalServiceIds)) {
      additionalServices = record.additionalServiceIds
        .filter(s => s && s._id) // Filter out null/undefined/invalid entries
        .map((s) => ({
          _id: s._id.toString(),
          serviceName: s.serviceName || '',
          price: s.price || 0,
        }));
    }
    
    console.log('🔍 [getOrCreateMedicalRecord] Appointment serviceId:', appointment.serviceId);
    console.log('🔍 [getOrCreateMedicalRecord] Record additionalServiceIds:', record?.additionalServiceIds);
    console.log('🔍 [getOrCreateMedicalRecord] Mapped additionalServices:', additionalServices);

    const appointmentStatus = appointment.status;
    const recordStatus = record?.status || 'Draft';
    const isAppointmentLocked = ['Completed', 'Finalized'].includes(appointmentStatus);
    const isRecordFinalized = recordStatus === 'Finalized';

    const nurseCanEdit = !isAppointmentLocked && !isRecordFinalized;
    const doctorCanEdit = !isAppointmentLocked && !isRecordFinalized;

    let nurseLockReason = null;
    let doctorLockReason = null;

    if (isAppointmentLocked) {
      nurseLockReason = 'Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ.';
      doctorLockReason = nurseLockReason;
    } else if (isRecordFinalized) {
      nurseLockReason = 'Hồ sơ đã được bác sĩ duyệt, điều dưỡng không thể chỉnh sửa.';
      doctorLockReason = 'Hồ sơ đã được duyệt. Nếu cần chỉnh sửa, vui lòng liên hệ quản trị.';
    }

    return {
      record,
      display: {
        patientName,
        patientAge,
        patientDob,
        address,
        doctorName: appointment.doctorUserId?.fullName || 'N/A',
        additionalServices,
        email,
        phoneNumber,
        gender
      },
      permissions: {
        appointmentStatus,
        recordStatus,
        nurse: {
          canEdit: nurseCanEdit,
          reason: nurseLockReason
        },
        doctor: {
          canEdit: doctorCanEdit,
          reason: doctorLockReason
        }
      }
    };
  }

  /**
   * Update nurse note
   */
  async updateNurseNote(appointmentId, nurseNote, nurseUserId) {
    return this.updateMedicalRecordForNurse(
      appointmentId,
      { nurseNote },
      nurseUserId
    );
  }

  /**
   * Update medical record draft values by nurse (save only)
   */
  async updateMedicalRecordForNurse(appointmentId, updateData = {}, nurseUserId) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }
    if (!nurseUserId) {
      throw new Error('Không xác định được điều dưỡng đang chỉnh sửa.');
    }

    const appointment = await Appointment.findById(appointmentId).select('status');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ.');
    }

    const record = await MedicalRecord.findOne({ appointmentId });
    if (!record) {
      throw new Error('Hồ sơ khám bệnh chưa được khởi tạo. Vui lòng tạo hồ sơ trước khi lưu.');
    }

    if (record.status === 'Finalized') {
      throw new Error('Hồ sơ đã được bác sĩ duyệt, điều dưỡng không thể chỉnh sửa.');
    }

    const allowedFields = ['nurseNote', 'diagnosis', 'conclusion', 'patientAge', 'address'];
    const updateFields = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updateData, field)) {
        updateFields[field] = updateData[field];
      }
    });

    // ⭐ Hỗ trợ cả prescription (object cũ) và prescriptions (array mới) để backward compatible
    if (Object.prototype.hasOwnProperty.call(updateData, 'prescription')) {
      const prescription = updateData.prescription;
      if (Array.isArray(prescription)) {
        updateFields.prescriptions = prescription.map(p => ({
          medicine: p?.medicine || '',
          dosage: p?.dosage || '',
          duration: p?.duration || ''
        }));
      } else if (prescription && typeof prescription === 'object') {
        // Nếu là object đơn, chuyển thành array với 1 phần tử (backward compatibility)
        updateFields.prescriptions = [{
          medicine: prescription?.medicine || '',
          dosage: prescription?.dosage || '',
          duration: prescription?.duration || ''
        }];
      } else {
        updateFields.prescriptions = [];
      }
    }

    updateFields.status = 'Draft';
    updateFields.nurseId = nurseUserId;

    const updatedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { $set: updateFields },
      { new: true }
    ).populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    return updatedRecord;
  }

  /**
   * Get active services for doctor
   */
  async getActiveServicesForDoctor() {
    const services = await Service.find({ status: 'Active' })
      .select('_id serviceName price category isPrepaid durationMinutes')
      .sort({ serviceName: 1 });

    return services;
  }

  /**
   * Update additional services for doctor
   */
  async updateAdditionalServicesForDoctor(appointmentId, serviceIds) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }
    if (!Array.isArray(serviceIds)) {
      throw new Error('serviceIds phải là mảng');
    }

    const appointment = await Appointment.findById(appointmentId).select('status');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể chỉnh sửa dịch vụ.');
    }

    const record = await MedicalRecord.findOne({ appointmentId });
    if (!record) {
      throw new Error('Hồ sơ khám bệnh chưa được khởi tạo.');
    }

    if (record.status === 'Finalized') {
      throw new Error('Hồ sơ đã được bác sĩ duyệt, không thể cập nhật dịch vụ bổ sung.');
    }

    const updatedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { $set: { additionalServiceIds: serviceIds, status: 'Draft' } },
      { new: true }
    ).populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    return updatedRecord;
  }

  /**
   * Update medical record for doctor (diagnosis, conclusion, prescription, nurseNote)
   * @param {string} appointmentId 
   * @param {object} updateData - { diagnosis, conclusion, prescription, nurseNote, approve }
   */
  async updateMedicalRecordForDoctor(appointmentId, updateData) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }

    const { diagnosis, conclusion, prescription, nurseNote, approve } = updateData;

    const appointment = await Appointment.findById(appointmentId).select('status');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ.');
    }

    const record = await MedicalRecord.findOne({ appointmentId });
    if (!record) {
      throw new Error('Hồ sơ khám bệnh chưa được khởi tạo.');
    }

    if (record.status === 'Finalized' && approve !== true) {
      throw new Error('Hồ sơ đã được duyệt, không thể chỉnh sửa.');
    }

    const updateFields = {};
    if (diagnosis !== undefined) updateFields.diagnosis = diagnosis;
    if (conclusion !== undefined) updateFields.conclusion = conclusion;
    // ⭐ Hỗ trợ cả prescription (object cũ) và prescriptions (array mới) để backward compatible
    if (prescription !== undefined) {
      // Nếu là array, lưu vào prescriptions
      if (Array.isArray(prescription)) {
        updateFields.prescriptions = prescription.map(p => ({
          medicine: p?.medicine || '',
          dosage: p?.dosage || '',
          duration: p?.duration || ''
        }));
      } else if (prescription && typeof prescription === 'object') {
        // Nếu là object đơn, chuyển thành array với 1 phần tử (backward compatibility)
        updateFields.prescriptions = [{
          medicine: prescription?.medicine || '',
          dosage: prescription?.dosage || '',
          duration: prescription?.duration || ''
        }];
      } else {
        updateFields.prescriptions = [];
      }
    }
    if (nurseNote !== undefined) updateFields.nurseNote = nurseNote;

    if (approve === true) {
      updateFields.status = 'Finalized';
    } else {
      updateFields.status = 'Draft';
    }

    const updatedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { $set: updateFields },
      { new: true }
    ).populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    return updatedRecord;
  }

  /**
   * Approve medical record by doctor - Set status = "Finalized"
   */
  async approveMedicalRecordByDoctor(appointmentId) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }

    const appointment = await Appointment.findById(appointmentId).select('status');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể duyệt hồ sơ.');
    }

    const record = await MedicalRecord.findOne({ appointmentId });
    if (!record) {
      throw new Error('Không tìm thấy hồ sơ khám bệnh');
    }

    if (record.status === 'Finalized') {
      return await MedicalRecord.findOne({ appointmentId }).populate({ path: 'additionalServiceIds', select: 'serviceName price' });
    }

    const finalizedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { 
        $set: { 
          status: 'Finalized'
        }
      },
      { new: true }
    ).populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    return finalizedRecord;
  }

  /**
   * Get medical record for patient (read-only)
   * Patient chỉ có thể xem medical record của chính mình
   */
  async getMedicalRecordForPatient(appointmentId, patientUserId) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }
    if (!patientUserId) {
      throw new Error('Thiếu patientUserId');
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate('doctorUserId', 'fullName')
      .populate('patientUserId', 'fullName dob address email phoneNumber gender')
      .populate('customerId', 'fullName address dob email phoneNumber gender')
      .populate('serviceId', 'serviceName price');

    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    // Kiểm tra quyền: Patient chỉ có thể xem medical record của chính mình
    const isPatientOwner = appointment.patientUserId?._id?.toString() === patientUserId.toString();
    const isCustomerOwner = appointment.customerId?._id?.toString() === patientUserId.toString();
    
    if (!isPatientOwner && !isCustomerOwner) {
      throw new Error('Bạn không có quyền xem hồ sơ khám bệnh này');
    }

    // Chỉ lấy record nếu đã tồn tại (không tạo mới)
    const record = await MedicalRecord.findOne({ appointmentId })
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' });

    if (!record) {
      throw new Error('Hồ sơ khám bệnh chưa được tạo');
    }

    // Kiểm tra appointment status
    if (appointment.status !== 'Completed') {
      throw new Error('Hồ sơ khám bệnh chỉ có thể xem khi ca khám đã hoàn thành');
    }

    // Kiểm tra quyền: Patient chỉ có thể xem medical record đã được doctor duyệt (status = "Finalized")
    if (record.status !== 'Finalized') {
      throw new Error('Hồ sơ khám bệnh chưa được bác sĩ duyệt');
    }

    const patient = appointment.patientUserId || appointment.customerId || null;
    const patientName = patient?.fullName || 'N/A';
    const patientAge = record.patientAge ?? this._calcAge(patient?.dob);
    const address = record.address || patient?.address || '';
    const patientDob = patient?.dob || null;
    const email = patient?.email || '';
    const phoneNumber = patient?.phoneNumber || '';
    const gender = patient?.gender || '';

    // Prepare additional services
    let additionalServices = [];
    if (record?.additionalServiceIds && Array.isArray(record.additionalServiceIds)) {
      additionalServices = record.additionalServiceIds
        .filter(s => s && s._id)
        .map((s) => ({
          _id: s._id.toString(),
          serviceName: s.serviceName || '',
          price: s.price || 0,
        }));
    }

    return {
      record: {
        _id: record._id,
        appointmentId: record.appointmentId,
        doctorUserId: record.doctorUserId,
        patientUserId: record.patientUserId,
        customerId: record.customerId,
        nurseId: record.nurseId,
        diagnosis: record.diagnosis || '',
        conclusion: record.conclusion || '',
        // ⭐ Hỗ trợ backward compatibility: nếu có prescriptions (array mới) thì dùng, nếu không thì dùng prescription (object cũ)
        prescription: (record.prescriptions && record.prescriptions.length > 0) 
          ? record.prescriptions[0] 
          : (record.prescription || {}),
        prescriptions: record.prescriptions || (record.prescription ? [record.prescription] : []),
        nurseNote: record.nurseNote || '',
        additionalServiceIds: record.additionalServiceIds || [],
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      display: {
        patientName,
        patientAge,
        patientDob,
        address,
        doctorName: appointment.doctorUserId?.fullName || 'N/A',
        additionalServices,
        email,
        phoneNumber,
        gender
      }
    };
  }

  /**
   * Get all medical records for a patient
   * Trả về danh sách các hồ sơ khám bệnh đã hoàn thành VÀ đã được doctor duyệt của patient
   */
  async getPatientMedicalRecordsList(patientUserId) {
    if (!patientUserId) {
      throw new Error('Thiếu patientUserId');
    }

    console.log(`📋 [getPatientMedicalRecordsList] Lấy danh sách hồ sơ cho patient: ${patientUserId}`);

    // Tìm tất cả medical records của patient (có thể là patientUserId hoặc customerId)
    // Chỉ lấy các records đã được doctor duyệt (status = "Finalized")
    const records = await MedicalRecord.find({
      $or: [
        { patientUserId: patientUserId },
        { customerId: patientUserId }
      ],
      // Chỉ lấy các records đã được doctor duyệt
      status: 'Finalized'
    })
      .populate({
        path: 'appointmentId',
        select: 'status timeslotId serviceId doctorUserId patientUserId customerId',
        match: { status: 'Completed' }, // Chỉ lấy appointments đã hoàn thành
        populate: [
          {
            path: 'timeslotId',
            select: 'startTime endTime'
          },
          {
            path: 'serviceId',
            select: 'serviceName price'
          },
          {
            path: 'doctorUserId',
            select: 'fullName'
          }
        ]
      })
      .populate('doctorUserId', 'fullName')
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
      .sort({ createdAt: -1 }) // Mới nhất trước
      .lean();

    console.log(`📋 [getPatientMedicalRecordsList] Tìm thấy ${records.length} medical records`);

    // Lọc lại để đảm bảo appointmentId tồn tại và đã completed
    const completedRecords = records.filter(record => {
      if (!record.appointmentId) {
        console.log(`⚠️ [getPatientMedicalRecordsList] Record ${record._id} không có appointmentId`);
        return false;
      }
      
      // Kiểm tra appointment status và record status
      const isValid = record.appointmentId.status === 'Completed' && record.status === 'Finalized';
      
      if (!isValid) {
        console.log(`⚠️ [getPatientMedicalRecordsList] Record ${record._id} không hợp lệ - appointment.status: ${record.appointmentId.status}, record.status: ${record.status}`);
      }
      
      return isValid;
    });

    console.log(`✅ [getPatientMedicalRecordsList] Lọc được ${completedRecords.length} records hợp lệ`);

    // Format dữ liệu để trả về
    const formattedRecords = completedRecords.map(record => {
      const appointment = record.appointmentId;
      const service = appointment?.serviceId;
      const timeslot = appointment?.timeslotId;
      const doctor = appointment?.doctorUserId || record.doctorUserId;

      // Format thời gian từ timeslot
      let startTime = null;
      let endTime = null;
      if (timeslot?.startTime) {
        startTime = new Date(timeslot.startTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        });
      }
      if (timeslot?.endTime) {
        endTime = new Date(timeslot.endTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        });
      }

      return {
        _id: record._id,
        appointmentId: record.appointmentId?._id ? record.appointmentId._id.toString() : null,
        doctorName: doctor?.fullName || 'N/A',
        serviceName: service?.serviceName || 'N/A',
        date: timeslot?.startTime || record.createdAt,
        startTime: startTime,
        endTime: endTime,
        hasDiagnosis: !!record.diagnosis,
        // ⭐ Hỗ trợ backward compatibility: kiểm tra cả prescriptions (array mới) và prescription (object cũ)
        hasPrescription: !!(
          (record.prescriptions && record.prescriptions.length > 0 && record.prescriptions.some(p => p.medicine || p.dosage || p.duration)) ||
          (record.prescription && (record.prescription.medicine || record.prescription.dosage || record.prescription.duration))
        ),
        prescription: (record.prescriptions && record.prescriptions.length > 0) 
          ? record.prescriptions[0] 
          : (record.prescription || null),
        prescriptions: record.prescriptions || (record.prescription ? [record.prescription] : []),
        diagnosis: record.diagnosis || null,
        conclusion: record.conclusion || null,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });

    return formattedRecords;
  }
}

module.exports = new MedicalRecordService();

