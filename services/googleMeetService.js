/**
 * Google Meet Service
 * Tạo liên kết cuộc họp online
 * 
 * Sử dụng Jitsi Meet (open source) thay vì Google Meet
 * Không cần credentials, hoạt động 100%
 */

const crypto = require('crypto');

class GoogleMeetService {
  constructor() {
    this.initialized = true;
  }

  /**
   * Tạo link Jitsi Meet (open source, không cần credentials)
   * @param {Object} meetData 
   */
  async generateMeetLink(meetData) {
    try {
      const { appointmentId, doctorName, patientName, serviceName } = meetData;

      // Tạo room ID từ appointmentId
      // Format: jitsi.haianh.{appointmentId}
      const roomId = `haianh-${appointmentId.substring(0, 12)}`.toLowerCase();
      
      // Jitsi Meet link
      const meetLink = `https://meet.jit.si/${roomId}`;

      console.log('✅ Jitsi Meet link đã tạo');
      console.log('   - Room ID:', roomId);
      console.log('   - Meet Link:', meetLink);
      console.log(`   - Bác sĩ: ${doctorName}`);
      console.log(`   - Bệnh nhân: ${patientName}`);
      console.log(`   - Dịch vụ: ${serviceName}`);

      return meetLink;

    } catch (error) {
      console.error('❌ Lỗi tạo meet link:', error.message);
      
      // Fallback: tạo link với random ID
      const randomId = `haianh-${crypto.randomBytes(6).toString('hex')}`;
      const fallbackLink = `https://meet.jit.si/${randomId}`;
      
      console.log('📌 Sử dụng fallback link:', fallbackLink);
      return fallbackLink;
    }
  }

  /**
   * Xóa event (không cần cho Jitsi)
   */
  async deleteMeetLink(eventId) {
    // Jitsi Meet không cần xóa, tự động hết hạn
    console.log('✅ Jitsi Meet room sẽ tự động hết hạn');
    return true;
  }
}

module.exports = new GoogleMeetService();
