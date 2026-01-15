const { 
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
  getReExaminationEmailTemplate
} = require('../config/emailConfig');

// Import SendGrid
const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    // Initialize SendGrid nếu có API key
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      console.log('✅ SendGrid initialized');
      this.useSendGrid = true;
    } else {
      console.warn('⚠️ SENDGRID_API_KEY not set, falling back to nodemailer');
      this.useSendGrid = false;
    }
  }

  createVerificationLink(token, email, baseUrl) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${frontendUrl}/verify-email?token=${token}&email=${email}`;
  }

  createResetPasswordLink(token, email, baseUrl) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${frontendUrl}/reset-password?token=${token}&email=${email}`;
  }

  async sendVerificationEmail(fullName, email, verificationLink) {
    try {
      if (this.useSendGrid) {
        const emailTemplate = getVerificationEmailTemplate(fullName, verificationLink);
        return this._sendViaSendGrid(
          email,
          emailTemplate.subject,
          emailTemplate.text,
          emailTemplate.html
        );
      }
      
      const transporter = createTransporter();
      const emailTemplate = getVerificationEmailTemplate(fullName, verificationLink);
      const result = await transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@healingmedicine.com',
        to: email,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      });
      
      console.log(`✅ Email xác thực đã được gửi đến: ${email}`);
      return result;
    } catch (error) {
      console.error('❌ Lỗi gửi email xác thực:', error.message);
      throw error;
    }
  }

  async resendVerificationEmail(fullName, email, verificationLink) {
    return this.sendVerificationEmail(fullName, email, verificationLink);
  }

  async sendResetPasswordEmail(fullName, email, resetLink) {
    // Luôn gọi template để lấy subject, text, html
    const emailTemplate = getResetPasswordEmailTemplate(fullName, resetLink);
    
    if (this.useSendGrid) {
      return this._sendViaSendGrid(
        email,
        emailTemplate.subject,
        emailTemplate.text,
        emailTemplate.html
      );
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
      to: email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    });
  }

  async sendAppointmentConfirmationEmail(email, appointmentData) {
    if (this.useSendGrid) {
      const emailTemplate = getAppointmentConfirmationEmailTemplate(appointmentData);
      return this._sendViaSendGrid(
        email,
        emailTemplate.subject,
        emailTemplate.text,
        emailTemplate.html
      );
    }

    const transporter = createTransporter();
    const emailTemplate = getAppointmentConfirmationEmailTemplate(appointmentData);
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
      to: email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    });
  }

  async sendAppointmentApprovedEmail(email, appointmentData) {
    if (this.useSendGrid) {
      const emailTemplate = getAppointmentApprovedEmailTemplate(appointmentData);
      return this._sendViaSendGrid(
        email,
        emailTemplate.subject,
        emailTemplate.text,
        emailTemplate.html
      );
    }

    const transporter = createTransporter();
    const emailTemplate = getAppointmentApprovedEmailTemplate(appointmentData);
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
      to: email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    });
  }

  async sendAppointmentCancelledEmail(email, appointmentData) {
    if (this.useSendGrid) {
      const emailTemplate = getAppointmentCancelledEmailTemplate(appointmentData);
      return this._sendViaSendGrid(
        email,
        emailTemplate.subject,
        emailTemplate.text,
        emailTemplate.html
      );
    }

    const transporter = createTransporter();
    const emailTemplate = getAppointmentCancelledEmailTemplate(appointmentData);
    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
      to: email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    });
  }

  /**
   * ⭐ Helper: Send via SendGrid (HTTP API - không SMTP)
   */
  async _sendViaSendGrid(email, subject, text, html) {
    try {
      const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@haianteeth.com',
        subject: subject,
        text: text,
        html: html
      };

      await sgMail.send(msg);
      console.log(`✅ Email gửi qua SendGrid thành công đến: ${email}`);
      return true;
    } catch (error) {
      console.error('❌ Lỗi SendGrid:', error.message);
      throw error;
    }
  }

  // Generic method để gửi email với template (format tách ở emailConfig)
  async sendEmail(emailData) {
    const { to, subject, template, data } = emailData;
    
    if (!to || !subject) {
      throw new Error('Email và subject là bắt buộc');
    }

    let html, text, resolvedSubject = subject;
    if (template === 'requestApproved') {
      const t = getRequestApprovedEmailTemplate(data);
      resolvedSubject = subject || t.subject;
      html = t.html; text = t.text;
    } else if (template === 'requestRejected') {
      const t = getRequestRejectedEmailTemplate(data);
      resolvedSubject = subject || t.subject;
      html = t.html; text = t.text;
    } else {
      html = `<p>${(data && data.message) || 'Thông báo từ hệ thống'}</p>`;
      text = (data && data.message) || 'Thông báo từ hệ thống';
    }

    if (this.useSendGrid) {
      return this._sendViaSendGrid(to, resolvedSubject, text, html);
    } else {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
          to: to,
          subject: resolvedSubject,
          text: text,
          html: html
        });
        console.log(`✅ Email gửi qua Nodemailer thành công đến: ${to}`);
        return true;
      } catch (error) {
        console.error('❌ Lỗi gửi email qua Nodemailer:', error.message);
        // Fallback: chỉ log ra console nếu không gửi được email
        console.log('📧 EMAIL CONTENT (Fallback):');
        console.log('To:', to);
        console.log('Subject:', resolvedSubject);
        console.log('Text:', text);
        console.log('HTML:', html);
        return false;
      }
    }
  }

  async sendDoctorAssignedEmail(email, data) {
  const template = getDoctorAssignedEmailTemplate(data); 

  if (this.useSendGrid) {
    return this._sendViaSendGrid(email, template.subject, template.text, template.html);
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

async sendConsultationFormStaffEmail(staffEmail, data) {
  if (!staffEmail) {
    // Có thể chỉ warn, không throw để không làm fail flow
    console.warn('⚠️ Không có email staff để gửi tư vấn');
    return;
  }

  const template = getConsultationFormStaffEmailTemplate({
    fullName: data.fullName,
    phoneNumber: data.phoneNumber,
    email: data.email,
    clinicName: data.clinicName || 'Phòng khám Hải Anh',
    emailStaff: staffEmail, // truyền vào để hiển thị trong nội dung mail
  });

  if (this.useSendGrid) {
    return this._sendViaSendGrid(
      staffEmail,
      template.subject,
      template.text,
      template.html
    );
  }

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
    to: staffEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
async sendReExaminationEmail(params) {
  const { email, ...data } = params;
  const template = getReExaminationEmailTemplate(data); 
  
  if (this.useSendGrid) {
    return this._sendViaSendGrid(email, template.subject, template.text, template.html);
  }
  
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_USER || 'noreply@haianteeth.com',
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
}

module.exports = new EmailService();
