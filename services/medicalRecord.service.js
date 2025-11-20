const MedicalRecord = require('../models/medicalRecord.model');
const Appointment = require('../models/appointment.model');
const Service = require('../models/service.model');
const { calculateServicesPrices } = require('../utils/promotionHelper');
const appointmentService = require('./appointment.service');

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
      .populate('serviceId', 'serviceName price') // Populate dịch vụ chính
      .populate('additionalServiceIds', 'serviceName price') // ⭐ THÊM: Populate additionalServiceIds cho follow-up
      .select('type followUpOfAppointmentId'); // ⭐ FIX: Select thêm type và followUpOfAppointmentId để check follow-up

    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (appointment.noTreatment) {
      throw new Error('Ca khám này đã được đánh dấu "Không cần khám" nên không có hồ sơ khám bệnh.');
    }

    // ⭐ FIX: Logic mới cho follow-up appointments:
    // 1. Mỗi follow-up appointment có thể có medical record riêng
    // 2. Nếu chưa có record, tạo mới (sẽ copy services từ appointment trước đó)
    // 3. Nếu có record rồi, dùng lại record đó
    // 4. Khi tạo follow-up tiếp theo, sẽ dùng record của follow-up trước đó
    
    // ⭐ Bước 1: Tìm record của chính appointment này trước
    let record = await MedicalRecord.findOne({ appointmentId })
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
      .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });

    // ⭐ Bước 2: Nếu chưa có record và là follow-up, tìm record của appointment trước đó để copy services
    let previousRecord = null;
    if (!record && appointment.type === 'FollowUp' && appointment.followUpOfAppointmentId) {
      // Tìm record của appointment trước đó trong chain
      previousRecord = await MedicalRecord.findOne({ appointmentId: appointment.followUpOfAppointmentId })
        .populate({ path: 'additionalServiceIds', select: 'serviceName price' });
      console.log('🔍 [getOrCreateMedicalRecord] Follow-up appointment detected. Previous appointment:', appointment.followUpOfAppointmentId);
      if (previousRecord) {
        console.log('🔍 [getOrCreateMedicalRecord] Found previous record with', previousRecord.additionalServiceIds?.length || 0, 'services');
      }
    }

    // Prefill basic info from user/customer if creating first time
    if (!record) {
      const patient = appointment.patientUserId || appointment.customerId || null;
      const patientAge = this._calcAge(patient?.dob);
      const address = patient?.address || '';

      // ⭐ FIX: Logic mới cho initial services:
      // 1. Nếu là follow-up và có previousRecord, copy services từ previousRecord
      // 2. Nếu là follow-up và không có previousRecord, lấy từ appointment.additionalServiceIds
      // 3. Nếu không phải follow-up, chỉ lấy service chính
      const initialServiceIds = [];
      if (appointment.type === 'FollowUp' && previousRecord && previousRecord.additionalServiceIds && Array.isArray(previousRecord.additionalServiceIds)) {
        // Follow-up: Copy services từ previousRecord (ca tái khám trước đó)
        initialServiceIds.push(...previousRecord.additionalServiceIds
          .filter(s => s && s._id)
          .map(s => s._id || s));
        console.log('🔍 [getOrCreateMedicalRecord] Follow-up appointment - copying services from previous record:', initialServiceIds);
      } else if (appointment.type === 'FollowUp' && appointment.additionalServiceIds && Array.isArray(appointment.additionalServiceIds)) {
        // Follow-up: Lấy tất cả services từ additionalServiceIds (fallback nếu không có previousRecord)
        initialServiceIds.push(...appointment.additionalServiceIds
          .filter(s => s && s._id)
          .map(s => s._id));
        console.log('🔍 [getOrCreateMedicalRecord] Follow-up appointment - using all services from appointment.additionalServiceIds:', initialServiceIds);
      } else if (appointment.serviceId && appointment.serviceId._id) {
        // Normal appointment: Chỉ lấy service chính
        initialServiceIds.push(appointment.serviceId._id);
      }

      const nurseOwnerId =
        currentUserRole === 'Nurse'
          ? currentUserId
          : appointment.inProgressByUserId ||
            appointment.checkInByUserId ||
            currentUserId;

      // ⭐ FIX: Tạo record mới cho chính appointment này (không phải appointment trước đó)
      // Mỗi follow-up appointment sẽ có record riêng, nhưng copy services từ appointment trước đó
      record = await MedicalRecord.create({
        appointmentId: appointmentId, // ⭐ Tạo record cho chính appointment này
        doctorUserId: appointment.doctorUserId,
        patientUserId: appointment.patientUserId || null,
        customerId: appointment.customerId || null,
        nurseId: nurseOwnerId,
        patientAge,
        address,
        additionalServiceIds: initialServiceIds, // ⭐ Copy services từ previousRecord hoặc lấy từ appointment
        status: 'Draft' // ⭐ Mỗi follow-up có thể duyệt riêng
      });
      // Re-fetch with populate to include services info
      record = await MedicalRecord.findById(record._id)
        .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
        .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });
    }

    // Ưu tiên thông tin người thân (customer) nếu lịch hẹn đặt cho "người thân khác"
    const patient = appointment.customerId || appointment.patientUserId || null;
    const patientName = patient?.fullName || 'N/A';
    const patientAge = record.patientAge ?? this._calcAge(patient?.dob);
    const address = record.address || patient?.address || '';
    const patientDob = patient?.dob || null;
    const email = patient?.email || '';
    const phoneNumber = patient?.phoneNumber || '';
    const gender = patient?.gender || '';

    // Prepare additional services - filter out null/undefined and ensure we have valid data
    // ⭐ FIX: Nếu là follow-up và record chưa có services, copy từ previousRecord hoặc lấy từ appointment
    let additionalServices = [];
    
    // ⭐ FIX: Nếu là follow-up và record chưa có services, copy từ previousRecord
    if (appointment.type === 'FollowUp' && (!record.additionalServiceIds || record.additionalServiceIds.length === 0)) {
      if (previousRecord && previousRecord.additionalServiceIds && Array.isArray(previousRecord.additionalServiceIds) && previousRecord.additionalServiceIds.length > 0) {
        // Copy services từ previousRecord
        console.log('🔍 [getOrCreateMedicalRecord] Follow-up record has no services. Copying from previous record...');
        record.additionalServiceIds = previousRecord.additionalServiceIds.map(s => s._id || s);
        await record.save();
        // Re-populate
        record = await MedicalRecord.findById(record._id)
          .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
          .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });
      } else if (appointment.additionalServiceIds && Array.isArray(appointment.additionalServiceIds) && appointment.additionalServiceIds.length > 0) {
        // Fallback: Lấy từ appointment nếu không có previousRecord
        console.log('🔍 [getOrCreateMedicalRecord] Follow-up record has no services. Using from appointment...');
        record.additionalServiceIds = appointment.additionalServiceIds.map(s => s._id || s);
        await record.save();
        // Re-populate
        record = await MedicalRecord.findById(record._id)
          .populate({ path: 'additionalServiceIds', select: 'serviceName price' });
      }
    }
    
    if (record?.additionalServiceIds && Array.isArray(record.additionalServiceIds)) {
      const mapped = record.additionalServiceIds
        .filter(s => s && s._id)
        .map((s) => ({ _id: s._id.toString(), serviceName: s.serviceName || '', price: s.price || 0 }));
      // Tính khuyến mãi cho các dịch vụ đã chọn (nếu có)
      const enriched = await calculateServicesPrices(mapped.map(m => ({ _id: m._id, price: m.price })));
      // Merge lại để giữ serviceName
      additionalServices = mapped.map(m => {
        const promo = enriched.find(e => e._id?.toString?.() === m._id);
        return {
          _id: m._id,
          serviceName: m.serviceName,
          price: m.price,
          finalPrice: promo?.finalPrice ?? m.price,
          discountAmount: promo?.discountAmount ?? 0,
        };
      });
    }
    
    console.log('🔍 [getOrCreateMedicalRecord] Appointment serviceId:', appointment.serviceId);
    console.log('🔍 [getOrCreateMedicalRecord] Record additionalServiceIds:', record?.additionalServiceIds);
    console.log('🔍 [getOrCreateMedicalRecord] Mapped additionalServices:', additionalServices);

    const appointmentStatus = appointment.status;
    const recordStatus = record?.status || 'Draft';
    const isAppointmentLocked = ['Completed', 'Finalized'].includes(appointmentStatus);
    const isRecordFinalized = recordStatus === 'Finalized';
    
    // ⭐ FIX: Sau khi duyệt, không cho chỉnh sửa nữa (kể cả follow-up appointments)
    const isFollowUpAppointment = appointment.type === 'FollowUp' && appointment.followUpOfAppointmentId;
    
    // ⭐ FIX: Nurse không thể chỉnh sửa hồ sơ đã Finalized
    const nurseCanEdit = !isAppointmentLocked && !isRecordFinalized;
    // ⭐ FIX: Doctor không thể chỉnh sửa hồ sơ đã Finalized (kể cả follow-up appointments)
    const doctorCanEdit = !isAppointmentLocked && !isRecordFinalized;

    let nurseLockReason = null;
    let doctorLockReason = null;

    if (isAppointmentLocked) {
      nurseLockReason = 'Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ.';
      doctorLockReason = nurseLockReason;
    } else if (isRecordFinalized) {
      // ⭐ FIX: Sau khi duyệt, không cho chỉnh sửa nữa (kể cả follow-up appointments)
      nurseLockReason = 'Hồ sơ đã được bác sĩ duyệt, điều dưỡng không thể chỉnh sửa.';
      doctorLockReason = 'Hồ sơ đã được duyệt, không thể chỉnh sửa.';
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
   * ⭐ Chỉ trả về các dịch vụ Examination, không có Consultation
   */
  async getActiveServicesForDoctor() {
    // ⭐ Lấy danh sách dịch vụ Active và chỉ lấy Examination (không có Consultation)
    const services = await Service.find({ 
      status: 'Active',
      category: 'Examination' // ⭐ Chỉ lấy Examination
    })
      .select('_id serviceName price category isPrepaid durationMinutes')
      .sort({ serviceName: 1 })
      .lean();

    // Tính giá sau khuyến mãi (nếu có), đồng bộ cách hiển thị như ở phần đặt lịch
    const servicesWithPromotion = await calculateServicesPrices(services);

    // Chuẩn hóa response giữ nguyên các trường cũ và thêm thông tin giảm giá
    return servicesWithPromotion.map(s => ({
      _id: s._id,
      serviceName: s.serviceName,
      price: s.price,                  // giá gốc
      category: s.category,
      isPrepaid: s.isPrepaid,
      durationMinutes: s.durationMinutes,
      // Thêm metadata khuyến mãi
      finalPrice: s.finalPrice,        // giá sau giảm
      discountAmount: s.discountAmount || 0,
      hasPromotion: !!s.hasPromotion,
      promotionInfo: s.promotionInfo || null,
    }));
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
  async updateMedicalRecordForDoctor(appointmentId, updateData = {}, doctorUserId = null) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }

    const {
      diagnosis,
      conclusion,
      prescription,
      nurseNote,
      approve,
      followUpRequired,
      followUpDate,
      followUpNote
    } = updateData;

    // ⭐ FIX: Populate thêm type và followUpOfAppointmentId để check follow-up
    const appointment = await Appointment.findById(appointmentId).select('status doctorUserId type followUpOfAppointmentId');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ.');
    }

    if (
      doctorUserId &&
      appointment.doctorUserId &&
      appointment.doctorUserId.toString() !== doctorUserId.toString()
    ) {
      throw new Error('Bạn không có quyền cập nhật hồ sơ của ca khám này.');
    }

    // ⭐ FIX: Mỗi follow-up appointment có record riêng, update record của chính appointment này
    // Không cần tìm record của appointment trước đó nữa
    const record = await MedicalRecord.findOne({ appointmentId });
    if (!record) {
      throw new Error('Không tìm thấy hồ sơ khám bệnh');
    }

    // ⭐ FIX: Sau khi duyệt, không cho chỉnh sửa nữa (kể cả follow-up appointments)
    // Chỉ cho phép approve lại (approve === true) nếu đã Finalized
    if (record.status === 'Finalized' && approve !== true) {
      throw new Error('Hồ sơ đã được duyệt, không thể chỉnh sửa.');
    }

    // ⭐ VALIDATION: Kiểm tra các trường bắt buộc
    if (diagnosis !== undefined) {
      if (!diagnosis || typeof diagnosis !== 'string' || diagnosis.trim() === '') {
        throw new Error('Chẩn đoán là bắt buộc. Vui lòng nhập chẩn đoán.');
      }
    }
    
    if (conclusion !== undefined) {
      if (!conclusion || typeof conclusion !== 'string' || conclusion.trim() === '') {
        throw new Error('Kết luận là bắt buộc. Vui lòng nhập kết luận.');
      }
    }

    const updateFields = {};
    if (diagnosis !== undefined) updateFields.diagnosis = diagnosis.trim();
    if (conclusion !== undefined) updateFields.conclusion = conclusion.trim();
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

    // ⭐ FIX: Nếu approve, set status = 'Finalized'
    // Nếu không approve, set status = 'Draft' (kể cả follow-up appointments)
    // if (approve === true) {
      // updateFields.status = 'Finalized';
    if(approve !== true) {
      // Sau khi duyệt, không cho chỉnh sửa nữa, nên chỉ set về Draft khi không approve
      updateFields.status = 'Draft';
    }

    const followUpToggleProvided = Object.prototype.hasOwnProperty.call(updateData, 'followUpRequired');
    const followUpDateProvided = Object.prototype.hasOwnProperty.call(updateData, 'followUpDate');
    const followUpNoteProvided = Object.prototype.hasOwnProperty.call(updateData, 'followUpNote');

    if (followUpToggleProvided || followUpDateProvided || followUpNoteProvided) {
      const shouldEnableFollowUp = followUpToggleProvided ? !!followUpRequired : record.followUpRequired;
      const actingDoctorId = doctorUserId || appointment.doctorUserId;

      if (!actingDoctorId) {
        throw new Error('Không xác định được bác sĩ tạo tái khám.');
      }

      if (shouldEnableFollowUp) {
        const effectiveFollowUpDateValue = followUpDateProvided
          ? followUpDate
          : record.followUpDate;

        // ⭐ VALIDATION: Nếu có tái khám, ngày và giờ tái khám là bắt buộc
        if (!effectiveFollowUpDateValue) {
          throw new Error('Vui lòng chọn ngày và giờ tái khám.');
        }

        const followUpDateObj = new Date(effectiveFollowUpDateValue);
        if (Number.isNaN(followUpDateObj.getTime())) {
          throw new Error('Ngày tái khám không hợp lệ.');
        }

        if (followUpDateObj.getTime() <= Date.now()) {
          throw new Error('Ngày tái khám phải ở trong tương lai.');
        }

        const noteValue = followUpNoteProvided
          ? (followUpNote || '')
          : (record.followUpNote || '');

        let followUpAppointmentId = record.followUpAppointmentId;

        // ⭐ Lấy tất cả serviceIds từ additional services để tạo follow-up appointment với nhiều services
        let followUpServiceIds = [];
        if (record.additionalServiceIds && Array.isArray(record.additionalServiceIds) && record.additionalServiceIds.length > 0) {
          // Lấy tất cả services từ additional services
          followUpServiceIds = record.additionalServiceIds.map(s => s?._id || s).filter(Boolean);
        } else if (appointment.serviceId) {
          // Fallback về service gốc nếu không có additional services
          followUpServiceIds = [appointment.serviceId._id || appointment.serviceId];
        }

        // ⭐ FIX: Chỉ lưu thông tin follow-up vào record, KHÔNG tạo follow-up appointment ở đây
        // Follow-up appointment chỉ được tạo khi bác sĩ duyệt hồ sơ (approve = true)
        // Nếu đã có followUpAppointmentId (đã được tạo từ lần approve trước), chỉ update nếu approve = true
        if (approve === true && followUpAppointmentId) {
          // Nếu đang approve và đã có follow-up appointment, update nó
          await appointmentService.updateFollowUpAppointment({
            followUpAppointmentId,
            followUpDate: followUpDateObj,
            followUpNote: noteValue,
            actingDoctorId
          });
        }
        // ⭐ KHÔNG tạo follow-up appointment ở đây nếu chưa có (sẽ tạo trong approveMedicalRecordByDoctor)

        updateFields.followUpRequired = true;
        updateFields.followUpDate = followUpDateObj;
        updateFields.followUpNote = noteValue;
        // ⭐ Chỉ update followUpAppointmentId nếu đang approve và đã có appointment
        if (approve === true && followUpAppointmentId) {
          updateFields.followUpAppointmentId = followUpAppointmentId;
        }
        // ⭐ Nếu chưa có followUpAppointmentId, giữ nguyên (sẽ được tạo trong approveMedicalRecordByDoctor)
      } else {
        // ⭐ FIX: Nếu tắt follow-up, chỉ cancel appointment nếu đang approve (đã được tạo)
        // Nếu chỉ lưu (không approve), không cần cancel vì chưa có appointment
        if (approve === true && record.followUpAppointmentId) {
          await appointmentService.cancelFollowUpAppointment({
            followUpAppointmentId: record.followUpAppointmentId,
            actingDoctorId
          });
        }

        updateFields.followUpRequired = false;
        updateFields.followUpDate = null;
        // ⭐ Chỉ clear followUpAppointmentId nếu đang approve (đã có appointment)
        if (approve === true) {
          updateFields.followUpAppointmentId = null;
        }
        updateFields.followUpNote = '';
      }
    }

    // ⭐ FIX: Update record của chính appointment này (mỗi follow-up có record riêng)
    const updatedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { $set: updateFields },
      { new: true }
    )
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
      .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });

    return updatedRecord;
  }

  /**
   * Approve medical record by doctor - Set status = "Finalized"
   * ⭐ FIX: Khi approve, nếu có followUpRequired, tạo follow-up appointment
   */
  async approveMedicalRecordByDoctor(appointmentId) {
    if (!appointmentId) {
      throw new Error('Thiếu appointmentId');
    }

    const appointment = await Appointment.findById(appointmentId).select('status doctorUserId type followUpOfAppointmentId serviceId');
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    if (['Completed', 'Finalized'].includes(appointment.status)) {
      throw new Error('Ca khám đã hoàn thành, không thể duyệt hồ sơ.');
    }

    const record = await MedicalRecord.findOne({ appointmentId })
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' });
    if (!record) {
      throw new Error('Không tìm thấy hồ sơ khám bệnh');
    }

    if (record.status === 'Finalized') {
      return await MedicalRecord.findOne({ appointmentId })
        .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
        .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });
    }

    // ⭐ FIX: Nếu có followUpRequired và chưa có followUpAppointmentId, tạo follow-up appointment
    let followUpAppointmentId = record.followUpAppointmentId;
    if (record.followUpRequired && !followUpAppointmentId && record.followUpDate) {
      const actingDoctorId = appointment.doctorUserId;
      
      if (!actingDoctorId) {
        throw new Error('Không xác định được bác sĩ tạo tái khám.');
      }

      const followUpDateObj = new Date(record.followUpDate);
      if (Number.isNaN(followUpDateObj.getTime())) {
        throw new Error('Ngày tái khám không hợp lệ.');
      }

      if (followUpDateObj.getTime() <= Date.now()) {
        throw new Error('Ngày tái khám phải ở trong tương lai.');
      }

      // ⭐ Lấy tất cả serviceIds từ additional services để tạo follow-up appointment với nhiều services
      let followUpServiceIds = [];
      if (record.additionalServiceIds && Array.isArray(record.additionalServiceIds) && record.additionalServiceIds.length > 0) {
        // Lấy tất cả services từ additional services
        followUpServiceIds = record.additionalServiceIds.map(s => s?._id || s).filter(Boolean);
      } else if (appointment.serviceId) {
        // Fallback về service gốc nếu không có additional services
        followUpServiceIds = [appointment.serviceId._id || appointment.serviceId];
      }

      // ⭐ Tạo follow-up appointment khi approve
      const followUpAppointment = await appointmentService.createFollowUpAppointment({
        originalAppointmentId: appointmentId,
        followUpDate: followUpDateObj,
        followUpNote: record.followUpNote || '',
        actingDoctorId,
        serviceIds: followUpServiceIds // ⭐ Truyền array serviceIds từ additional services
      });
      followUpAppointmentId = followUpAppointment?._id || null;
      
      console.log('🔍 [approveMedicalRecordByDoctor] Created follow-up appointment:', followUpAppointmentId);
    }

    // ⭐ Update record với status = 'Finalized' và followUpAppointmentId (nếu có)
    const updateFields = { 
      status: 'Finalized'
    };
    if (followUpAppointmentId) {
      updateFields.followUpAppointmentId = followUpAppointmentId;
    }

    const finalizedRecord = await MedicalRecord.findOneAndUpdate(
      { appointmentId },
      { 
        $set: updateFields
      },
      { new: true }
    )
      .populate({ path: 'additionalServiceIds', select: 'serviceName price' })
      .populate({ path: 'followUpAppointmentId', select: '_id status type timeslotId', populate: { path: 'timeslotId', select: 'startTime endTime' } });

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

    // ⭐ Bao phủ trường hợp ca Walk-in trước khi user đăng ký: so khớp theo email
    let isEmailOwner = false;
    if (!isPatientOwner && !isCustomerOwner) {
      const User = require('../models/user.model');
      const user = await User.findById(patientUserId).select('email').lean();
      if (user?.email && appointment.customerId?.email) {
        isEmailOwner = user.email.toLowerCase() === appointment.customerId.email.toLowerCase();
      }
    }
    
    if (!isPatientOwner && !isCustomerOwner && !isEmailOwner) {
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

    // Ưu tiên customerId (bệnh nhân vãng lai / walk-in) rồi mới tới patientUserId
    const patient = appointment.customerId || appointment.patientUserId || null;
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
    // Bao phủ cả case Walk-in trước khi user đăng ký: match theo email của Customer
    const User = require('../models/user.model');
    const Customer = require('../models/customer.model');

    const user = await User.findById(patientUserId).select('email').lean();
    const userEmail = user?.email || null;

    let emailCustomerIds = [];
    if (userEmail) {
      const customers = await Customer.find({ email: userEmail })
        .select('_id')
        .lean();
      emailCustomerIds = customers.map(c => c._id);
    }

    const baseOr = [
      { patientUserId: patientUserId },
      { customerId: patientUserId }
    ];
    if (emailCustomerIds.length > 0) {
      baseOr.push({ customerId: { $in: emailCustomerIds } });
    }

    // Chỉ lấy các records đã được doctor duyệt (status = "Finalized")
    const records = await MedicalRecord.find({
      $or: baseOr,
      // Chỉ lấy các records đã được doctor duyệt
      status: 'Finalized'
    })
      .populate({
        path: 'appointmentId',
        select: 'status timeslotId serviceId doctorUserId patientUserId customerId type followUpOfAppointmentId',
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
        appointmentType: appointment?.type || null,
        followUpOfAppointmentId: appointment?.followUpOfAppointmentId
          ? appointment.followUpOfAppointmentId.toString()
          : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      };
    });

    return formattedRecords;
  }
}

module.exports = new MedicalRecordService();

