/**
 * Date Helper - Xử lý timezone Việt Nam (UTC+7)
 * 
 */
const VN_UTC_OFFSET = 7;
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
    // ⭐ CRITICAL FIX: Sử dụng Intl.DateTimeFormat với timezone Asia/Ho_Chi_Minh
    // để hiển thị đúng giờ Việt Nam thay vì UTC
    // Vì database lưu UTC time, cần convert sang VN time khi hiển thị
    const d = new Date(date);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const hours = parts.find(p => p.type === 'hour')?.value || '00';
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    
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
   * Lấy thời gian hiện tại theo timezone Việt Nam (UTC+7)
   * @returns {Date} - Date object đại diện cho thời gian hiện tại trong VN timezone (nhưng được lưu dưới dạng UTC)
   */
  static getNowVN() {
    const now = new Date();
    
    // ⭐ Sử dụng Intl.DateTimeFormat để lấy các thành phần thời gian chính xác trong VN timezone
    const vnYear = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now));
    const vnMonth = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', month: '2-digit' }).format(now));
    const vnDay = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' }).format(now));
    const vnHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false }).format(now));
    const vnMinute = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', minute: '2-digit' }).format(now));
    const vnSecond = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', second: '2-digit' }).format(now));
    
    // Tạo Date object với VN time (local time) và convert sang UTC
    const vnDate = new Date(vnYear, vnMonth - 1, vnDay, vnHour, vnMinute, vnSecond);
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

  /**
   * Lấy thứ 2 tuần sau theo timezone Việt Nam (UTC+7)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: "2025-11-17")
   */
  static getNextWeekMondayVN() {
    const todayStr = this.getTodayVN();
    const [year, month, day] = todayStr.split('-').map(Number);
    
    // Tạo Date object từ ngày hiện tại (theo timezone VN)
    // Lưu ý: month trong Date constructor là 0-based (0 = tháng 1, 11 = tháng 12)
    const today = new Date(year, month - 1, day);
    
    // Lấy thứ trong tuần (0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7)
    const dayOfWeek = today.getDay();
    
    // Tính số ngày cần thêm để đến thứ 2 tuần sau
    // Nếu hôm nay là thứ 2 (1), thứ 2 tuần sau = +7 ngày
    // Nếu hôm nay là thứ 3 (2), thứ 2 tuần sau = +6 ngày
    // Nếu hôm nay là Chủ nhật (0), thứ 2 tuần sau = +8 ngày
    let daysToAdd;
    if (dayOfWeek === 0) {
      // Chủ nhật → thứ 2 tuần sau = +8 ngày
      daysToAdd = 8;
    } else {
      // Các ngày khác → thứ 2 tuần sau = + (8 - dayOfWeek) ngày
      daysToAdd = 8 - dayOfWeek;
    }
    
    // Thêm số ngày
    const nextWeekMonday = new Date(today);
    nextWeekMonday.setDate(today.getDate() + daysToAdd);
    
    // Format về YYYY-MM-DD
    const nextYear = nextWeekMonday.getFullYear();
    const nextMonth = String(nextWeekMonday.getMonth() + 1).padStart(2, '0');
    const nextDay = String(nextWeekMonday.getDate()).padStart(2, '0');
    
    return `${nextYear}-${nextMonth}-${nextDay}`;
  }

  /**
   * Lấy cùng thứ trong tuần sau (tuần sau = +7 ngày từ hôm nay)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: nếu hôm nay là 13-11 thứ 3, thì trả về 20-11 thứ 3)
   */
  static getNextWeekSameDayVN() {
    const todayStr = this.getTodayVN();
    const [year, month, day] = todayStr.split('-').map(Number);
    
    // Tạo Date object từ ngày hiện tại
    const today = new Date(year, month - 1, day);
    
    // Thêm 7 ngày (tuần sau = cùng thứ trong tuần sau)
    const nextWeekSameDay = new Date(today);
    nextWeekSameDay.setDate(today.getDate() + 7);
    
    // Format về YYYY-MM-DD
    const nextYear = nextWeekSameDay.getFullYear();
    const nextMonth = String(nextWeekSameDay.getMonth() + 1).padStart(2, '0');
    const nextDay = String(nextWeekSameDay.getDate()).padStart(2, '0');
    
    return `${nextYear}-${nextMonth}-${nextDay}`;
  }

  /**
   * Tính ngày cho thứ X tuần sau (ví dụ: thứ 3 tuần sau)
   * @param {number} targetDayOfWeek - Thứ trong tuần (0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7)
   * @returns {string} - "YYYY-MM-DD" (ví dụ: nếu hôm nay là 13-11 thứ 4, và targetDayOfWeek = 2 (thứ 3) → trả về 19-11)
   */
  static getNextWeekDayVN(targetDayOfWeek) {
    // ⭐ QUAN TRỌNG: Lấy ngày hiện tại theo timezone Việt Nam
    const todayStr = this.getTodayVN();
    const [year, month, day] = todayStr.split('-').map(Number);
    
    // ⭐ Sử dụng Intl.DateTimeFormat để lấy thứ trong tuần theo timezone Việt Nam
    const now = new Date();
    const vnDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    
    const [vnYear, vnMonth, vnDay] = vnDateStr.split('-').map(Number);
    
    // Tạo Date object từ ngày Việt Nam (local time, không phải UTC)
    const today = new Date(vnYear, vnMonth - 1, vnDay);
    
    // ⭐ Lấy thứ trong tuần theo timezone Việt Nam
    // Sử dụng Intl.DateTimeFormat để lấy weekday theo VN timezone
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short'
    });
    const weekdayStr = weekdayFormatter.format(now);
    
    // Map weekday string sang số (0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7)
    const weekdayMap = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    const currentDayOfWeek = weekdayMap[weekdayStr] !== undefined ? weekdayMap[weekdayStr] : today.getDay();
    
    console.log(`📅 [getNextWeekDayVN] VN Date: ${vnDateStr}, Weekday: ${weekdayStr} (${currentDayOfWeek}), Target: ${targetDayOfWeek}`);
    
    // Tính số ngày cần thêm để đến thứ X tuần sau
    // Logic: Tìm thứ X đầu tiên trong tuần sau (không phải tuần này)
    // Ví dụ: Hôm nay là 13-11 (thứ 5, currentDayOfWeek = 5), muốn tìm thứ 3 tuần sau (targetDayOfWeek = 2)
    // - Thứ 3 tuần này = 11-11 (đã qua, cách hôm nay 2 ngày về trước)
    // - Thứ 3 tuần sau = 11 + 7 = 18-11
    // - Từ 13-11 đến 18-11 = 5 ngày
    // 
    // Công thức đúng:
    // - Tìm thứ X tuần này:
    //   * Nếu targetDayOfWeek >= currentDayOfWeek → thứ X tuần này = today + (targetDayOfWeek - currentDayOfWeek)
    //   * Nếu targetDayOfWeek < currentDayOfWeek → thứ X tuần này = today - (currentDayOfWeek - targetDayOfWeek) (đã qua)
    // - Thứ X tuần sau = thứ X tuần này + 7
    // - daysToAdd = thứ X tuần sau - today
    let daysToAdd;
    if (targetDayOfWeek >= currentDayOfWeek) {
      // Thứ X tuần này chưa đến hoặc đang là hôm nay
      // Thứ X tuần này = today + (targetDayOfWeek - currentDayOfWeek)
      // Thứ X tuần sau = today + (targetDayOfWeek - currentDayOfWeek) + 7
      daysToAdd = (targetDayOfWeek - currentDayOfWeek) + 7;
    } else {
      // Thứ X tuần này đã qua
      // Tính thứ X tuần này (có thể đã qua)
      // Ví dụ: hôm nay thứ 5 (currentDayOfWeek = 4 vì Thu = 4), muốn thứ 3 (targetDayOfWeek = 2) tuần sau
      // - Thứ 3 tuần này = 11/11 (đã qua, cách hôm nay 2 ngày về trước)
      // - Thứ 3 tuần sau = 11 + 7 = 18/11
      // - Từ 13 đến 18 = 5 ngày
      
      // ⭐ Tính trực tiếp bằng số ngày, không dùng setDate() để tránh timezone issues
      // Số ngày từ thứ X đến hôm nay = currentDayOfWeek - targetDayOfWeek
      const daysDiff = currentDayOfWeek - targetDayOfWeek; // Ví dụ: 4 - 2 = 2
      
      // Thứ X tuần này = today - daysDiff (tính bằng số ngày)
      // Thứ X tuần sau = thứ X tuần này + 7
      // daysToAdd = (today - daysDiff + 7) - today = 7 - daysDiff
      daysToAdd = 7 - daysDiff;
      
      // ⭐ DEBUG: Tính toán để verify
      const thisWeekTargetDayNum = vnDay - daysDiff;
      const nextWeekTargetDayNum = thisWeekTargetDayNum + 7;
      
      // Format để log (xử lý chuyển tháng nếu cần)
      let thisWeekMonth = vnMonth;
      let thisWeekYear = vnYear;
      let thisWeekDay = thisWeekTargetDayNum;
      if (thisWeekDay < 1) {
        thisWeekMonth--;
        if (thisWeekMonth < 1) {
          thisWeekMonth = 12;
          thisWeekYear--;
        }
        const daysInPrevMonth = new Date(thisWeekYear, thisWeekMonth, 0).getDate();
        thisWeekDay = daysInPrevMonth + thisWeekDay;
      }
      
      let nextWeekMonth = thisWeekMonth;
      let nextWeekYear = thisWeekYear;
      let nextWeekDay = nextWeekTargetDayNum;
      if (nextWeekDay > new Date(nextWeekYear, nextWeekMonth, 0).getDate()) {
        nextWeekDay = nextWeekDay - new Date(nextWeekYear, nextWeekMonth, 0).getDate();
        nextWeekMonth++;
        if (nextWeekMonth > 12) {
          nextWeekMonth = 1;
          nextWeekYear++;
        }
      }
      
      const thisWeekTargetDayStr = `${thisWeekYear}-${String(thisWeekMonth).padStart(2, '0')}-${String(thisWeekDay).padStart(2, '0')}`;
      const nextWeekTargetDayStr = `${nextWeekYear}-${String(nextWeekMonth).padStart(2, '0')}-${String(nextWeekDay).padStart(2, '0')}`;
      
      console.log(`📅 [getNextWeekDayVN] Debug: today=${vnDateStr}, currentDayOfWeek=${currentDayOfWeek}, targetDayOfWeek=${targetDayOfWeek}, daysDiff=${daysDiff}, thisWeekTargetDay=${thisWeekTargetDayStr}, nextWeekTargetDay=${nextWeekTargetDayStr}, daysToAdd=${daysToAdd}`);
    }
    
    // ⭐ Tính trực tiếp bằng số ngày để tránh timezone issues
    // Thêm daysToAdd vào ngày hiện tại (theo VN timezone)
    let nextYear = vnYear;
    let nextMonth = vnMonth;
    let nextDay = vnDay + daysToAdd;
    
    // Xử lý chuyển tháng/năm nếu cần
    const daysInMonth = new Date(nextYear, nextMonth, 0).getDate();
    if (nextDay > daysInMonth) {
      nextDay = nextDay - daysInMonth;
      nextMonth++;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
    }
    
    // Format về YYYY-MM-DD
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
  }

// Giả sử vẫn có const VN_UTC_OFFSET = 7; ở đâu đó, nhưng 3 hàm này không dùng nữa.

/**
 * Parse "YYYY-MM-DD" → Date UTC với đúng ngày đó (dùng như nhãn ngày)
 * VD: "2025-12-03" → 2025-12-03T00:00:00.000Z
 */
static parseVNDateOnlyStart(dateStr) {
  if (typeof dateStr !== 'string') {
    throw new Error('Ngày không hợp lệ');
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error('Ngày không hợp lệ');
  }

  // Không trừ 7h nữa, giữ nguyên "ngày" theo dạng YYYY-MM-DD
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Parse "YYYY-MM-DD" → Date UTC tương ứng 23:59:59.999 của chính ngày đó
 * VD: "2025-12-03" → 2025-12-03T23:59:59.999Z
 */
static parseVNDateOnlyEnd(dateStr) {
  if (typeof dateStr !== 'string') {
    throw new Error('Ngày không hợp lệ');
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error('Ngày không hợp lệ');
  }

  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

/**
 * Lấy "hôm nay 00:00" theo NGÀY VIỆT NAM nhưng biểu diễn dạng UTC
 * (dùng cùng style với parseVNDateOnlyStart để so sánh ngày)
 */
static getTodayVNStartUTC() {
  // Lấy ngày hôm nay theo timezone VN, dưới dạng "YYYY-MM-DD"
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const todayStr = formatter.format(new Date()); // ví dụ "2025-12-03"
  const [year, month, day] = todayStr.split('-').map(Number);

  // Dùng cùng style với parseVNDateOnlyStart: 00:00 của đúng ngày đó
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

// DateHelper
static parseDobFromDDMMYYYY(dobStr) {
  if (typeof dobStr !== 'string') {
    throw new Error('Ngày sinh không hợp lệ');
  }

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dobStr)) {
    throw new Error('Ngày sinh phải theo định dạng dd/MM/yyyy');
  }

  const [day, month, year] = dobStr.split('/').map(Number);

  // Kiểm tra ngày tháng năm
  const dateObj = new Date(year, month - 1, day);
  if (isNaN(dateObj.getTime()) ||
      dateObj.getDate() !== day ||
      dateObj.getMonth() !== month - 1 ||
      dateObj.getFullYear() !== year) {
    throw new Error('Ngày sinh không hợp lệ');
  }

  return { day, month, year }; // trả về parts để tính tuổi
}

static getTodayVNDateParts() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const todayStr = formatter.format(new Date()); // "YYYY-MM-DD"
  const [year, month, day] = todayStr.split('-').map(Number);
  return { day, month, year };
}


}

module.exports = DateHelper;

