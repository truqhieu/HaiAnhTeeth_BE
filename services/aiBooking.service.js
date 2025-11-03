const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const availableSlotService = require('./availableSlot.service');
const appointmentService = require('./appointment.service');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Load prompt configuration
const promptConfigPath = path.join(__dirname, '../config/aiBooking.prompt.json');
const promptConfig = JSON.parse(fs.readFileSync(promptConfigPath, 'utf8'));

class AIBookingService {
  /**
   * Parse user prompt để extract thông tin đặt lịch
   */
  async parseBookingPrompt(userPrompt, patientUserId) {
    try {
      // 1. Lấy danh sách services và doctors để cung cấp context cho AI
      const services = await Service.find({ status: 'Active' })
        .select('_id serviceName category')
        .lean();
      
      const doctors = await User.find({ role: 'Doctor', status: 'Active' })
        .select('_id fullName')
        .lean();

      // 2. Format data cho AI
      const servicesList = services.map(s => ({
        id: s._id.toString(),
        name: s.serviceName,
        category: s.category
      })).slice(0, 50); // Limit để không quá dài

      const doctorsList = doctors.map(d => ({
        id: d._id.toString(),
        name: d.fullName
      }));

      // 3. Build instructions từ config
      const instructionsText = promptConfig.instructions.rules.map(rule => {
        let text = `${rule.id}. ${rule.description}`;
        if (rule.details && Array.isArray(rule.details)) {
          text += '\n' + rule.details.map(d => `   - ${d}`).join('\n');
        }
        return text;
      }).join('\n');

      // 4. Build examples từ config
      const examplesText = 'Ví dụ parse (few-shot examples):\n' + 
        promptConfig.examples.map(ex => {
          return `- Input: "${ex.input}"\n  Output: ${JSON.stringify(ex.output, null, 2)}`;
        }).join('\n\n');

      // 5. Build system prompt từ template
      const systemPrompt = promptConfig.systemPromptTemplate
        .replace('{{SERVICES_LIST}}', JSON.stringify(servicesList, null, 2))
        .replace('{{DOCTORS_LIST}}', JSON.stringify(doctorsList, null, 2))
        .replace('{{INSTRUCTIONS}}', instructionsText)
        .replace('{{EXAMPLES}}', examplesText);

      // 3.5. Parse ngày hiện tại để AI biết context
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // 4. Gọi OpenAI API với context về ngày
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Hôm nay là ${todayStr}. ${userPrompt}\n\nLưu ý: "ngày mai" = ${tomorrowStr}, "hôm nay" = ${todayStr}`
          }
        ],
        temperature: 0.3, // Lower temperature để tăng độ chính xác
        response_format: { type: "json_object" }, // Force JSON output
        max_tokens: 500
      });

      // 5. Parse response
      const responseText = completion.choices[0].message.content;
      const parsedData = JSON.parse(responseText);

      console.log('🤖 [AI] Parsed booking data:', parsedData);

      return parsedData;
    } catch (error) {
      console.error('❌ [AI] Error parsing prompt:', error);
      
      // Handle specific OpenAI API errors
      if (error.response?.status === 429) {
        throw new Error('Quota OpenAI đã hết. Vui lòng kiểm tra billing và nạp tiền tại: https://platform.openai.com/account/billing');
      }
      
      if (error.response?.status === 401) {
        throw new Error('OpenAI API key không hợp lệ. Vui lòng kiểm tra lại OPENAI_API_KEY trong .env');
      }
      
      if (error.message?.includes('quota') || error.message?.includes('billing')) {
        throw new Error('Quota OpenAI đã hết. Vui lòng nạp tiền vào tài khoản OpenAI.');
      }
      
      throw new Error(`Lỗi khi phân tích yêu cầu đặt lịch: ${error.message}`);
    }
  }

  /**
   * Map parsed data từ AI sang serviceId và doctorUserId
   */
  async mapParsedDataToIds(parsedData) {
    try {
      let serviceId = null;
      let doctorUserId = null;

      // 1. Map serviceName → serviceId
      if (parsedData.serviceName) {
        const service = await Service.findOne({
          serviceName: { $regex: new RegExp(parsedData.serviceName, 'i') },
          status: 'Active'
        });
        
        if (service) {
          serviceId = service._id;
          console.log(`✅ [AI] Mapped service "${parsedData.serviceName}" → ${serviceId}`);
        } else {
          console.warn(`⚠️ [AI] Không tìm thấy dịch vụ: ${parsedData.serviceName}`);
        }
      }

      // 2. Map doctorName → doctorUserId
      if (parsedData.doctorName) {
        const doctor = await User.findOne({
          role: 'Doctor',
          status: 'Active',
          fullName: { $regex: new RegExp(parsedData.doctorName, 'i') }
        });

        if (doctor) {
          doctorUserId = doctor._id;
          console.log(`✅ [AI] Mapped doctor "${parsedData.doctorName}" → ${doctorUserId}`);
        } else {
          console.warn(`⚠️ [AI] Không tìm thấy bác sĩ: ${parsedData.doctorName}`);
        }
      }

      return {
        serviceId,
        doctorUserId,
        date: parsedData.date,
        time: parsedData.time,
        timePreference: parsedData.timePreference || 'any',
        notes: parsedData.notes || '',
        confidence: parsedData.confidence || 'medium'
      };
    } catch (error) {
      console.error('❌ [AI] Error mapping data:', error);
      throw new Error(`Lỗi khi map dữ liệu: ${error.message}`);
    }
  }

  /**
   * Tìm available slots dựa trên parsed data
   */
  async findAvailableSlots(mappedData) {
    try {
      const { serviceId, doctorUserId, date, time, timePreference } = mappedData;

      if (!serviceId || !date) {
        throw new Error('Thiếu thông tin dịch vụ hoặc ngày');
      }

      // 1. Nếu có doctorUserId → tìm slots của doctor cụ thể
      if (doctorUserId) {
        const slotsResult = await availableSlotService.getAvailableSlots({
          doctorUserId,
          serviceId,
          date: new Date(date),
          patientUserId: null, // AI booking không exclude user's own appointments
          breakAfterMinutes: 10
        });

        // Filter theo time nếu có
        let availableSlots = slotsResult.availableSlots || [];
        
        if (time) {
          // Parse time và tìm slot gần nhất
          const [hours, minutes] = time.split(':').map(Number);
          const targetTime = hours * 60 + minutes; // Convert to minutes

          availableSlots = availableSlots.filter(slot => {
            const slotStart = new Date(slot.startTime);
            const slotHours = slotStart.getUTCHours() + 7; // Convert to VN time
            const slotMinutes = slotStart.getUTCMinutes();
            const slotTime = slotHours * 60 + slotMinutes;

            // Chọn slot gần nhất trong khoảng ±30 phút
            return Math.abs(slotTime - targetTime) <= 30;
          }).sort((a, b) => {
            // Sort theo độ gần với target time
            const aTime = new Date(a.startTime).getUTCHours() * 60 + new Date(a.startTime).getUTCMinutes();
            const bTime = new Date(b.startTime).getUTCHours() * 60 + new Date(b.startTime).getUTCMinutes();
            const targetMinutes = hours * 60 + minutes;
            return Math.abs(aTime - targetMinutes) - Math.abs(bTime - targetMinutes);
          });
        } else if (timePreference === 'morning') {
          // Filter chỉ lấy slots buổi sáng (8h-12h VN time)
          availableSlots = availableSlots.filter(slot => {
            const slotStart = new Date(slot.startTime);
            const vnHours = slotStart.getUTCHours() + 7;
            return vnHours >= 8 && vnHours < 12;
          });
        } else if (timePreference === 'afternoon') {
          // Filter chỉ lấy slots buổi chiều (14h-18h VN time)
          availableSlots = availableSlots.filter(slot => {
            const slotStart = new Date(slot.startTime);
            const vnHours = slotStart.getUTCHours() + 7;
            return vnHours >= 14 && vnHours < 18;
          });
        }

        if (availableSlots.length === 0) {
          return {
            success: false,
            message: doctorUserId 
              ? 'Bác sĩ này không có slot khả dụng vào thời điểm này'
              : 'Không có slot khả dụng vào thời điểm này',
            slotsResult
          };
        }

        return {
          success: true,
          slotsResult,
          selectedSlot: availableSlots[0], // Chọn slot đầu tiên (gần nhất với yêu cầu)
          doctorScheduleId: slotsResult.scheduleId || null
        };
      }

      // 2. Nếu không có doctorUserId → tìm tất cả doctors có slot
      const doctorsResult = await availableSlotService.getAvailableDoctors({
        serviceId,
        date: new Date(date),
        breakAfterMinutes: 10
      });

      if (!doctorsResult.availableDoctors || doctorsResult.availableDoctors.length === 0) {
        return {
          success: false,
          message: 'Không có bác sĩ nào có slot khả dụng vào ngày này'
        };
      }

      // Chọn doctor đầu tiên và lấy slots của doctor đó
      const firstDoctor = doctorsResult.availableDoctors[0];
      const slotsResult = await availableSlotService.getAvailableSlots({
        doctorUserId: firstDoctor.doctorId,
        serviceId,
        date: new Date(date),
        patientUserId: null, // AI booking không exclude user's own appointments
        breakAfterMinutes: 10
      });

      // Filter theo time preference
      let availableSlots = slotsResult.availableSlots || [];
      if (timePreference === 'morning') {
        availableSlots = availableSlots.filter(slot => {
          const slotStart = new Date(slot.startTime);
          const vnHours = slotStart.getUTCHours() + 7;
          return vnHours >= 8 && vnHours < 12;
        });
      } else if (timePreference === 'afternoon') {
        availableSlots = availableSlots.filter(slot => {
          const slotStart = new Date(slot.startTime);
          const vnHours = slotStart.getUTCHours() + 7;
          return vnHours >= 14 && vnHours < 18;
        });
      }

      if (availableSlots.length === 0) {
        return {
          success: false,
          message: 'Không có slot khả dụng với yêu cầu này',
          slotsResult
        };
      }

      return {
        success: true,
        slotsResult,
        selectedSlot: availableSlots[0],
        doctorUserId: firstDoctor.doctorId,
        doctorScheduleId: slotsResult.scheduleId || null
      };
    } catch (error) {
      console.error('❌ [AI] Error finding slots:', error);
      throw new Error(`Lỗi khi tìm slot khả dụng: ${error.message}`);
    }
  }

  /**
   * Tạo appointment từ AI parsed data
   */
  async createAppointmentFromAI(userPrompt, patientUserId, appointmentFor = 'self') {
    try {
      // 1. Parse prompt
      const parsedData = await this.parseBookingPrompt(userPrompt, patientUserId);

      // 2. Map to IDs
      const mappedData = await this.mapParsedDataToIds(parsedData);

      // 3. Validate required data
      if (!mappedData.serviceId) {
        throw new Error('Không tìm thấy dịch vụ phù hợp. Vui lòng chỉ định rõ dịch vụ bạn muốn đặt lịch.');
      }

      if (!mappedData.date) {
        throw new Error('Không thể xác định ngày đặt lịch. Vui lòng chỉ định rõ ngày (ví dụ: "ngày mai", "15/11").');
      }

      // 4. Find available slots
      const slotsResult = await this.findAvailableSlots(mappedData);

      if (!slotsResult.success) {
        throw new Error(slotsResult.message || 'Không tìm thấy slot khả dụng');
      }

      // 5. Validate và lấy doctorScheduleId nếu chưa có
      if (!slotsResult.doctorScheduleId) {
        // Nếu selectedSlot có doctorScheduleId thì dùng nó
        if (slotsResult.selectedSlot && slotsResult.selectedSlot.doctorScheduleId) {
          slotsResult.doctorScheduleId = slotsResult.selectedSlot.doctorScheduleId;
        } else {
          // Fallback: Lấy từ generateSlotsByDate
          const generateResult = await availableSlotService.generateAvailableSlotsByDate({
            serviceId: mappedData.serviceId,
            date: new Date(mappedData.date),
            breakAfterMinutes: 10,
            patientUserId: null
          });

          if (!generateResult.slots || generateResult.slots.length === 0) {
            throw new Error('Không tìm thấy slot khả dụng vào ngày này');
          }

          // Tìm slot phù hợp với doctor và time
          const targetDoctorId = (slotsResult.doctorUserId || mappedData.doctorUserId)?.toString();
          let selectedSlot = generateResult.slots.find(slot => 
            !targetDoctorId || slot.doctor?.doctorUserId?.toString() === targetDoctorId
          ) || generateResult.slots[0];

          if (selectedSlot && selectedSlot.doctorScheduleId) {
            slotsResult.doctorScheduleId = selectedSlot.doctorScheduleId;
            // Cập nhật selectedSlot nếu chưa có
            if (!slotsResult.selectedSlot) {
              slotsResult.selectedSlot = selectedSlot;
            }
            // Cập nhật doctorUserId nếu chưa có
            if (!slotsResult.doctorUserId && selectedSlot.doctor?.doctorUserId) {
              slotsResult.doctorUserId = selectedSlot.doctor.doctorUserId;
            }
          }
        }
      }

      if (!slotsResult.doctorScheduleId) {
        throw new Error('Không tìm thấy lịch làm việc của bác sĩ vào ngày này');
      }

      // 6. Create appointment
      const appointmentData = {
        patientUserId,
        doctorUserId: slotsResult.doctorUserId || mappedData.doctorUserId,
        serviceId: mappedData.serviceId,
        doctorScheduleId: slotsResult.doctorScheduleId,
        selectedSlot: {
          startTime: slotsResult.selectedSlot.startTime,
          endTime: slotsResult.selectedSlot.endTime
        },
        notes: mappedData.notes,
        appointmentFor: appointmentFor || 'self'
      };

      const appointment = await appointmentService.createConsultationAppointment(appointmentData);

      return {
        success: true,
        appointment,
        parsedData,
        mappedData,
        selectedSlot: slotsResult.selectedSlot
      };
    } catch (error) {
      console.error('❌ [AI] Error creating appointment:', error);
      throw error;
    }
  }
}

module.exports = new AIBookingService();

