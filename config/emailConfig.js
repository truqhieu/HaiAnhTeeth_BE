const nodemailer = require('nodemailer');
const DateHelper = require('../utils/dateHelper');

const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    const missingVars = [];
    if (!process.env.EMAIL_USER) missingVars.push('EMAIL_USER');
    if (!process.env.EMAIL_PASSWORD) missingVars.push('EMAIL_PASSWORD');

    console.error(`⚠️ Thiếu biến môi trường: ${missingVars.join(', ')} trong file .env`);
    console.error('💡 Hướng dẫn: Thêm EMAIL_USER và EMAIL_PASSWORD vào file .env');
    throw new Error(`Email configuration missing: ${missingVars.join(', ')}`);
  }

  console.log('📧 Tạo email transporter với:', process.env.EMAIL_USER);

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

const getVerificationEmailTemplate = (fullName, verificationLink) => {
  return {
    subject: `Xác thực tài khoản HaiAnhTeeth`,
    text: `
Xin chào ${fullName}!

Để hoàn tất đăng ký, vui lòng nhấp vào link:
${verificationLink}

Link có hiệu lực trong 24 giờ.

HaiAnhTeeth Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  
  <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
        🦷 HaiAnhTeeth
      </h1>
      <p style="margin: 8px 0 0 0; color: #cffafe; font-size: 14px; opacity: 0.9;">
        Nha khoa uy tín - Nụ cười rạng rỡ
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
        Xin chào ${fullName}! 👋
      </h2>
      
      <p style="margin: 0 0 25px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Chào mừng bạn đến với <strong style="color: #0891b2;">HaiAnhTeeth</strong>!<br>
        Để hoàn tất đăng ký tài khoản, vui lòng xác thực email của bạn.
      </p>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="${verificationLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3); transition: transform 0.2s;">
          ✅ Xác thực tài khoản
        </a>
      </div>
      
      <!-- Info Box -->
      <div style="background: #f1f5f9; border-left: 4px solid #0891b2; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 18px; margin-right: 8px;">⏰</span>
          <strong style="color: #1e293b; font-size: 14px;">Quan trọng</strong>
        </div>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
          Link xác thực có hiệu lực trong <strong style="color: #dc2626;">24 giờ</strong>. 
          Sau khi xác thực, bạn có thể đăng nhập và sử dụng hệ thống.
        </p>
      </div>
      
      <p style="margin: 25px 0 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">
        Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email này.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">
        🦷 HaiAnhTeeth
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Email tự động • Không trả lời
      </p>
    </div>
    
  </div>
</body>
</html>
    `.trim()
  };
};

const getResetPasswordEmailTemplate = (fullName, resetLink) => {
  return {
    subject: `🔐 Yêu cầu đặt lại mật khẩu - HaiAnhTeeth`,
    text: `
Xin chào ${fullName}!

Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản HaiAnhTeeth.

Để đặt lại mật khẩu, vui lòng nhấp vào link sau:
${resetLink}

Link có hiệu lực trong 10 phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

HaiAnhTeeth Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  
  <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">
        🔐 Đặt lại mật khẩu
      </h1>
      <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px; opacity: 0.9;">
        HaiAnhTeeth - Nha khoa uy tín
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="margin: 0 0 20px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
        Xin chào ${fullName}! 👋
      </h2>
      
      <p style="margin: 0 0 25px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong style="color: #dc2626;">HaiAnhTeeth</strong> của bạn.
      </p>

      <p style="margin: 0 0 30px 0; color: #475569; font-size: 15px; line-height: 1.6;">
        Nếu đó là bạn, vui lòng nhấp vào nút bên dưới để thiết lập mật khẩu mới. Nếu không phải, bạn có thể bỏ qua email này một cách an toàn.
      </p>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); transition: transform 0.2s; cursor: pointer;">
          🔄 Đặt lại mật khẩu
        </a>
      </div>
      
      <!-- Security Info Box -->
      <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
        <div style="display: flex; align-items: flex-start; margin-bottom: 0;">
          <span style="font-size: 20px; margin-right: 12px; flex-shrink: 0;">🔒</span>
          <div>
            <strong style="color: #7f1d1d; font-size: 14px; display: block; margin-bottom: 8px;">Thông tin bảo mật quan trọng</strong>
            <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
              • Link sẽ hết hạn trong <strong style="color: #dc2626;">10 phút</strong><br>
              • Không chia sẻ link này với bất kỳ ai<br>
              • HaiAnhTeeth sẽ không bao giờ yêu cầu bạn gửi mật khẩu qua email
            </p>
          </div>
        </div>
      </div>

      <!-- Additional Help -->
      <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
        <div style="display: flex; align-items: flex-start;">
          <span style="font-size: 18px; margin-right: 12px; flex-shrink: 0;">❓</span>
          <div>
            <strong style="color: #0369a1; font-size: 14px; display: block; margin-bottom: 8px;">Cần giúp đỡ?</strong>
            <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">
              Nếu bạn không yêu cầu đặt lại mật khẩu này, có thể tài khoản của bạn đã bị truy cập trái phép. 
              Vui lòng <strong>liên hệ hotline: 1900-xxxx</strong> ngay lập tức.
            </p>
          </div>
        </div>
      </div>
      
      <p style="margin: 25px 0 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">
        Đây là email tự động, vui lòng không trả lời email này.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">
        🦷 HaiAnhTeeth
      </p>
      <p style="margin: 0 0 4px 0; color: #94a3b8; font-size: 12px;">
        Nha khoa uy tín - Nụ cười rạng rỡ
      </p>
      <p style="margin: 0; color: #cbd5e1; font-size: 11px;">
        Email tự động • Không trả lời
      </p>
    </div>
    
  </div>
</body>
</html>
    `.trim()
  };
};

const getAppointmentConfirmationEmailTemplate = (appointmentData) => {
  const { fullName, serviceName, doctorName, startTime, endTime, type, mode } = appointmentData;

  // Format date and time với timezone Việt Nam (UTC+7) sử dụng DateHelper
  const formattedDate = DateHelper.formatVietnameseDate(startTime);
  const formattedStartTime = DateHelper.formatVietnameseTime(startTime);
  const formattedEndTime = DateHelper.formatVietnameseTime(endTime);

  const typeText = type === 'Consultation' ? 'Tư vấn' : type === 'Examination' ? 'Khám bệnh' : 'Tái khám';
  const modeText = mode === 'Online' ? 'Trực tuyến' : 'Trực tiếp';

  console.log('📧 Email template data:');
  console.log('   - Start Time UTC:', startTime);
  console.log('   - End Time UTC:', endTime);
  console.log('   - Formatted Date VN:', formattedDate);
  console.log('   - Formatted Start Time VN:', formattedStartTime);
  console.log('   - Formatted End Time VN:', formattedEndTime);

  return {
    subject: `Xác nhận đặt lịch ${typeText} - HaiAnhTeeth`,
    text: `
Xin chào ${fullName}!

Cảm ơn bạn đã đặt lịch ${typeText.toLowerCase()} tại HaiAnhTeeth.

THÔNG TIN CUỘC HẸN:
- Dịch vụ: ${serviceName}
- Bác sĩ: ${doctorName}
- Thời gian: ${formattedStartTime} - ${formattedEndTime}
- Ngày: ${formattedDate}
- Hình thức: ${modeText}

Cuộc hẹn của bạn đang chờ xác nhận từ phòng khám. Chúng tôi sẽ thông báo cho bạn sớm nhất.

Nếu cần thay đổi hoặc hủy lịch hẹn, vui lòng liên hệ hotline: 1900-xxxx

Trân trọng,
HaiAnhTeeth Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
        🦷 HaiAnhTeeth
      </h1>
      <p style="margin: 8px 0 0 0; color: #cffafe; font-size: 14px; opacity: 0.9;">
        Nha khoa uy tín - Nụ cười rạng rỡ
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; background: #dcfce7; border-radius: 50%; width: 80px; height: 80px; line-height: 80px; font-size: 40px; margin-bottom: 15px;">
          ✅
        </div>
        <h2 style="margin: 0; color: #1e293b; font-size: 24px; font-weight: 600;">
          Đặt lịch thành công!
        </h2>
      </div>
      
      <p style="margin: 0 0 25px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Xin chào <strong style="color: #0891b2;">${fullName}</strong>! 👋
      </p>
      
      <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Cảm ơn bạn đã đặt lịch ${typeText.toLowerCase()} tại <strong style="color: #0891b2;">HaiAnhTeeth</strong>. 
        Chúng tôi đã nhận được yêu cầu của bạn.
      </p>
      
      <!-- Appointment Details Box -->
      <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #10b981; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.15);">
        <h3 style="margin: 0 0 20px 0; color: #059669; font-size: 18px; font-weight: 600; text-align: center;">
          📋 Thông tin cuộc hẹn
        </h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top; width: 36px;">
              <span style="font-size: 20px;">💊</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top; width: 100px;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Dịch vụ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${serviceName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">👨‍⚕️</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Bác sĩ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${doctorName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">📅</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Ngày hẹn</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${formattedDate}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">🕐</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Thời gian</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500; padding: 4px 12px; border-radius: 6px;">${formattedStartTime} - ${formattedEndTime}</span>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">${mode === 'Online' ? '💻' : '🏥'}</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Hình thức</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${modeText}</span>
            </td>
          </tr>
        </table>
      </div>
      
      <!-- Status Info Box -->
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 18px; margin-right: 8px;">⏳</span>
          <strong style="color: #1e293b; font-size: 14px;">Trạng thái</strong>
        </div>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
          Cuộc hẹn của bạn đang <strong style="color: #f59e0b;">chờ xác nhận</strong> từ phòng khám. 
          Chúng tôi sẽ thông báo cho bạn qua email khi cuộc hẹn được xác nhận.
        </p>
      </div>
      
      <!-- Contact Info -->
      <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 30px 0;">
        <p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; font-weight: 600;">
          📞 Cần hỗ trợ?
        </p>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
          Nếu cần thay đổi hoặc hủy lịch hẹn, vui lòng liên hệ:<br>
          <strong>Hotline:</strong> 1900-xxxx<br>
          <strong>Email:</strong> support@haianteeth.com
        </p>
      </div>
      
      <p style="margin: 25px 0 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5; text-align: center;">
        Cảm ơn bạn đã tin tưởng HaiAnhTeeth!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">
        🦷 HaiAnhTeeth
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Email tự động • Không trả lời
      </p>
    </div>
    
  </div>
</body>
</html>
    `.trim()
  };
};

const getAppointmentApprovedEmailTemplate = (appointmentData) => {
  const { fullName, serviceName, doctorName, startTime, endTime, type, mode, meetLink } = appointmentData;

  // Format date and time
  const formattedDate = DateHelper.formatVietnameseDate(startTime);
  const formattedStartTime = DateHelper.formatVietnameseTime(startTime);
  const formattedEndTime = DateHelper.formatVietnameseTime(endTime);

  const typeText = type === 'Consultation' ? 'Tư vấn' : type === 'Examination' ? 'Khám bệnh' : 'Tái khám';
  const modeText = mode === 'Online' ? 'Trực tuyến' : 'Trực tiếp';

  const isMeetLink = meetLink && (meetLink.includes('meet.google.com') || meetLink.includes('/meet'));

  return {
    subject: `✅ Lịch ${typeText} được xác nhận - HaiAnhTeeth`,
    text: `
Xin chào ${fullName}!

Chúng tôi thông báo với bạn rằng lịch ${typeText.toLowerCase()} đã được xác nhận!

THÔNG TIN CUỘC HẸN:
- Dịch vụ: ${serviceName}
- Bác sĩ: ${doctorName}
- Thời gian: ${formattedStartTime} - ${formattedEndTime}
- Ngày: ${formattedDate}
- Hình thức: ${modeText}

${isMeetLink ? `LIÊN KẾT CUỘC HỌP:
${meetLink}

Vui lòng nhấp vào link trên vào thời gian dự kiến để tham gia cuộc tư vấn.` : ''}

Nếu cần thay đổi hoặc có bất cứ câu hỏi nào, vui lòng liên hệ hotline: 1900-xxxx

Trân trọng,
HaiAnhTeeth Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
        ✅ Xác nhận lịch hẹn
      </h1>
      <p style="margin: 8px 0 0 0; color: #d1fae5; font-size: 14px; opacity: 0.9;">
        HaiAnhTeeth - Nha khoa uy tín
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 25px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Xin chào <strong style="color: #059669;">${fullName}</strong>! 👋
      </p>
      
      <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Chúng tôi vui mừng thông báo rằng lịch <strong style="color: #059669;">${typeText.toLowerCase()}</strong> của bạn đã được <strong style="color: #059669;">xác nhận</strong>! 
        Vui lòng ghi chú những thông tin bên dưới.
      </p>
      
      <!-- Appointment Details Box -->
      <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #10b981; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.15);">
        <h3 style="margin: 0 0 20px 0; color: #059669; font-size: 18px; font-weight: 600; text-align: center;">
          📋 Thông tin cuộc hẹn
        </h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top; width: 36px;">
              <span style="font-size: 20px;">💊</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top; width: 100px;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Dịch vụ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${serviceName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">👨‍⚕️</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Bác sĩ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${doctorName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">📅</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Ngày hẹn</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${formattedDate}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #d1fae5;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">🕐</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Thời gian</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${formattedStartTime} - ${formattedEndTime}</span>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">${mode === 'Online' ? '💻' : '🏥'}</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #065f46; font-size: 14px; font-weight: 400;">Hình thức</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #047857; font-size: 15px; font-weight: 500;">${modeText}</span>
            </td>
          </tr>
        </table>
      </div>

      ${isMeetLink ? `
      <!-- Google Meet Link -->
      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0284c7; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 15px rgba(2, 132, 199, 0.15);">
        <h3 style="margin: 0 0 20px 0; color: #0369a1; font-size: 18px; font-weight: 600; text-align: center;">
          💻 Liên kết cuộc họp
        </h3>
        
        <p style="margin: 0 0 20px 0; color: #0c4a6e; font-size: 14px; line-height: 1.6;">
          Vui lòng nhấp vào link bên dưới vào thời gian dự kiến để tham gia cuộc tư vấn trực tuyến:
        </p>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="${meetLink}" 
             style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);">
            🔗 Vào cuộc họp Google Meet
          </a>
        </div>

        <p style="margin: 0; color: #0c4a6e; font-size: 13px; line-height: 1.5; word-break: break-all;">
          <strong>Hoặc sao chép link:</strong><br>
          <code style="background: white; padding: 8px 12px; border-radius: 4px; display: block; margin-top: 8px; font-size: 12px; color: #0369a1;">${meetLink}</code>
        </p>
      </div>
      ` : ''}
      
      <!-- Info Box -->
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 18px; margin-right: 8px;">💡</span>
          <strong style="color: #1e293b; font-size: 14px;">Gợi ý hữu ích</strong>
        </div>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
          Vui lòng:
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #64748b; font-size: 14px;">
            <li>Đến sớm 5-10 phút trước giờ hẹn</li>
            <li>Kiểm tra kết nối Internet của bạn</li>
            <li>Chuẩn bị một nơi yên tĩnh để tư vấn</li>
          </ul>
        </p>
      </div>
      
      <!-- Contact Info -->
      <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 30px 0;">
        <p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; font-weight: 600;">
          📞 Cần hỗ trợ?
        </p>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
          Nếu có bất cứ câu hỏi nào, vui lòng liên hệ:<br>
          <strong>Hotline:</strong> 1900-xxxx<br>
          <strong>Email:</strong> support@haianteeth.com
        </p>
      </div>
      
      <p style="margin: 25px 0 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5; text-align: center;">
        Cảm ơn bạn đã tin tưởng HaiAnhTeeth!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">
        🦷 HaiAnhTeeth
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Email tự động • Không trả lời
      </p>
    </div>
    
  </div>
</body>
</html>
    `.trim()
  };
};

const getAppointmentCancelledEmailTemplate = (appointmentData) => {
  const {
    fullName,
    serviceName,
    doctorName,
    startTime,
    endTime,
    type,
    mode,
    cancelReason,
    appointmentId,
    patientPhone,
    patientEmail,
    servicePrice,
    serviceDuration,
    cancelledAt
  } = appointmentData;

  // Format date and time
  const formattedDate = DateHelper.formatVietnameseDate(startTime);
  const formattedStartTime = DateHelper.formatVietnameseTime(startTime);
  const formattedEndTime = DateHelper.formatVietnameseTime(endTime);
  // Format cancelledAt time
  let formattedCancelledAt;
  if (cancelledAt) {
    try {
      const cancelledDate = new Date(cancelledAt);
      formattedCancelledAt = cancelledDate.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      formattedCancelledAt = new Date().toLocaleString('vi-VN');
    }
  } else {
    formattedCancelledAt = new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh'
    });
  }

  const typeText = type === 'Consultation' ? 'Tư vấn' : type === 'Examination' ? 'Khám bệnh' : 'Tái khám';
  const modeText = mode === 'Online' ? 'Trực tuyến' : 'Trực tiếp';

  // Format price
  const formattedPrice = servicePrice ? new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(servicePrice) : 'Miễn phí';

  return {
    subject: `❌ Lịch ${typeText} đã bị hủy - HaiAnhTeeth`,
    text: `
Xin chào ${fullName}!

Chúng tôi xin thông báo rằng lịch ${typeText.toLowerCase()} của bạn đã bị hủy.

THÔNG TIN CUỘC HẸN ĐÃ HỦY:
- Mã lịch hẹn: ${appointmentId || 'N/A'}
- Dịch vụ: ${serviceName}
- Bác sĩ: ${doctorName}
- Thời gian: ${formattedStartTime} - ${formattedEndTime}
- Ngày: ${formattedDate}
- Hình thức: ${modeText}
- Thời lượng: ${serviceDuration || 30} phút
- Giá dịch vụ: ${formattedPrice}
- Thời gian hủy: ${formattedCancelledAt}

THÔNG TIN KHÁCH HÀNG:
- Họ tên: ${fullName}
- Email: ${patientEmail || 'N/A'}
- Số điện thoại: ${patientPhone || 'N/A'}

LÝ DO HỦY:
${cancelReason}

Nếu bạn muốn đặt lịch mới hoặc có bất cứ câu hỏi nào, vui lòng liên hệ hotline: 1900-xxxx

Trân trọng,
HaiAnhTeeth Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
        ❌ Lịch hẹn đã bị hủy
      </h1>
      <p style="margin: 8px 0 0 0; color: #fecaca; font-size: 14px; opacity: 0.9;">
        HaiAnhTeeth - Nha khoa uy tín
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 25px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Xin chào <strong style="color: #dc2626;">${fullName}</strong>! 👋
      </p>
      
      <p style="margin: 0 0 30px 0; color: #475569; font-size: 16px; line-height: 1.6;">
        Chúng tôi xin thông báo rằng lịch <strong style="color: #dc2626;">${typeText.toLowerCase()}</strong> của bạn đã bị <strong style="color: #dc2626;">hủy</strong>.
      </p>
      
      <!-- Appointment Details Box -->
      <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #ef4444; border-radius: 12px; padding: 25px; margin: 30px 0; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.15);">
        <h3 style="margin: 0 0 20px 0; color: #dc2626; font-size: 18px; font-weight: 600; text-align: center;">
          📋 Thông tin cuộc hẹn đã hủy
        </h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top; width: 36px;">
              <span style="font-size: 20px;">💊</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top; width: 100px;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Dịch vụ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${serviceName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">👨‍⚕️</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Bác sĩ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${doctorName}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">📅</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Ngày hẹn</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${formattedDate}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">🕐</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Thời gian</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${formattedStartTime} - ${formattedEndTime}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">⏱️</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Thời lượng</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${serviceDuration || 30} phút</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">💰</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Giá dịch vụ</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${formattedPrice}</span>
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #fecaca;">
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">${mode === 'Online' ? '💻' : '🏥'}</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Hình thức</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${modeText}</span>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="font-size: 20px;">⏰</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #7f1d1d; font-size: 14px; font-weight: 400;">Thời gian hủy</span>
            </td>
            <td style="padding: 12px 0; vertical-align: top;">
              <span style="color: #991b1b; font-size: 15px; font-weight: 500;">${formattedCancelledAt}</span>
            </td>
          </tr>
        </table>
        
        <!-- Patient Info Section -->
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h4 style="margin: 0 0 15px 0; color: #9a3412; font-size: 15px; font-weight: 600;">
            👤 Thông tin khách hàng
          </h4>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #7c2d12; font-size: 13px; font-weight: 400;">Họ tên:</td>
              <td style="padding: 8px 0; color: #9a3412; font-size: 14px; font-weight: 500;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #7c2d12; font-size: 13px; font-weight: 400;">Email:</td>
              <td style="padding: 8px 0; color: #9a3412; font-size: 14px; font-weight: 500;">${patientEmail || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #7c2d12; font-size: 13px; font-weight: 400;">Số điện thoại:</td>
              <td style="padding: 8px 0; color: #9a3412; font-size: 14px; font-weight: 500;">${patientPhone || 'N/A'}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Cancel Reason Box -->
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 0 8px 8px 0; margin: 30px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 18px; margin-right: 8px;">📌</span>
          <strong style="color: #1e293b; font-size: 14px;">Lý do hủy lịch</strong>
        </div>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
          ${cancelReason}
        </p>
      </div>
      
      <!-- Rebook Info -->
      <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 30px 0;">
        <p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; font-weight: 600;">
          📞 Muốn đặt lịch khác?
        </p>
        <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
          Bạn có thể đặt lịch mới bất cứ lúc nào hoặc liên hệ chúng tôi để được hỗ trợ:<br>
          <strong>Hotline:</strong> 1900-xxxx<br>
          <strong>Email:</strong> support@haianteeth.com
        </p>
      </div>
      
      <p style="margin: 25px 0 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5; text-align: center;">
        Cảm ơn bạn đã tin tưởng HaiAnhTeeth!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background: #f8fafc; padding: 25px 30px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 600;">
        🦷 HaiAnhTeeth
      </p>
      <p style="margin: 0; color: #94a3b8; font-size: 12px;">
        Email tự động • Không trả lời
      </p>
    </div>
    
  </div>
</body>
</html>
    `.trim()
  };
};

const getDoctorAssignedEmailTemplate = (data) => {
  const {
    patientName,
    serviceName,
    oldDoctorName = null,
    newDoctorName,
    appointmentDate,
    appointmentStart,
    appointmentEnd,
    clinicName = 'Phòng khám Hải An'
  } = data;

  // Kiểm tra và format ngày giờ an toàn
  const formattedDate = appointmentDate ? DateHelper.formatVietnameseDate(appointmentDate) : 'Chưa xác định';
  const formattedStart = appointmentStart ? DateHelper.formatVietnameseTime(appointmentStart) : '';
  const formattedEnd = appointmentEnd ? DateHelper.formatVietnameseTime(appointmentEnd) : '';

  const hasOldDoctor = oldDoctorName && oldDoctorName.trim();
  const reason = hasOldDoctor
    ? `Do bác sĩ ${oldDoctorName} bận, chúng tôi đã chỉ định bác sĩ ${newDoctorName} thay thế.`
    : `Chúng tôi đã chỉ định bác sĩ ${newDoctorName} khám cho bạn.`;

  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || 'support@haianteeth.com';

  return {
    subject: `Cập nhật bác sĩ khám - ${clinicName}`,
    text: `
Xin chào ${patientName},

${reason}

📅 THÔNG TIN LỊCH KHÁM:
- Dịch vụ: ${serviceName}
- Bác sĩ: ${newDoctorName}${hasOldDoctor ? ` (thay thế ${oldDoctorName})` : ''}
- Thời gian: ${formattedStart} - ${formattedEnd}, ${formattedDate}
- Địa điểm: ${clinicName}

Vui lòng đến đúng giờ để đảm bảo chất lượng khám chữa bệnh.

Mọi thắc mắc xin liên hệ: ${supportEmail}

Trân trọng,
${clinicName}
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; padding: 20px; color: #333; }
    .email-container { max-width: 600px; margin: auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    .email-header { background: #007bff; color: white; padding: 20px; text-align: center; font-size: 20px; font-weight: bold; }
    .email-body { padding: 25px; font-size: 15px; line-height: 1.6; }
    .highlight { background: #e2f0d9; padding: 12px; border-radius: 6px; margin: 20px 0; }
    .highlight strong { color: #2c3e50; }
    .doctor-change { background: #fff3cd; padding: 12px; border-radius: 6px; font-weight: 600; color: #856404; text-align: center; margin-bottom: 20px; }
    .email-footer { background: #f1f1f1; padding: 15px; text-align: center; font-size: 13px; color: #666; }
    a { color: #007bff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      Cập nhật bác sĩ khám
    </div>
    <div class="email-body">
      <p>Xin chào <strong>${patientName}</strong>,</p>
      <p>${reason}</p>
      <div class="doctor-change">
        ${hasOldDoctor
        ? `Bác sĩ <span style="text-decoration: line-through;">${oldDoctorName}</span> → <strong>${newDoctorName}</strong>`
        : `<strong>${newDoctorName}</strong> được chỉ định khám cho bạn`}
      </div>
      <div class="highlight">
        <strong>Dịch vụ:</strong> ${serviceName}<br>
        <strong>Bác sĩ:</strong> ${newDoctorName}${hasOldDoctor ? ` (thay thế ${oldDoctorName})` : ''}<br>
        <strong>Thời gian:</strong> ${formattedStart} - ${formattedEnd}, ${formattedDate}<br>
        <strong>Địa điểm:</strong> ${clinicName}
      </div>
      <p>Vui lòng đến đúng giờ để đảm bảo chất lượng khám chữa bệnh.</p>
      <p>Mọi thắc mắc xin liên hệ: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
    </div>
    <div class="email-footer">
      ${clinicName} • Email tự động
    </div>
  </div>
</body>
</html>
    `.trim()
  };
};


// helpers/emailTemplate.js

const getConsultationFormStaffEmailTemplate = (data) => {
  const {
    fullName,
    phoneNumber,
    email,
    clinicName = 'Phòng khám Hải An',
    emailStaff, // email staff lấy từ DB truyền vào
  } = data;

  const createdAt = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });

  return {
    subject: `[TƯ VẤN] Khách hàng mới gửi form - ${fullName}`,
    text: `
Có một khách hàng mới vừa gửi form tư vấn.

THÔNG TIN KHÁCH HÀNG:
- Họ tên: ${fullName}
- Số điện thoại: ${phoneNumber}
- Email: ${email}

THÔNG TIN HỆ THỐNG:
- Thời điểm gửi form: ${createdAt}
- Gửi tới: ${emailStaff || 'Nhân viên phụ trách'}
- Cơ sở: ${clinicName}

Vui lòng liên hệ khách sớm để tư vấn & chốt lịch.
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; padding: 20px; color: #333; }
    .email-container { max-width: 650px; margin: auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
    .email-header { background: #17a2b8; color: white; padding: 20px; text-align: center; font-size: 20px; font-weight: bold; }
    .email-body { padding: 25px; font-size: 15px; line-height: 1.6; }
    .section-title { font-weight: 600; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; font-size: 13px; color: #555; }
    .info-box { background: #f8f9fa; padding: 12px 15px; border-radius: 6px; margin-bottom: 12px; }
    .info-row { margin-bottom: 4px; }
    .label { font-weight: 600; }
    .email-footer { background: #f1f1f1; padding: 12px 15px; text-align: center; font-size: 13px; color: #666; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      Khách hàng mới gửi form tư vấn
    </div>
    <div class="email-body">
      <p>Chào đội ngũ <strong>${clinicName}</strong>,</p>
      <p>Có một <strong>khách hàng mới</strong> vừa gửi thông tin tư vấn.</p>

      <div class="section-title">Thông tin khách hàng</div>
      <div class="info-box">
        <div class="info-row"><span class="label">Họ tên:</span> ${fullName}</div>
        <div class="info-row"><span class="label">Số điện thoại:</span> ${phoneNumber}</div>
        <div class="info-row"><span class="label">Email:</span> ${email}</div>
      </div>

      <div class="section-title">Thông tin hệ thống</div>
      <div class="info-box">
        <div class="info-row"><span class="label">Thời điểm gửi form:</span> ${createdAt}</div>
        <div class="info-row"><span class="label">Cơ sở:</span> ${clinicName}</div>
        ${emailStaff ? `<div class="info-row"><span class="label">Gửi tới:</span> ${emailStaff}</div>` : ''}
      </div>

      <p><strong>Gợi ý xử lý:</strong> Vui lòng liên hệ khách sớm để tư vấn chi tiết và đề xuất lịch hẹn phù hợp.</p>
    </div>
    <div class="email-footer">
      Email tự động gửi tới staff${emailStaff ? ` (${emailStaff})` : ''}.
    </div>
  </div>
</body>
</html>
    `.trim(),
  };
};

const getReExaminationEmailTemplate = (data) => {
  const {
    patientName,
    patientPhone,
    patientEmail,
    doctorName,
    appointmentDate,
    appointmentTime,
    appointmentEndTime,
    clinicName = 'Phòng khám Hải Anh',
  } = data;

  // Format ngày tái khám
  const formattedDate = new Date(appointmentDate).toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Format giờ bắt đầu tái khám
  const formattedTime = new Date(appointmentTime).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Format giờ kết thúc tái khám
  const formattedEndTime = appointmentEndTime
    ? new Date(appointmentEndTime).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    : null;

  return {
    subject: `[TÁI KHÁM] Đơn tái khám mới - ${patientName}`,
    text: `
Bác sĩ vừa tạo đơn tái khám cho bệnh nhân.

THÔNG TIN BỆNH NHÂN:
- Họ tên: ${patientName}
- Số điện thoại: ${patientPhone}
- Email: ${patientEmail}

THÔNG TIN TÁI KHÁM:
- Bác sĩ: ${doctorName}
- Ngày tái khám: ${formattedDate}
- Giờ tái khám: ${formattedTime}${formattedEndTime ? ` - ${formattedEndTime}` : ''}
- Cơ sở: ${clinicName}

Vui lòng xem chi tiết lịch tái khám trong hệ thống.
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      background: #f5f5f5; 
      padding: 20px; 
      color: #333; 
      line-height: 1.6;
    }
    .email-wrapper { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
    .email-header { 
      background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
      color: white; 
      padding: 30px 20px; 
      text-align: center;
    }
    .email-header h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .email-body { 
      padding: 30px 25px;
    }
    .email-body > p:first-child {
      font-size: 16px;
      margin-bottom: 10px;
    }
    .email-body > p:nth-child(2) {
      font-size: 15px;
      color: #555;
      margin-bottom: 25px;
    }
    .section-title { 
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: #17a2b8;
      margin: 20px 0 10px 0;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #17a2b8;
      padding-bottom: 5px;
    }
    .info-box { 
      background: #f8f9fa;
      padding: 15px 18px;
      border-radius: 6px;
      margin-bottom: 15px;
      border-left: 4px solid #17a2b8;
    }
    .info-row { 
      margin-bottom: 8px;
      font-size: 14px;
      display: flex;
      align-items: baseline;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }
    .label { 
      font-weight: 600;
      color: #444;
      min-width: 130px;
      display: inline-block;
    }
    .value {
      color: #555;
    }
    .highlight-box {
      background: #e7f6f8;
      border: 1px solid #17a2b8;
      border-radius: 6px;
      padding: 15px;
      margin: 20px 0;
      text-align: center;
    }
    .highlight-box strong {
      color: #17a2b8;
      font-size: 15px;
    }
    .email-footer { 
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 13px;
      color: #6c757d;
      border-top: 1px solid #e9ecef;
    }
    .email-footer p {
      margin: 0;
    }
    @media only screen and (max-width: 600px) {
      body { padding: 10px; }
      .email-body { padding: 20px 15px; }
      .label { min-width: 110px; font-size: 13px; }
      .value { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <h1>Đơn tái khám mới</h1>
    </div>
    
    <div class="email-body">
      <p>Chào đội ngũ <strong>${clinicName}</strong>,</p>
      <p>Bác sĩ vừa tạo <strong>đơn tái khám</strong> cho bệnh nhân.</p>

      <div class="section-title">Thông tin bệnh nhân</div>
      <div class="info-box">
        <div class="info-row">
          <span class="label">Họ tên:</span>
          <span class="value">${patientName}</span>
        </div>
        <div class="info-row">
          <span class="label">Số điện thoại:</span>
          <span class="value">${patientPhone}</span>
        </div>
        <div class="info-row">
          <span class="label">Email:</span>
          <span class="value">${patientEmail}</span>
        </div>
      </div>

      <div class="section-title">Thông tin tái khám</div>
      <div class="info-box">
        <div class="info-row">
          <span class="label">Bác sĩ:</span>
          <span class="value">${doctorName}</span>
        </div>
        <div class="info-row">
          <span class="label">Ngày tái khám:</span>
          <span class="value">${formattedDate}</span>
        </div>
        <div class="info-row">
          <span class="label">Giờ tái khám:</span>
          <span class="value">${formattedTime}${formattedEndTime ? ` - ${formattedEndTime}` : ''}</span>
        </div>
        <div class="info-row">
          <span class="label">Cơ sở:</span>
          <span class="value">${clinicName}</span>
        </div>
      </div>

      <div class="highlight-box">
        <strong>Gợi ý xử lý:</strong> Vui lòng xem chi tiết lịch tái khám trong hệ thống.
      </div>
    </div>
    
    <div class="email-footer">
      <p>Email tự động thông báo đơn tái khám.</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  };
};



module.exports = {
  createTransporter,
  getVerificationEmailTemplate,
  getResetPasswordEmailTemplate,
  getAppointmentConfirmationEmailTemplate,
  getAppointmentApprovedEmailTemplate,
  getAppointmentCancelledEmailTemplate,
  getRequestApprovedEmailTemplate,
  getRequestRejectedEmailTemplate,
  getDoctorAssignedEmailTemplate,
  getConsultationFormStaffEmailTemplate,
  getReExaminationEmailTemplate,
};

// ⭐ Template: Yêu cầu đã được duyệt (Đổi lịch/Đổi bác sĩ)
function getRequestApprovedEmailTemplate(data) {
  const subject = `Yêu cầu ${data?.requestType || 'Đổi lịch hẹn'} đã được duyệt`;
  const text = `
Xin chào ${data?.patientName || ''},

Yêu cầu ${data?.requestType || ''} của bạn đã được duyệt thành công!

Thông tin chi tiết:
- Loại yêu cầu: ${data?.requestType || ''}
- Thời gian duyệt: ${data?.approvedAt || ''}
- Người duyệt: ${data?.staffName || ''}
${data?.appointmentDateVN ? `- Ngày khám mới: ${data.appointmentDateVN}` : ''}
${data?.appointmentStartVN ? `- Giờ khám: ${data.appointmentStartVN} - ${data.appointmentEndVN}` : ''}

Lịch hẹn của bạn đã được cập nhật theo yêu cầu. Vui lòng kiểm tra lại thông tin trong tài khoản của bạn.

Trân trọng,
Đội ngũ Hải Anh Teeth
  `.trim();

  const dateLine = data?.appointmentDateVN ? `<li><strong>Ngày khám mới:</strong> ${data.appointmentDateVN}</li>` : '';
  const timeLine = data?.appointmentStartVN ? `<li><strong>Giờ khám:</strong> ${data.appointmentStartVN} - ${data.appointmentEndVN}</li>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f3f4f6; }
    .container { max-width: 620px; margin: 24px auto; padding: 0 12px; }
    .card { overflow: hidden; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(90deg, #22c55e, #16a34a); color: white; padding: 24px; text-align: center; }
    .content { padding: 24px; }
    .success-icon { font-size: 48px; margin-bottom: 8px; }
    .title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.2px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0; }
    .info-card h3 { margin: 0 0 8px; font-size: 16px; color: #111827; }
    .info-card ul { padding-left: 18px; margin: 0; }
    .info-card li { margin: 6px 0; }
    .footer { color: #6b7280; margin-top: 18px; }
  </style>
  </head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="success-icon">✅</div>
        <h1 class="title">Yêu cầu đã được duyệt</h1>
      </div>
      <div class="content">
        <p>Xin chào <strong>${data?.patientName || ''}</strong>,</p>
        <p>Yêu cầu <strong>${data?.requestType || ''}</strong> của bạn đã được duyệt thành công!</p>
        <div class="info-card">
          <h3>Thông tin chi tiết</h3>
          <ul>
            <li><strong>Loại yêu cầu:</strong> ${data?.requestType || ''}</li>
            <li><strong>Thời gian duyệt:</strong> ${data?.approvedAt || ''}</li>
            <li><strong>Người duyệt:</strong> ${data?.staffName || ''}</li>
            ${dateLine}
            ${timeLine}
          </ul>
        </div>
        <p class="footer">Lịch hẹn của bạn đã được cập nhật theo yêu cầu. Vui lòng kiểm tra lại thông tin trong tài khoản của bạn.</p>
        <p class="footer">Trân trọng,<br><strong>Đội ngũ Hải Anh Teeth</strong></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// ⭐ Template: Yêu cầu bị từ chối
function getRequestRejectedEmailTemplate(data) {
  const subject = `Yêu cầu ${data?.requestType || 'Đổi lịch hẹn'} đã bị từ chối`;
  const time = data?.requestedDateVN ? `- Thời gian yêu cầu: ${data.requestedDateVN}${data?.requestedStartVN ? ` - ${data.requestedStartVN} đến ${data.requestedEndVN}` : ''}` : '';
  const text = `
Xin chào ${data?.patientName || ''},

Rất tiếc, yêu cầu ${data?.requestType || ''} của bạn đã bị từ chối.

Thông tin chi tiết:
- Loại yêu cầu: ${data?.requestType || ''}
- Thời gian từ chối: ${data?.rejectedAt || ''}
- Người xử lý: ${data?.staffName || ''}
${time}

Lý do từ chối:
${data?.reason || ''}

Vui lòng liên hệ với chúng tôi nếu bạn có thắc mắc hoặc muốn đặt lịch mới.

Trân trọng,
Đội ngũ Hải Anh Teeth
  `.trim();

  const reqTime = data?.requestedDateVN ? `<li><strong>Thời gian yêu cầu:</strong> ${data.requestedDateVN}${data?.requestedStartVN ? ` - ${data.requestedStartVN} đến ${data.requestedEndVN}` : ''}</li>` : '';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f3f4f6; }
    .container { max-width: 620px; margin: 24px auto; padding: 0 12px; }
    .card { overflow: hidden; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(90deg, #ef4444, #dc2626); color: white; padding: 24px; text-align: center; }
    .content { padding: 24px; }
    .error-icon { font-size: 48px; margin-bottom: 8px; }
    .title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.2px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0; }
    .info-card h3 { margin: 0 0 8px; font-size: 16px; color: #111827; }
    .info-card ul { padding-left: 18px; margin: 0; }
    .info-card li { margin: 6px 0; }
    .reason-box { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px; }
    .footer { color: #6b7280; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="error-icon">❌</div>
        <h1 class="title">Yêu cầu bị từ chối</h1>
      </div>
      <div class="content">
        <p>Xin chào <strong>${data?.patientName || ''}</strong>,</p>
        <p>Rất tiếc, yêu cầu <strong>${data?.requestType || ''}</strong> của bạn đã bị từ chối.</p>
        <div class="info-card">
          <h3>Thông tin chi tiết</h3>
          <ul>
            <li><strong>Loại yêu cầu:</strong> ${data?.requestType || ''}</li>
            <li><strong>Thời gian từ chối:</strong> ${data?.rejectedAt || ''}</li>
            <li><strong>Người xử lý:</strong> ${data?.staffName || ''}</li>
            ${reqTime}
          </ul>
        </div>
        <div class="reason-box">
          <h3>Lý do từ chối</h3>
          <p style="margin:6px 0 0;">${data?.reason || ''}</p>
        </div>
        <p class="footer">Vui lòng liên hệ với chúng tôi nếu bạn có thắc mắc hoặc muốn đặt lịch mới.</p>
        <p class="footer">Trân trọng,<br><strong>Đội ngũ Hải Anh Teeth</strong></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}



