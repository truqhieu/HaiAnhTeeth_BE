/**
 * Date Helper - Xử lý timezone Việt Nam (UTC+7)
 */

class DateHelper {
  
  /**
   * Convert từ UTC sang giờ Việt Nam
   * @param {Date} utcDate - Date object UTC
   * @returns {Date} - Date object theo giờ VN (UTC+7)
   */
  static utcToVietnamTime(utcDate) {
    const date = new Date(utcDate);
    // Thêm 7 giờ (UTC+7)
    date.setHours(date.getHours() + 7);
    return date;
  }

  /**
   * Convert từ giờ Việt Nam sang UTC
   * @param {Date} vnDate - Date object theo giờ VN
   * @returns {Date} - Date object UTC
   */
  static vietnamTimeToUTC(vnDate) {
    const date = new Date(vnDate);
    // Trừ 7 giờ
    date.setHours(date.getHours() - 7);
    return date;
  }

  /**
   * Format date theo định dạng Việt Nam
   * @param {Date} date 
   * @returns {string} - "Thứ Hai, 21 tháng 10, 2025"
   */
  static formatVietnameseDate(date) {
    // Sử dụng UTC date để hiển thị đúng ngày
    const d = new Date(date);
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'UTC'
    };
    return d.toLocaleDateString('vi-VN', options);
  }

  /**
   * Format time theo định dạng 24h Việt Nam
   * @param {Date} date 
   * @returns {string} - "08:00"
   */
  static formatVietnameseTime(date) {
    // Hiển thị thời gian UTC trực tiếp (không convert timezone)
    // Vì thời gian trong DB đã được lưu theo giờ Việt Nam
    const d = new Date(date);
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format datetime đầy đủ
   * @param {Date} date 
   * @returns {string} - "21/10/2025 08:00"
   */
  static formatVietnameseDateTime(date) {
    const dateStr = new Date(date).toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh'
    });
    const timeStr = this.formatVietnameseTime(date);
    return `${dateStr} ${timeStr}`;
  }

  /**
   * Tạo Date object từ string với timezone VN
   * @param {string} dateString - ISO string hoặc date string
   * @returns {Date}
   */
  static parseVietnameseDate(dateString) {
    // Parse date và assume nó là giờ VN
    const date = new Date(dateString);
    // Nếu không có timezone info, xem như là giờ VN
    if (!dateString.includes('Z') && !dateString.includes('+')) {
      return this.vietnamTimeToUTC(date);
    }
    return date;
  }

  /**
   * Tạo Date object từ date và time string (giờ VN)
   * @param {string} dateStr - "2025-10-21"
   * @param {string} timeStr - "08:00"
   * @returns {Date} - UTC Date
   */
  static createVietnamDateTime(dateStr, timeStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    
    // Tạo date theo giờ VN (local time)
    const vnDate = new Date(year, month - 1, day, hour, minute, 0);
    
    // Convert sang UTC (trừ 7 giờ)
    return this.vietnamTimeToUTC(vnDate);
  }

  /**
   * Lấy ngày hôm nay theo timezone Việt Nam (UTC+7)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: "2025-11-06")
   */
  static getTodayVN() {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return dateFormatter.format(now);
  }

  /**
   * Lấy ngày mai theo timezone Việt Nam (UTC+7)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: "2025-11-07")
   */
  static getTomorrowVN() {
    const todayStr = this.getTodayVN();
    const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
    
    // Tính ngày mai: thêm 1 ngày
    let tomorrowYear = todayYear;
    let tomorrowMonth = todayMonth;
    let tomorrowDay = todayDay + 1;
    
    // ⭐ Kiểm tra số ngày trong tháng hiện tại (tomorrowMonth)
    // new Date(year, month, 0) trả về ngày cuối cùng của tháng (month - 1)
    // Vậy để lấy số ngày trong tháng month, phải dùng new Date(year, month, 0)
    const daysInMonth = new Date(tomorrowYear, tomorrowMonth, 0).getDate();
    if (tomorrowDay > daysInMonth) {
      tomorrowDay = 1;
      tomorrowMonth++;
      if (tomorrowMonth > 12) {
        tomorrowMonth = 1;
        tomorrowYear++;
      }
    }
    
    return `${tomorrowYear}-${String(tomorrowMonth).padStart(2, '0')}-${String(tomorrowDay).padStart(2, '0')}`;
  }

  /**
   * Lấy ngày kia theo timezone Việt Nam (UTC+7)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: "2025-11-08")
   */
  static getDayAfterTomorrowVN() {
    const todayStr = this.getTodayVN();
    const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
    
    // Tính ngày kia: thêm 2 ngày
    let dayAfterTomorrowYear = todayYear;
    let dayAfterTomorrowMonth = todayMonth;
    let dayAfterTomorrowDay = todayDay + 2;
    
    // ⭐ Xử lý chuyển tháng/năm
    // new Date(year, month, 0) trả về ngày cuối cùng của tháng (month - 1)
    // Vậy để lấy số ngày trong tháng month, phải dùng new Date(year, month, 0)
    while (true) {
      const daysInCurrentMonth = new Date(dayAfterTomorrowYear, dayAfterTomorrowMonth, 0).getDate();
      if (dayAfterTomorrowDay <= daysInCurrentMonth) {
        break;
      }
      dayAfterTomorrowDay -= daysInCurrentMonth;
      dayAfterTomorrowMonth++;
      if (dayAfterTomorrowMonth > 12) {
        dayAfterTomorrowMonth = 1;
        dayAfterTomorrowYear++;
      }
    }
    
    return `${dayAfterTomorrowYear}-${String(dayAfterTomorrowMonth).padStart(2, '0')}-${String(dayAfterTomorrowDay).padStart(2, '0')}`;
  }

  /**
   * Lấy thông tin ngày hiện tại theo timezone Việt Nam (UTC+7)
   * @returns {Object} - { year, month, day, dateString } (month là 1-12, day là 1-31)
   */
  static getTodayInfoVN() {
    const todayStr = this.getTodayVN();
    const [year, month, day] = todayStr.split('-').map(Number);
    return {
      year,
      month,
      day,
      dateString: todayStr
    };
  }
}

module.exports = DateHelper;

