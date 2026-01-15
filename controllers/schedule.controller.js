const scheduleService = require('../services/schedule.service');

const updateWorkingHours = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { workingHours } = req.body;

    const data = await scheduleService.updateWorkingHours(scheduleId, workingHours);

    return res.status(200).json({
      success: true,
      message: 'Cập nhật thời gian làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in updateWorkingHours:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật thời gian làm việc',
      error: error.message
    });
  }
};

const getWorkingHours = async (req, res) => {
  try {
    const { scheduleId } = req.params;

    const data = await scheduleService.getWorkingHours(scheduleId);

    return res.status(200).json({
      success: true,
      message: 'Lấy thời gian làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in getWorkingHours:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thời gian làm việc',
      error: error.message
    });
  }
};

const updateDoctorWorkingHoursForDate = async (req, res) => {
  try {
    const { doctorId, date } = req.params;
    const { workingHours } = req.body;

    const data = await scheduleService.updateDoctorWorkingHoursForDate(doctorId, date, workingHours);

    return res.status(200).json({
      success: true,
      message: 'Cập nhật thời gian làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in updateDoctorWorkingHoursForDate:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật thời gian làm việc',
      error: error.message
    });
  }
};

const getDoctorsWithWorkingHours = async (req, res) => {
  try {
    const data = await scheduleService.getDoctorsWithWorkingHours();

    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách bác sĩ với thời gian làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in getDoctorsWithWorkingHours:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy danh sách bác sĩ',
      error: error.message
    });
  }
};

// ⭐ Lấy danh sách bác sĩ chưa có workingHours (chưa được manager tạo lịch làm việc)
const getDoctorsWithoutWorkingHours = async (req, res) => {
  try {
    const data = await scheduleService.getDoctorsWithoutWorkingHours();

    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách bác sĩ chưa có lịch làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in getDoctorsWithoutWorkingHours:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy danh sách bác sĩ',
      error: error.message
    });
  }
};

const updateDoctorWorkingHours = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { workingHours } = req.body;

    const data = await scheduleService.updateDoctorWorkingHours(doctorId, workingHours);

    return res.status(200).json({
      success: true,
      message: 'Cập nhật thời gian làm việc thành công',
      data
    });
  } catch (error) {
    console.error('Error in updateDoctorWorkingHours:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật thời gian làm việc',
      error: error.message
    });
  }
};

// ⭐ Tạo lịch làm việc mới (tự động tạo cả ca sáng và ca chiều)
const createSchedule = async (req, res) => {
  try {
    const { doctorId, date, workingHours, roomId } = req.body;

    if (!doctorId || !date || !workingHours) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ doctorId, date và workingHours'
      });
    }

    const data = await scheduleService.createSchedule(doctorId, date, workingHours, roomId);

    return res.status(201).json({
      success: true,
      message: data.message || 'Tạo lịch làm việc thành công',
      data: data
    });
  } catch (error) {
    console.error('Error in createSchedule:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi tạo lịch làm việc',
      error: error.message
    });
  }
};

module.exports = {
  updateWorkingHours,
  getWorkingHours,
  updateDoctorWorkingHoursForDate,
  getDoctorsWithWorkingHours,
  getDoctorsWithoutWorkingHours,
  updateDoctorWorkingHours,
  createSchedule
};
