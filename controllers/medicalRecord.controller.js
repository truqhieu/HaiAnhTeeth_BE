const medicalRecordService = require('../services/medicalRecord.service');

exports.getOrCreateMedicalRecord = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const nurseUserId = req.user?.userId;

    const result = await medicalRecordService.getOrCreateMedicalRecord(appointmentId, nurseUserId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ getOrCreateMedicalRecord error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.updateNurseNote = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { nurseNote } = req.body;

    const record = await medicalRecordService.updateNurseNote(appointmentId, nurseNote);

    return res.status(200).json({
      success: true,
      message: 'Đã lưu ghi chú điều dưỡng',
      data: record
    });
  } catch (error) {
    console.error('❌ updateNurseNote error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.getActiveServicesForDoctor = async (_req, res) => {
  try {
    const services = await medicalRecordService.getActiveServicesForDoctor();

    return res.status(200).json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error('❌ getActiveServicesForDoctor error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.updateAdditionalServicesForDoctor = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { serviceIds } = req.body || {};

    const record = await medicalRecordService.updateAdditionalServicesForDoctor(appointmentId, serviceIds);

    return res.status(200).json({
      success: true,
      message: 'Đã cập nhật dịch vụ bổ sung',
      data: record
    });
  } catch (error) {
    console.error('❌ updateAdditionalServicesForDoctor error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.updateMedicalRecordForDoctor = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { diagnosis, conclusion, prescription, nurseNote, approve } = req.body || {};

    const updateData = {};
    if (diagnosis !== undefined) updateData.diagnosis = diagnosis;
    if (conclusion !== undefined) updateData.conclusion = conclusion;
    if (prescription !== undefined) updateData.prescription = prescription;
    if (nurseNote !== undefined) updateData.nurseNote = nurseNote;
    if (approve !== undefined) updateData.approve = approve;

    const record = await medicalRecordService.updateMedicalRecordForDoctor(appointmentId, updateData);

    return res.status(200).json({
      success: true,
      message: approve ? 'Đã duyệt hồ sơ khám bệnh (status = Finalized)' : 'Đã lưu hồ sơ khám bệnh (status = Draft)',
      data: record
    });
  } catch (error) {
    console.error('❌ updateMedicalRecordForDoctor error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.approveMedicalRecordByDoctor = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const record = await medicalRecordService.approveMedicalRecordByDoctor(appointmentId);

    return res.status(200).json({
      success: true,
      message: 'Đã duyệt hồ sơ khám bệnh',
      data: record
    });
  } catch (error) {
    console.error('❌ approveMedicalRecordByDoctor error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.getMedicalRecordForPatient = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const patientUserId = req.user?.userId;

    if (!patientUserId) {
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập'
      });
    }

    const result = await medicalRecordService.getMedicalRecordForPatient(appointmentId, patientUserId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ getMedicalRecordForPatient error:', error);
    const statusCode = error.message.includes('không có quyền') ? 403 : 
                      error.message.includes('không tìm thấy') ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

exports.getPatientMedicalRecordsList = async (req, res) => {
  try {
    const patientUserId = req.user?.userId;

    if (!patientUserId) {
      console.log('❌ [getPatientMedicalRecordsList] Chưa đăng nhập');
      return res.status(401).json({
        success: false,
        message: 'Chưa đăng nhập'
      });
    }

    console.log(`📋 [getPatientMedicalRecordsList] Controller - Patient ID: ${patientUserId}`);
    
    const records = await medicalRecordService.getPatientMedicalRecordsList(patientUserId);

    console.log(`✅ [getPatientMedicalRecordsList] Controller - Trả về ${records.length} records`);

    return res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('❌ [getPatientMedicalRecordsList] Controller error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};