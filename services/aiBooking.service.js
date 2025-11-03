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
   * Helper: Check if input indicates "any" or "doesn't matter"
   */
  isAnyOrDoesntMatter(text) {
    const anyKeywords = [
      'bất kỳ', 'bất cứ', 'ai cũng được', 'gì cũng được', 'không quan trọng',
      'tùy', 'tùy ý', 'random', 'any', 'anyone', 'whatever', 'anything',
      'không chọn', 'không cần', 'thôi'
    ];
    const normalized = text.toLowerCase().trim();
    return anyKeywords.some(keyword => normalized.includes(keyword));
  }

  /**
   * Helper: Extract number/index from text (e.g., "số 1", "thứ 2", "1")
   */
  extractIndex(text) {
    const normalized = text.toLowerCase().trim();
    
    // Match patterns: "số 1", "thứ 1", "1", "đầu tiên", "thứ nhất"
    const indexPatterns = [
      /số\s*(\d+)/,
      /thứ\s*(\d+)/,
      /^(\d+)$/,
      /đầu\s*tiên/i,
      /thứ\s*nhất/i,
      /thứ\s*hai/i,
      /thứ\s*ba/i
    ];
    
    for (const pattern of indexPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        if (match[1]) return parseInt(match[1]) - 1; // Convert to 0-indexed
        // Handle text numbers
        if (normalized.includes('đầu') || normalized.includes('nhất')) return 0;
        if (normalized.includes('hai')) return 1;
        if (normalized.includes('ba')) return 2;
      }
    }
    
    return null;
  }

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

      // 3. Build system prompt từ template (Zero-shot - không cần examples)
      // Support both string and array format
      const templateString = Array.isArray(promptConfig.systemPromptTemplate)
        ? promptConfig.systemPromptTemplate.join('\n')
        : promptConfig.systemPromptTemplate;
      
      const systemPrompt = templateString
        .replace('{{SERVICES_LIST}}', JSON.stringify(servicesList, null, 2))
        .replace('{{DOCTORS_LIST}}', JSON.stringify(doctorsList, null, 2));

      // 3.5. Parse ngày hiện tại để AI biết context
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // 4. Gọi OpenAI API với context về ngày
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
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

      // 2. Handle different user intents
      const intent = parsedData.userIntent;

      // Handle greeting
      if (intent === 'greeting') {
        // Chỉ chào và hỏi có muốn đặt lịch không, KHÔNG hiển thị list services ngay
        const greetingMessage = parsedData.followUpQuestion || 'Xin chào! Mình có thể giúp bạn đặt lịch khám răng. Bạn có muốn đặt lịch không ạ?';
        
        return {
          success: false,
          needsMoreInfo: true,
          userIntent: 'greeting',
          followUpQuestion: greetingMessage,
          parsedData
        };
      }

      // ✅ Handle affirmative (Đồng ý/Xác nhận) - User trả lời "có", "ok", "được"... 
      // → Tự động chuyển sang hỏi ngày
      if (intent === 'affirmative') {
        console.log('✅ [AI] Detected affirmative intent → Ask for date');
        return {
          success: false,
          needsMoreInfo: true,
          userIntent: 'affirmative',
          missingFields: ['date'],
          followUpQuestion: 'Bạn muốn đặt lịch vào ngày nào ạ? (Ví dụ: ngày mai, hôm nay, thứ 3 tuần sau, 15/11...)',
          parsedData
        };
      }

      // Handle rejection/goodbye
      if (intent === 'rejection' || intent === 'goodbye') {
        return {
          success: false,
          isConversationEnd: true,
          userIntent: intent,
          followUpQuestion: parsedData.followUpQuestion || 'Dạ được ạ! Hẹn gặp lại bạn. Chúc bạn một ngày tốt lành! 😊',
          parsedData
        };
      }

      // Handle ambiguous input
      if (intent === 'ambiguous') {
        return {
          success: false,
          needsMoreInfo: true,
          userIntent: 'ambiguous',
          followUpQuestion: parsedData.followUpQuestion || 'Mình chưa hiểu rõ yêu cầu của bạn. Bạn muốn đặt lịch khám răng không ạ?',
          parsedData
        };
      }

      // Handle off-topic (invalid input)
      if (parsedData.isValidInput === false || intent === 'off_topic') {
        return {
          success: false,
          isInvalidInput: true,
          userIntent: 'off_topic',
          rejectionReason: parsedData.rejectionReason || 'Xin lỗi, mình chỉ hỗ trợ đặt lịch khám răng và các dịch vụ nha khoa thôi ạ.',
          parsedData
        };
      }

      // 3. Check if AI needs more info (multi-turn conversation) - for booking intent
      // ƯU TIÊN theo thứ tự: Ngày → Dịch vụ → Bác sĩ → Giờ
      if (parsedData.needsMoreInfo) {
        let enrichedQuestion = parsedData.followUpQuestion || 'Bạn có thể cung cấp thêm thông tin không?';
        
        // ⚠️ PRE-VALIDATION: Nếu user ĐÃ cung cấp doctorName hoặc serviceName trong input ban đầu
        // → Validate NGAY xem có tồn tại trong hệ thống không, TRƯỚC KHI hỏi các field còn thiếu
        
        // 🔍 Validate bác sĩ (nếu user đã cung cấp)
        if (parsedData.doctorName) {
          console.log(`🔍 [PRE-VALIDATION] Checking if doctor "${parsedData.doctorName}" exists...`);
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('fullName specialization')
            .lean();
          
          const matchedDoctors = doctors.filter(d => 
            d.fullName.toLowerCase().includes(parsedData.doctorName.toLowerCase())
          );
          
          // ❌ Nếu KHÔNG TÌM THẤY bác sĩ nào
          if (matchedDoctors.length === 0) {
            console.log(`❌ [PRE-VALIDATION] Doctor "${parsedData.doctorName}" NOT FOUND!`);
            let doctorsList = '\n\n📋 Các bác sĩ khả dụng:\n';
            doctors.forEach((d, idx) => {
              const spec = d.specialization ? ` (${d.specialization})` : '';
              doctorsList += `  ${idx + 1}. ${d.fullName}${spec}\n`;
            });
            doctorsList += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập tên bác sĩ.';
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['doctorName'],
              followUpQuestion: `Xin lỗi, mình không tìm thấy bác sĩ "${parsedData.doctorName}" trong hệ thống. Bạn muốn chọn bác sĩ nào trong danh sách sau ạ?${doctorsList}`,
              parsedData: { ...parsedData, doctorName: null } // Reset doctorName
            };
          }
          
          // ⚠️ Nếu tìm thấy NHIỀU bác sĩ match (ví dụ: user nhập "Huy" có 4 bác sĩ)
          if (matchedDoctors.length > 1) {
            console.log(`⚠️ [PRE-VALIDATION] Found ${matchedDoctors.length} doctors matching "${parsedData.doctorName}"`);
            enrichedQuestion = `Mình thấy có ${matchedDoctors.length} bác sĩ có tên liên quan đến "${parsedData.doctorName}". Bạn muốn chọn bác sĩ nào cụ thể ạ?\n\n📋 Các bác sĩ khả dụng:\n`;
            matchedDoctors.forEach((d, idx) => {
              const spec = d.specialization ? ` (${d.specialization})` : '';
              enrichedQuestion += `  ${idx + 1}. ${d.fullName}${spec}\n`;
            });
            enrichedQuestion += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập tên bác sĩ đầy đủ.';
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['doctorName'],
              followUpQuestion: enrichedQuestion,
              parsedData
            };
          }
          
          // ✅ Nếu chỉ tìm thấy 1 bác sĩ → OK, tiếp tục flow
          console.log(`✅ [PRE-VALIDATION] Doctor "${matchedDoctors[0].fullName}" found!`);
        }
        
        // 🔍 Validate dịch vụ (nếu user đã cung cấp TÊN CHÍNH XÁC)
        if (parsedData.serviceName && !parsedData.serviceCategory) {
          console.log(`🔍 [PRE-VALIDATION] Checking if service "${parsedData.serviceName}" exists...`);
          const services = await Service.find({ status: 'Active' })
            .select('serviceName category')
            .lean();
          
          const matchedServices = services.filter(s => 
            s.serviceName.toLowerCase().includes(parsedData.serviceName.toLowerCase())
          );
          
          // ❌ Nếu KHÔNG TÌM THẤY dịch vụ nào
          if (matchedServices.length === 0) {
            console.log(`❌ [PRE-VALIDATION] Service "${parsedData.serviceName}" NOT FOUND!`);
            
            // Group by category
            const groupedServices = {};
            services.forEach(s => {
              const category = s.category || 'Khác';
              if (!groupedServices[category]) {
                groupedServices[category] = [];
              }
              groupedServices[category].push(s.serviceName);
            });
            
            const categoryMap = {
              'Consultation': '💬 Tư vấn online',
              'Examination': '🏥 Khám trực tiếp',
              'Treatment': '⚕️ Điều trị',
              'Cosmetic': '✨ Thẩm mỹ',
              'Surgery': '🔬 Phẫu thuật',
              'Orthodontics': '🦷 Niềng răng',
              'Prevention': '🛡️ Phòng ngừa'
            };
            
            let servicesList = '';
            Object.keys(groupedServices).forEach(category => {
              if (groupedServices[category].length > 0) {
                const displayName = categoryMap[category] || `📋 ${category}`;
                servicesList += `\n${displayName}:\n`;
                groupedServices[category].forEach(name => {
                  servicesList += `  • ${name}\n`;
                });
              }
            });
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['serviceName'],
              followUpQuestion: `Xin lỗi, mình không tìm thấy dịch vụ "${parsedData.serviceName}" trong hệ thống. Bạn muốn đặt lịch dịch vụ nào ạ?\n\nCác dịch vụ của chúng tôi:${servicesList}`,
              parsedData: { ...parsedData, serviceName: null } // Reset serviceName
            };
          }
        }
        
        // BƯỚC 1: Ưu tiên hỏi NGÀY trước tiên
        if (parsedData.missingFields && parsedData.missingFields.includes('date')) {
          enrichedQuestion = 'Bạn muốn đặt lịch vào ngày nào ạ? (Ví dụ: ngày mai, hôm nay, thứ 3 tuần sau, 15/11...)';
          
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['date'],
            followUpQuestion: enrichedQuestion,
            parsedData
          };
        }
        
        // BƯỚC 2: Nếu có ngày rồi, mới hỏi DỊCH VỤ
        if (parsedData.missingFields && parsedData.missingFields.includes('serviceName')) {
          // Lấy tất cả dịch vụ active
          let services = await Service.find({ status: 'Active' })
            .select('serviceName category')
            .sort({ category: 1, serviceName: 1 })
            .lean();
          
          // Fuzzy matching: Nếu user nhập từ khóa chung (ví dụ: "răng"), filter các dịch vụ liên quan
          // ✅ PRIORITY 1: Nếu AI đã parse được serviceCategory (ví dụ: "khám" → "Examination")
          let keyword = null;
          if (parsedData.serviceCategory) {
            console.log(`✅ [AI] User specified category: ${parsedData.serviceCategory}`);
            const filteredServices = services.filter(s => s.category === parsedData.serviceCategory);
            
            if (filteredServices.length > 0) {
              services = filteredServices;
              const categoryMap = {
                'Consultation': 'Tư vấn online',
                'Examination': 'Khám trực tiếp'
              };
              const categoryName = categoryMap[parsedData.serviceCategory] || parsedData.serviceCategory;
              enrichedQuestion = `Bạn muốn đặt lịch dịch vụ ${categoryName} nào ạ? Các dịch vụ ${categoryName}:`;
            }
          }
          // ✅ PRIORITY 2: Fuzzy matching với từ khóa từ userPrompt (nếu không có serviceCategory)
          else {
            const userInput = userPrompt.toLowerCase().trim();
            const keywords = [
              'răng', 'tẩy', 'trồng', 'nhổ', 'niềng', 'bọc', 
              'làm sạch', 'tím', 'hàm', 'sâu', 'trắng',
              'điều trị', 'phục hồi', 'mặt', 'lắc', 'tủy', 'chỉnh nha',
              'thẩm mỹ', 'phòng ngừa', 'cao vôi'
            ];
            
            // Check xem user có nhập từ khóa chung không
            for (const kw of keywords) {
              if (userInput.includes(kw)) {
                keyword = kw;
                break;
              }
            }
            
            // Nếu có từ khóa, filter services
            if (keyword && services.length > 0) {
              const filteredServices = services.filter(s => 
                s.serviceName.toLowerCase().includes(keyword)
              );
              
              // Nếu tìm thấy nhiều dịch vụ liên quan
              if (filteredServices.length > 1) {
                services = filteredServices;
                enrichedQuestion = `Bạn muốn đặt lịch dịch vụ nào ạ? Các dịch vụ liên quan đến "${keyword}":`;
              }
              // Nếu chỉ có 1 dịch vụ match, AI sẽ tự chọn (không vào đây)
              else if (filteredServices.length === 1) {
                // Let AI auto-select this service in the next turn
                services = filteredServices;
                enrichedQuestion = `Bạn có muốn đặt lịch dịch vụ "${filteredServices[0].serviceName}" không ạ?`;
              }
            }
          }
          
          if (services && services.length > 0) {
            // Map category sang tên tiếng Việt thân thiện
            const categoryMap = {
              'Consultation': '💬 Tư vấn online',
              'Examination': '🏥 Khám trực tiếp',
              'Treatment': '⚕️ Điều trị',
              'Cosmetic': '✨ Thẩm mỹ',
              'Surgery': '🔬 Phẫu thuật',
              'Orthodontics': '🦷 Niềng răng',
              'Prevention': '🛡️ Phòng ngừa'
            };
            
            // Group by category (nếu có)
            const groupedServices = {};
            services.forEach(s => {
              const category = s.category || 'Khác';
              if (!groupedServices[category]) {
                groupedServices[category] = [];
              }
              groupedServices[category].push(s.serviceName);
            });
            
            // Format with category headers (tiếng Việt)
            let servicesList = '';
            Object.keys(groupedServices).forEach(category => {
              if (groupedServices[category].length > 0) {
                // Dùng tên tiếng Việt nếu có, không thì giữ nguyên
                const displayName = categoryMap[category] || `📋 ${category}`;
                servicesList += `\n${displayName}:\n`;
                groupedServices[category].forEach(name => {
                  servicesList += `  • ${name}\n`;
                });
              }
            });
            
            // Chỉ override enrichedQuestion nếu chưa được set bởi fuzzy matching
            if (!keyword) {
              enrichedQuestion = `Bạn muốn đặt lịch dịch vụ nào ạ?\n\nCác dịch vụ của chúng tôi:${servicesList}`;
            } else {
              // Đã filter rồi, append servicesList
              enrichedQuestion += servicesList;
            }
          }
          
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['serviceName'],
            followUpQuestion: enrichedQuestion,
            parsedData
          };
        }
        
        // BƯỚC 3: Nếu có date + service, nhưng thiếu bác sĩ → Hiển thị list bác sĩ available
        if (parsedData.missingFields && parsedData.missingFields.includes('doctorName')) {
          // Map data để lấy serviceId và date
          const tempMappedData = await this.mapParsedDataToIds(parsedData);
          
          if (tempMappedData.serviceId && tempMappedData.date) {
            // Fetch available doctors for this service + date
            let doctors = await User.find({ role: 'Doctor', status: 'Active' })
              .select('fullName specialization')
              .lean();
            
            // Fuzzy matching: Nếu user nhập từ khóa chung về bác sĩ (ví dụ: "Huy đê" có chữ "Huy")
            const userInput = userPrompt.toLowerCase().trim();
            let matchedDoctors = null;
            let keyword = null;
            
            // Check xem user có nhập keyword nào liên quan đến tên bác sĩ không
            for (const doctor of doctors) {
              const doctorNameParts = doctor.fullName.toLowerCase().split(' ');
              for (const part of doctorNameParts) {
                if (part.length >= 2 && userInput.includes(part)) {
                  keyword = part;
                  break;
                }
              }
              if (keyword) break;
            }
            
            // Nếu có keyword, filter doctors
            if (keyword) {
              matchedDoctors = doctors.filter(d => 
                d.fullName.toLowerCase().includes(keyword)
              );
              
              // Nếu tìm thấy nhiều bác sĩ có cùng keyword (ví dụ: 4 bác sĩ "Huy")
              if (matchedDoctors.length > 1) {
                doctors = matchedDoctors;
                enrichedQuestion = `Mình thấy có ${matchedDoctors.length} bác sĩ có tên "${keyword}". Bạn muốn chọn bác sĩ nào cụ thể ạ?\n\n📋 Các bác sĩ khả dụng:\n`;
                matchedDoctors.forEach(d => {
                  const spec = d.specialization ? ` (${d.specialization})` : '';
                  enrichedQuestion += `  • ${d.fullName}${spec}\n`;
                });
                
                return {
                  success: false,
                  needsMoreInfo: true,
                  missingFields: ['doctorName'],
                  followUpQuestion: enrichedQuestion,
                  parsedData
                };
              }
              // Nếu chỉ có 1 bác sĩ match
              else if (matchedDoctors.length === 1) {
                enrichedQuestion = `Bạn có muốn chọn bác sĩ "${matchedDoctors[0].fullName}" không ạ?`;
                
                return {
                  success: false,
                  needsMoreInfo: true,
                  missingFields: ['doctorName'],
                  followUpQuestion: enrichedQuestion,
                  parsedData
                };
              }
            }
            
            // Trường hợp chung: Hiển thị tất cả bác sĩ
            if (doctors && doctors.length > 0) {
              let doctorsList = '\n\n📋 Các bác sĩ khả dụng:\n';
              doctors.forEach(d => {
                const spec = d.specialization ? ` (${d.specialization})` : '';
                doctorsList += `  • ${d.fullName}${spec}\n`;
              });
              
              enrichedQuestion = `Bạn muốn chọn bác sĩ nào ạ?${doctorsList}`;
            } else {
              enrichedQuestion = 'Bạn muốn chọn bác sĩ nào ạ?';
            }
          }
          
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['doctorName'],
            followUpQuestion: enrichedQuestion,
            parsedData
          };
        }
        
        // BƯỚC 4: Nếu có date + service + doctor, nhưng thiếu giờ → Hiển thị slots available
        if (parsedData.missingFields && parsedData.missingFields.includes('time')) {
          // Map data để lấy đầy đủ thông tin
          const tempMappedData = await this.mapParsedDataToIds(parsedData);
          
          if (tempMappedData.serviceId && tempMappedData.date && tempMappedData.doctorId) {
            // Fetch available slots for this doctor + date + service
            // ✅ EXCLUDE slots mà bệnh nhân này đã đặt để tránh trùng lịch
            const slotsResult = await availableSlotService.generateAvailableSlotsByDate({
              date: tempMappedData.date,
              serviceId: tempMappedData.serviceId,
              doctorId: tempMappedData.doctorId,
              patientUserId: patientUserId  // Exclude slots của chính bệnh nhân này
            });
            
            if (slotsResult.success && slotsResult.data && slotsResult.data.length > 0) {
              let slotsList = '\n\n🕐 Các khung giờ khả dụng:\n';
              
              // Group by morning/afternoon
              const morningSlots = slotsResult.data.filter(s => {
                const hour = parseInt(s.startTime.split(':')[0]);
                return hour < 12;
              });
              const afternoonSlots = slotsResult.data.filter(s => {
                const hour = parseInt(s.startTime.split(':')[0]);
                return hour >= 12;
              });
              
              if (morningSlots.length > 0) {
                slotsList += '  🌅 Buổi sáng:\n';
                morningSlots.forEach(s => {
                  slotsList += `    • ${s.startTime} - ${s.endTime}\n`;
                });
              }
              
              if (afternoonSlots.length > 0) {
                slotsList += '  🌆 Buổi chiều:\n';
                afternoonSlots.forEach(s => {
                  slotsList += `    • ${s.startTime} - ${s.endTime}\n`;
                });
              }
              
              enrichedQuestion = `Bạn muốn đặt lịch vào giờ nào ạ?${slotsList}`;
            } else {
              enrichedQuestion = 'Xin lỗi, không có khung giờ nào khả dụng cho bác sĩ này vào ngày đã chọn. Bạn có muốn chọn bác sĩ khác không?';
            }
          }
          
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['time'],
            followUpQuestion: enrichedQuestion,
            parsedData
          };
        }
        
        // Fallback: Nếu vẫn cần thông tin khác
        return {
          success: false,
          needsMoreInfo: true,
          missingFields: parsedData.missingFields || [],
          followUpQuestion: enrichedQuestion,
          parsedData
        };
      }

      // 4. Map to IDs
      const mappedData = await this.mapParsedDataToIds(parsedData);

      // 5. Validate required data (double-check theo thứ tự: Ngày → Dịch vụ → Bác sĩ → Giờ)
      // BƯỚC 1: Validate ngày
      if (!mappedData.date) {
        return {
          success: false,
          needsMoreInfo: true,
          missingFields: ['date'],
          followUpQuestion: 'Bạn muốn đặt lịch vào ngày nào ạ? (Ví dụ: ngày mai, hôm nay, thứ 3 tuần sau, 15/11...)',
          parsedData
        };
      }

      // BƯỚC 2: Validate dịch vụ
      if (!mappedData.serviceId) {
        return {
          success: false,
          needsMoreInfo: true,
          missingFields: ['serviceName'],
          followUpQuestion: 'Xin lỗi, mình không tìm thấy dịch vụ phù hợp. Bạn muốn đặt lịch dịch vụ nào ạ? (Khám răng, Nhổ răng, Trám răng, Tư vấn...)',
          parsedData
        };
      }

      // BƯỚC 3: Validate bác sĩ
      if (!mappedData.doctorId) {
        let doctors = await User.find({ role: 'Doctor', status: 'Active' })
          .select('fullName specialization')
          .lean();
        
        // ✅ Smart Detection cho input bác sĩ
        const userInput = userPrompt.toLowerCase().trim();
        let enrichedQuestion = '';
        
        // 1. Check "bất kỳ" / "ai cũng được" → Auto-select first doctor
        if (this.isAnyOrDoesntMatter(userInput)) {
          console.log('✅ [AI] User chose "any doctor" → Auto-select first doctor');
          // Set doctorId thành doctor đầu tiên
          const firstDoctor = doctors[0];
          mappedData.doctorId = firstDoctor._id.toString();
          mappedData.doctorName = firstDoctor.fullName;
          
          // Skip doctor selection, move to time
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['time'],
            followUpQuestion: `Đã chọn bác sĩ ${firstDoctor.fullName}. Bạn muốn đặt lịch vào giờ nào ạ?`,
            parsedData: { ...parsedData, doctorName: firstDoctor.fullName }
          };
        }
        
        // 2. Check số thứ tự (1, 2, 3, đầu tiên, thứ hai...)
        const index = this.extractIndex(userInput);
        if (index !== null && index >= 0 && index < doctors.length) {
          console.log(`✅ [AI] User chose doctor by index: ${index + 1}`);
          const selectedDoctor = doctors[index];
          mappedData.doctorId = selectedDoctor._id.toString();
          mappedData.doctorName = selectedDoctor.fullName;
          
          // Skip doctor selection, move to time
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['time'],
            followUpQuestion: `Đã chọn bác sĩ ${selectedDoctor.fullName}. Bạn muốn đặt lịch vào giờ nào ạ?`,
            parsedData: { ...parsedData, doctorName: selectedDoctor.fullName }
          };
        }
        
        // 3. Fuzzy matching: Nếu user đã nhập tên (ví dụ: "Huy đê")
        if (parsedData.doctorName) {
          const inputKeyword = parsedData.doctorName.toLowerCase().trim();
          const matchedDoctors = doctors.filter(d => 
            d.fullName.toLowerCase().includes(inputKeyword)
          );
          
          // Nếu có nhiều bác sĩ match (ví dụ: 4 bác sĩ "Huy")
          if (matchedDoctors.length > 1) {
            doctors = matchedDoctors;
            enrichedQuestion = `Mình thấy có ${matchedDoctors.length} bác sĩ có tên liên quan đến "${parsedData.doctorName}". Bạn muốn chọn bác sĩ nào cụ thể ạ?\n\n📋 Các bác sĩ khả dụng:\n`;
            matchedDoctors.forEach((d, idx) => {
              const spec = d.specialization ? ` (${d.specialization})` : '';
              enrichedQuestion += `  ${idx + 1}. ${d.fullName}${spec}\n`;
            });
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['doctorName'],
              followUpQuestion: enrichedQuestion,
              parsedData
            };
          }
          // Nếu chỉ có 1 bác sĩ match → Auto-select
          else if (matchedDoctors.length === 1) {
            const selectedDoctor = matchedDoctors[0];
            mappedData.doctorId = selectedDoctor._id.toString();
            mappedData.doctorName = selectedDoctor.fullName;
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['time'],
              followUpQuestion: `Đã chọn bác sĩ ${selectedDoctor.fullName}. Bạn muốn đặt lịch vào giờ nào ạ?`,
              parsedData: { ...parsedData, doctorName: selectedDoctor.fullName }
            };
          }
          // ⚠️ Nếu KHÔNG TÌM THẤY bác sĩ nào (bác sĩ không tồn tại trong hệ thống)
          else if (matchedDoctors.length === 0) {
            console.log(`⚠️ [AI] Doctor "${parsedData.doctorName}" NOT FOUND in system → Ask again`);
            enrichedQuestion = `Xin lỗi, mình không tìm thấy bác sĩ "${parsedData.doctorName}" trong hệ thống. Bạn muốn chọn bác sĩ nào trong danh sách sau ạ?\n\n📋 Các bác sĩ khả dụng:\n`;
            doctors.forEach((d, idx) => {
              const spec = d.specialization ? ` (${d.specialization})` : '';
              enrichedQuestion += `  ${idx + 1}. ${d.fullName}${spec}\n`;
            });
            enrichedQuestion += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập tên bác sĩ.';
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['doctorName'],
              followUpQuestion: enrichedQuestion,
              parsedData
            };
          }
        }
        
        // 4. Backup fuzzy matching: Nếu AI không parse được doctorName, nhưng userInput có keyword
        // → Thử fuzzy match với userInput luôn (ví dụ: user chỉ nhập "huy", "hiếu"...)
        const userKeywords = userInput.split(/\s+/).filter(w => w.length >= 2 && !['bác', 'sĩ', 'doctor', 'dr', 'bs'].includes(w));
        if (userKeywords.length > 0) {
          const matchedDoctors = doctors.filter(d => 
            userKeywords.some(keyword => d.fullName.toLowerCase().includes(keyword))
          );
          
          // Nếu tìm thấy doctors match với keyword từ userInput
          if (matchedDoctors.length > 1) {
            console.log(`✅ [AI] Found ${matchedDoctors.length} doctors matching userInput keywords: ${userKeywords.join(', ')}`);
            enrichedQuestion = `Mình thấy có ${matchedDoctors.length} bác sĩ phù hợp. Bạn muốn chọn bác sĩ nào cụ thể ạ?\n\n📋 Các bác sĩ khả dụng:\n`;
            matchedDoctors.forEach((d, idx) => {
              const spec = d.specialization ? ` (${d.specialization})` : '';
              enrichedQuestion += `  ${idx + 1}. ${d.fullName}${spec}\n`;
            });
            enrichedQuestion += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập tên bác sĩ đầy đủ.';
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['doctorName'],
              followUpQuestion: enrichedQuestion,
              parsedData
            };
          }
          // Nếu chỉ có 1 bác sĩ match → Auto-select
          else if (matchedDoctors.length === 1) {
            console.log(`✅ [AI] Auto-select doctor from userInput keyword: ${matchedDoctors[0].fullName}`);
            const selectedDoctor = matchedDoctors[0];
            mappedData.doctorId = selectedDoctor._id.toString();
            mappedData.doctorName = selectedDoctor.fullName;
            
            return {
              success: false,
              needsMoreInfo: true,
              missingFields: ['time'],
              followUpQuestion: `Đã chọn bác sĩ ${selectedDoctor.fullName}. Bạn muốn đặt lịch vào giờ nào ạ?`,
              parsedData: { ...parsedData, doctorName: selectedDoctor.fullName }
            };
          }
        }
        
        // Trường hợp chung: Hiển thị tất cả bác sĩ với số thứ tự
        let doctorsList = '';
        if (doctors && doctors.length > 0) {
          doctorsList = '\n\n📋 Các bác sĩ khả dụng:\n';
          doctors.forEach((d, idx) => {
            const spec = d.specialization ? ` (${d.specialization})` : '';
            doctorsList += `  ${idx + 1}. ${d.fullName}${spec}\n`;
          });
          doctorsList += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập tên bác sĩ.';
        }
        
        return {
          success: false,
          needsMoreInfo: true,
          missingFields: ['doctorName'],
          followUpQuestion: `Bạn muốn chọn bác sĩ nào ạ?${doctorsList}`,
          parsedData
        };
      }

      // BƯỚC 4: Validate giờ
      if (!mappedData.time) {
        // Fetch available slots
        // ✅ EXCLUDE slots mà bệnh nhân này đã đặt để tránh trùng lịch
        const slotsResult = await availableSlotService.generateAvailableSlotsByDate({
          date: mappedData.date,
          serviceId: mappedData.serviceId,
          doctorId: mappedData.doctorId,
          patientUserId: patientUserId  // Exclude slots của chính bệnh nhân này
        });
        
        const userInput = userPrompt.toLowerCase().trim();
        
        if (slotsResult.success && slotsResult.data && slotsResult.data.length > 0) {
          const allSlots = slotsResult.data;
          const morningSlots = allSlots.filter(s => parseInt(s.startTime.split(':')[0]) < 12);
          const afternoonSlots = allSlots.filter(s => parseInt(s.startTime.split(':')[0]) >= 12);
          
          // ✅ 1. Check "bất kỳ" / "ai cũng được" → Auto-select first slot
          if (this.isAnyOrDoesntMatter(userInput)) {
            console.log('✅ [AI] User chose "any time" → Auto-select first slot');
            const firstSlot = allSlots[0];
            mappedData.time = firstSlot.startTime;
            
            // Continue to create appointment
            return this.createAppointmentFromAI(
              `Đặt lịch ${mappedData.date} ${firstSlot.startTime}`,
              patientUserId,
              appointmentFor
            );
          }
          
          // ✅ 2. Check "buổi sáng" → Auto-select first morning slot
          if (userInput.includes('sáng') || userInput.includes('morning')) {
            if (morningSlots.length > 0) {
              console.log('✅ [AI] User chose "morning" → Auto-select first morning slot');
              mappedData.time = morningSlots[0].startTime;
              mappedData.timePreference = 'morning';
              
              // Continue to create appointment
              return this.createAppointmentFromAI(
                `Đặt lịch ${mappedData.date} ${morningSlots[0].startTime}`,
                patientUserId,
                appointmentFor
              );
            }
          }
          
          // ✅ 3. Check "buổi chiều" → Auto-select first afternoon slot
          if (userInput.includes('chiều') || userInput.includes('afternoon')) {
            if (afternoonSlots.length > 0) {
              console.log('✅ [AI] User chose "afternoon" → Auto-select first afternoon slot');
              mappedData.time = afternoonSlots[0].startTime;
              mappedData.timePreference = 'afternoon';
              
              // Continue to create appointment
              return this.createAppointmentFromAI(
                `Đặt lịch ${mappedData.date} ${afternoonSlots[0].startTime}`,
                patientUserId,
                appointmentFor
              );
            }
          }
          
          // ✅ 4. Check số thứ tự (1, 2, 3, đầu tiên...)
          const index = this.extractIndex(userInput);
          if (index !== null && index >= 0 && index < allSlots.length) {
            console.log(`✅ [AI] User chose slot by index: ${index + 1}`);
            const selectedSlot = allSlots[index];
            mappedData.time = selectedSlot.startTime;
            
            // Continue to create appointment
            return this.createAppointmentFromAI(
              `Đặt lịch ${mappedData.date} ${selectedSlot.startTime}`,
              patientUserId,
              appointmentFor
            );
          }
          
          // 5. Hiển thị danh sách slots với số thứ tự
          let slotsList = '\n\n🕐 Các khung giờ khả dụng:\n';
          
          if (morningSlots.length > 0) {
            slotsList += '  🌅 Buổi sáng:\n';
            morningSlots.forEach((s, idx) => {
              slotsList += `    ${idx + 1}. ${s.startTime} - ${s.endTime}\n`;
            });
          }
          
          if (afternoonSlots.length > 0) {
            const offset = morningSlots.length;
            slotsList += '  🌆 Buổi chiều:\n';
            afternoonSlots.forEach((s, idx) => {
              slotsList += `    ${offset + idx + 1}. ${s.startTime} - ${s.endTime}\n`;
            });
          }
          
          slotsList += '\nBạn có thể chọn theo số thứ tự (1, 2, 3...) hoặc nhập giờ cụ thể (ví dụ: 9h, 14h).';
          
          return {
            success: false,
            needsMoreInfo: true,
            missingFields: ['time'],
            followUpQuestion: `Bạn muốn đặt lịch vào giờ nào ạ?${slotsList}`,
            parsedData
          };
        }
        
        return {
          success: false,
          needsMoreInfo: true,
          missingFields: ['time'],
          followUpQuestion: 'Xin lỗi, không có khung giờ nào khả dụng. Bạn có muốn chọn bác sĩ khác không?',
          parsedData
        };
      }

      // 6. Find available slots
      const slotsResult = await this.findAvailableSlots(mappedData);

      if (!slotsResult.success) {
        throw new Error(slotsResult.message || 'Không tìm thấy slot khả dụng');
      }

      // 7. Validate và lấy doctorScheduleId nếu chưa có
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

      // 8. Create appointment
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

