const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const DoctorSchedule = require('../models/doctorSchedule.model');
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const Customer = require('../models/customer.model');
const availableSlotService = require('./availableSlot.service');
const appointmentService = require('./appointment.service');
const leaveRequestService = require('./leaveRequest.service');
const { calculateServicePrice } = require('../utils/promotionHelper');
const ScheduleHelper = require('../utils/scheduleHelper');
const DateHelper = require('../utils/dateHelper');

// Initialize OpenAI client
// ⭐ Timeout được config ở client level (nếu cần), không phải request level
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 seconds timeout cho tất cả requests
});

// ⭐ AI Model Configuration - TẤT CẢ API calls đều dùng model này
const AI_MODEL = 'gpt-4o-mini'; 

// Load function tools configuration
const toolsConfigPath = path.join(__dirname, '../config/aiBooking.tools.json');
const toolsConfig = JSON.parse(fs.readFileSync(toolsConfigPath, 'utf8'));

const FUNCTIONS_REQUIRING_DATE_VALIDATION = new Set([
  'get_available_slots',
  'check_appointment_conflict',
  'create_appointment',
  'get_doctors'
]);

const DATE_VALIDATION_MODEL = process.env.AI_DATE_MODEL || AI_MODEL;

const DATE_VALIDATION_SYSTEM_PROMPT = `
Bạn là trợ lý chuyên kiểm tra và chuẩn hóa NGÀY THÁNG bằng tiếng Việt.
- Luôn suy luận ở timezone Asia/Ho_Chi_Minh.
- Payload user gửi là JSON; trong đó có inputText (nguyên văn người dùng), today/tomorrow/dayAfterTomorrow/nextWeekSameDay (định dạng YYYY-MM-DD), now (ISO), latestUserPrompt và historySnippet.
- Nhiệm vụ: diễn giải inputText thành ngày tuyệt đối định dạng YYYY-MM-DD nếu có thể.
- normalizedDate PHẢI ở dạng YYYY-MM-DD để hệ thống nội bộ sử dụng, nhưng mọi message/hướng dẫn trong phản hồi phải yêu cầu người dùng nhập và hiểu ngày theo định dạng DD/MM/YYYY (ví dụ: 05/11/2025). Không bao giờ bảo người dùng nhập theo YYYY-MM-DD.
- Nếu cụm từ là quan hệ (\"ngày mai\", \"thứ 5 tuần sau\"...), sử dụng giá trị trong payload để tính ngày chính xác.
- ⚠️ QUAN TRỌNG: Nếu người dùng chỉ nói \"tuần sau\", \"tuần tới\", \"mỗi tuần sau\" hoặc \"mỗi tuần tới\" mà KHÔNG có thứ cụ thể (ví dụ: \"thứ 2 tuần sau\", \"thứ 5 tuần sau\") → PHẢI trả về status=ambiguous, requiresClarification=true, normalizedDate=null. KHÔNG được tự động chọn ngày (ví dụ: không được dùng nextWeekSameDay).
- Nếu người dùng nói \"tuần sau\", \"mỗi tuần sau\" kèm theo thứ cụ thể (ví dụ: \"thứ 2 tuần sau\", \"thứ 5 tuần sau\") → tính ngày chính xác và trả về status=valid với normalizedDate.
- Nếu ngày không tồn tại (ví dụ 30/02) → status=invalid, requiresClarification=true.
- Nếu ngày hợp lệ nhưng nhỏ hơn today (trong quá khứ) → status=past, requiresClarification=true.
- Không dùng dữ liệu ngoài payload, không dùng RAG.
- Luôn trả kết quả dưới dạng function call commit_date_validation, không trả lời tự do.
`.trim();

const DATE_VALIDATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'commit_date_validation',
      description: 'Chuẩn hóa ngày tháng sang YYYY-MM-DD và mô tả tình trạng hợp lệ/không hợp lệ',
      parameters: {
        type: 'object',
        properties: {
          originalInputEcho: {
            type: 'string',
            description: 'Nguyên văn cụm từ ngày tháng mà người dùng nhập'
          },
          normalizedDate: {
            type: ['string', 'null'],
            description: 'Ngày chuẩn hóa dạng YYYY-MM-DD nếu hợp lệ, ngược lại để null'
          },
          status: {
            type: 'string',
            enum: ['valid', 'ambiguous', 'invalid', 'past'],
            description: 'Trạng thái diễn giải ngày'
          },
          requiresClarification: {
            type: 'boolean',
            description: 'true nếu cần hỏi lại người dùng'
          },
          message: {
            type: 'string',
            description: 'Giải thích ngắn gọn (tiếng Việt) để trợ lý thông báo lại cho người dùng'
          }
        },
        required: ['originalInputEcho', 'status', 'requiresClarification']
      }
    }
  }
];

const CONTEXT_STOP_WORDS = new Set([
  'vao', 'vào', 'ngay', 'ngày', 'hom', 'hôm', 'nay', 'mai',
  'luc', 'lúc', 'gio', 'giờ', 'buoi', 'buổi', 'sang', 'sáng',
  'chieu', 'chiều', 'toi', 'tối', 'trua', 'trưa', 'den', 'đến',
  'tu', 'từ', 'thoi', 'thời', 'khung', 'gio', 'giờ', 'luc', 'lúc',
  'vao', 'vào', 'khoang', 'khoảng'
].map(word => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

const WORKING_HOUR_FIELDS = [
  'morningStart',
  'morningEnd',
  'afternoonStart',
  'afternoonEnd'
];

const hasCompleteWorkingHours = (workingHours) => {
  if (!workingHours) return false;
  return WORKING_HOUR_FIELDS.every(field => {
    const value = workingHours[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
};

class AIBookingService {
  
  constructor() {
    this.serviceKeywordCache = {
      keywords: [],
      lastFetched: 0,
      refreshing: false
    };
    
    this.defaultServiceKeywords = [
      'khám tổng quát',
      'bọc răng',
      'gắn đinh trồng răng',
      'làm sạch răng',
      'lấy tủy',
      'mài răng',
      'nhổ răng',
      'trồng răng hàm',
      'tẩy trắng răng'
    ];
    
    // Load service keywords from DB at startup (non-blocking)
    this.refreshServiceKeywordCache().catch(err => {
      console.error('❌ [AI Booking] Failed to warm service keyword cache:', err?.message || err);
    });
  }
  
  async refreshServiceKeywordCache(force = false) {
    if (this.serviceKeywordCache.refreshing) {
      return;
    }
    
    this.serviceKeywordCache.refreshing = true;
    try {
      const services = await Service.find({ status: 'Active' })
        .select('serviceName name aliases keywords displayName')
        .lean();
      
      const keywordSet = new Set();
      services.forEach(service => {
        const candidateNames = [
          service.serviceName,
          service.name,
          service.displayName,
          ...(Array.isArray(service.aliases) ? service.aliases : []),
          ...(Array.isArray(service.keywords) ? service.keywords : [])
        ];
        
        candidateNames.forEach(name => {
          if (typeof name === 'string' && name.trim().length > 0) {
            keywordSet.add(name.trim().toLowerCase());
          }
        });
      });
      
      if (keywordSet.size > 0) {
        this.serviceKeywordCache.keywords = Array.from(keywordSet);
        this.serviceKeywordCache.lastFetched = Date.now();
      }
    } catch (error) {
      console.error('❌ [AI Booking] Error refreshing service keyword cache:', error);
    } finally {
      this.serviceKeywordCache.refreshing = false;
    }
  }
  
  getServiceKeywords() {
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    if (
      !this.serviceKeywordCache.keywords.length ||
      (now - this.serviceKeywordCache.lastFetched) > CACHE_TTL_MS
    ) {
      // Refresh cache in background (non-blocking)
      this.refreshServiceKeywordCache().catch(err => {
        console.error('❌ [AI Booking] Error refreshing service keywords:', err);
      });
    }
    
    return this.serviceKeywordCache.keywords.length > 0
      ? this.serviceKeywordCache.keywords
      : this.defaultServiceKeywords;
  }

  updateServiceKeywordCacheFromList(services = []) {
    if (!Array.isArray(services) || services.length === 0) {
      return;
    }
    const newKeywords = services
      .map(service => service?.name || service?.serviceName || service?.displayName || '')
      .filter(Boolean)
      .map(name => name.toLowerCase());
    if (!newKeywords.length) {
      return;
    }
    const keywordSet = new Set([
      ...this.serviceKeywordCache.keywords,
      ...newKeywords
    ]);
    this.serviceKeywordCache.keywords = Array.from(keywordSet);
  }
  
  async getWorkingHoursFromDatabase(doctorUserId, date) {
    if (!doctorUserId || !mongoose.Types.ObjectId.isValid(doctorUserId)) {
      return null;
    }

    try {
      const searchDate = date instanceof Date ? date : new Date(date);
      searchDate.setHours(0, 0, 0, 0);

      let schedules = await DoctorSchedule.find({
        doctorUserId: doctorUserId,
        date: searchDate,
        status: 'Available'
      })
      .select('workingHours')
      .lean();

      // ⭐ TỰ ĐỘNG TẠO SCHEDULE NẾU KHÔNG CÓ (chỉ cho ngày tương lai)
      if (schedules.length === 0) {
        // ⭐ So sánh date trong VN timezone
        const todayDateStr = DateHelper.getTodayVN();
        
        // Lấy ngày của searchDate trong VN timezone (YYYY-MM-DD)
        const searchDateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const searchDateStr = searchDateFormatter.format(searchDate);
        
        // Chỉ tự động tạo schedule cho ngày tương lai (so sánh string YYYY-MM-DD)
        if (searchDateStr >= todayDateStr) {
          console.log(`⚠️ [getWorkingHoursFromDatabase] No schedules found for doctorId ${doctorUserId}, date ${searchDate.toISOString().split('T')[0]}. Auto-creating schedule...`);
          
          try {
            // Tự động tạo schedule cho bác sĩ này vào ngày này
            await ScheduleHelper.ensureScheduleForDoctor(doctorUserId, searchDate);
            
            // ⭐ Query lại sau khi tạo - KHÔNG filter theo status để lấy workingHours (dù status là Unavailable)
            let newSchedules = await DoctorSchedule.find({
              doctorUserId: doctorUserId,
              date: searchDate
            })
            .select('workingHours status')
            .lean();
            
            if (newSchedules.length === 0) {
              console.log(`⚠️ [getWorkingHoursFromDatabase] Failed to create schedule for doctorId ${doctorUserId}`);
              return null;
            }
            
            // Lấy workingHours từ schedule đầu tiên (tất cả schedules đều có cùng workingHours)
            schedules = newSchedules;
            console.log(`✅ [getWorkingHoursFromDatabase] Auto-created schedule for doctorId ${doctorUserId}, date ${searchDate.toISOString().split('T')[0]}, found ${schedules.length} schedules`);
          } catch (createError) {
            console.error(`❌ [getWorkingHoursFromDatabase] Error auto-creating schedule:`, createError.message);
            return null;
          }
        } else {
          // Ngày quá khứ - không tự động tạo
          console.log(`⚠️ [getWorkingHoursFromDatabase] No schedules found for doctorId ${doctorUserId}, date ${searchDate.toISOString().split('T')[0]} (past date, not auto-creating)`);
          return null;
        }
      }

      // Lấy workingHours từ schedule đầu tiên (tất cả schedules đều có cùng workingHours)
      const workingHours = schedules[0]?.workingHours;
      
      if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || 
          !workingHours.afternoonStart || !workingHours.afternoonEnd) {
        console.log(`⚠️ [getWorkingHoursFromDatabase] No workingHours in schedule for doctorId ${doctorUserId}, date ${searchDate.toISOString().split('T')[0]}`);
        return null;
      }

      console.log(`✅ [getWorkingHoursFromDatabase] Found workingHours from database for doctorId ${doctorUserId}:`, workingHours);
      return workingHours;
    } catch (error) {
      console.error(`❌ [getWorkingHoursFromDatabase] Error querying DoctorSchedule:`, error.message);
      return null;
    }
  }

  /**
   * Helper function để resolve serviceId từ nhiều định dạng:
   * - ObjectId: Trả về ObjectId trực tiếp
   * - Số thứ tự: Tìm theo index trong danh sách dịch vụ
   * - Tên dịch vụ: Tìm theo tên (exact, contains, slug)
   * @param {string} serviceIdInput - Input có thể là ObjectId, số thứ tự, hoặc tên dịch vụ
   * @returns {Promise<Object>} { service: Object, serviceId: string } hoặc null nếu không tìm thấy
   */
  async resolveServiceId(serviceIdInput) {
    if (!serviceIdInput || typeof serviceIdInput !== 'string') {
      return null;
    }

    const serviceIdStr = serviceIdInput.toString().trim();
    
    // 1. Kiểm tra nếu là số thứ tự
    const serviceNumberMatch = serviceIdStr.match(/^\d+$/);
    if (serviceNumberMatch) {
      const services = await Service.find({ status: 'Active' })
        .select('_id serviceName durationMinutes price isPrepaid category description')
        .sort({ category: 1, serviceName: 1 })
        .lean();
      
      const index = parseInt(serviceIdStr) - 1; // Convert to 0-based index
      if (index >= 0 && index < services.length) {
        return {
          service: services[index],
          serviceId: services[index]._id.toString()
        };
      }
      return null;
    }

    // 2. Kiểm tra nếu là ObjectId hợp lệ
    if (mongoose.Types.ObjectId.isValid(serviceIdStr)) {
      const service = await Service.findOne({ 
        _id: serviceIdStr,
        status: 'Active' 
      })
        .select('_id serviceName durationMinutes price isPrepaid category description status')
        .lean();
      
      if (service) {
        return {
          service: service,
          serviceId: service._id.toString()
        };
      }
      // Nếu không tìm thấy với ObjectId, tiếp tục tìm theo tên
    }

    // 3. Tìm theo tên dịch vụ (exact match, contains, slug)
    // Normalize input: loại bỏ dấu, chuyển thành lowercase, thay thế dấu gạch ngang
    const normalizeString = (str) => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
        .replace(/[^\w\s-]/g, '') // Loại bỏ ký tự đặc biệt (trừ gạch ngang)
        .replace(/\s+/g, '-') // Thay thế khoảng trắng bằng dấu gạch ngang
        .replace(/-+/g, '-') // Gộp nhiều dấu gạch ngang thành một
        .trim();
    };

    const normalizedInput = normalizeString(serviceIdStr);

    // Lấy tất cả dịch vụ active
    const allServices = await Service.find({ status: 'Active' })
      .select('_id serviceName durationMinutes price isPrepaid category description')
      .lean();

    // Ưu tiên 1: Exact match (normalized)
    let matchedService = allServices.find(s => {
      const normalizedServiceName = normalizeString(s.serviceName || '');
      return normalizedServiceName === normalizedInput;
    });

    if (matchedService) {
      return {
        service: matchedService,
        serviceId: matchedService._id.toString()
      };
    }

    // Ưu tiên 2: Contains match (normalized) - tên dịch vụ chứa input
    matchedService = allServices.find(s => {
      const normalizedServiceName = normalizeString(s.serviceName || '');
      return normalizedServiceName.includes(normalizedInput) || 
             normalizedInput.includes(normalizedServiceName);
    });

    if (matchedService) {
      return {
        service: matchedService,
        serviceId: matchedService._id.toString()
      };
    }

    // Ưu tiên 3: Word-based matching - tìm các từ có ý nghĩa
    const inputWords = normalizedInput.split('-').filter(w => w.length >= 2);
    if (inputWords.length > 0) {
      matchedService = allServices.find(s => {
        const normalizedServiceName = normalizeString(s.serviceName || '');
        const serviceWords = normalizedServiceName.split('-');
        
        // Kiểm tra xem có ít nhất một từ trong input khớp với từ trong service name
        return inputWords.some(inputWord => 
          serviceWords.some(serviceWord => 
            serviceWord.includes(inputWord) || inputWord.includes(serviceWord)
          )
        );
      });

      if (matchedService) {
        return {
          service: matchedService,
          serviceId: matchedService._id.toString()
        };
      }
    }

    // Không tìm thấy
    return null;
  }

  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Không retry nếu là lỗi validation hoặc user error
        if (error.status === 400 || error.status === 422) {
          throw error;
        }
        
        // Nếu đã hết retry, throw error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff: delay = baseDelay * 2^attempt
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠️ [Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  validateFunctionArgs(functionName, functionArgs) {
    const validationRules = {
      find_service_by_name: {
        serviceName: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('serviceName phải là chuỗi không rỗng');
          }
          return val.trim();
        }
      },
      find_doctor_by_name: {
        doctorName: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('doctorName phải là chuỗi không rỗng');
          }
          return val.trim();
        }
      },
      validate_service: {
        serviceId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('serviceId không hợp lệ');
          }
          return val.trim();
        }
      },
      validate_doctor: {
        doctorId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('doctorId không hợp lệ');
          }
          return val.trim();
        }
      },
      get_available_slots: {
        doctorId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('doctorId không hợp lệ');
          }
          return val.trim();
        },
        date: (val) => {
          if (!val || typeof val !== 'string') {
            throw new Error('date phải là chuỗi hợp lệ');
          }
          return val.trim();
        },
        serviceId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('serviceId không hợp lệ');
          }
          return val.trim();
        }
      },
      check_appointment_conflict: {
        date: (val) => {
          if (!val || typeof val !== 'string') {
            throw new Error('date phải là chuỗi hợp lệ');
          }
          return val.trim();
        },
        time: (val) => {
          if (!val || typeof val !== 'string') {
            throw new Error('time phải là chuỗi format HH:mm');
          }
          const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(val)) {
            throw new Error('time phải có format HH:mm');
          }
          return val.trim();
        },
        doctorId: (val) => {
          // Optional: Chỉ validate nếu có giá trị
          if (val === undefined || val === null || val === '') {
            return null; // Cho phép null/undefined
          }
          if (typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('doctorId phải là chuỗi hợp lệ (ObjectId)');
          }
          return val.trim();
        }
      },
      create_appointment: {
        serviceId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('serviceId không hợp lệ');
          }
          return val.trim();
        },
        doctorId: (val) => {
          if (!val || typeof val !== 'string' || val.trim().length === 0) {
            throw new Error('doctorId không hợp lệ');
          }
          return val.trim();
        },
        date: (val) => {
          if (!val || typeof val !== 'string') {
            throw new Error('date phải là chuỗi hợp lệ');
          }
          return val.trim();
        },
        time: (val) => {
          if (!val || typeof val !== 'string') {
            throw new Error('time phải là chuỗi format HH:mm');
          }
          const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(val)) {
            throw new Error('time phải có format HH:mm');
          }
          return val.trim();
        }
      }
    };

    const rules = validationRules[functionName];
    if (!rules) {
      return functionArgs; // Không có validation rules, return as is
    }

    // Lấy danh sách required fields từ tool definition
    let requiredFields = [];
    try {
      const toolConfig = toolsConfig?.tools?.find(t => t.function?.name === functionName);
      if (toolConfig?.function?.parameters?.required) {
        requiredFields = toolConfig.function.parameters.required;
      }
    } catch (error) {
      console.warn(`⚠️ Không thể lấy required fields cho ${functionName}, sử dụng validation rules mặc định`);
    }

    const validated = {};
    for (const [key, validator] of Object.entries(rules)) {
      if (functionArgs.hasOwnProperty(key)) {
        // Validate field nếu có trong functionArgs
        validated[key] = validator(functionArgs[key]);
      } else if (requiredFields.includes(key)) {
        // Chỉ throw error nếu field là required và thiếu
        throw new Error(`Thiếu tham số bắt buộc: ${key}`);
      }
      // Nếu field không có trong functionArgs và không phải required -> bỏ qua (optional field)
    }

    // Validate các required fields còn lại (nếu có trong functionArgs nhưng chưa được validate)
    for (const key of requiredFields) {
      if (!validated.hasOwnProperty(key) && !functionArgs.hasOwnProperty(key)) {
        throw new Error(`Thiếu tham số bắt buộc: ${key}`);
      }
    }

    // Copy các fields không cần validate (không có trong rules)
    Object.keys(functionArgs).forEach(key => {
      if (!validated.hasOwnProperty(key)) {
        validated[key] = functionArgs[key];
      }
    });

    return validated;
  }

  /**
   * Execute function call từ OpenAI với validation và retry
   */
  async executeFunction(functionName, functionArgs, patientUserId) {
    // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
    
    try {
      // Validate arguments trước với error handling
      let validatedArgs;
      try {
        validatedArgs = this.validateFunctionArgs(functionName, functionArgs);
      } catch (validationError) {
        console.error(`❌ [AI] Validation error for ${functionName}:`, validationError);
        return { 
          error: `Lỗi validate tham số: ${validationError.message || 'Tham số không hợp lệ'}` 
        };
      }
      switch (functionName) {
        case 'check_appointment_conflict': {
          const { date, time, doctorId } = validatedArgs;
          
          // ⭐ CỰC KỲ QUAN TRỌNG - LUÔN LẤY WORKING HOURS TỪ DATABASE
          let workingHours = null;
          
          if (doctorId && mongoose.Types.ObjectId.isValid(doctorId)) {
            // Nếu có doctorId, lấy workingHours từ bác sĩ đó
            workingHours = await this.getWorkingHoursFromDatabase(doctorId, date);
          } else {
            // Nếu không có doctorId, lấy workingHours từ một bác sĩ bất kỳ trong database
            // để validate working hours (vì tất cả bác sĩ thường có cùng working hours)
            try {
              const searchDate = date instanceof Date ? date : new Date(date);
              searchDate.setHours(0, 0, 0, 0);
              
              // Lấy schedule của bất kỳ bác sĩ nào vào ngày này (hoặc ngày gần nhất)
              let anySchedule = await DoctorSchedule.findOne({
                date: searchDate,
                status: 'Available'
              })
              .select('workingHours')
              .sort({ date: -1 })
              .lean();
              
              // Nếu không có schedule cho ngày này, lấy schedule mới nhất của bất kỳ bác sĩ nào
              if (!anySchedule) {
                anySchedule = await DoctorSchedule.findOne({
                  status: 'Available'
                })
                .select('workingHours')
                .sort({ date: -1 })
                .lean();
              }
              
              if (anySchedule && anySchedule.workingHours) {
                workingHours = anySchedule.workingHours;
                console.log(`✅ [check_appointment_conflict] Using workingHours from any doctor's schedule:`, workingHours);
              }
            } catch (error) {
              console.error(`❌ [check_appointment_conflict] Error getting workingHours from any doctor:`, error.message);
            }
          }
          
          // Nếu vẫn không có workingHours, không thể validate - trả về error
          if (!workingHours) {
            return {
              hasConflict: true,
              conflictMessage: doctorId 
                ? `Không tìm thấy lịch làm việc của bác sĩ vào ngày ${date}. Vui lòng chọn ngày khác hoặc bác sĩ khác.`
                : `Không thể xác định khung giờ làm việc. Vui lòng chọn bác sĩ trước khi kiểm tra thời gian.`,
              workingHours: null
            };
          }
          
          // Parse time và working hours
          const [hours, minutes] = time.split(':').map(Number);
          const timeInMinutes = hours * 60 + minutes;
          
          // Parse working hours từ database (format HH:mm)
          const [morningStartHour, morningStartMin] = workingHours.morningStart.split(':').map(Number);
          const [morningEndHour, morningEndMin] = workingHours.morningEnd.split(':').map(Number);
          const [afternoonStartHour, afternoonStartMin] = workingHours.afternoonStart.split(':').map(Number);
          const [afternoonEndHour, afternoonEndMin] = workingHours.afternoonEnd.split(':').map(Number);
          
          const morningStart = morningStartHour * 60 + morningStartMin;
          const morningEnd = morningEndHour * 60 + morningEndMin;
          const afternoonStart = afternoonStartHour * 60 + afternoonStartMin;
          const afternoonEnd = afternoonEndHour * 60 + afternoonEndMin;
          
          // ⭐ CỰC KỲ QUAN TRỌNG - CHECK ENDTIME TRƯỚC (trước khi check isInMorning/isInAfternoon)
          // Nếu time đúng bằng endTime, không thể đặt lịch vì đã hết ca
          const isMorningEndTime = timeInMinutes === morningEnd;
          const isAfternoonEndTime = timeInMinutes === afternoonEnd;
          
          // ⭐ XỬ LÝ RIÊNG CHO ENDTIME (morningEnd và afternoonEnd từ database) - CHECK TRƯỚC
          if (isMorningEndTime) {
            return {
              hasConflict: true,
              conflictMessage: `Thời gian ${time} là thời điểm kết thúc ca buổi sáng. Vui lòng chọn thời gian trước ${time} hoặc chọn ca buổi chiều (từ ${workingHours.afternoonStart}).`,
              isEndTime: true,
              remainingMinutes: 0, // Hết ca
              shift: 'Morning',
              workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
            };
          }
          
          if (isAfternoonEndTime) {
            return {
              hasConflict: true,
              conflictMessage: `Thời gian ${time} là thời điểm kết thúc ca buổi chiều. Vui lòng chọn thời gian trước ${time}.`,
              isEndTime: true,
              remainingMinutes: 0, // Hết ca
              shift: 'Afternoon',
              workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
            };
          }
          
          // Check xem time có nằm trong working hours không (sau khi đã check endTime)
          const isInMorning = timeInMinutes >= morningStart && timeInMinutes < morningEnd;
          const isInAfternoon = timeInMinutes >= afternoonStart && timeInMinutes < afternoonEnd;
          
          if (!isInMorning && !isInAfternoon) {
            // ⭐ HIỂN THỊ WORKING HOURS CỤ THỂ TRONG ERROR MESSAGE
            return {
              hasConflict: true,
              conflictMessage: `Thời gian ${time} không nằm trong khung giờ làm việc của bác sĩ. Bác sĩ làm việc từ ${workingHours.morningStart} - ${workingHours.morningEnd} (buổi sáng) và ${workingHours.afternoonStart} - ${workingHours.afternoonEnd} (buổi chiều). Vui lòng chọn thời gian trong khung giờ làm việc.`,
              workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng trong error message
            };
          }
          
          // ⭐ TÍNH THỜI GIAN CÒN LẠI TRONG CA để filter dịch vụ
          // Tính dựa trên thời gian kết thúc của ca khám (endTime của shift từ database)
          // Ví dụ: Nếu ca sáng kết thúc 12:00 (từ workingHours.morningEnd), user nhập 11:30 → remainingMinutes = 12:00 - 11:30 = 30 phút
          let remainingMinutes = 0;
          let currentShift = '';
          if (isInMorning) {
            currentShift = 'Morning';
            // Thời gian còn lại = endTime của ca sáng (từ database) - thời gian user nhập
            remainingMinutes = morningEnd - timeInMinutes; // Thời gian còn lại đến khi kết thúc ca sáng
          } else if (isInAfternoon) {
            currentShift = 'Afternoon';
            // Thời gian còn lại = endTime của ca chiều (từ database) - thời gian user nhập
            remainingMinutes = afternoonEnd - timeInMinutes; // Thời gian còn lại đến khi kết thúc ca chiều
          }
          
          if (!patientUserId) {
            return { 
              hasConflict: false,
              remainingMinutes: remainingMinutes, // Thời gian còn lại trong ca
              shift: currentShift, // Ca hiện tại
              workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
            };
          }
          
          // Parse date string (YYYY-MM-DD) và tạo Date object ở VN timezone
          // date string là "2025-11-06" - cần tạo Date ở VN timezone (08:30 VN = 01:30 UTC)
          // VN timezone = UTC+7, nên 08:30 VN = 01:30 UTC
          const dateParts = date.split('-');
          const year = parseInt(dateParts[0]);
          const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
          const day = parseInt(dateParts[2]);
          
          // Tạo Date ở UTC với thời gian VN (trừ 7 giờ để convert sang UTC)
          // Xử lý trường hợp hours < 7 (ví dụ: 06:00 VN = 23:00 UTC ngày hôm trước)
          let utcHours = hours - 7;
          let utcDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
          if (utcHours < 0) {
            // Nếu giờ UTC < 0, lùi lại 1 ngày và cộng 24 giờ
            utcDate.setUTCDate(utcDate.getUTCDate() - 1);
            utcHours += 24;
          }
          utcDate.setUTCHours(utcHours, minutes, 0, 0);
          const appointmentDateUTC = utcDate;
          
          // Tính endTime (giả sử duration tối đa là 120 phút để check conflict)
          const endTimeUTC = new Date(appointmentDateUTC);
          endTimeUTC.setUTCMinutes(endTimeUTC.getUTCMinutes() + 120);
          
          // Check conflict với appointments của patient (BẤT KỲ bác sĩ nào)
          const Appointment = require('../models/appointment.model');
          const patientConflictAppointments = await Appointment.find({
            patientUserId: patientUserId,
            status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
            timeslotId: { $exists: true }
          }).populate({
            path: 'timeslotId',
            select: 'startTime endTime'
          });
          
          const hasConflict = patientConflictAppointments.some(apt => {
            if (!apt.timeslotId) return false;
            
            const aptStartTime = new Date(apt.timeslotId.startTime);
            const aptEndTime = new Date(apt.timeslotId.endTime);
            
            // Conflict nếu: appointmentDate < aptEndTime && endTime > aptStartTime
            // So sánh trực tiếp UTC timestamps
            return appointmentDateUTC < aptEndTime && endTimeUTC > aptStartTime;
          });
          
          if (hasConflict) {
            // Tìm appointment conflict để hiển thị thông tin chi tiết
            const conflictAppt = patientConflictAppointments.find(apt => {
              if (!apt.timeslotId) return false;
              const aptStartTime = new Date(apt.timeslotId.startTime);
              const aptEndTime = new Date(apt.timeslotId.endTime);
              return appointmentDateUTC < aptEndTime && endTimeUTC > aptStartTime;
            });
            
            if (conflictAppt && conflictAppt.timeslotId) {
              const conflictStart = new Date(conflictAppt.timeslotId.startTime);
              const conflictEnd = new Date(conflictAppt.timeslotId.endTime);
              const conflictDateVN = conflictStart.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
              const conflictStartVN = conflictStart.toLocaleTimeString('vi-VN', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Ho_Chi_Minh'
              });
              const conflictEndVN = conflictEnd.toLocaleTimeString('vi-VN', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Ho_Chi_Minh'
              });
              
              // ⭐ QUAN TRỌNG: Nếu có conflict với appointment cũ (bác sĩ khác), vẫn cho phép tiếp tục
              // vì user có thể muốn đặt với bác sĩ khác. get_available_slots sẽ tự động exclude slot này.
              // Chỉ block hoàn toàn nếu user đã chọn chính xác bác sĩ đó và time đó.
              // Nếu chưa có doctorId hoặc doctorId khác với appointment conflict → cho phép tiếp tục
              const conflictDoctorId = conflictAppt.doctorId?.toString();
              const currentDoctorId = doctorId?.toString();
              
              // Nếu không có doctorId hoặc doctorId khác với appointment conflict → cho phép tiếp tục
              const allowContinueWithOtherDoctors = !currentDoctorId || (conflictDoctorId && conflictDoctorId !== currentDoctorId);
              
              // ⭐ KHÔNG HIỂN THỊ MESSAGE CHI TIẾT KHI CHO PHÉP TIẾP TỤC VỚI BÁC SĨ KHÁC
              // User sẽ chọn bác sĩ trước, sau đó get_available_slots sẽ tự động exclude slot đã bận
              if (allowContinueWithOtherDoctors) {
                return {
                  hasConflict: false, // ⭐ Coi như không có conflict để tiếp tục flow bình thường
                  allowContinueWithOtherDoctors: true, // ⭐ Flag để log (không hiển thị cho user)
                  workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
                };
              }
              
              // Conflict với chính bác sĩ đã chọn → không hiển thị message, chỉ yêu cầu chọn giờ khác
              return {
                hasConflict: false,
                conflictHandled: true,
                conflictSlot: {
                  date: conflictDateVN,
                  startTime: conflictStartVN,
                  endTime: conflictEndVN
                },
                allowContinueWithOtherDoctors: false,
                workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
              };
            }
            
            // ⭐ KHÔNG CÓ appointment cụ thể → cho phép tiếp tục (không hiển thị message)
            return {
              hasConflict: false, // ⭐ Coi như không có conflict để tiếp tục flow bình thường
              allowContinueWithOtherDoctors: true, // ⭐ Flag để log (không hiển thị cho user)
              workingHours: workingHours // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
            };
          }
          
          return { 
            hasConflict: false,
            workingHours: workingHours, // ⭐ QUAN TRỌNG: Trả về workingHours để AI sử dụng
            remainingMinutes: remainingMinutes, // Thời gian còn lại trong ca
            shift: currentShift // Ca hiện tại (Morning hoặc Afternoon)
          };
        }
        
        case 'get_services': {
          const { category, maxDurationMinutes } = validatedArgs;
          const query = { status: 'Active' };
          if (category) {
            query.category = category;
          }
          
          console.log('🔍 [get_services] Querying Service model with query:', JSON.stringify(query));
          
          // ⭐ QUAN TRỌNG: Đảm bảo query đúng Service model, không phải User model
          let services = await Service.find(query)
            .select('_id serviceName category durationMinutes price isPrepaid description')
            .sort({ category: 1, serviceName: 1 })
            .lean();

          console.log(`📊 [get_services] Found ${services.length} services from database`);
          if (services.length > 0) {
            console.log('📋 [get_services] First 5 service names:', services.slice(0, 5).map(s => s.serviceName));
          }

          // ⭐ VALIDATE: Kiểm tra xem có phải đang query nhầm collection không
          // Nếu serviceName chứa "Bác sĩ", "Bac si", "doctor", hoặc các pattern tên bác sĩ → có thể là dữ liệu sai hoặc query nhầm
          const invalidServices = services.filter(s => {
            const name = (s.serviceName || '').toLowerCase().trim();
            // Check các pattern tên bác sĩ
            const hasDoctorKeyword = name.includes('bác sĩ') || name.includes('bac si') || name.includes('doctor') || name.includes('dr.') || name.includes('bs.');
            // Check pattern tên người đơn giản (ví dụ: "Bac si M", "Bac si duong", "Bác sĩ A", "Bác sĩ An", "Bác sĩ Hải")
            // Pattern: bắt đầu bằng "bac si" hoặc "bác sĩ" + tên người (1-3 từ, không có từ khóa dịch vụ)
            const doctorNamePattern = /^(bac\s*si|bác\s*sĩ|doctor|dr\.?|bs\.?)\s+[a-zà-ỹ]+(\s+[a-zà-ỹ]+){0,2}$/i;
            const matchesDoctorPattern = doctorNamePattern.test(name);
            return hasDoctorKeyword || matchesDoctorPattern;
          });

          if (invalidServices.length > 0) {
            console.error('❌ [get_services] WARNING: Found services with doctor names:', invalidServices.map(s => s.serviceName));
            console.error('❌ [get_services] Invalid service IDs:', invalidServices.map(s => s._id));
            // Filter bỏ các service có tên bác sĩ (có thể là dữ liệu sai)
            const validServices = services.filter(s => {
              const name = (s.serviceName || '').toLowerCase().trim();
              // Check các pattern tên bác sĩ
              const hasDoctorKeyword = name.includes('bác sĩ') || name.includes('bac si') || name.includes('doctor') || name.includes('dr.') || name.includes('bs.');
              // Check pattern tên người đơn giản
              const doctorNamePattern = /^(bac\s*si|bác\s*sĩ|doctor|dr\.?|bs\.?)\s+[a-zà-ỹ]+(\s+[a-zà-ỹ]+){0,2}$/i;
              const matchesDoctorPattern = doctorNamePattern.test(name);
              return !hasDoctorKeyword && !matchesDoctorPattern;
            });
            
            if (validServices.length === 0) {
              console.error('❌ [get_services] ERROR: No valid services found after filtering doctor names');
              return { 
                error: 'Không tìm thấy dịch vụ nào trong hệ thống. Vui lòng liên hệ quản trị viên.' 
              };
            }
            
            console.log(`⚠️ [get_services] Filtered out ${invalidServices.length} invalid services, keeping ${validServices.length} valid services`);
            services = validServices;
          }

          // ⭐ FILTER DỊCH VỤ THEO THỜI GIAN CÒN LẠI (nếu có maxDurationMinutes)
          let filteredServices = services;
          if (maxDurationMinutes && maxDurationMinutes > 0) {
            filteredServices = services.filter(s => (s.durationMinutes || 30) <= maxDurationMinutes);
          }

          // ⭐ Tính giá sau khuyến mãi cho mỗi service
          const servicesWithPrice = await Promise.all(filteredServices.map(async (s) => {
            // ⭐ VALIDATE: Đảm bảo serviceName tồn tại và không phải tên bác sĩ
            if (!s.serviceName || s.serviceName.trim().length === 0) {
              console.error('❌ [get_services] ERROR: Service missing serviceName:', s._id);
              return null;
            }

            const promotionData = await calculateServicePrice(s._id.toString(), s.price);
            return {
              id: s._id.toString(),
              name: s.serviceName,
              category: s.category,
              durationMinutes: s.durationMinutes || 30, // Default 30 phút nếu không có
              price: s.price || 0,
              originalPrice: promotionData.originalPrice,
              finalPrice: promotionData.finalPrice,
              isPrepaid: s.isPrepaid || false,
              description: s.description || ''
            };
          }));

          // Filter bỏ các service null (nếu có)
          const validServicesWithPrice = servicesWithPrice.filter(s => s !== null);

          // ⭐ VALIDATE LẦN CUỐI: Đảm bảo không có tên bác sĩ trong response
          const finalValidServices = validServicesWithPrice.filter(s => {
            if (!s || !s.name) return false;
            const name = s.name.toLowerCase().trim();
            // Check các pattern tên bác sĩ
            const hasDoctorKeyword = name.includes('bác sĩ') || name.includes('bac si') || name.includes('doctor') || name.includes('dr.') || name.includes('bs.');
            // Check pattern tên người đơn giản
            const doctorNamePattern = /^(bac\s*si|bác\s*sĩ|doctor|dr\.?|bs\.?)\s+[a-zà-ỹ]+(\s+[a-zà-ỹ]+){0,2}$/i;
            const matchesDoctorPattern = doctorNamePattern.test(name);
            const isDoctorName = hasDoctorKeyword || matchesDoctorPattern;
            if (isDoctorName) {
              console.error('❌ [get_services] FINAL VALIDATION: Found doctor name in service:', s.name, 'ID:', s.id);
            }
            return !isDoctorName;
          });

          if (finalValidServices.length !== validServicesWithPrice.length) {
            console.error(`❌ [get_services] FINAL VALIDATION: Filtered out ${validServicesWithPrice.length - finalValidServices.length} services with doctor names`);
          }

          console.log(`✅ [get_services] Returning ${finalValidServices.length} valid services`);
          if (finalValidServices.length > 0) {
            console.log('📋 [get_services] Service names being returned:', finalValidServices.map(s => s.name));
          }

          return {
            services: finalValidServices
          };
        }
        
        case 'get_service_info': {
          const { serviceId } = validatedArgs;
          
          if (!serviceId) {
            return { error: 'Missing required parameter: serviceId' };
          }
          
          const service = await Service.findById(serviceId)
            .select('_id serviceName category durationMinutes description price isPrepaid status')
            .lean();
          
          if (!service) {
            return { error: 'Service not found' };
          }
          
          // ⭐ Tính giá sau khuyến mãi
          const promotionData = await calculateServicePrice(service._id.toString(), service.price);
          
          return {
            id: service._id.toString(),
            name: service.serviceName,
            category: service.category,
            durationMinutes: service.durationMinutes || 30,
            description: service.description || '',
            price: service.price || 0,
            originalPrice: promotionData.originalPrice,
            finalPrice: promotionData.finalPrice,
            isPrepaid: service.isPrepaid || false,
            status: service.status
          };
        }
        
        case 'find_service_by_name': {
          const { serviceName, category } = validatedArgs;
          
          if (!serviceName) {
            return { error: 'Missing serviceName parameter' };
          }
          
          const query = { status: 'Active' };
          if (category) {
            query.category = category;
          }
          
          const services = await Service.find(query)
            .select('_id serviceName category durationMinutes price isPrepaid description')
            .sort({ category: 1, serviceName: 1 })
            .lean();
          
          // ⭐ Tính giá sau khuyến mãi cho tất cả services
          const servicesWithPrice = await Promise.all(services.map(async (s) => {
            try {
              const promotionData = await calculateServicePrice(s._id.toString(), s.price);
              return {
                ...s,
                originalPrice: promotionData.originalPrice,
                finalPrice: promotionData.finalPrice
              };
            } catch (promoError) {
              console.error(`⚠️ [AI] Error calculating price for service ${s._id}:`, promoError);
              // Nếu lỗi tính giá, vẫn trả về service với giá gốc
              return {
                ...s,
                originalPrice: s.price || 0,
                finalPrice: s.price || 0
              };
            }
          }));
          
          // Check nếu input là số thứ tự
          const numberMatch = serviceName.match(/^\d+$/);
          if (numberMatch) {
            const index = parseInt(serviceName) - 1; // Convert to 0-based index
            if (index >= 0 && index < servicesWithPrice.length) {
              const selectedService = servicesWithPrice[index];
              return {
                found: true,
                service: {
                  id: selectedService._id.toString(),
                  name: selectedService.serviceName,
                  category: selectedService.category,
                  durationMinutes: selectedService.durationMinutes || 30,
                  price: selectedService.price || 0,
                  originalPrice: selectedService.originalPrice,
                  finalPrice: selectedService.finalPrice,
                  isPrepaid: selectedService.isPrepaid || false,
                  description: selectedService.description || ''
                }
              };
            }
          }
          
          // ⭐ FILTER CHẶT CHẼ - Chỉ match khi có từ khóa quan trọng
          // ⭐ NORMALIZE: Loại bỏ dấu tiếng Việt để match cả "thay rang su" và "Thay răng sứ"
          const normalizeString = (str) => {
            return str
              .toLowerCase()
              .normalize('NFD') // Chuyển sang dạng decomposed (á → a + ́)
              .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
              .replace(/[^\w\s]/g, '') // Loại bỏ ký tự đặc biệt
              .trim();
          };
          
          const inputLower = serviceName.toLowerCase().trim();
          const normalizedInput = normalizeString(serviceName);
          
          // Danh sách từ chung chung cần loại bỏ
          const commonWords = ['cho', 'và', 'của', 'có', 'là', 'để', 'với', 'từ', 'trong', 'theo', 'người', 'mới', 'đầu'];
          
          // ✅ PRIORITY 1: Exact match (case-insensitive, không dấu)
          let matchedServices = servicesWithPrice.filter(s => {
            const serviceNameNormalized = normalizeString(s.serviceName);
            return serviceNameNormalized === normalizedInput;
          });
          
          // ✅ PRIORITY 2: Contains match - CHỈ khi input có ít nhất 3 ký tự và service name chứa input
          // ⭐ CHẶT CHẼ: Chỉ match khi service name chứa toàn bộ input (hoặc input là một phần của service name)
          // Ví dụ: "khám tổng quát" chỉ match với "Khám tổng quát định kỳ", không match với "Trồng răng hàm"
          if (matchedServices.length === 0 && normalizedInput.length >= 3) {
            matchedServices = servicesWithPrice.filter(s => {
              const serviceNameNormalized = normalizeString(s.serviceName);
              
              // ⭐ Chỉ match nếu service name chứa input (không match ngược lại)
              // Và input phải có ít nhất 2 từ để tránh match quá rộng
              const inputWordCount = normalizedInput.split(/\s+/).filter(w => w.length >= 2).length;
              if (inputWordCount < 2) {
                return false; // Nếu input chỉ có 1 từ, bỏ qua contains match, dùng word-based matching
              }
              
              return serviceNameNormalized.includes(normalizedInput);
            });
          }
          
          // ✅ PRIORITY 3: Word-based matching với scoring - ƯU TIÊN match nhiều từ hơn
          if (matchedServices.length === 0) {
            const inputWords = normalizedInput.split(/\s+/)
              .filter(w => w.length >= 2) // Lấy từ có ít nhất 2 ký tự
              .filter(w => !commonWords.includes(w)); // Loại bỏ từ chung chung
            
            // Phải có ít nhất 1 từ có ý nghĩa mới match
            if (inputWords.length > 0) {
              // ⭐ Từ khóa chung cho các loại dịch vụ (category keywords) - ƯU TIÊN CAO NHẤT
              const categoryKeywords = ['răng', 'tim', 'mạch', 'mắt'];
              const categoryKeywordsNormalized = categoryKeywords.map(kw => normalizeString(kw));
              
              // ⭐ QUAN TRỌNG: Kiểm tra xem có từ khóa category trong input không (so sánh normalized)
              const categoryKeywordInInput = inputWords.find(word => 
                categoryKeywordsNormalized.some(keywordNormalized => 
                  word === keywordNormalized || word.includes(keywordNormalized) || keywordNormalized.includes(word)
                )
              );
              
              // ⭐ Nếu có category keyword → match với tất cả service có chứa từ khóa đó (ƯU TIÊN)
              if (categoryKeywordInInput) {
                const matchedCategoryIndex = categoryKeywordsNormalized.findIndex(keywordNormalized => 
                  categoryKeywordInInput === keywordNormalized || 
                  categoryKeywordInInput.includes(keywordNormalized) || 
                  keywordNormalized.includes(categoryKeywordInInput)
                );
                
                if (matchedCategoryIndex >= 0) {
                  const matchedCategory = categoryKeywords[matchedCategoryIndex];
                  // ✅ Match với tất cả service có chứa category keyword (normalized)
                  matchedServices = servicesWithPrice.filter(s => {
                    const serviceNameNormalized = normalizeString(s.serviceName);
                    return serviceNameNormalized.includes(categoryKeywordInInput);
                  });
                }
              }
              
              // Nếu chưa match (không có category keyword hoặc không tìm thấy), dùng logic word-based matching với scoring
          if (matchedServices.length === 0) {
                // ⭐ SỬ DỤNG SCORING: Tính điểm match cho mỗi service, ưu tiên service có nhiều từ khớp hơn
                const scoredServices = servicesWithPrice.map(s => {
                  const serviceNameNormalized = normalizeString(s.serviceName);
                  const serviceWords = serviceNameNormalized.split(/\s+/);
                  
                  let matchScore = 0;
                  let exactWordMatches = 0;
                  let containsMatches = 0;
                  
                  // Đếm số từ khớp chính xác và contains
                  inputWords.forEach(inputWord => {
                    const inputWordClean = normalizeString(inputWord);
                    
                    // Check exact match với từng từ trong service name
                    const exactMatch = serviceWords.some(serviceWord => {
                      const serviceWordClean = normalizeString(serviceWord);
                      return serviceWordClean === inputWordClean;
                    });
                    
                    if (exactMatch) {
                      exactWordMatches++;
                      matchScore += 10; // Exact match = 10 điểm
                    } else {
                      // Check contains match
                      const containsMatch = serviceWords.some(serviceWord => {
                        const serviceWordClean = normalizeString(serviceWord);
                        return serviceWordClean.includes(inputWordClean) || inputWordClean.includes(serviceWordClean);
                    });
                    
                      if (containsMatch) {
                        containsMatches++;
                        matchScore += 5; // Contains match = 5 điểm
                      } else {
                        // Check full service name contains input word
                        if (serviceNameNormalized.includes(inputWordClean)) {
                          containsMatches++;
                          matchScore += 3; // Partial match = 3 điểm
                        }
                      }
                    }
                  });
                  
                  // ⭐ BONUS: Nếu số từ khớp >= 50% số từ input → bonus điểm
                  const matchRatio = (exactWordMatches + containsMatches) / inputWords.length;
                  if (matchRatio >= 0.5) {
                    matchScore += 5; // Bonus cho match nhiều từ
                  }
                  
                  // ⭐ BONUS: Nếu match tất cả từ → bonus lớn
                  if (exactWordMatches + containsMatches === inputWords.length) {
                    matchScore += 20; // Bonus lớn cho match tất cả từ
                  }
                  
                  return {
                    service: s,
                    score: matchScore,
                    exactMatches: exactWordMatches,
                    totalMatches: exactWordMatches + containsMatches
                  };
                });
                
                // Lọc và sắp xếp theo điểm
                matchedServices = scoredServices
                  .filter(item => item.score > 0) // Chỉ lấy service có điểm > 0
                  .sort((a, b) => {
                    // Ưu tiên: điểm cao hơn, sau đó match nhiều từ hơn, sau đó exact match nhiều hơn
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.totalMatches !== a.totalMatches) return b.totalMatches - a.totalMatches;
                    return b.exactMatches - a.exactMatches;
                  })
                  .map(item => item.service);
              }
            }
          }
          
          // ❌ Không tìm thấy
          if (matchedServices.length === 0) {
            return { 
              error: `Không tìm thấy dịch vụ phù hợp với "${serviceName}". Vui lòng chọn một trong các dịch vụ có sẵn sau đây:`,
              suggestions: servicesWithPrice.map(s => ({
                id: s._id.toString(),
                name: s.serviceName,
                category: s.category,
                durationMinutes: s.durationMinutes || 30,
                price: s.price || 0,
                originalPrice: s.originalPrice,
                finalPrice: s.finalPrice,
                isPrepaid: s.isPrepaid || false,
                description: s.description || ''
              }))
            };
          }
          
          // ⭐ BLOCK AUTO-SELECT: KHÔNG BAO GIỜ tự động chọn dịch vụ, ngay cả khi chỉ có 1 match
          // User PHẢI chọn cụ thể (nhập tên chính xác hoặc chọn số thứ tự)
          // Chỉ auto-select khi:
          // 1. User nhập số thứ tự (đã xử lý ở trên)
          // 2. Exact match (case-insensitive, không dấu) - user đã nhập tên chính xác
          const isExactMatch = matchedServices.length === 1 && 
            normalizeString(matchedServices[0].serviceName) === normalizedInput;
          
          if (isExactMatch) {
            // Chỉ auto-select khi exact match (user đã nhập tên chính xác)
            return {
              found: true,
              service: {
                id: matchedServices[0]._id.toString(),
                name: matchedServices[0].serviceName,
                category: matchedServices[0].category,
                durationMinutes: matchedServices[0].durationMinutes || 30,
                price: matchedServices[0].price || 0,
                originalPrice: matchedServices[0].originalPrice,
                finalPrice: matchedServices[0].finalPrice,
                isPrepaid: matchedServices[0].isPrepaid || false,
                description: matchedServices[0].description || ''
              }
            };
          }
          
          // ⚠️ Nếu chỉ có 1 match nhưng KHÔNG phải exact match → vẫn trả về danh sách để user chọn
          // Điều này ngăn AI tự động chọn dịch vụ khi user chưa chọn cụ thể
          
          // ⚠️ Nhiều dịch vụ match → Trả về danh sách để user chọn
          return {
            found: true,
            multiple: true,
            services: matchedServices.map(s => ({
              id: s._id.toString(),
              name: s.serviceName,
              category: s.category,
              durationMinutes: s.durationMinutes || 30,
              price: s.price || 0,
              originalPrice: s.originalPrice,
              finalPrice: s.finalPrice,
              isPrepaid: s.isPrepaid || false,
              description: s.description || ''
            }))
          };
        }
        
        case 'validate_service': {
          const { serviceId } = validatedArgs;
          
          if (!serviceId) {
            return { valid: false, error: 'Missing serviceId' };
          }
          
          // Sử dụng helper function để resolve serviceId
          const resolved = await this.resolveServiceId(serviceId);
          
          if (!resolved || !resolved.service) {
            return { 
              valid: false, 
              error: `ServiceId "${serviceId}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId), số thứ tự, hoặc tên dịch vụ từ danh sách dịch vụ.` 
            };
          }
          
          const service = resolved.service;

          // ⭐ Tính giá sau khuyến mãi
          const promotionData = await calculateServicePrice(service._id.toString(), service.price);

      return {
            valid: true, 
            service: {
              id: service._id.toString(),
              name: service.serviceName,
              category: service.category,
              durationMinutes: service.durationMinutes || 30,
              price: service.price || 0,
              originalPrice: promotionData.originalPrice,
              finalPrice: promotionData.finalPrice,
              isPrepaid: service.isPrepaid || false,
              description: service.description || '',
              status: service.status
            }
          };
        }
        
        case 'find_doctor_by_name': {
          const { doctorName } = validatedArgs;
          
          if (!doctorName) {
            return { error: 'Missing doctorName parameter' };
          }
          
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization email phoneNumber status role')
            .sort({ fullName: 1 }) // Sort để có thứ tự cố định
            .lean();
          
          // ⭐ THÊM: Lấy danh sách Doctor model để filter bỏ bác sĩ "On Leave" hoặc "Inactive" và check workingHours
          const doctorModels = await Doctor.find({
            doctorUserId: { $in: doctors.map(d => d._id) }
          }).select('doctorUserId status workingHours');
          
          // Tạo Map để lookup nhanh
          const doctorStatusMap = new Map();
          const doctorWorkingHoursMap = new Map();
          doctorModels.forEach(doc => {
            doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
            doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
          });
          
          // Filter bỏ các bác sĩ có status "On Leave" hoặc "Inactive" và không có workingHours
          const availableDoctors = doctors.filter(doctor => {
            const doctorStatus = doctorStatusMap.get(doctor._id.toString());
            const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
            const hasHours = hasCompleteWorkingHours(workingHours);

            if (!hasHours) {
              return false;
            }

            // Check status: chỉ lấy bác sĩ có status "Available" hoặc "Busy"
            if (doctorStatus && doctorStatus !== 'Available' && doctorStatus !== 'Busy') {
              return false;
            }

            return true;
          });
          
          // Check nếu input là số thứ tự
          const numberMatch = doctorName.match(/^\d+$/);
          if (numberMatch) {
            const index = parseInt(doctorName) - 1; // Convert to 0-based index
            if (index >= 0 && index < availableDoctors.length) {
              const selectedDoctor = availableDoctors[index];
              
              // ⭐ CỰC KỲ QUAN TRỌNG: Validate workingHours ngay khi chọn bác sĩ theo số thứ tự
              const doctorModelForValidation = await Doctor.findOne({ 
                doctorUserId: selectedDoctor._id 
              }).select('workingHours');
              
              if (!doctorModelForValidation || !hasCompleteWorkingHours(doctorModelForValidation.workingHours)) {
                // Lấy danh sách bác sĩ có workingHours để làm suggestions
                const doctorModelsForSuggestions = await Doctor.find({
                  doctorUserId: { $in: availableDoctors.map(d => d._id) }
                }).select('doctorUserId workingHours').lean();

                const doctorsWithValidWorkingHoursForSuggestions = new Set();
                doctorModelsForSuggestions.forEach(doc => {
                  if (hasCompleteWorkingHours(doc.workingHours)) {
                    doctorsWithValidWorkingHoursForSuggestions.add(doc.doctorUserId.toString());
                  }
                });

                const validAvailableDoctors = availableDoctors.filter(doc => 
                  doctorsWithValidWorkingHoursForSuggestions.has(doc._id.toString())
                );

                return {
                  error: `Bác sĩ ${selectedDoctor.fullName} chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.`,
                  suggestions: validAvailableDoctors.slice(0, 5).map(d => ({
                    id: d._id.toString(),
                    name: d.fullName,
                    specialization: d.specialization || '',
                    email: d.email || '',
                    phoneNumber: d.phoneNumber || ''
                  }))
                };
              }
              
              return {
                found: true,
                doctor: {
                  id: selectedDoctor._id.toString(),
                  name: selectedDoctor.fullName,
                  specialization: selectedDoctor.specialization || '',
                  email: selectedDoctor.email || '',
                  phoneNumber: selectedDoctor.phoneNumber || '',
                  status: selectedDoctor.status || 'Active'
                }
              };
            }
          }
          
          const inputLower = doctorName.toLowerCase().trim();
          const inputClean = inputLower.replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
          const inputWords = inputClean.split(/\s+/).filter(w => w.length > 0);
          
          // ⭐ QUAN TRỌNG: Tìm trong TẤT CẢ bác sĩ (kể cả On Leave, kể cả không có workingHours) để check xem có tồn tại không
          // Sau đó sẽ validate workingHours
          let matchedDoctors = [];
          
          // ✅ PRIORITY 1: Exact match (case-insensitive) - Tìm trong TẤT CẢ bác sĩ
          const exactMatches = doctors.filter(d => 
            d.fullName.toLowerCase() === inputLower
          );
          if (exactMatches.length > 0) {
            matchedDoctors = exactMatches;
          }
          
          // ✅ PRIORITY 2: Exact match bỏ "bác sĩ" prefix
          if (matchedDoctors.length === 0) {
            const prefixMatches = doctors.filter(d => {
              const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
              return doctorNameClean === inputClean;
            });
            if (prefixMatches.length > 0) {
              matchedDoctors = prefixMatches;
            }
          }
          
          // ✅ PRIORITY 3: Substring matching (chặt chẽ) - chỉ khi input ngắn và không có khoảng trắng
          // Nếu input là một chuỗi ngắn (không có khoảng trắng), match substring trong tên bác sĩ
          if (matchedDoctors.length === 0 && inputClean.length >= 2 && !inputClean.includes(' ')) {
            const substringMatches = doctors.filter(d => {
              const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
              // CHỈ match khi tên bác sĩ CHỨA input như một substring liên tục
              // Ví dụ: "aaa" chỉ match với "Aaaaa", không match với "Thu" hay "Nguyễn Huy"
              return doctorNameClean.includes(inputClean);
            });
            
            if (substringMatches.length > 0) {
              matchedDoctors = substringMatches;
            }
          }
          
          // ✅ PRIORITY 4: Word-based matching (match theo TỪ) - chỉ khi input có nhiều từ
          // Nếu vẫn chưa có match và input có nhiều từ, thử word-based
          if (matchedDoctors.length === 0 && inputWords.length > 1) {
            const wordMatches = doctors.filter(d => {
              const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
              const doctorWords = doctorNameClean.split(/\s+/);
              
              // Check xem TẤT CẢ các từ trong input có tồn tại trong tên bác sĩ không
              return inputWords.every(inputWord => 
                doctorWords.some(doctorWord => doctorWord === inputWord)
              );
            });
            
            // Nếu word-based match tìm thấy, dùng kết quả đó (có thể nhiều hơn)
            if (wordMatches.length > 0) {
              matchedDoctors = wordMatches;
            }
          }
          
          // ✅ PRIORITY 5: Fuzzy matching không dấu (sử dụng normalizeString)
          if (matchedDoctors.length === 0) {
            // ⭐ Định nghĩa normalizeString function ở đây
            const normalizeString = (str) => {
              return str
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu
                .replace(/[^\w\s]/g, '') // Loại bỏ ký tự đặc biệt
                .trim();
            };
            
            const normalizedInput = normalizeString(inputClean);
            const fuzzyMatches = doctors.filter(d => {
              const normalizedDoctorName = normalizeString(
                d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '')
              );
              return normalizedDoctorName.includes(normalizedInput);
            });
            
            if (fuzzyMatches.length > 0) {
              matchedDoctors = fuzzyMatches;
            }
          }
          
          // ⭐ CỰC KỲ QUAN TRỌNG: Validate workingHours cho tất cả matched doctors TRƯỚC KHI tiếp tục
          if (matchedDoctors.length > 0) {
            console.log(`🔍 [find_doctor_by_name] Found ${matchedDoctors.length} matched doctors. Validating workingHours...`);
            const matchedDoctorModels = await Doctor.find({
              doctorUserId: { $in: matchedDoctors.map(d => d._id) }
            }).select('doctorUserId workingHours').lean();

            console.log(`🔍 [find_doctor_by_name] Fetched ${matchedDoctorModels.length} doctor models from DB`);
            matchedDoctorModels.forEach(doc => {
              const docHasWorkingHours = hasCompleteWorkingHours(doc.workingHours);
              console.log(`🔍 [find_doctor_by_name] Doctor ${doc.doctorUserId}: has workingHours = ${docHasWorkingHours}`);
            });

            const matchedDoctorsWithWorkingHours = new Set();
            matchedDoctorModels.forEach(doc => {
              if (hasCompleteWorkingHours(doc.workingHours)) {
                matchedDoctorsWithWorkingHours.add(doc.doctorUserId.toString());
              }
            });

            console.log(`🔍 [find_doctor_by_name] Doctors with workingHours: ${matchedDoctorsWithWorkingHours.size} out of ${matchedDoctors.length}`);

            // Filter bỏ các bác sĩ không có workingHours
            const beforeFilterCount = matchedDoctors.length;
            matchedDoctors = matchedDoctors.filter(doc => 
              matchedDoctorsWithWorkingHours.has(doc._id.toString())
            );
            console.log(`🔍 [find_doctor_by_name] After filtering workingHours: ${matchedDoctors.length} out of ${beforeFilterCount}`);

            // ⚠️ Nếu sau khi filter workingHours, không còn bác sĩ nào
            if (matchedDoctors.length === 0) {
              console.log(`⚠️ [find_doctor_by_name] No doctors with workingHours found. Returning error.`);
              // Lấy danh sách bác sĩ có workingHours để làm suggestions
              const doctorModelsForSuggestions = await Doctor.find({
                doctorUserId: { $in: availableDoctors.map(d => d._id) }
              }).select('doctorUserId workingHours').lean();

              const doctorsWithValidWorkingHoursForSuggestions = new Set();
              doctorModelsForSuggestions.forEach(doc => {
                if (hasCompleteWorkingHours(doc.workingHours)) {
                  doctorsWithValidWorkingHoursForSuggestions.add(doc.doctorUserId.toString());
                }
              });

              const validAvailableDoctors = availableDoctors.filter(doc => 
                doctorsWithValidWorkingHoursForSuggestions.has(doc._id.toString())
              );

              console.log(`⚠️ [find_doctor_by_name] Returning error: Bác sĩ "${doctorName}" chưa đi vào hoạt động.`);
              return {
                error: `Bác sĩ "${doctorName}" chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.`,
                suggestions: validAvailableDoctors.slice(0, 5).map(d => ({
                  id: d._id.toString(),
                  name: d.fullName,
                  specialization: d.specialization || '',
                  email: d.email || '',
                  phoneNumber: d.phoneNumber || ''
                }))
              };
            }
          }
          
          // ❌ Không tìm thấy bác sĩ nào
          if (matchedDoctors.length === 0) {
            // availableDoctors đã được filter để chỉ có bác sĩ có workingHours
            return { 
              error: 'Không tìm thấy bác sĩ',
              suggestions: availableDoctors.slice(0, 5).map(d => ({
                id: d._id.toString(),
                name: d.fullName,
                specialization: d.specialization || '',
                email: d.email || '',
                phoneNumber: d.phoneNumber || ''
              }))
            };
          }
          
          // ⭐ QUAN TRỌNG: Check xem bác sĩ tìm được có đang "On Leave" hoặc "Inactive" không
          const matchedDoctorsWithStatus = matchedDoctors.map(d => {
            const doctorStatus = doctorStatusMap.get(d._id.toString());
            return {
              ...d,
              doctorStatus: doctorStatus || 'Available' // Default to Available nếu không có trong Doctor model
            };
          });
          
          // ⚠️ Nếu tất cả bác sĩ tìm được đều đang "On Leave" hoặc "Inactive"
          const onLeaveDoctors = matchedDoctorsWithStatus.filter(d => 
            d.doctorStatus === 'On Leave' || d.doctorStatus === 'Inactive'
          );
          
          if (onLeaveDoctors.length === matchedDoctorsWithStatus.length) {
            // Tất cả bác sĩ tìm được đều đang On Leave
            const doctorNameDisplay = onLeaveDoctors[0].fullName;
            // availableDoctors đã được filter để chỉ có bác sĩ có workingHours
            return {
              error: `Bác sĩ ${doctorNameDisplay} đang trong thời gian nghỉ phép. Vui lòng chọn bác sĩ khác.`,
              suggestions: availableDoctors.slice(0, 5).map(d => ({
                id: d._id.toString(),
                name: d.fullName,
                specialization: d.specialization || '',
                email: d.email || '',
                phoneNumber: d.phoneNumber || ''
              }))
            };
          }
          
          // Filter chỉ lấy các bác sĩ available (không On Leave, không Inactive)
          let availableMatchedDoctors = matchedDoctorsWithStatus.filter(d => 
            d.doctorStatus === 'Available' || d.doctorStatus === 'Busy' || !d.doctorStatus
          );
          
          // Nếu sau khi filter chỉ còn 1 bác sĩ available → Auto-select
          if (availableMatchedDoctors.length === 1) {
            // ⭐ CỰC KỲ QUAN TRỌNG: Validate workingHours ngay khi tìm thấy bác sĩ
            const doctorModelForValidation = await Doctor.findOne({ 
              doctorUserId: availableMatchedDoctors[0]._id 
            }).select('workingHours');
            
            if (!doctorModelForValidation || !doctorModelForValidation.workingHours) {
              // Lấy danh sách bác sĩ có workingHours để làm suggestions
              const doctorModelsForSuggestions = await Doctor.find({
                doctorUserId: { $in: availableDoctors.map(d => d._id) }
              }).select('doctorUserId workingHours').lean();

              const doctorsWithValidWorkingHoursForSuggestions = new Set();
              doctorModelsForSuggestions.forEach(doc => {
                if (hasCompleteWorkingHours(doc.workingHours)) {
                  doctorsWithValidWorkingHoursForSuggestions.add(doc.doctorUserId.toString());
                }
              });

              const validAvailableDoctors = availableDoctors.filter(doc => 
                doctorsWithValidWorkingHoursForSuggestions.has(doc._id.toString())
              );

              return {
                error: `Bác sĩ ${availableMatchedDoctors[0].fullName} chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.`,
                suggestions: validAvailableDoctors.slice(0, 5).map(d => ({
                  id: d._id.toString(),
                  name: d.fullName,
                  specialization: d.specialization || '',
                  email: d.email || '',
                  phoneNumber: d.phoneNumber || ''
                }))
              };
            }
            
            return {
              found: true,
              doctor: {
                id: availableMatchedDoctors[0]._id.toString(),
                name: availableMatchedDoctors[0].fullName,
                specialization: availableMatchedDoctors[0].specialization || '',
                email: availableMatchedDoctors[0].email || '',
                phoneNumber: availableMatchedDoctors[0].phoneNumber || '',
                status: availableMatchedDoctors[0].status || 'Active'
              }
            };
          }
          
          // ⭐ Nếu có nhiều bác sĩ available match → Validate workingHours và filter bỏ bác sĩ không có workingHours
          if (availableMatchedDoctors.length > 1) {
            // ⭐ CỰC KỲ QUAN TRỌNG: Validate workingHours cho tất cả bác sĩ match
            const doctorModelsForValidation = await Doctor.find({
              doctorUserId: { $in: availableMatchedDoctors.map(d => d._id) }
            }).select('doctorUserId workingHours').lean();

            const doctorsWithWorkingHours = new Set();
            doctorModelsForValidation.forEach(doc => {
              if (hasCompleteWorkingHours(doc.workingHours)) {
                doctorsWithWorkingHours.add(doc.doctorUserId.toString());
              }
            });

            // Filter chỉ lấy bác sĩ có workingHours
            const validMatchedDoctors = availableMatchedDoctors.filter(doc => 
              doctorsWithWorkingHours.has(doc._id.toString())
            );

            // Nếu sau khi filter không còn bác sĩ nào → trả về error
            if (validMatchedDoctors.length === 0) {
              // Lấy danh sách bác sĩ có workingHours để làm suggestions
              const doctorModelsForSuggestions = await Doctor.find({
                doctorUserId: { $in: availableDoctors.map(d => d._id) }
              }).select('doctorUserId workingHours').lean();

              const doctorsWithValidWorkingHoursForSuggestions = new Set();
              doctorModelsForSuggestions.forEach(doc => {
                if (hasCompleteWorkingHours(doc.workingHours)) {
                  doctorsWithValidWorkingHoursForSuggestions.add(doc.doctorUserId.toString());
                }
              });

              const validAvailableDoctors = availableDoctors.filter(doc => 
                doctorsWithValidWorkingHoursForSuggestions.has(doc._id.toString())
              );

              return {
                error: `Bác sĩ "${doctorName}" chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.`,
                suggestions: validAvailableDoctors.slice(0, 5).map(d => ({
                  id: d._id.toString(),
                  name: d.fullName,
                  specialization: d.specialization || '',
                  email: d.email || '',
                  phoneNumber: d.phoneNumber || ''
                }))
              };
            }

            // Nếu sau khi filter chỉ còn 1 bác sĩ → Auto-select
            if (validMatchedDoctors.length === 1) {
              return {
                found: true,
                doctor: {
                  id: validMatchedDoctors[0]._id.toString(),
                  name: validMatchedDoctors[0].fullName,
                  specialization: validMatchedDoctors[0].specialization || '',
                  email: validMatchedDoctors[0].email || '',
                  phoneNumber: validMatchedDoctors[0].phoneNumber || '',
                  status: validMatchedDoctors[0].status || 'Active'
                }
              };
            }

            // Nếu vẫn còn nhiều bác sĩ → Trả về danh sách để user chọn
            return {
              found: true,
              multiple: true,
              message: `Có nhiều bác sĩ tên "${doctorName}". Vui lòng chọn bác sĩ cụ thể từ danh sách bên dưới.`,
              requiresUserSelection: true, // ⭐ Flag đặc biệt để AI biết PHẢI hỏi lại
              doctors: validMatchedDoctors.map(d => ({
                id: d._id.toString(),
                name: d.fullName,
                specialization: d.specialization || '',
                email: d.email || '',
                phoneNumber: d.phoneNumber || ''
              }))
            };
          }
          
          // Nếu không có bác sĩ nào available sau khi filter
          // (Trường hợp này đã được xử lý ở trên, nhưng để an toàn)
          // availableDoctors đã được filter để chỉ có bác sĩ có workingHours
          return {
            error: `Bác sĩ ${matchedDoctors[0].fullName} đang trong thời gian nghỉ phép. Vui lòng chọn bác sĩ khác.`,
            suggestions: availableDoctors.slice(0, 5).map(d => ({
              id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
              email: d.email || '',
              phoneNumber: d.phoneNumber || ''
            }))
          };
        }
        
        case 'validate_doctor': {
          const { doctorId } = validatedArgs;
          
          if (!doctorId) {
            return { valid: false, error: 'Missing doctorId' };
          }
          
          const doctorIdStr = doctorId.toString();
          
          // Check nếu doctorId là ObjectId hợp lệ
          let doctor = null;
          if (mongoose.Types.ObjectId.isValid(doctorIdStr)) {
            doctor = await User.findOne({ 
              _id: doctorIdStr, 
            role: 'Doctor',
            status: 'Active' 
            })
            .select('_id fullName specialization email phoneNumber status role')
            .lean();
          } else {
            // Nếu không phải ObjectId → có thể là tên bác sĩ
            // Sử dụng fuzzy matching tương tự như find_doctor_by_name
            const allDoctors = await User.find({ role: 'Doctor', status: 'Active' })
              .select('_id fullName specialization email phoneNumber status role')
              .sort({ fullName: 1 })
              .lean();
            
            // ⭐ THÊM: Lấy Doctor model để filter status + workingHours
            const doctorModels = await Doctor.find({
              doctorUserId: { $in: allDoctors.map(d => d._id) }
            }).select('doctorUserId status workingHours');
            
            const doctorStatusMap = new Map();
            const doctorWorkingHoursMap = new Map();
            doctorModels.forEach(doc => {
              doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
              doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
            });
            
            const availableDoctors = allDoctors.filter(d => {
              const doctorStatus = doctorStatusMap.get(d._id.toString());
              const workingHours = doctorWorkingHoursMap.get(d._id.toString());
              const hasHours = hasCompleteWorkingHours(workingHours);

              if (!hasHours) {
                return false;
              }

              if (doctorStatus && doctorStatus !== 'Available' && doctorStatus !== 'Busy') {
                return false;
              }

              return true;
            });
            
            const inputLower = doctorIdStr.toLowerCase().trim();
            const inputClean = inputLower.replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
            const inputWords = inputClean.split(/\s+/).filter(w => w.length > 0);
            
            let matchedDoctors = [];
            
            // PRIORITY 1: Exact match (case-insensitive)
            const exactMatches = availableDoctors.filter(d => 
              d.fullName.toLowerCase() === inputLower
            );
            if (exactMatches.length > 0) {
              matchedDoctors = exactMatches;
            }
            
            // PRIORITY 2: Exact match bỏ "bác sĩ" prefix
            if (matchedDoctors.length === 0) {
              const prefixMatches = availableDoctors.filter(d => {
                const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                return doctorNameClean === inputClean;
              });
              if (prefixMatches.length > 0) {
                matchedDoctors = prefixMatches;
              }
            }
            
            // PRIORITY 3: Substring matching (chặt chẽ) - chỉ khi input ngắn và không có khoảng trắng
            if (matchedDoctors.length === 0 && inputClean.length >= 2 && !inputClean.includes(' ')) {
              const substringMatches = availableDoctors.filter(d => {
                const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                return doctorNameClean.includes(inputClean);
              });
              if (substringMatches.length > 0) {
                matchedDoctors = substringMatches;
              }
            }
            
            // PRIORITY 4: Word-based matching (match theo TỪ)
            if (matchedDoctors.length === 0 && inputWords.length > 1) {
              const wordMatches = availableDoctors.filter(d => {
                const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                const doctorWords = doctorNameClean.split(/\s+/);
                return inputWords.every(inputWord => 
                  doctorWords.some(doctorWord => doctorWord.includes(inputWord) || inputWord.includes(doctorWord))
                );
              });
              if (wordMatches.length > 0) {
                matchedDoctors = wordMatches;
              }
            }
            
            // ⭐ QUAN TRỌNG: Filter bỏ bác sĩ "On Leave" hoặc "Inactive" từ matchedDoctors
            const finalMatchedDoctors = matchedDoctors.filter(d => {
              const doctorStatus = doctorStatusMap.get(d._id.toString());
              if (!doctorStatus) return true;
              return doctorStatus === 'Available' || doctorStatus === 'Busy';
            });
            
            if (finalMatchedDoctors.length === 1) {
              // Chỉ có 1 bác sĩ match → sử dụng bác sĩ đó
              doctor = finalMatchedDoctors[0];
            } else if (finalMatchedDoctors.length > 1) {
              // Có nhiều bác sĩ match → trả về lỗi
              return { 
                valid: false,
                error: `Có nhiều bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`,
                shouldCallFindDoctorByName: true
              };
            } else {
              // Không tìm thấy bác sĩ nào
              return { 
                valid: false,
                error: `Không tìm thấy bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`,
                shouldCallFindDoctorByName: true
              };
            }
          }
          
          if (!doctor) {
            return { valid: false, error: 'Doctor not found or inactive' };
        }
          
          // ⭐ THÊM: Kiểm tra Doctor status (On Leave/Inactive)
          const doctorModel = await Doctor.findOne({ doctorUserId: doctor._id }).select('status workingHours');
          if (doctorModel && (doctorModel.status === 'On Leave' || doctorModel.status === 'Inactive')) {
            return { valid: false, error: 'Bác sĩ bạn chọn hiện đang nghỉ phép hoặc không khả dụng. Vui lòng chọn bác sĩ khác.' };
          }

          if (!doctorModel || !hasCompleteWorkingHours(doctorModel.workingHours)) {
            return { valid: false, error: 'Bác sĩ này chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.' };
          }

        return {
            valid: true, 
            doctor: {
              id: doctor._id.toString(),
              name: doctor.fullName,
              specialization: doctor.specialization || '',
              email: doctor.email || '',
              phoneNumber: doctor.phoneNumber || '',
              status: doctor.status || 'Active'
            }
          };
        }
        
        case 'get_doctors': {
          const { date } = validatedArgs;
          // Lấy tất cả bác sĩ Active từ User
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization email phoneNumber status role')
            .lean();
          
          // ⭐ THÊM: Lấy danh sách Doctor model để filter bỏ bác sĩ "On Leave" hoặc "Inactive" và check workingHours
          const doctorModels = await Doctor.find({
            doctorUserId: { $in: doctors.map(d => d._id) }
          }).select('doctorUserId status workingHours');
          
          // Tạo Map để lookup nhanh
          const doctorStatusMap = new Map();
          const doctorWorkingHoursMap = new Map();
          doctorModels.forEach(doc => {
            doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
            doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
          });
          
          // Filter bỏ các bác sĩ có status "On Leave" hoặc "Inactive" và không có workingHours
          let availableDoctors = doctors.filter(doctor => {
            const doctorStatus = doctorStatusMap.get(doctor._id.toString());
            const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
            const hasHours = hasCompleteWorkingHours(workingHours);

            if (!hasHours) {
              return false;
            }

            // Check status: chỉ lấy bác sĩ có status "Available" hoặc "Busy"
            if (doctorStatus && doctorStatus !== 'Available' && doctorStatus !== 'Busy') {
              return false;
            }

            return true;
          });

          if (availableDoctors.length === 0) {
            if (date) {
              const displayDate = this.formatDateForDisplay(date);
              return {
                error: `Không có bác sĩ nào có lịch làm việc vào ngày ${displayDate}. Vui lòng chọn ngày khác.`,
                noDoctorsForDate: true
              };
            } else {
              return {
                error: `Không có bác sĩ nào khả dụng trong hệ thống.`,
                noDoctors: true
              };
            }
          }
          
          return {
            doctors: availableDoctors.map(d => ({
              id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
              email: d.email || '',
              phoneNumber: d.phoneNumber || '',
              status: d.status || 'Active'
            })),
            date: date || null
          };
        }
        
        case 'get_available_slots': {
          const { doctorId, date, serviceId } = validatedArgs;
          
          if (!doctorId || !date || !serviceId) {
            // ⭐ CỰC KỲ QUAN TRỌNG: Nếu thiếu doctorId, trả về error message hướng dẫn AI gọi get_doctors()
            // AI sẽ tự động gọi get_doctors() để hiển thị danh sách bác sĩ cho user chọn
            if (!doctorId) {
              return { 
                error: 'doctor_not_found',
                message: 'Vui lòng chọn bác sĩ trước khi xem khung giờ khả dụng. Tôi sẽ hiển thị danh sách bác sĩ cho bạn.',
                shouldCallGetDoctors: true
              };
            }
            return { error: 'Missing required parameters: doctorId, date, serviceId' };
          }
          
          // Sử dụng helper function để resolve serviceId
          const resolved = await this.resolveServiceId(serviceId);
          
          if (!resolved || !resolved.service) {
            return { 
              error: `ServiceId "${serviceId}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId), số thứ tự, hoặc tên dịch vụ từ danh sách dịch vụ.` 
            };
          }
          
          const service = resolved.service;
          
          // ⭐ Tính giá sau khuyến mãi
          const promotionData = await calculateServicePrice(service._id.toString(), service.price);
          
          const serviceDuration = service.durationMinutes || 30;
          
          // Xử lý doctorId: có thể là ObjectId, số thứ tự, hoặc tên bác sĩ (sai)
          let doctor = null;
          const doctorIdStr = doctorId.toString();
          
          // Check nếu doctorId là số thứ tự
          const doctorNumberMatch = doctorIdStr.match(/^\d+$/);
          if (doctorNumberMatch) {
            // Lấy danh sách bác sĩ và chọn theo index
            const doctors = await User.find({ role: 'Doctor', status: 'Active' })
              .select('_id fullName specialization email phoneNumber status role')
              .sort({ fullName: 1 })
              .lean();
            
            // ⭐ THÊM: Lấy danh sách Doctor model để filter bỏ bác sĩ "On Leave" hoặc "Inactive"
            const doctorStatuses = await Doctor.find({
              doctorUserId: { $in: doctors.map(d => d._id) }
            }).select('doctorUserId status');
            
            // Tạo Map để lookup nhanh
            const doctorStatusMap = new Map();
            doctorStatuses.forEach(doc => {
              doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
            });
            
            // Filter bỏ các bác sĩ có status "On Leave" hoặc "Inactive"
            const availableDoctors = doctors.filter(doctor => {
              const doctorStatus = doctorStatusMap.get(doctor._id.toString());
              // Nếu không có trong Doctor model → coi như Available (cho backward compatibility)
              if (!doctorStatus) return true;
              // Chỉ lấy bác sĩ có status "Available" hoặc "Busy"
              return doctorStatus === 'Available' || doctorStatus === 'Busy';
            });
            
            const index = parseInt(doctorIdStr) - 1; // Convert to 0-based index
            if (index >= 0 && index < availableDoctors.length) {
              doctor = availableDoctors[index];
            } else {
              return { error: `Số thứ tự ${doctorIdStr} không hợp lệ. Vui lòng chọn lại bác sĩ.` };
            }
          } else {
            // Check nếu doctorId là ObjectId hợp lệ
            if (mongoose.Types.ObjectId.isValid(doctorIdStr)) {
            // Dùng doctorId trực tiếp (ObjectId) - ⭐ THÊM: Kiểm tra role và status
              doctor = await User.findOne({
                _id: doctorIdStr,
                role: 'Doctor',
                status: 'Active'
              })
                .select('_id fullName specialization email phoneNumber status role')
              .lean();
            } else {
              // Nếu không phải ObjectId và không phải số → có thể là tên bác sĩ
              // Sử dụng fuzzy matching tương tự như find_doctor_by_name
              const allDoctors = await User.find({ role: 'Doctor', status: 'Active' })
                .select('_id fullName specialization email phoneNumber status role')
                .sort({ fullName: 1 })
                .lean();
              
              // ⭐ THÊM: Filter bỏ bác sĩ "On Leave" hoặc "Inactive"
              const doctorStatuses = await Doctor.find({
                doctorUserId: { $in: allDoctors.map(d => d._id) }
              }).select('doctorUserId status');
              
              const doctorStatusMap = new Map();
              doctorStatuses.forEach(doc => {
                doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
              });
              
              const availableDoctors = allDoctors.filter(d => {
                const doctorStatus = doctorStatusMap.get(d._id.toString());
                if (!doctorStatus) return true;
                return doctorStatus === 'Available' || doctorStatus === 'Busy';
              });
              
              const inputLower = doctorIdStr.toLowerCase().trim();
              const inputClean = inputLower.replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
              const inputWords = inputClean.split(/\s+/).filter(w => w.length > 0);
              
              let matchedDoctors = [];
              
              // PRIORITY 1: Exact match (case-insensitive)
              const exactMatches = availableDoctors.filter(d => 
                d.fullName.toLowerCase() === inputLower
              );
              if (exactMatches.length > 0) {
                matchedDoctors = exactMatches;
              }
              
              // PRIORITY 2: Exact match bỏ "bác sĩ" prefix
              if (matchedDoctors.length === 0) {
                const prefixMatches = availableDoctors.filter(d => {
                  const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                  return doctorNameClean === inputClean;
                });
                if (prefixMatches.length > 0) {
                  matchedDoctors = prefixMatches;
                }
              }
              
              // PRIORITY 3: Substring matching (chặt chẽ) - chỉ khi input ngắn và không có khoảng trắng
              if (matchedDoctors.length === 0 && inputClean.length >= 2 && !inputClean.includes(' ')) {
                const substringMatches = availableDoctors.filter(d => {
                  const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                  return doctorNameClean.includes(inputClean);
                });
                if (substringMatches.length > 0) {
                  matchedDoctors = substringMatches;
                }
              }
              
              // PRIORITY 4: Word-based matching (match theo TỪ)
              if (matchedDoctors.length === 0 && inputWords.length > 1) {
                const wordMatches = availableDoctors.filter(d => {
                  const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                  const doctorWords = doctorNameClean.split(/\s+/);
                  return inputWords.every(inputWord => 
                    doctorWords.some(doctorWord => doctorWord.includes(inputWord) || inputWord.includes(doctorWord))
                  );
                });
                if (wordMatches.length > 0) {
                  matchedDoctors = wordMatches;
                }
              }
              
              // ⭐ QUAN TRỌNG: Filter bỏ bác sĩ "On Leave" hoặc "Inactive" từ matchedDoctors
              const finalMatchedDoctors = matchedDoctors.filter(d => {
                const doctorStatus = doctorStatusMap.get(d._id.toString());
                if (!doctorStatus) return true;
                return doctorStatus === 'Available' || doctorStatus === 'Busy';
              });
              
              if (finalMatchedDoctors.length === 1) {
                // Chỉ có 1 bác sĩ match → sử dụng bác sĩ đó
                doctor = finalMatchedDoctors[0];
              } else if (finalMatchedDoctors.length > 1) {
                // Có nhiều bác sĩ match → trả về lỗi với message hướng dẫn
                return { 
                  error: `Có nhiều bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`,
                  shouldCallFindDoctorByName: true
                };
              } else {
                // Không tìm thấy bác sĩ nào
                return { 
                  error: `Không tìm thấy bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`,
                  shouldCallFindDoctorByName: true
                };
              }
            }
          }
          
          if (!doctor || doctor.role !== 'Doctor' || doctor.status !== 'Active') {
            // ⭐ CỰC KỲ QUAN TRỌNG: Nếu doctorId không hợp lệ, trả về error message hướng dẫn AI gọi get_doctors()
            // AI sẽ tự động gọi get_doctors() để hiển thị danh sách bác sĩ cho user chọn
            return { 
              error: 'doctor_not_found',
              message: 'Vui lòng chọn bác sĩ từ danh sách bác sĩ khả dụng. Tôi sẽ hiển thị danh sách bác sĩ cho bạn.',
              shouldCallGetDoctors: true
            };
          }
          
          // ⭐ THÊM: Kiểm tra Doctor status (On Leave/Inactive) và workingHours
          const doctorModel = await Doctor.findOne({ doctorUserId: doctor._id }).select('status workingHours');
          if (doctorModel && (doctorModel.status === 'On Leave' || doctorModel.status === 'Inactive')) {
            return { error: 'Bác sĩ bạn chọn hiện đang nghỉ phép hoặc không khả dụng. Vui lòng chọn bác sĩ khác.' };
          }

          // ⭐ CỰC KỲ QUAN TRỌNG: Kiểm tra workingHours ngay sau khi validate doctor
          if (!doctorModel || !hasCompleteWorkingHours(doctorModel.workingHours)) {
            return { error: 'Bác sĩ này chưa đi vào hoạt động. Vui lòng chọn bác sĩ khác.' };
          }
          
          // Parse date
          const searchDate = new Date(date);
          searchDate.setHours(0, 0, 0, 0);
          
          // ⭐ Log để debug
          const dateStrVN = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(searchDate);
          const todayStr = DateHelper.getTodayVN();
          console.log(`📅 [get_available_slots] Input date: ${date}, searchDate: ${searchDate.toISOString()}, dateStrVN: ${dateStrVN}, todayStr: ${todayStr}`);
          
          // ⭐ CỰC KỲ QUAN TRỌNG: Kiểm tra nghỉ phép cho ngày cụ thể TRƯỚC khi query schedule
          // Tạo một Date object với giờ 12:00 để kiểm tra nghỉ phép (isDoctorOnLeave cần startTime)
          const checkLeaveDate = new Date(searchDate);
          checkLeaveDate.setHours(12, 0, 0, 0); // 12:00 VN time
          
          const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
          if (isOnLeave) {
            console.log(`⚠️ [get_available_slots] Doctor ${doctor._id} is on leave on ${date}`);
            return { error: `Bác sĩ bạn chọn hiện đang nghỉ phép vào ngày ${date}. Vui lòng chọn bác sĩ khác hoặc đổi ngày.` };
          }
          
          // Lấy DoctorSchedule của bác sĩ cho ngày đó (Morning và Afternoon)
          // ⭐ QUAN TRỌNG: Query KHÔNG filter theo status để lấy tất cả schedules (cả Available và Unavailable)
          // Sau đó sẽ filter và kiểm tra nghỉ phép
          let schedules = await DoctorSchedule.find({
            doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
            date: searchDate
          }).lean();
          
          console.log(`📅 [get_available_slots] Found ${schedules.length} existing schedules for doctorId ${doctor._id}, date ${date}`);
          
          // ⭐ TỰ ĐỘNG TẠO SCHEDULE NẾU KHÔNG CÓ (chỉ cho ngày tương lai, và không nghỉ phép)
          // Lưu ý: workingHours đã được check ở trên, nên ở đây chắc chắn bác sĩ đã có workingHours
          if (schedules.length === 0) {
            // ⭐ So sánh date trong VN timezone
            const todayDateStr = DateHelper.getTodayVN();
            
            // Lấy ngày của searchDate trong VN timezone (YYYY-MM-DD)
            const searchDateFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const searchDateStr = searchDateFormatter.format(searchDate);
            
            console.log(`📅 [get_available_slots] Checking schedule for doctorId ${doctor._id}, date input: ${date}, searchDateStr (VN): ${searchDateStr}, todayDateStr (VN): ${todayDateStr}`);
            
            // Chỉ tự động tạo schedule cho ngày tương lai hoặc hôm nay (so sánh string YYYY-MM-DD)
            if (searchDateStr >= todayDateStr) {
              console.log(`⚠️ [get_available_slots] No schedules found for doctorId ${doctor._id}, date ${date} (VN: ${searchDateStr}). Auto-creating schedule...`);
              
              try {
                // ⭐ Đảm bảo date là Date object (không phải string)
                const scheduleDate = searchDate instanceof Date ? new Date(searchDate) : new Date(searchDate);
                scheduleDate.setHours(0, 0, 0, 0);
                
                console.log(`📅 [get_available_slots] Creating schedule for doctorId ${doctor._id}, scheduleDate: ${scheduleDate.toISOString()}`);
                
                // Tự động tạo schedule cho bác sĩ này vào ngày này
                await ScheduleHelper.ensureScheduleForDoctor(doctor._id, scheduleDate);
                
                // ⭐ Đợi một chút để đảm bảo database đã commit
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // ⭐ Query lại sau khi tạo - KHÔNG filter theo status để lấy tất cả schedules
                // Sử dụng date range để đảm bảo match đúng (do MongoDB có thể lưu với timezone khác)
                const startOfDay = new Date(scheduleDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(scheduleDate);
                endOfDay.setHours(23, 59, 59, 999);
                
                let newSchedules = await DoctorSchedule.find({
                  doctorUserId: doctor._id,
                  date: {
                    $gte: startOfDay,
                    $lte: endOfDay
                  }
                }).lean();
                
                // Nếu vẫn không tìm thấy, thử query lại với date chính xác
                if (newSchedules.length === 0) {
                  newSchedules = await DoctorSchedule.find({
                    doctorUserId: doctor._id,
                    date: scheduleDate
                  }).lean();
                }
                
                // Nếu vẫn không tìm thấy schedule nào, có thể là lỗi
                if (newSchedules.length === 0) {
                  console.error(`❌ [get_available_slots] Không tìm thấy schedule sau khi tạo cho doctorId ${doctor._id}, date ${date}, scheduleDate: ${scheduleDate.toISOString()}`);
                  
                  // Thử tạo lại một lần nữa
                  try {
                    await ScheduleHelper.ensureScheduleForDoctor(doctor._id, scheduleDate);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    newSchedules = await DoctorSchedule.find({
                      doctorUserId: doctor._id,
                      date: {
                        $gte: startOfDay,
                        $lte: endOfDay
                      }
                    }).lean();
                    
                    if (newSchedules.length === 0) {
                      return { error: `Không thể tạo lịch làm việc cho bác sĩ vào ngày ${date}. Vui lòng thử lại sau.` };
                    }
                  } catch (retryError) {
                    console.error(`❌ [get_available_slots] Retry failed:`, retryError.message);
                    return { error: `Không thể tạo lịch làm việc cho bác sĩ vào ngày ${date}. Vui lòng thử lại sau.` };
                  }
                }
                
                // ⭐ Lọc chỉ lấy schedule có status 'Available' (ít nhất 1 ca còn available)
                const availableSchedules = newSchedules.filter(s => s.status === 'Available');
                
                // Nếu không có schedule nào Available (có thể cả 2 ca đã hết), vẫn dùng schedule để lấy workingHours
                // Nhưng sẽ trả về error về không có slot available
                if (availableSchedules.length === 0) {
                  // Lấy schedule đầu tiên để lấy workingHours (dù status là Unavailable)
                  const firstSchedule = newSchedules[0];
                  
                  if (firstSchedule && firstSchedule.workingHours) {
                    // Có schedule nhưng đã hết - có thể là đã qua giờ làm việc
                    const workingHours = firstSchedule.workingHours;
                    return { 
                      error: `Bác sĩ này không còn khung giờ khả dụng vào ngày ${date}. Bác sĩ làm việc từ ${workingHours.morningStart} - ${workingHours.morningEnd} (buổi sáng) và ${workingHours.afternoonStart} - ${workingHours.afternoonEnd} (buổi chiều). Vui lòng chọn ngày khác.` 
                    };
                  }
                  return { error: `Không thể tạo lịch làm việc cho bác sĩ vào ngày ${date}. Vui lòng thử lại sau.` };
                }
                
                schedules = availableSchedules;
                console.log(`✅ [get_available_slots] Auto-created schedule for doctorId ${doctor._id}, date ${date}, found ${schedules.length} available shifts`);
              } catch (createError) {
                console.error(`❌ [get_available_slots] Error auto-creating schedule:`, createError);
                console.error(`   - Error stack:`, createError.stack);
                return { error: `Không thể tạo lịch làm việc cho bác sĩ vào ngày ${date}. Vui lòng thử lại sau.` };
              }
            } else {
              // Ngày quá khứ - không tự động tạo
              console.log(`⚠️ [get_available_slots] Date ${date} (VN: ${searchDateStr}) is in the past (today: ${todayDateStr}). Cannot auto-create schedule.`);
              return { error: `Bác sĩ này không có lịch làm việc vào ngày ${date}. Vui lòng chọn ngày trong tương lai.` };
            }
          }
          
          // ⭐ SAU KHI CÓ SCHEDULES (từ query hoặc auto-create), filter chỉ lấy Available
          // Nếu có schedule nhưng tất cả đều Unavailable, kiểm tra xem có phải do nghỉ phép không
          const availableSchedules = schedules.filter(s => s.status === 'Available');
          
          console.log(`📅 [get_available_slots] After processing: total schedules=${schedules.length}, available schedules=${availableSchedules.length}`);
          
          if (availableSchedules.length === 0 && schedules.length > 0) {
            // Có schedule nhưng tất cả đều Unavailable
            // Kiểm tra lại nghỉ phép (có thể schedule đã được tạo trước khi có leave request)
            const recheckLeaveDate = new Date(searchDate);
            recheckLeaveDate.setHours(12, 0, 0, 0);
            const recheckIsOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, recheckLeaveDate);
            
            if (recheckIsOnLeave) {
              return { error: `Bác sĩ bạn chọn hiện đang nghỉ phép vào ngày ${date}. Vui lòng chọn bác sĩ khác hoặc đổi ngày.` };
            }
            
            // Không nghỉ phép nhưng schedule Unavailable - có thể do đã qua giờ làm việc
            const firstSchedule = schedules[0];
            if (firstSchedule && firstSchedule.workingHours) {
              const workingHours = firstSchedule.workingHours;
              return { 
                error: `Bác sĩ này không còn khung giờ khả dụng vào ngày ${date}. Bác sĩ làm việc từ ${workingHours.morningStart} - ${workingHours.morningEnd} (buổi sáng) và ${workingHours.afternoonStart} - ${workingHours.afternoonEnd} (buổi chiều). Vui lòng chọn ngày khác.` 
              };
            }
          }
          
          // ⭐ SỬ DỤNG availableSchedules (nếu có) hoặc schedules (nếu không có available)
          const finalSchedules = availableSchedules.length > 0 ? availableSchedules : schedules;
          
          console.log(`📅 [get_available_slots] Final schedules: ${finalSchedules.length} (available: ${availableSchedules.length}, total: ${schedules.length})`);
          
          // ⭐ Nếu không có schedule nào, có thể là lỗi trong quá trình tự tạo
          if (finalSchedules.length === 0) {
            console.error(`❌ [get_available_slots] No schedules found after processing for doctorId ${doctor._id}, date ${date}`);
            return { error: `Bác sĩ này không có lịch làm việc vào ngày ${date}. Vui lòng chọn ngày khác hoặc bác sĩ khác.` };
          }
          
          // ⭐ LUÔN LẤY WORKING HOURS TỪ DATABASE - KHÔNG DÙNG MẶC ĐỊNH
          const workingHours = finalSchedules[0]?.workingHours;
          
          if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || 
              !workingHours.afternoonStart || !workingHours.afternoonEnd) {
            console.error(`❌ [get_available_slots] No workingHours found in schedule for doctorId ${doctor._id}, date ${date}`);
            return { error: `Không tìm thấy thông tin khung giờ làm việc của bác sĩ vào ngày ${date}. Vui lòng kiểm tra lại.` };
          }
          
          // QUAN TRỌNG: Query Timeslots trực tiếp để lấy tất cả slots đã đặt (Reserved/Booked)
          // Điều này chính xác hơn vì Timeslots là nguồn truth về các slot đã được đặt
          const startOfDay = new Date(searchDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(searchDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          // Lấy tất cả Timeslots đã đặt của bác sĩ trong ngày đó (Reserved hoặc Booked)
          const doctorBookedTimeslots = await Timeslot.find({
            doctorUserId: doctor._id,
            status: { $in: ['Reserved', 'Booked'] },
            startTime: { $gte: startOfDay, $lt: endOfDay }
          })
          .select('startTime endTime')
          .lean();
          
          // Convert sang format để tính free blocks
          const bookedAppointments = doctorBookedTimeslots
            .map(ts => ({
              start: new Date(ts.startTime),
              end: new Date(ts.endTime)
            }))
            .sort((a, b) => a.start - b.start);
          
          // Exclude Timeslots của patient nếu có (bất kỳ bác sĩ nào)
          let patientBookedSlots = [];
          if (patientUserId) {
            // Lấy tất cả appointments của patient trong ngày đó
            const patientAppointments = await Appointment.find({
              patientUserId: patientUserId,
              status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
              timeslotId: { $exists: true }
            })
            .populate({
              path: 'timeslotId',
              select: 'startTime endTime',
              match: {
                startTime: { $gte: startOfDay, $lt: endOfDay }
              }
            })
            .lean();
            
            patientBookedSlots = patientAppointments
              .filter(apt => apt.timeslotId && apt.timeslotId.startTime)
              .map(apt => ({
                start: new Date(apt.timeslotId.startTime),
                end: new Date(apt.timeslotId.endTime)
              }))
              .sort((a, b) => a.start - b.start);
          }
          
          // Helper function: Tính continuous free blocks từ start-end và booked appointments
          // CHỈ trả về các blocks có độ dài >= serviceDurationMinutes
          // QUAN TRỌNG: Nếu là ngày hôm nay, chỉ hiển thị từ thời gian hiện tại trở đi
          const calculateFreeBlocks = (startTimeStr, endTimeStr, bookedAppts, patientBooked, serviceDurationMinutes) => {
            const [startHour, startMin] = startTimeStr.split(':').map(Number);
            const [endHour, endMin] = endTimeStr.split(':').map(Number);
            
            // Tạo Date object với giờ VN (workingHours là giờ VN trong DB)
            // Sử dụng UTC để tránh timezone conversion
            const shiftStart = new Date(Date.UTC(
              searchDate.getFullYear(),
              searchDate.getMonth(),
              searchDate.getDate(),
              startHour - 7, // Convert VN time (UTC+7) to UTC
              startMin,
              0
            ));
            
            const shiftEnd = new Date(Date.UTC(
              searchDate.getFullYear(),
              searchDate.getMonth(),
              searchDate.getDate(),
              endHour - 7, // Convert VN time (UTC+7) to UTC
              endMin,
              0
            ));
            
            // QUAN TRỌNG: Nếu là ngày hôm nay, chỉ hiển thị từ thời gian hiện tại trở đi
            // ⭐ So sánh ngày theo VN timezone để nhất quán
            const todayVN = DateHelper.getTodayVN(); // YYYY-MM-DD
            const searchDateFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const searchDateVN = searchDateFormatter.format(searchDate); // YYYY-MM-DD
            
            const isToday = searchDateVN === todayVN;
            
            // Nếu là hôm nay, tính thời gian hiện tại và điều chỉnh shiftStart
            let actualShiftStart = shiftStart;
            if (isToday) {
              // Lấy thời gian hiện tại theo VN timezone (UTC+7)
              // ⭐ SỬ DỤNG DateHelper để đảm bảo tính chính xác theo timezone VN
              const nowVN = DateHelper.getNowVN(); // Đã là UTC Date object đại diện cho thời gian VN hiện tại
              const currentTimeUTC = new Date(Date.UTC(
                nowVN.getUTCFullYear(),
                nowVN.getUTCMonth(),
                nowVN.getUTCDate(),
                nowVN.getUTCHours(),
                nowVN.getUTCMinutes(),
                0
              ));
              
              // Nếu thời gian hiện tại > shiftStart, dùng currentTimeUTC làm điểm bắt đầu
              // Nhưng phải đảm bảo currentTimeUTC < shiftEnd (chưa qua hết shift)
              if (currentTimeUTC > shiftStart && currentTimeUTC < shiftEnd) {
                actualShiftStart = currentTimeUTC;
              } else if (currentTimeUTC >= shiftEnd) {
                // Đã qua hết shift này, không hiển thị gì
                return [];
              }
            }
            
            // Combine booked appointments (doctor + patient) và filter theo shift (overlap với shift)
            const allBooked = [...bookedAppts, ...(patientBooked || [])]
              .filter(apt => {
                // Chỉ lấy appointments overlap với shift này (appointment end > shift start và appointment start < shift end)
                return apt.end > actualShiftStart && apt.start < shiftEnd;
              })
              .map(apt => ({
                // Clamp appointment vào shift boundaries
                start: apt.start < actualShiftStart ? actualShiftStart : apt.start,
                end: apt.end > shiftEnd ? shiftEnd : apt.end
              }))
              .sort((a, b) => a.start - b.start);
            
            // Tính free blocks
            const freeBlocks = [];
            let currentStart = actualShiftStart;
            
            for (const booked of allBooked) {
              if (currentStart < booked.start) {
                // Có khoảng trống trước appointment
                freeBlocks.push({
                  start: currentStart,
                  end: booked.start
                });
              }
              // Cập nhật currentStart = end của appointment
              currentStart = booked.end > currentStart ? booked.end : currentStart;
            }
            
            // Khoảng trống cuối cùng (nếu còn)
            if (currentStart < shiftEnd) {
              freeBlocks.push({
                start: currentStart,
                end: shiftEnd
              });
            }
            
            // QUAN TRỌNG: Filter các free blocks - CHỈ giữ lại những blocks có độ dài >= serviceDurationMinutes
            const minDurationMs = serviceDurationMinutes * 60 * 1000; // Convert phút sang milliseconds
            const validFreeBlocks = freeBlocks.filter(block => {
              const blockDurationMs = block.end.getTime() - block.start.getTime();
              return blockDurationMs >= minDurationMs;
            });
            
            // Format time cho display (HH:mm) - Format từ hour/minute của Date, convert về VN time (UTC+7)
            const formatTime = (date) => {
              // Lấy UTC hour và minute, rồi cộng 7 để convert về VN time
              const hour = date.getUTCHours() + 7;
              const minute = date.getUTCMinutes();
              // Nếu hour >= 24, trừ 24 (vì đã qua ngày hôm sau)
              const vnHour = hour >= 24 ? hour - 24 : hour;
              // Format thành HH:mm
              return `${String(vnHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            };
            
            return validFreeBlocks.map(block => ({
              startTime: formatTime(block.start),
              endTime: formatTime(block.end),
              displayTime: `${formatTime(block.start)}-${formatTime(block.end)}`
            }));
          };
          
          // Filter appointments theo morning/afternoon để optimize
          // Note: calculateFreeBlocks sẽ tự filter chính xác theo shift boundaries,
          // nên filter này chỉ để optimize performance
          // Convert VN time sang UTC để so sánh
          const [morningStartHour, morningStartMin] = workingHours.morningStart.split(':').map(Number);
          const [morningEndHour, morningEndMin] = workingHours.morningEnd.split(':').map(Number);
          const [afternoonStartHour, afternoonStartMin] = workingHours.afternoonStart.split(':').map(Number);
          const [afternoonEndHour, afternoonEndMin] = workingHours.afternoonEnd.split(':').map(Number);
          
          // Convert sang UTC hours để so sánh
          const morningStartUTC = morningStartHour - 7;
          const morningEndUTC = morningEndHour - 7;
          const afternoonStartUTC = afternoonStartHour - 7;
          const afternoonEndUTC = afternoonEndHour - 7;
          
          const morningBooked = bookedAppointments.filter(apt => {
            const hour = apt.start.getUTCHours();
            return hour >= morningStartUTC && hour < morningEndUTC;
          });
          const afternoonBooked = bookedAppointments.filter(apt => {
            const hour = apt.start.getUTCHours();
            return hour >= afternoonStartUTC && hour < afternoonEndUTC;
          });
          const morningPatientBooked = patientBookedSlots.filter(apt => {
            const hour = apt.start.getUTCHours();
            return hour >= morningStartUTC && hour < morningEndUTC;
          });
          const afternoonPatientBooked = patientBookedSlots.filter(apt => {
            const hour = apt.start.getUTCHours();
            return hour >= afternoonStartUTC && hour < afternoonEndUTC;
          });
          
          // Tính free blocks cho buổi sáng (chỉ hiển thị blocks >= serviceDuration)
          const morningBlocks = calculateFreeBlocks(
            workingHours.morningStart,
            workingHours.morningEnd,
            morningBooked,
            morningPatientBooked,
            serviceDuration // Truyền serviceDuration để filter
          );
          
          // Tính free blocks cho buổi chiều (chỉ hiển thị blocks >= serviceDuration)
          const afternoonBlocks = calculateFreeBlocks(
            workingHours.afternoonStart,
            workingHours.afternoonEnd,
            afternoonBooked,
            afternoonPatientBooked,
            serviceDuration // Truyền serviceDuration để filter
          );
          
          return {
            success: true,
            serviceName: service.serviceName,
            durationMinutes: serviceDuration,
            servicePrice: service.price || 0,
            serviceOriginalPrice: promotionData.originalPrice,
            serviceFinalPrice: promotionData.finalPrice,
            serviceIsPrepaid: service.isPrepaid || false,
            serviceCategory: service.category,
            serviceDescription: service.description || '',
            date: date,
            doctorId: doctor._id.toString(), // Dùng doctor._id thay vì doctorId
            doctorName: doctor.fullName || '',
            doctorSpecialization: doctor.specialization || '',
            doctorEmail: doctor.email || '',
            doctorPhoneNumber: doctor.phoneNumber || '',
            workingHours: workingHours, // ⭐ Thêm working hours để AI biết giờ làm việc
            morning: morningBlocks,
            afternoon: afternoonBlocks,
            totalFreeBlocks: morningBlocks.length + afternoonBlocks.length
          };
        }
        
        case 'create_appointment': {
          const { serviceId, doctorId, date, time, notes } = validatedArgs;
          
          if (!serviceId || !doctorId || !date || !time) {
            return { error: 'Vui lòng nhập đầy đủ thông tin để đặt lịch.' };
          }
          
          try {
            // 1. Validate patient
            const patient = await User.findById(patientUserId);
            if (!patient) {
              return { error: 'Tài khoản của bạn không hợp lệ. Vui lòng đăng nhập lại.' };
            }
            
            // 2. Validate service - Sử dụng helper function để resolve serviceId
            const resolved = await this.resolveServiceId(serviceId);
            
            if (!resolved || !resolved.service) {
              return { 
                error: `ServiceId "${serviceId}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId), số thứ tự, hoặc tên dịch vụ từ danh sách dịch vụ.` 
              };
            }
            
            const service = resolved.service;
            
            // 3. Validate doctor (có thể là ObjectId, số thứ tự, hoặc tên bác sĩ - sai)
            let doctor = null;
            const doctorIdStr = doctorId.toString();
            const doctorNumberMatch = doctorIdStr.match(/^\d+$/);
            
            if (doctorNumberMatch) {
              const doctors = await User.find({ role: 'Doctor', status: 'Active' })
                .select('_id fullName specialization role status email phoneNumber')
                .sort({ fullName: 1 })
                .lean();
              
              const index = parseInt(doctorIdStr) - 1;
              if (index >= 0 && index < doctors.length) {
                doctor = doctors[index];
              }
            } else {
              // Check nếu doctorId là ObjectId hợp lệ
              if (mongoose.Types.ObjectId.isValid(doctorIdStr)) {
                doctor = await User.findById(doctorIdStr)
                  .select('_id fullName specialization role status email phoneNumber')
                .lean();
              } else {
                // Nếu không phải ObjectId và không phải số → có thể là tên bác sĩ
                // Sử dụng fuzzy matching tương tự như find_doctor_by_name
                const allDoctors = await User.find({ role: 'Doctor', status: 'Active' })
                  .select('_id fullName specialization role status email phoneNumber')
                  .sort({ fullName: 1 })
                  .lean();
                
                // ⭐ THÊM: Filter bỏ bác sĩ "On Leave" hoặc "Inactive"
                const doctorStatuses = await Doctor.find({
                  doctorUserId: { $in: allDoctors.map(d => d._id) }
                }).select('doctorUserId status');
                
                const doctorStatusMap = new Map();
                doctorStatuses.forEach(doc => {
                  doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
                });
                
                const availableDoctors = allDoctors.filter(d => {
                  const doctorStatus = doctorStatusMap.get(d._id.toString());
                  if (!doctorStatus) return true;
                  return doctorStatus === 'Available' || doctorStatus === 'Busy';
                });
                
                const inputLower = doctorIdStr.toLowerCase().trim();
                const inputClean = inputLower.replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                const inputWords = inputClean.split(/\s+/).filter(w => w.length > 0);
                
                let matchedDoctors = [];
                
                // PRIORITY 1: Exact match (case-insensitive)
                const exactMatches = availableDoctors.filter(d => 
                  d.fullName.toLowerCase() === inputLower
                );
                if (exactMatches.length > 0) {
                  matchedDoctors = exactMatches;
                }
                
                // PRIORITY 2: Exact match bỏ "bác sĩ" prefix
                if (matchedDoctors.length === 0) {
                  const prefixMatches = availableDoctors.filter(d => {
                    const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                    return doctorNameClean === inputClean;
                  });
                  if (prefixMatches.length > 0) {
                    matchedDoctors = prefixMatches;
                  }
                }
                
                // PRIORITY 3: Substring matching (chặt chẽ) - chỉ khi input ngắn và không có khoảng trắng
                if (matchedDoctors.length === 0 && inputClean.length >= 2 && !inputClean.includes(' ')) {
                  const substringMatches = availableDoctors.filter(d => {
                    const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                    return doctorNameClean.includes(inputClean);
                  });
                  if (substringMatches.length > 0) {
                    matchedDoctors = substringMatches;
                  }
                }
                
                // PRIORITY 4: Word-based matching (match theo TỪ)
                if (matchedDoctors.length === 0 && inputWords.length > 1) {
                  const wordMatches = availableDoctors.filter(d => {
                    const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
                    const doctorWords = doctorNameClean.split(/\s+/);
                    return inputWords.every(inputWord => 
                      doctorWords.some(doctorWord => doctorWord.includes(inputWord) || inputWord.includes(doctorWord))
                    );
                  });
                  if (wordMatches.length > 0) {
                    matchedDoctors = wordMatches;
                  }
                }
                
                // ⭐ QUAN TRỌNG: Filter bỏ bác sĩ "On Leave" hoặc "Inactive" từ matchedDoctors
                const finalMatchedDoctors = matchedDoctors.filter(d => {
                  const doctorStatus = doctorStatusMap.get(d._id.toString());
                  if (!doctorStatus) return true;
                  return doctorStatus === 'Available' || doctorStatus === 'Busy';
                });
                
                if (finalMatchedDoctors.length === 1) {
                  // Chỉ có 1 bác sĩ match → sử dụng bác sĩ đó
                  doctor = finalMatchedDoctors[0];
                } else if (finalMatchedDoctors.length > 1) {
                  // Có nhiều bác sĩ match → trả về lỗi
                  return { 
                    error: `Có nhiều bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`
                  };
                } else {
                  // Không tìm thấy bác sĩ nào
                  return { 
                    error: `Không tìm thấy bác sĩ tên "${doctorIdStr}". Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.`
                  };
                }
              }
            }
            
            if (!doctor) {
              return { error: 'Bác sĩ bạn chọn không tồn tại. Vui lòng chọn bác sĩ khác.' };
            }
            if (doctor.role !== 'Doctor') {
              return { error: 'Bác sĩ bạn chọn không hợp lệ. Vui lòng chọn bác sĩ khác.' };
            }
            if (doctor.status !== 'Active') {
              return { error: 'Bác sĩ bạn chọn hiện không khả dụng. Vui lòng chọn bác sĩ khác.' };
            }
            
            // 4. Parse date and time
            // ⭐ Normalize date từ các format khác nhau (5-11-2025, 5/11/2025) thành YYYY-MM-DD
            let normalizedDate = date;
            
            // Kiểm tra nếu là format YYYY-MM-DD (đã đúng)
            const yyyyMMddRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!yyyyMMddRegex.test(date)) {
              // Thử parse các format khác: DD-MM-YYYY hoặc DD/MM/YYYY
              const ddmmyyyyRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
              const match = date.match(ddmmyyyyRegex);
              
              if (match) {
                const day = parseInt(match[1], 10);
                const month = parseInt(match[2], 10);
                const year = parseInt(match[3], 10);
                
                // Validate date
                if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2020 || year > 2100) {
                  return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo định dạng DD/MM/YYYY (ví dụ: 05/11/2025).` };
                }
                
                // Chuyển đổi thành YYYY-MM-DD
                normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              } else {
                // Format không hợp lệ
                return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo định dạng DD/MM/YYYY (ví dụ: 05/11/2025). Nếu bạn nhập "5-11-2025" hoặc "5/11/2025", hệ thống sẽ tự động chuyển đổi.` };
              }
            }
            
            // Validate date sau khi normalize
            const appointmentDate = new Date(normalizedDate);
            if (isNaN(appointmentDate.getTime())) {
              return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo định dạng DD/MM/YYYY (ví dụ: 05/11/2025).` };
            }
            
            // Kiểm tra date có hợp lệ không (ví dụ: 31/02/2025 không hợp lệ)
            const checkDate = new Date(normalizedDate);
            const dateParts = normalizedDate.split('-').map(Number);
            const year = dateParts[0];
            const month = dateParts[1];
            const day = dateParts[2];
            if (checkDate.getFullYear() !== year || checkDate.getMonth() + 1 !== month || checkDate.getDate() !== day) {
              return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo định dạng DD/MM/YYYY (ví dụ: 05/11/2025).` };
            }
            
            appointmentDate.setHours(0, 0, 0, 0);
            
            // ⭐ CỰC KỲ QUAN TRỌNG: Kiểm tra nghỉ phép cho ngày cụ thể TRƯỚC khi parse time và tạo schedule
            // Tạo một Date object với giờ 12:00 để kiểm tra nghỉ phép (isDoctorOnLeave cần startTime)
            const checkLeaveDate = new Date(appointmentDate);
            checkLeaveDate.setHours(12, 0, 0, 0); // 12:00 VN time
            
            const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
            if (isOnLeave) {
              return { error: `Bác sĩ bạn chọn hiện đang nghỉ phép vào ngày ${normalizedDate}. Vui lòng chọn bác sĩ khác hoặc đổi ngày.` };
            }
            
            // Parse time (format: HH:mm)
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
              return { error: 'Thời gian không hợp lệ. Vui lòng nhập theo format HH:mm (ví dụ: 09:00)' };
            }
            
            // Create startTime and endTime (VN timezone)
            // ⭐ CỰC KỲ QUAN TRỌNG: Xử lý timezone conversion đúng cách
            // normalizedDate là string "YYYY-MM-DD" (ví dụ: "2025-11-06")
            // hours và minutes là thời gian VN (UTC+7)
            // year, month, day đã được parse ở trên
            let slotStartTime;
            if (hours >= 7) {
              // Nếu giờ >= 7, convert trực tiếp: hours - 7 = UTC hours
              slotStartTime = new Date(Date.UTC(
                year,
                month - 1, // Month is 0-indexed
                day,
                hours - 7,
                minutes,
                0,
                0
              ));
            } else {
              // Nếu giờ < 7 (ví dụ: 6h VN = 23h UTC ngày hôm trước)
              // Tính ngày trước: nếu day = 1, lùi về tháng trước
              let prevDay = day - 1;
              let prevMonth = month;
              let prevYear = year;
              
              if (prevDay < 1) {
                prevMonth--;
                if (prevMonth < 1) {
                  prevMonth = 12;
                  prevYear--;
                }
                // Tính số ngày trong tháng trước
                const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
                prevDay = daysInPrevMonth;
              }
              
              slotStartTime = new Date(Date.UTC(
                prevYear,
                prevMonth - 1, // Month is 0-indexed
                prevDay,
                hours - 7 + 24, // +24 để convert sang UTC
                minutes,
                0,
                0
              ));
            }
            
            const slotEndTime = new Date(slotStartTime);
            slotEndTime.setUTCMinutes(slotEndTime.getUTCMinutes() + service.durationMinutes);
            
            // 5. Find doctor schedule (CẦN LẤY TRƯỚC ĐỂ VALIDATE WORKING HOURS)
            // ⭐ QUAN TRỌNG: Query KHÔNG filter theo status để lấy tất cả schedules (cả Available và Unavailable)
            let schedules = await DoctorSchedule.find({
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              date: appointmentDate
            }).lean();
            
            // ⭐ TỰ ĐỘNG TẠO SCHEDULE NẾU KHÔNG CÓ (chỉ cho ngày tương lai, và không nghỉ phép)
            if (schedules.length === 0) {
              // ⭐ So sánh date trong VN timezone
              const todayDateStr = DateHelper.getTodayVN();
              
              // Lấy ngày của appointmentDate trong VN timezone (YYYY-MM-DD)
              const appointmentDateFormatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Ho_Chi_Minh',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              });
              const appointmentDateStrVN = appointmentDateFormatter.format(appointmentDate);
              
              // Chỉ tự động tạo schedule cho ngày tương lai (so sánh string YYYY-MM-DD)
              if (appointmentDateStrVN >= todayDateStr) {
                console.log(`⚠️ [create_appointment] No schedules found for doctorId ${doctor._id}, date ${normalizedDate}. Auto-creating schedule...`);

                try {
                  // ⭐ Đảm bảo date là Date object (không phải string)
                  const scheduleDate = appointmentDate instanceof Date ? new Date(appointmentDate) : new Date(appointmentDate);
                  scheduleDate.setHours(0, 0, 0, 0);
                  
                  // Tự động tạo schedule cho bác sĩ này vào ngày này
                  await ScheduleHelper.ensureScheduleForDoctor(doctor._id, scheduleDate);
                  
                  // ⭐ Đợi một chút để đảm bảo database đã commit
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  // ⭐ Query lại sau khi tạo - sử dụng date range để đảm bảo match đúng
                  const startOfDay = new Date(scheduleDate);
                  startOfDay.setHours(0, 0, 0, 0);
                  const endOfDay = new Date(scheduleDate);
                  endOfDay.setHours(23, 59, 59, 999);
                  
                  let newSchedules = await DoctorSchedule.find({
                    doctorUserId: doctor._id,
                    date: {
                      $gte: startOfDay,
                      $lte: endOfDay
                    }
                  }).lean();
                  
                  // Nếu vẫn không tìm thấy, thử query lại với date chính xác
                  if (newSchedules.length === 0) {
                    newSchedules = await DoctorSchedule.find({
                      doctorUserId: doctor._id,
                      date: scheduleDate
                    }).lean();
                  }
                  
                  // Nếu vẫn không tìm thấy, thử tạo lại
                  if (newSchedules.length === 0) {
                    console.log(`⚠️ [create_appointment] Retrying schedule creation...`);
                    await ScheduleHelper.ensureScheduleForDoctor(doctor._id, scheduleDate);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    newSchedules = await DoctorSchedule.find({
                      doctorUserId: doctor._id,
                      date: {
                        $gte: startOfDay,
                        $lte: endOfDay
                      }
                    }).lean();
                    
                    if (newSchedules.length === 0) {
                      return { error: 'Không thể tạo lịch làm việc cho bác sĩ vào ngày này. Vui lòng thử lại sau.' };
                    }
                  }
                  
                  // ⭐ Lọc chỉ lấy schedule có status 'Available' (ít nhất 1 ca còn available)
                  const availableSchedules = newSchedules.filter(s => s.status === 'Available');
                  
                  if (availableSchedules.length === 0) {
                    // Có schedule nhưng tất cả đều Unavailable
                    // Kiểm tra lại nghỉ phép (có thể schedule đã được tạo trước khi có leave request)
                    const recheckIsOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
                    
                    if (recheckIsOnLeave) {
                      return { error: `Bác sĩ bạn chọn hiện đang nghỉ phép vào ngày ${normalizedDate}. Vui lòng chọn bác sĩ khác hoặc đổi ngày.` };
                    }
                    
                    // Không nghỉ phép nhưng schedule Unavailable - có thể do đã qua giờ làm việc
                    const firstSchedule = newSchedules[0];
                    if (firstSchedule && firstSchedule.workingHours) {
                      const workingHours = firstSchedule.workingHours;
                      return { 
                        error: `Bác sĩ này không còn khung giờ khả dụng vào ngày ${normalizedDate}. Bác sĩ làm việc từ ${workingHours.morningStart} - ${workingHours.morningEnd} (buổi sáng) và ${workingHours.afternoonStart} - ${workingHours.afternoonEnd} (buổi chiều). Vui lòng chọn ngày khác.` 
                      };
                    }
                    
                    return { error: 'Không thể tạo lịch làm việc cho bác sĩ vào ngày này. Vui lòng thử lại sau.' };
                  }
                  
                  schedules = availableSchedules;
                  console.log(`✅ [create_appointment] Auto-created schedule for doctorId ${doctor._id}, date ${normalizedDate}, found ${schedules.length} available shifts`);
                } catch (createError) {
                  console.error(`❌ [create_appointment] Error auto-creating schedule:`, createError);
                  console.error(`   - Error stack:`, createError.stack);
                  return { error: 'Không thể tạo lịch làm việc cho bác sĩ vào ngày này. Vui lòng thử lại sau.' };
                }
              } else {
                // Ngày quá khứ - không tự động tạo
                return { error: 'Bác sĩ này không có lịch làm việc vào ngày này. Vui lòng chọn ngày khác.' };
              }
            }
            
            // Find schedule that matches the time slot (morning or afternoon)
            // hours và minutes đã được parse từ input (VN time)
            // ⭐ LUÔN LẤY WORKING HOURS TỪ DATABASE - KHÔNG DÙNG MẶC ĐỊNH
            const workingHours = schedules[0]?.workingHours;
            
            if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || 
                !workingHours.afternoonStart || !workingHours.afternoonEnd) {
              return { error: `Không tìm thấy thông tin khung giờ làm việc của bác sĩ vào ngày này. Vui lòng kiểm tra lại.` };
            }
            
            const schedule = schedules.find(s => {
              
              if (s.shift === 'Morning') {
                const [startHour, startMin] = workingHours.morningStart.split(':').map(Number);
                const [endHour, endMin] = workingHours.morningEnd.split(':').map(Number);
                const slotTimeMinutes = hours * 60 + minutes;
                const startTimeMinutes = startHour * 60 + startMin;
                const endTimeMinutes = endHour * 60 + endMin;
                return slotTimeMinutes >= startTimeMinutes && slotTimeMinutes < endTimeMinutes;
              } else if (s.shift === 'Afternoon') {
                const [startHour, startMin] = workingHours.afternoonStart.split(':').map(Number);
                const [endHour, endMin] = workingHours.afternoonEnd.split(':').map(Number);
                const slotTimeMinutes = hours * 60 + minutes;
                const startTimeMinutes = startHour * 60 + startMin;
                const endTimeMinutes = endHour * 60 + endMin;
                return slotTimeMinutes >= startTimeMinutes && slotTimeMinutes < endTimeMinutes;
              }
              return false;
            });
            
            if (!schedule) {
              // ⭐ LUÔN LẤY WORKING HOURS TỪ DATABASE - KHÔNG DÙNG MẶC ĐỊNH
              const workingHours = schedules[0]?.workingHours;
              
              if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || 
                  !workingHours.afternoonStart || !workingHours.afternoonEnd) {
                return { 
                  error: `Không tìm thấy thông tin khung giờ làm việc của bác sĩ vào ngày này. Vui lòng kiểm tra lại.` 
                };
              }
              
              // ⭐ CỰC KỲ QUAN TRỌNG: Báo lỗi "không nằm trong khung giờ làm việc" thay vì "quá khứ"
              return { 
                error: `Thời gian ${time} không nằm trong khung giờ làm việc của bác sĩ. Bác sĩ làm việc từ ${workingHours.morningStart} - ${workingHours.morningEnd} (buổi sáng) và ${workingHours.afternoonStart} - ${workingHours.afternoonEnd} (buổi chiều). Vui lòng chọn thời gian trong khung giờ làm việc của bác sĩ.` 
              };
            }
            
            // 6. Validate slot duration phải khớp với service duration
            const slotDurationMinutes = (slotEndTime - slotStartTime) / 60000;
            if (slotDurationMinutes !== service.durationMinutes) {
              return { 
                error: `Khung giờ không hợp lệ. Dịch vụ "${service.serviceName}" cần ${service.durationMinutes} phút, nhưng thời gian bạn chọn là ${slotDurationMinutes} phút. Vui lòng chọn lại.` 
              };
            }
            
            // 7. Validate time không ở quá khứ (CHỈ KIỂM TRA SAU KHI ĐÃ XÁC NHẬN THỜI GIAN NẰM TRONG WORKING HOURS)
            // ⭐ CỰC KỲ QUAN TRỌNG: So sánh trong cùng timezone (VN timezone)
            // ⭐ SỬ DỤNG DateHelper để đảm bảo tính chính xác theo timezone VN
            const nowVN = DateHelper.getNowVN(); // UTC Date object đại diện cho thời gian VN hiện tại
            
            // Lấy ngày hôm nay trong VN timezone (YYYY-MM-DD)
            // ⭐ Sử dụng DateHelper để lấy ngày hôm nay theo VN timezone
            const todayDateStr = DateHelper.getTodayVN(); // Format: YYYY-MM-DD
            
            // normalizedDate đã là string "YYYY-MM-DD" (từ input)
            const appointmentDateStr = normalizedDate; // YYYY-MM-DD
            
            // Check nếu date là quá khứ (ngày < hôm nay)
            if (appointmentDateStr < todayDateStr) {
              const dateVN = appointmentDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
              const todayVNFormatted = DateHelper.getTodayVN();
              const [year, month, day] = todayVNFormatted.split('-').map(Number);
              const todayVNDisplay = `${day}/${month}/${year}`;
              return { error: `Không thể đặt lịch trong quá khứ. Ngày bạn chọn là ${dateVN}, nhưng hôm nay là ${todayVNDisplay}. Vui lòng chọn ngày trong tương lai.` };
            }
            
            // Nếu date là hôm nay, check time không được trong quá khứ
            // ⭐ QUAN TRỌNG: So sánh slotStartTime (UTC) với nowVN (UTC) - cả hai đều là UTC nên so sánh chính xác
            if (appointmentDateStr === todayDateStr) {
              // So sánh slotStartTime (UTC) với nowVN (UTC)
              // slotStartTime đã được tính ở UTC, nowVN cũng là UTC (đại diện cho thời gian VN hiện tại)
              // ⭐ QUAN TRỌNG: Chỉ báo lỗi nếu slotStartTime < nowVN (không bao gồm =)
              // Vì nếu = thì có thể là thời gian hiện tại, nhưng vẫn nên cho phép để tránh race condition
              if (slotStartTime.getTime() < nowVN.getTime()) {
                const timeVN = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                // ⭐ Lấy thời gian hiện tại theo VN timezone để hiển thị
                const nowVNForDisplay = DateHelper.getNowVN();
                const nowTimeVN = nowVNForDisplay.toLocaleTimeString('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh', 
                  hour: '2-digit', 
                  minute: '2-digit', 
                  hour12: false
                });
                return { error: `Không thể đặt lịch trong quá khứ. Thời gian bạn chọn là ${timeVN}, nhưng hiện tại là ${nowTimeVN}. Vui lòng chọn thời gian trong tương lai.` };
              }
            }
            
            // 8. ⭐ CỰC KỲ QUAN TRỌNG: Validate thời gian có nằm trong available slots không
            // Kiểm tra xem thời gian user chọn có nằm trong các available gaps không
            try {
              const scheduleRangeResult = await availableSlotService.getDoctorScheduleRange({
                doctorUserId: doctor._id,
                serviceId: service._id,
                date: appointmentDate,
                patientUserId: patientUserId,
                appointmentFor: 'self'
              });

              if (scheduleRangeResult && scheduleRangeResult.scheduleRanges) {
                let isTimeInAvailableSlots = false;
                
                for (const range of scheduleRangeResult.scheduleRanges) {
                  // Kiểm tra availableGaps
                  if (range.availableGaps && range.availableGaps.length > 0) {
                    for (const gap of range.availableGaps) {
                      const gapStart = new Date(gap.start);
                      const gapEnd = new Date(gap.end);
                      
                      // Kiểm tra xem slotStartTime có nằm trong gap không
                      // Slot phải bắt đầu >= gapStart và kết thúc <= gapEnd
                      if (slotStartTime >= gapStart && slotEndTime <= gapEnd) {
                        isTimeInAvailableSlots = true;
                        break;
                      }
                    }
                  }
                  
                  if (isTimeInAvailableSlots) break;
                }
                
                if (!isTimeInAvailableSlots) {
                  // Thời gian không nằm trong available slots
                  // Kiểm tra xem có phải do conflict với appointment của patient không
                  const patientConflictAppointments = await Appointment.find({
                    patientUserId: patientUserId,
                    status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
                    timeslotId: { $exists: true }
                  }).populate({
                    path: 'timeslotId',
                    select: 'startTime endTime'
                  }).lean();
                  
                  const hasPatientConflict = patientConflictAppointments.some(apt => {
                    if (!apt.timeslotId) return false;
                    const aptStartTime = new Date(apt.timeslotId.startTime);
                    const aptEndTime = new Date(apt.timeslotId.endTime);
                    return slotStartTime < aptEndTime && slotEndTime > aptStartTime;
                  });
                  
                  if (hasPatientConflict) {
                    return { error: 'Bạn đã có ca khám vào khung giờ này rồi. Vui lòng đặt khung giờ khác.' };
                  } else {
                    return { error: 'Khung giờ này không khả dụng. Vui lòng chọn thời gian khác từ danh sách khung giờ khả dụng.' };
                  }
                }
              }
            } catch (validateError) {
              console.error('❌ [create_appointment] Error validating available slots:', validateError);
              // Nếu có lỗi khi validate, vẫn tiếp tục để không block flow
            }
            
            // 9. Check conflict với timeslots đã có
            const conflictingTimeslots = await Timeslot.find({
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              startTime: { $lt: slotEndTime },
              endTime: { $gt: slotStartTime },
              status: { $in: ['Reserved', 'Booked'] }
            });
            
            if (conflictingTimeslots.length > 0) {
              return { error: 'Khung giờ này đã có người đặt hoặc đang chờ thanh toán. Vui lòng chọn thời gian khác.' };
            }
            
            // 10. Check conflict với appointments của patient (BẤT KỲ bác sĩ nào) - không được đặt 2 bác sĩ khác nhau cùng giờ
            const patientConflictAppointments = await Appointment.find({
              patientUserId: patientUserId,
              status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
              timeslotId: { $exists: true }
            }).populate({
              path: 'timeslotId',
              select: 'startTime endTime doctorUserId'
            });
            
            const hasConflict = patientConflictAppointments.some(apt => {
              if (!apt.timeslotId) return false;
              
              const aptStartTime = new Date(apt.timeslotId.startTime);
              const aptEndTime = new Date(apt.timeslotId.endTime);
              
              // Conflict nếu: slotStartTime < aptEndTime && slotEndTime > aptStartTime
              return slotStartTime < aptEndTime && slotEndTime > aptStartTime;
            });
            
            if (hasConflict) {
              return { error: 'Bạn đã có lịch khám vào khung giờ này với bác sĩ khác. Vui lòng chọn thời gian khác hoặc hủy lịch cũ trước!' };
            }
            
            // 10. Check conflict với appointments của patient với cùng bác sĩ này
            const sameDayAppointments = await Appointment.find({
              patientUserId,
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
              timeslotId: { $exists: true }
            }).populate({
              path: 'timeslotId',
              select: 'startTime endTime'
            });
            
            for (const apt of sameDayAppointments) {
              if (!apt.timeslotId) continue;
              
              const aptStart = new Date(apt.timeslotId.startTime);
              const aptEnd = new Date(apt.timeslotId.endTime);
              
              // Check overlap: (start1 < end2) AND (end1 > start2)
              if (slotStartTime < aptEnd && slotEndTime > aptStart) {
                const aptDateVN = aptStart.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                const aptStartVN = aptStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
                const aptEndVN = aptEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
                
                return {
                  error: `Bạn đã có lịch hẹn với bác sĩ này vào ${aptDateVN} từ ${aptStartVN} - ${aptEndVN}. Vui lòng chọn bác sĩ khác hoặc thời gian khác.`
                };
              }
            }
            
            // 11. Calculate price với promotion
            const promotionData = await calculateServicePrice(service._id.toString(), service.price);
            const finalPrice = promotionData.finalPrice;
            const originalPrice = promotionData.originalPrice;
            
            // 12. Xác định appointment mode và type
            let appointmentMode = 'Online';
            let appointmentType = 'Consultation';
            if (service.category === 'Consultation') {
              appointmentMode = 'Online';
              appointmentType = 'Consultation';
            } else if (service.category === 'Examination') {
              appointmentMode = 'Offline';
              appointmentType = 'Examination';
            }
            
            // 13. Xác định status dựa vào isPrepaid
            let appointmentStatus = 'Pending';
            let paymentHoldExpiresAt = null;
            if (service.isPrepaid) {
              appointmentStatus = 'PendingPayment';
              paymentHoldExpiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 phút
            }
            
            // 14. Tạo Timeslot
            const newTimeslot = await Timeslot.create({
              doctorScheduleId: schedule._id,
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              serviceId: service._id, // Dùng service._id thay vì serviceId
              startTime: slotStartTime,
              endTime: slotEndTime,
              breakAfterMinutes: 0,
              status: service.isPrepaid ? 'Reserved' : 'Booked',
              appointmentId: null // Sẽ update sau
            });
            
            // 15. Tạo Appointment
            const newAppointment = await Appointment.create({
              patientUserId,
              customerId: null, // Đặt cho bản thân
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              serviceId: service._id, // Dùng service._id thay vì serviceId
              timeslotId: newTimeslot._id,
              status: appointmentStatus,
              type: appointmentType,
              mode: appointmentMode,
              notes: notes || null,
              bookedByUserId: patientUserId,
              paymentHoldExpiresAt: paymentHoldExpiresAt,
              appointmentFor: 'self',
              promotionId: promotionData.promotionInfo?.promotionId || null,
              originalPrice: originalPrice,
              finalPrice: finalPrice,
              discountAmount: promotionData.discountAmount
            });
            
            // 16. Update timeslot với appointmentId
            await Timeslot.findByIdAndUpdate(newTimeslot._id, {
              appointmentId: newAppointment._id,
              status: service.isPrepaid ? 'Reserved' : 'Booked'
            });
            
            // 17. Nếu cần thanh toán trước, tạo payment record (tạm thời skip, vì AI booking không có payment flow)
            
            return {
              success: true,
              appointmentId: newAppointment._id.toString(),
              service: service.serviceName,
              serviceId: service._id.toString(),
              serviceDescription: service.description || '',
              serviceCategory: service.category || '',
              serviceDuration: service.durationMinutes || 30,
              doctor: doctor.fullName,
              doctorId: doctor._id.toString(),
              doctorSpecialization: doctor.specialization || '',
              doctorEmail: doctor.email || '',
              doctorPhoneNumber: doctor.phoneNumber || '',
              date: date,
              time: time,
              status: appointmentStatus,
              appointmentType: appointmentType,
              appointmentMode: appointmentMode,
              finalPrice: finalPrice,
              originalPrice: originalPrice,
              discountAmount: promotionData.discountAmount || 0,
              needsPayment: service.isPrepaid,
              notes: notes || null
            };
          } catch (error) {
            console.error('❌ [AI create_appointment] Error:', error);
            return { error: error.message || 'Đã xảy ra lỗi khi tạo lịch hẹn. Vui lòng thử lại.' };
          }
        }
        
        default:
          return { error: `Unknown function: ${functionName}` };
      }
    } catch (error) {
      console.error(`❌ [AI] Error executing function ${functionName}:`, error);
      return { error: error.message };
    }
  }

  /**
   * ⭐ Preprocess user input để tăng độ chính xác
   * - Normalize text
   * - Extract intent
   * - Fix common typos
   */
  preprocessUserInput(userPrompt) {
    if (!userPrompt || typeof userPrompt !== 'string') {
      return userPrompt;
    }
    
    let processed = userPrompt.trim();
    
    // Normalize common variations
    const normalizations = {
      // Ngày tháng
      'ngày mai': 'mai',
      'sáng mai': 'mai buổi sáng',
      'chiều mai': 'mai buổi chiều',
      // Dịch vụ
      'khám răng': 'khám răng',
      'đặt lịch': 'đặt lịch',
      // Bác sĩ
      'bs ': 'bác sĩ ',
      'bac si ': 'bác sĩ ',
      // Số thứ tự
      'số ': '',
      'số': '',
    };
    
    // Apply normalizations
    Object.entries(normalizations).forEach(([old, replacement]) => {
      processed = processed.replace(new RegExp(old, 'gi'), replacement);
    });
    
    // Remove extra spaces
    processed = processed.replace(/\s+/g, ' ').trim();
    
    return processed;
  }

  /**
   * 🆕 Chat với AI sử dụng Function Calling (linh hoạt như ChatGPT)
   */
  /**
   * Lọc và làm sạch conversation history để loại bỏ thông tin không hợp lệ
   * - Loại bỏ messages có error hoặc bị reject
   * - Loại bỏ thông tin về time/date từ message cũ không liên quan
   * - Chỉ giữ lại thông tin hợp lệ và liên quan đến booking hiện tại
   */
  filterConversationHistory(history) {
    if (!Array.isArray(history) || history.length === 0) {
      return [];
    }
    
    // Filter logic:
    // 1. Loại bỏ messages có chứa error keywords
    const errorKeywords = [
      'lỗi', 'error', 'không thể', 'không hợp lệ', 
      'quá khứ', 'bị từ chối', 'rejected', 'failed'
    ];
    
    // 2. Chỉ giữ lại messages có role hợp lệ
    const filtered = history.filter(msg => {
      if (!msg || typeof msg !== 'object') return false;
      if (msg.role !== 'user' && msg.role !== 'assistant') return false;
      if (!msg.content || typeof msg.content !== 'string') return false;
      
      // Loại bỏ messages có error (nhưng giữ lại nếu là assistant message có suggestions)
      const content = msg.content.toLowerCase();
      const hasError = errorKeywords.some(keyword => content.includes(keyword));
      
      // Nếu là assistant message và có error → có thể giữ nếu có suggestions
      if (msg.role === 'assistant' && hasError) {
        // Giữ lại nếu có suggestions hoặc hướng dẫn tiếp theo
        const hasSuggestions = content.includes('vui lòng') || 
                               content.includes('bạn có thể') ||
                               content.includes('dịch vụ') ||
                               content.includes('bác sĩ');
        return hasSuggestions;
      }
      
      // Nếu là user message và có error → có thể là message bị reject, bỏ đi
      if (msg.role === 'user' && hasError) {
        return false;
      }
      
      return true;
    });
    
    // 3. Giới hạn số lượng messages để tránh quá dài (chỉ giữ 10 messages gần nhất)
    const maxMessages = 10;
    return filtered.slice(-maxMessages);
  }

  formatDateForDisplay(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      return dateStr;
    }
    const parts = dateStr.split('-');
    if (parts.length !== 3) {
      return dateStr;
    }
    const [year, month, day] = parts;
    if (!year || !month || !day) {
      return dateStr;
    }
    return `${day}/${month}/${year}`;
  }

  formatCurrency(amount) {
    if (amount == null) return null;
    const numeric = Number(amount);
    if (Number.isNaN(numeric)) return amount;
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(numeric);
  }

  buildAppointmentConfirmationMessage(appointment) {
    if (!appointment) {
      return '✅ Lịch hẹn của bạn đã được đặt thành công.';
    }

    const dateDisplay = this.formatDateForDisplay(appointment.date);
    const timeDisplay = appointment.time ? ` lúc ${appointment.time}` : '';

    const statusMap = {
      PendingPayment: 'Đang chờ thanh toán',
      Pending: 'Đang chờ xác nhận',
      Approved: 'Đã xác nhận',
      Booked: 'Đã đặt chỗ',
      CheckedIn: 'Đã đến phòng khám',
      InProgress: 'Đang trong ca khám',
      Completed: 'Đã hoàn tất'
    };
    const statusLabel = statusMap[appointment.status] || appointment.status;

    const priceLine = appointment.finalPrice != null
      ? `- Giá: ${this.formatCurrency(appointment.finalPrice)}`
      : null;

    const note = appointment.needsPayment
      ? '- Vui lòng hoàn tất thanh toán trước để giữ chỗ. Thông tin thanh toán sẽ được gửi đến email của bạn.'
      : '- Bạn chỉ cần đến trước 5-10 phút để làm thủ tục, không cần thanh toán trước.';

    const lines = [
      `✅ Lịch hẹn "${appointment.service}" với ${appointment.doctor} đã được xác nhận!`,
      `- Ngày & giờ: ${dateDisplay}${timeDisplay}`,
      `- Trạng thái: ${statusLabel}`,
      priceLine,
      note
    ].filter(Boolean);

    return lines.join('\n');
  }

  collectUserMessages(latestPrompt, history) {
    const messages = [];
    if (latestPrompt && typeof latestPrompt === 'string' && latestPrompt.trim().length > 0) {
      messages.push(latestPrompt);
    }
    if (Array.isArray(history)) {
      history.forEach(msg => {
        if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.trim().length > 0) {
          messages.push(msg.content);
        }
      });
    }
    return messages;
  }

  normalizeVietnameseText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getCurrentVietnamTimeInfo() {
    const now = new Date();
    const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false });
    const minuteFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', minute: '2-digit' });
    const displayFormatter = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
    const hour = parseInt(hourFormatter.format(now), 10);
    const minute = parseInt(minuteFormatter.format(now), 10);
    return {
      hour,
      minute,
      totalMinutes: hour * 60 + minute,
      display: displayFormatter.format(now)
    };
  }

  getTimePeriodRequestInfo(message) {
    if (!message || typeof message !== 'string') {
      return null;
    }
    const normalized = this.normalizeVietnameseText(message);
    if (!normalized) {
      return null;
    }
    const periods = [
      {
        label: 'buổi sáng hôm nay',
        endMinutes: 12 * 60,
        keywords: ['sang nay', 'sang hom nay', 'buoi sang nay', 'buoi sang hom nay']
      },
      {
        label: 'buổi trưa hôm nay',
        endMinutes: 13 * 60,
        keywords: ['trua nay', 'trua hom nay', 'buoi trua nay']
      },
      {
        label: 'buổi chiều hôm nay',
        endMinutes: 18 * 60,
        keywords: ['chieu nay', 'chieu hom nay', 'buoi chieu nay']
      },
      {
        label: 'buổi tối hôm nay',
        endMinutes: 22 * 60,
        keywords: ['toi nay', 'toi hom nay', 'buoi toi nay', 'ban toi nay']
      }
    ];
    for (const period of periods) {
      if (period.keywords.some(keyword => normalized.includes(keyword))) {
        return period;
      }
    }
    return null;
  }

  cleanMentionText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    const tokens = text
      .replace(/[\*\[\]\(\)\.,!?:]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    
    const cleanedTokens = [];
    for (const token of tokens) {
      const normalizedToken = this.normalizeVietnameseText(token);
      if (!normalizedToken) continue;
      if (CONTEXT_STOP_WORDS.has(normalizedToken)) {
        break;
      }
      cleanedTokens.push(token);
    }
    return cleanedTokens.join(' ').trim();
  }

  hasUserMentionedServiceName(serviceName, latestPrompt, history) {
    if (!serviceName || typeof serviceName !== 'string') {
      return false;
    }
    const normalizedService = this.normalizeVietnameseText(serviceName);
    if (!normalizedService) {
      return false;
    }
    const userMessages = this.collectUserMessages(latestPrompt, history);
    return userMessages.some(message => {
      const normalizedMessage = this.normalizeVietnameseText(message);
      return normalizedMessage.includes(normalizedService);
    });
  }

  userSelectedServiceByNumber(latestPrompt, history) {
    const numberOnlyRegex = /^\s*\d+(\s*,\s*\d+)*\s*$/;
    const numberWithKeywordRegex = /(dich\svu|chon|lua\s+chon|option|muon|chon\s+so|chon\s+dich\svu)\s*\d+/;
    const userMessages = this.collectUserMessages(latestPrompt, history);
    return userMessages.some(message => {
      if (!message || typeof message !== 'string') return false;
      if (numberOnlyRegex.test(message.trim())) {
        return true;
      }
      const normalizedMessage = this.normalizeVietnameseText(message);
      return numberWithKeywordRegex.test(normalizedMessage);
    });
  }

  userConfirmedServiceChoice(serviceName, latestPrompt, history) {
    if (this.userSelectedServiceByNumber(latestPrompt, history)) {
      return true;
    }
    return this.hasUserMentionedServiceName(serviceName, latestPrompt, history);
  }

  hasServiceInfoInResults(functionResults = []) {
    if (!Array.isArray(functionResults)) {
      return false;
    }
    return functionResults.some(fr => {
      if (!fr || !fr.result) return false;
      if (fr.functionName === 'validate_service' && fr.result.valid) {
        return true;
      }
      if (fr.functionName === 'find_service_by_name' && fr.result.found && !fr.result.multiple) {
        return true;
      }
      return false;
    });
  }

  hasServiceInfoInHistory(history = []) {
    if (!Array.isArray(history)) {
      return false;
    }
    
    // ⭐ KIỂM TRA 1: Assistant messages - xác nhận dịch vụ
    const servicePatterns = [
      /dịch vụ bạn chọn/i,
      /dịch vụ đã được chọn/i,
      /bạn đã chọn dịch vụ/i,
      /dịch vụ bạn đã chọn/i
    ];
    const hasServiceInAssistant = history.some(msg => {
      if (!msg || msg.role !== 'assistant' || typeof msg.content !== 'string') {
        return false;
      }
      return servicePatterns.some(pattern => pattern.test(msg.content));
    });
    
    if (hasServiceInAssistant) {
      return true;
    }
    
    // ⭐ KIỂM TRA 2: User messages - user đã nhập tên dịch vụ (dùng danh sách dịch vụ từ DB)
    const serviceKeywords = this.getServiceKeywords();
    
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') {
        continue;
      }
      const content = msg.content.toLowerCase();
      const hasServiceKeyword = serviceKeywords.some(keyword => content.includes(keyword));
      
                  if (hasServiceKeyword) {
                    return true;
      }
    }
    
    return false;
  }

  hasServiceContext(functionResults, history) {
    return this.hasServiceInfoInResults(functionResults) || this.hasServiceInfoInHistory(history);
  }

  hasDoctorContext(functionResults, history) {
    const hasDoctorInResults = functionResults.some(fr => 
      (fr.functionName === 'find_doctor_by_name' && fr.result.found && !fr.result.multiple) ||
      (fr.functionName === 'validate_doctor' && fr.result.valid)
    );
    
    // Check history for doctor mentions
    if (!Array.isArray(history)) {
      return hasDoctorInResults;
    }
    
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg.content) continue;
      const content = msg.content.toLowerCase();
      
      if (msg.role === 'assistant') {
        if (content.includes('bác sĩ bạn chọn') || 
            content.includes('bác sĩ đã được chọn') ||
            content.includes('bác sĩ bạn muốn')) {
          return true;
        }
      }
      
      if (msg.role === 'user') {
        const doctorKeywords = ['bác sĩ', 'bs', 'doctor', 'dr'];
        const hasDoctorKeyword = doctorKeywords.some(keyword => content.includes(keyword));
        if (hasDoctorKeyword) {
          for (let j = i + 1; j < history.length; j++) {
            const nextMsg = history[j];
            if (nextMsg.role === 'assistant' && nextMsg.content) {
              const nextContent = nextMsg.content.toLowerCase();
              if (nextContent.includes('bác sĩ') && 
                  (nextContent.includes('chọn') || nextContent.includes('đã'))) {
                return true;
              }
            }
          }
        }
      }
    }
    
    return hasDoctorInResults;
  }

  extractDoctorMentionsFromMessage(message) {
    if (!message || typeof message !== 'string') {
      return [];
    }
    const mentions = [];
    const regex = /(bác sĩ|bac si|bs|doctor|dr)\s+([a-zà-ỹ\s]{1,40})/gi;
    let match;
    while ((match = regex.exec(message)) !== null) {
      const raw = match[2]
        .replace(/[,.;:!?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (raw.length > 0) {
        const cleaned = this.cleanMentionText(raw);
        if (cleaned.length > 0) {
          mentions.push(cleaned);
        } else {
          mentions.push(raw.trim());
        }
      }
    }
    return mentions;
  }

  extractLastServiceNameFromHistory(history = []) {
    if (!Array.isArray(history)) return null;
    const patterns = [
      /Dịch vụ\s+bạn\s+chọn\s+là\s+\*\*(.+?)\*\*/i,
      /Dịch vụ\s+(.+?)\s+(?:với|ngày|\.|,|\(|$)/i
    ];
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg || typeof msg.content !== 'string') continue;
      for (const pattern of patterns) {
        const match = msg.content.match(pattern);
        if (match && match[1]) {
          const cleaned = this.cleanMentionText(match[1]);
          if (cleaned) {
            return cleaned;
          }
        }
      }
    }
    return null;
  }

  extractLastDoctorNameFromHistory(history = []) {
    if (!Array.isArray(history)) return null;
    const assistantPatterns = [
      /Bác sĩ\s+bạn\s+chọn\s+là\s+\*\*(.+?)\*\*/i,
      /Bác sĩ\s+(.+?)\s+(?:có|sẽ|ngày|\.|,|\(|$)/i
    ];
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg || typeof msg.content !== 'string') continue;
      if (msg.role === 'assistant') {
        for (const pattern of assistantPatterns) {
          const match = msg.content.match(pattern);
          if (match && match[1]) {
            const cleaned = this.cleanMentionText(match[1]);
            if (cleaned) {
              return cleaned;
            }
          }
        }
      } else if (msg.role === 'user') {
        const match = msg.content.match(/(?:bác sĩ|bs|doctor|dr)\s+([a-zà-ỹ\s]+)/i);
        if (match && match[1]) {
          const cleaned = this.cleanMentionText(match[1]);
          if (cleaned) {
            return cleaned;
          }
        }
      }
    }
    return null;
  }

  async resolveServiceInfoFromHistory(history, patientUserId) {
    const serviceName = this.extractLastServiceNameFromHistory(history);
    if (!serviceName) return null;
    try {
      const result = await this.executeFunction(
        'find_service_by_name',
        { serviceName },
        patientUserId
      );
      if (result?.found && result.service) {
        return result.service;
      }
    } catch (error) {
      console.error('❌ [AI Booking] Error resolving service from history:', error?.message || error);
    }
    return null;
  }

  async resolveDoctorInfoFromHistory(history, patientUserId) {
    const doctorName = this.extractLastDoctorNameFromHistory(history);
    if (!doctorName) return null;
    try {
      const result = await this.executeFunction(
        'find_doctor_by_name',
        { doctorName },
        patientUserId
      );
      if (result?.found && result.doctor && !result.multiple) {
        return result.doctor;
      }
    } catch (error) {
      console.error('❌ [AI Booking] Error resolving doctor from history:', error?.message || error);
    }
    return null;
  }

  findDoctorMention(latestPrompt, history) {
    const userMessages = this.collectUserMessages(latestPrompt, history);
    for (const message of userMessages) {
      const mentions = this.extractDoctorMentionsFromMessage(message);
      if (mentions.length > 0) {
        return mentions[0];
      }
    }
    return null;
  }

  hasUserMentionedDoctorName(doctorName, latestPrompt, history) {
    if (!doctorName || typeof doctorName !== 'string') {
      return false;
    }
    const normalizedDoctor = this.normalizeVietnameseText(doctorName)
      .replace(/^(bac si|bs|doctor|dr)\s+/, '')
      .trim();
    if (!normalizedDoctor) {
      return false;
    }
    const userMessages = this.collectUserMessages(latestPrompt, history);
    return userMessages.some(message => {
      const normalizedMessage = this.normalizeVietnameseText(message);
      return normalizedMessage.includes(normalizedDoctor);
    });
  }

  userSelectedDoctorByNumber(latestPrompt, history) {
    const numberOnlyRegex = /^\s*\d+(\s*,\s*\d+)*\s*$/;
    const numberWithKeywordRegex = /(bác sĩ|bac si|doctor|dr|chon|lua\s+chon|option)\s*\d+/i;
    const userMessages = this.collectUserMessages(latestPrompt, history);
    return userMessages.some(message => {
      if (!message || typeof message !== 'string') return false;
      if (numberOnlyRegex.test(message.trim())) {
        return true;
      }
      return numberWithKeywordRegex.test(message);
    });
  }

  userConfirmedDoctorChoice(doctorName, latestPrompt, history) {
    if (this.userSelectedDoctorByNumber(latestPrompt, history)) {
      return true;
    }
    return this.hasUserMentionedDoctorName(doctorName, latestPrompt, history);
  }

  shouldAttemptDateParsing(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    const lowerMessage = message.toLowerCase();
    const relativeKeywords = /(hôm qua|ngày hôm qua|hôm trước|ngày trước|yesterday)/i;
    const timeOfDayKeywords = /(sáng nay|buổi sáng|trưa nay|buổi trưa|chiều nay|buổi chiều|tối nay|ban tối|đêm nay|sáng mai|chiều mai|tối mai)/i;
    const explicitDatePattern = /\d{1,2}\s*(\/|-|\s+tháng\s+)\s*\d{1,2}(\s*(\/|-)\s*\d{2,4})?/i;
    const isoPattern = /\d{4}-\d{2}-\d{2}/;
    return relativeKeywords.test(lowerMessage) || timeOfDayKeywords.test(lowerMessage) || explicitDatePattern.test(message) || isoPattern.test(message);
  }

  isInformationalQuery(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    const lowerMessage = message.toLowerCase().trim();
    
    // Các pattern cho câu hỏi thông tin về ngày tháng
    const informationalPatterns = [
      /^(vậy\s+)?(ngày\s+)?hôm\s+nay\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(vậy\s+)?(ngày\s+)?mai\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(vậy\s+)?(ngày\s+)?hôm\s+nay\s+(là\s+)?(thứ\s+)?(mấy|gì|bao\s+nhiêu)/i,
      /^(vậy\s+)?(ngày\s+)?mai\s+(là\s+)?(thứ\s+)?(mấy|gì|bao\s+nhiêu)/i,
      /^(hôm\s+nay|ngày\s+hôm\s+nay)\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(ngày\s+)?mai\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(cho\s+)?(tôi\s+)?(biết\s+)?(ngày\s+)?hôm\s+nay\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(cho\s+)?(tôi\s+)?(biết\s+)?(ngày\s+)?mai\s+(là\s+)?(ngày\s+)?(bao\s+nhiêu|gì|mấy)/i,
      /^(hôm\s+nay|ngày\s+hôm\s+nay)\s+(là\s+)?(thứ\s+)?(mấy|gì)/i,
      /^(ngày\s+)?mai\s+(là\s+)?(thứ\s+)?(mấy|gì)/i
    ];
    
    return informationalPatterns.some(pattern => pattern.test(lowerMessage));
  }

  isOffTopicInput(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    const lowerMessage = message.toLowerCase().trim();
    
    // ⭐ CỰC KỲ QUAN TRỌNG: Kiểm tra xem có phải là input về thời gian không (ví dụ: "9 giờ", "8h", "14h30", "09:00")
    // Pattern cho thời gian: số + "giờ"/"h"/":" hoặc "giờ" + số
    const timePatterns = [
      /^\d+\s*(?:giờ|h|hour|hours)/i, // "9 giờ", "8h", "9 hour"
      /^(?:giờ|h)\s*\d+/i, // "giờ 9", "h 8"
      /^\d{1,2}:\d{2}/, // "09:00", "9:30", "14:30"
      /^\d{1,2}h\d{2}/i, // "9h30", "14h30"
      /^\d{1,2}\s*giờ\s*\d{1,2}/i, // "9 giờ 30"
      /^(?:sáng|chiều|tối|trưa)/i, // "sáng", "chiều", "tối", "trưa"
      /^(?:buổi sáng|buổi chiều|buổi tối)/i // "buổi sáng", "buổi chiều"
    ];
    
    const isTimeInput = timePatterns.some(pattern => pattern.test(lowerMessage));
    if (isTimeInput) {
      console.log(`✅ [isOffTopicInput] Detected time input: "${message}" → NOT off-topic`);
      return false; // Input về thời gian → không phải off-topic
    }
    
    // Từ khóa liên quan đến đặt lịch nha khoa (KHÔNG phải off-topic)
    const dentalKeywords = [
      'đặt lịch', 'dat lich', 'book', 'appointment', 'khám', 'kham', 'răng', 'rang',
      'nha khoa', 'nhakhoa', 'dentist', 'bác sĩ', 'bac si', 'doctor', 'bs',
      'dịch vụ', 'dich vu', 'service', 'làm sạch', 'lam sach', 'nhổ', 'nhổ răng',
      'bọc răng', 'boc rang', 'tẩy trắng', 'tay trang', 'trồng răng', 'trong rang',
      'lấy tủy', 'lay tuy', 'mài răng', 'mai rang', 'tư vấn', 'tu van',
      'khám tổng quát', 'kham tong quat', 'gắn đinh', 'gan dinh', 'amidan'
    ];
    
    // Kiểm tra xem có từ khóa nha khoa không
    const hasDentalKeyword = dentalKeywords.some(keyword => lowerMessage.includes(keyword));
    if (hasDentalKeyword) {
      return false; // Có từ khóa nha khoa → không phải off-topic
    }
    
    // Từ khóa off-topic (đồ ăn, thức uống, du lịch, giải trí, v.v.)
    const offTopicKeywords = [
      'bún', 'bun', 'phở', 'pho', 'mắm tôm', 'mam tom', 'cơm', 'com',
      'bánh', 'banh', 'nước', 'nuoc', 'cà phê', 'ca phe', 'trà', 'tra',
      'du lịch', 'du lich', 'travel', 'tour', 'đi chơi', 'di choi',
      'phim', 'movie', 'nhạc', 'nhac', 'music', 'game', 'thể thao', 'the thao',
      'sport', 'bóng đá', 'bong da', 'football', 'bóng rổ', 'bong ro', 'basketball',
      'mua sắm', 'mua sam', 'shopping', 'thời trang', 'thoi trang', 'fashion',
      'chính trị', 'chinh tri', 'politics', 'tin tức', 'tin tuc', 'news',
      'học tập', 'hoc tap', 'study', 'giáo dục', 'giao duc', 'education',
      'công việc', 'cong viec', 'work', 'job', 'nghề nghiệp', 'nghe nghiep'
    ];
    
    // Kiểm tra xem có từ khóa off-topic không
    const hasOffTopicKeyword = offTopicKeywords.some(keyword => lowerMessage.includes(keyword));
    if (hasOffTopicKeyword) {
      return true; // Có từ khóa off-topic → là off-topic
    }
    
    // Nếu input quá ngắn (< 3 từ) và không có từ khóa nha khoa → có thể là off-topic
    const words = lowerMessage.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 3 && !hasDentalKeyword) {
      // Kiểm tra xem có phải là greeting/affirmative/rejection không
      const greetingWords = ['xin chào', 'hello', 'hi', 'chào', 'chao', 'helo'];
      const affirmativeWords = ['có', 'co', 'được', 'duoc', 'ok', 'oke', 'okie', 'vâng', 'vang', 'dạ', 'da', 'yes', 'sure'];
      const rejectionWords = ['không', 'khong', 'thôi', 'thoi', 'cancel', 'hủy', 'huy', 'no'];
      
      const isGreeting = greetingWords.some(word => lowerMessage.includes(word));
      const isAffirmative = affirmativeWords.some(word => lowerMessage === word || lowerMessage.startsWith(word + ' '));
      const isRejection = rejectionWords.some(word => lowerMessage.includes(word));
      
      if (!isGreeting && !isAffirmative && !isRejection) {
        return true; // Ngắn, không có từ khóa nha khoa, không phải greeting/affirmative/rejection → có thể off-topic
      }
    }
    
    return false; // Mặc định không phải off-topic
  }

  async detectPastDateIntent(latestPrompt, history) {
    if (!this.shouldAttemptDateParsing(latestPrompt)) {
      return null;
    }

    try {
      const normalized = await this.normalizeDateArgument(
        latestPrompt,
        {
          latestUserPrompt: latestPrompt,
          conversationHistory: history,
          activeFunction: 'past_date_guard'
        },
        new Map()
      );

      if (normalized.status === 'past') {
        const displayDate = normalized.date ? this.formatDateForDisplay(normalized.date) : normalized.originalInput;
        const message = normalized.message ||
          `Không thể đặt lịch trong quá khứ. Ngày bạn chọn là ${displayDate}. Vui lòng chọn ngày trong tương lai.`;
        return message;
      }

      const todayStr = DateHelper.getTodayVN();
      if (normalized.date === todayStr) {
        const periodInfo = this.getTimePeriodRequestInfo(latestPrompt);
        if (periodInfo) {
          const currentTimeInfo = this.getCurrentVietnamTimeInfo();
          if (currentTimeInfo.totalMinutes >= periodInfo.endMinutes) {
            const dateDisplay = this.formatDateForDisplay(normalized.date);
            return `Hiện tại đã ${currentTimeInfo.display} nên ${periodInfo.label} ngày ${dateDisplay} đã qua. Vui lòng chọn thời gian còn lại trong ngày hoặc một ngày khác trong tương lai.`;
          }
        }
      }
    } catch (error) {
      console.error('❌ [AI Booking] detectPastDateIntent error:', error);
    }

    return null;
  }

  formatServiceListMessage(services = []) {
    if (!Array.isArray(services) || services.length === 0) {
      return '';
    }
    const items = services.map((s, idx) => {
      const duration = s.durationMinutes ? ` (${s.durationMinutes} phút)` : '';
      const description = s.description ? ` - ${s.description}` : '';
      return `${idx + 1}. ${s.name || s.serviceName || 'Dịch vụ'}${duration}${description}`;
    });
    return `Dưới đây là danh sách dịch vụ hiện có:\n${items.join('\n')}\n\nBạn muốn chọn dịch vụ nào? (Nhập tên hoặc số thứ tự)`;
  }

  async buildServiceSelectionFollowUp(functionResults, filteredHistory, processedPrompt, patientUserId, hasServiceId = false) {
    if (hasServiceId) {
      return null;
    }

    // ⭐ Kiểm tra nếu đây là câu hỏi thông tin (informational query) - chỉ trả lời thông tin, không chuyển sang đặt lịch
    if (this.isInformationalQuery(processedPrompt)) {
      try {
        const todayStr = DateHelper.getTodayVN();
        const todayDisplay = this.formatDateForDisplay(todayStr);
        const tomorrowStr = DateHelper.getTomorrowVN();
        const tomorrowDisplay = this.formatDateForDisplay(tomorrowStr);
        
        const lowerPrompt = processedPrompt.toLowerCase();
        let infoResponse = '';
        
        if (lowerPrompt.includes('hôm nay')) {
          infoResponse = `Hôm nay là ngày ${todayDisplay}.`;
        } else if (lowerPrompt.includes('ngày mai') || lowerPrompt.includes('mai')) {
          infoResponse = `Ngày mai là ngày ${tomorrowDisplay}.`;
        } else {
          infoResponse = `Hôm nay là ngày ${todayDisplay}. Ngày mai là ngày ${tomorrowDisplay}.`;
        }
        
        const updatedHistory = [...filteredHistory,
          { role: "user", content: processedPrompt },
          { role: "assistant", content: infoResponse }
        ];

        return {
          success: true,
          needsMoreInfo: false,
          response: infoResponse,
          conversationHistory: updatedHistory
        };
      } catch (infoError) {
        console.error('❌ [AI Booking] Error handling informational query in buildServiceSelectionFollowUp:', infoError);
        // Nếu có lỗi khi xử lý câu hỏi thông tin, trả về lỗi generic thay vì throw
        return {
          success: false,
          needsMoreInfo: false,
          response: 'Xin lỗi, mình không thể lấy thông tin ngày tháng. Vui lòng thử lại sau.',
          conversationHistory: filteredHistory || []
        };
      }
    }

    const pastDateMessage = await this.detectPastDateIntent(processedPrompt, filteredHistory);
    if (pastDateMessage) {
      const updatedHistory = [...filteredHistory,
        { role: "user", content: processedPrompt },
        { role: "assistant", content: pastDateMessage }
      ];

      return {
        success: false,
        needsMoreInfo: true,
        response: pastDateMessage,
        conversationHistory: updatedHistory
      };
    }

    let listResult = [...functionResults].reverse().find(fr => {
      if (!fr || !fr.result) return false;
      if (fr.functionName === 'get_services' && Array.isArray(fr.result.services) && fr.result.services.length > 0) {
        return true;
      }
      if (Array.isArray(fr.result?.services) && fr.result.services.length > 0) {
        return true;
      }
      if (Array.isArray(fr.result?.suggestions) && fr.result.suggestions.length > 0) {
        return true;
      }
      return false;
    });

    if (!listResult) {
      const fallbackServices = await this.executeFunction('get_services', {}, patientUserId);
      listResult = { functionName: 'get_services', result: fallbackServices };
    }

    const serviceItems = listResult?.result?.services || listResult?.result?.suggestions;
    this.updateServiceKeywordCacheFromList(serviceItems);
    const listMessage = this.formatServiceListMessage(serviceItems);
    const responseMessage = [
      'Bạn chưa chọn dịch vụ cụ thể cho lịch hẹn này. Vui lòng chọn dịch vụ bằng cách nhập tên hoặc số thứ tự trong danh sách.',
      listMessage || 'Hiện tại chưa có danh sách dịch vụ để hiển thị. Bạn có thể nhập tên dịch vụ (ví dụ: "Khám tổng quát", "Nhổ răng") để mình hỗ trợ.'
    ].join('\n\n');

    const updatedHistory = [...filteredHistory,
      { role: "user", content: processedPrompt },
      { role: "assistant", content: responseMessage }
    ];

    return {
      success: false,
      needsMoreInfo: true,
      response: responseMessage,
      conversationHistory: updatedHistory
    };
  }

  getLatestDateFromResults(functionResults = []) {
    if (!Array.isArray(functionResults)) {
      return null;
    }
    for (let i = functionResults.length - 1; i >= 0; i--) {
      const fr = functionResults[i];
      if (!fr) continue;
      if (fr.functionArgs && fr.functionArgs.date) {
        return fr.functionArgs.date;
      }
      if (fr.result && fr.result.date) {
        return fr.result.date;
      }
    }
    return null;
  }

  async extractDateFromConversation(latestPrompt, history, dateValidationCache) {
    const userMessages = this.collectUserMessages(latestPrompt, history);
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const message = userMessages[i];
      if (!this.shouldAttemptDateParsing(message)) {
        continue;
      }
      const normalized = await this.normalizeDateArgument(
        message,
        {
          latestUserPrompt: message,
          conversationHistory: history,
          activeFunction: 'context_date_extract'
        },
        dateValidationCache
      );
      if (normalized && normalized.success && normalized.date) {
        return normalized.date;
      }
    }
    return null;
  }

  formatAvailableSlotsMessage(rangeResult, serviceName, doctorName, dateDisplay) {
    if (!rangeResult || !Array.isArray(rangeResult.scheduleRanges)) {
      return `Không thể tải khung giờ của bác sĩ ${doctorName} vào ngày ${dateDisplay}. Vui lòng thử lại sau.`;
    }

    const lines = [`Dịch vụ ${serviceName} với ${doctorName} ngày ${dateDisplay}.`];

    if (rangeResult.message) {
      lines.push(rangeResult.message);
    }

    const formatTime = (isoString) => {
      if (!isoString) return '--:--';
      const date = new Date(isoString);
      const hour = (date.getUTCHours() + 7 + 24) % 24;
      const minute = date.getUTCMinutes();
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    };

    const hasAvailableSlots = rangeResult.scheduleRanges.some(range => {
      if (!range) return false;
      if (range.availableGaps && range.availableGaps.length > 0) return true;
      const label = (range.displayRange || '').trim();
      return label && !['đã hết chỗ', 'đã qua thời gian làm việc'].includes(label.toLowerCase());
    });

    for (const range of rangeResult.scheduleRanges) {
      const label = (range.displayRange || '').trim();
      const isUnavailableLabel = label &&
        ['đã hết chỗ', 'đã qua thời gian làm việc'].includes(label.toLowerCase());

      if (isUnavailableLabel) {
        lines.push(`\n- ${range.shiftDisplay || ''}: ${label}`);
        continue;
      }

      // ⭐ CỰC KỲ QUAN TRỌNG: Nếu có availableGaps hoặc label (các timeslot cụ thể) → CHỈ hiển thị các slots cụ thể
      // TUYỆT ĐỐI KHÔNG hiển thị "từ 08:00 đến 12:00" khi đã có các slot cụ thể
      const hasSpecificSlots = (label && label.trim()) || (range.availableGaps && range.availableGaps.length > 0);
      
      if (hasSpecificSlots) {
        // ⭐ CHỈ hiển thị shift name (Buổi sáng/Buổi chiều) và các slots cụ thể, KHÔNG hiển thị "từ ... đến ..."
        const shiftName = range.shiftDisplay ? 
          (range.shiftDisplay.includes(':') ? range.shiftDisplay.split(':')[0].trim() : range.shiftDisplay) :
          (range.shift === 'Morning' ? 'Buổi sáng' : 'Buổi chiều');
        
        // Lấy danh sách slots cụ thể
        let slotsList = [];
        if (label) {
          slotsList = label.split(',').map(t => t.trim());
        } else if (range.availableGaps && range.availableGaps.length > 0) {
          slotsList = range.availableGaps.map((gap) => {
            return gap.display || `${formatTime(gap.start)}-${formatTime(gap.end)}`;
          });
        }
        
        // ⭐ CHỈ hiển thị shift name và các slots cụ thể, KHÔNG có "từ ... đến ..."
        if (slotsList.length > 0) {
          lines.push(`\n- ${shiftName}:`);
          slotsList.forEach(slot => {
            lines.push(`  - ${slot}`);
          });
        } else {
          // Fallback: Nếu không có slots cụ thể, hiển thị shift name thôi
          lines.push(`\n- ${shiftName}:`);
        }
      } else {
        // Nếu không có timeslot cụ thể → mới hiển thị khoảng thời gian tổng quát
        const start = formatTime(range.startTime);
        const end = formatTime(range.endTime);
        const shiftName = range.shiftDisplay ? 
          (range.shiftDisplay.includes(':') ? range.shiftDisplay.split(':')[0].trim() : range.shiftDisplay) :
          (range.shift === 'Morning' ? 'Buổi sáng' : 'Buổi chiều');
        lines.push(`\n- ${shiftName}: ${start} - ${end}`);
      }
    }

    if (hasAvailableSlots) {
      lines.push('\nBạn muốn chọn giờ nào trong các khoảng trên?');
    } else {
      lines.push('\nBác sĩ không còn khung giờ khả dụng vào ngày này. Bạn có muốn chọn ngày khác không?');
    }

    return lines.join('\n');
  }

  async maybeAutoDisplaySlots({
    hasServiceId,
    hasDoctorId,
    functionResults,
    filteredHistory,
    processedPrompt,
    patientUserId,
    dateValidationCache,
    getLatestServiceInfo,
    getLatestDoctorInfo
  }) {
    if (!hasServiceId || !hasDoctorId) {
      return null;
    }
    const alreadyFetchedSlots = functionResults.some(fr => fr.functionName === 'get_available_slots');
    if (alreadyFetchedSlots) {
      return null;
    }
    let latestService = getLatestServiceInfo();
    if (!latestService) {
      latestService = await this.resolveServiceInfoFromHistory(filteredHistory, patientUserId);
    }
    let latestDoctor = getLatestDoctorInfo();
    if (!latestDoctor) {
      latestDoctor = await this.resolveDoctorInfoFromHistory(filteredHistory, patientUserId);
    }
    if (!latestService || !latestDoctor) {
      return null;
    }
    let appointmentDate = this.getLatestDateFromResults(functionResults);
    if (!appointmentDate) {
      appointmentDate = await this.extractDateFromConversation(
        processedPrompt,
        filteredHistory,
        dateValidationCache
      );
    }
    if (!appointmentDate) {
      return null;
    }

    try {
      const searchDate = new Date(appointmentDate);
      if (Number.isNaN(searchDate.getTime())) {
        return null;
      }

      const scheduleRangeResult = await availableSlotService.getDoctorScheduleRange({
        doctorUserId: latestDoctor.id,
        serviceId: latestService.id,
        date: searchDate,
        patientUserId
      });

      if (!scheduleRangeResult || (scheduleRangeResult.message && !scheduleRangeResult.scheduleRanges)) {
        return null;
      }

      const dateDisplay = this.formatDateForDisplay(appointmentDate);
      const responseMessage = this.formatAvailableSlotsMessage(
        scheduleRangeResult,
        latestService.name || latestService.serviceName || 'Dịch vụ',
        latestDoctor.name || latestDoctor.fullName || 'Bác sĩ',
        dateDisplay
      );

      const updatedHistory = [
        ...filteredHistory,
        { role: 'user', content: processedPrompt },
        { role: 'assistant', content: responseMessage }
      ];

      return {
        success: false,
        needsMoreInfo: true,
        response: responseMessage,
        conversationHistory: updatedHistory
      };
    } catch (error) {
      console.error('❌ [AI Booking] Auto display slots error:', error);
    }

    return null;
  }

  formatHistoryForDateValidation(history, limit = 6) {
    if (!Array.isArray(history) || history.length === 0) {
      return '';
    }

    return history
      .slice(-limit)
      .map(msg => {
        const role = msg.role === 'assistant' ? 'Assistant' : 'User';
        const content = (msg.content || '').replace(/\s+/g, ' ').trim();
        return `${role}: ${content}`;
      })
      .join('\n');
  }

  async normalizeDateArgument(rawInput, options = {}, cache) {
    const trimmedInput = typeof rawInput === 'string' ? rawInput.trim() : '';
    const latestPrompt = options.latestUserPrompt || '';
    const activeFunction = options.activeFunction || '';

    if (!trimmedInput) {
      return {
        success: false,
        status: 'invalid',
        originalInput: '',
        message: 'Ngày không được để trống. Vui lòng cung cấp ngày cụ thể (ví dụ: 05/11/2025).',
        requiresClarification: true
      };
    }

    if (!(cache instanceof Map)) {
      cache = new Map();
    }

    const cacheKey = `${trimmedInput.toLowerCase()}|${activeFunction}`;
    if (cache?.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const payload = {
      inputText: trimmedInput,
      latestUserPrompt: latestPrompt,
      historySnippet: this.formatHistoryForDateValidation(options.conversationHistory || []),
      timezone: 'Asia/Ho_Chi_Minh',
      today: DateHelper.getTodayVN(),
      tomorrow: DateHelper.getTomorrowVN(),
      dayAfterTomorrow: DateHelper.getDayAfterTomorrowVN(),
      nextWeekSameDay: DateHelper.getNextWeekSameDayVN(),
      now: DateHelper.getNowVN().toISOString(),
      activeFunction
    };

    let response;
    try {
      response = await this.retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: DATE_VALIDATION_MODEL,
          messages: [
            { role: 'system', content: DATE_VALIDATION_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(payload) }
          ],
          tools: DATE_VALIDATION_TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 300
        });
      }, 1, 300);
    } catch (error) {
      console.error('❌ [DateValidation] OpenAI error:', error);
      return {
        success: false,
        status: 'error',
        originalInput: trimmedInput,
        message: 'Không thể xác thực ngày. Vui lòng nhập lại ngày theo định dạng DD/MM/YYYY hoặc diễn tả rõ hơn.',
        requiresClarification: true
      };
    }

    const toolCall = response?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return {
        success: false,
        status: 'error',
        originalInput: trimmedInput,
        message: 'Không thể hiểu ngày bạn cung cấp. Vui lòng mô tả rõ hơn.',
        requiresClarification: true
      };
    }

    let parsedArgs;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
    } catch (parseErr) {
      console.error('❌ [DateValidation] Cannot parse tool arguments:', parseErr);
      return {
        success: false,
        status: 'error',
        originalInput: trimmedInput,
        message: 'Không thể xác thực ngày. Vui lòng nhập lại theo định dạng DD/MM/YYYY.',
        requiresClarification: true
      };
    }

    // ⭐ Kiểm tra nếu input có chứa "tuần sau" hoặc "mỗi tuần sau" mà không có thứ cụ thể
    const inputLower = trimmedInput.toLowerCase();
    // Cập nhật regex để bắt cả "tuần sau", "tuần tới", "mỗi tuần sau", "mỗi tuần tới"
    const hasNextWeekKeyword = /(mỗi\s+)?tuần\s+(sau|tới)/i.test(trimmedInput);
    const hasSpecificDay = /(thứ\s+[2-7]|chủ\s+nhật|thứ\s+hai|thứ\s+ba|thứ\s+tư|thứ\s+năm|thứ\s+sáu|thứ\s+bảy)/i.test(trimmedInput);
    
    // Nếu có "tuần sau" hoặc "mỗi tuần sau" nhưng không có thứ cụ thể, đảm bảo status là ambiguous
    if (hasNextWeekKeyword && !hasSpecificDay) {
      parsedArgs.status = 'ambiguous';
      parsedArgs.requiresClarification = true;
      parsedArgs.normalizedDate = null;
    }
    
    // Tạo message phù hợp cho trường hợp "tuần sau" không có thứ
    let defaultMessage;
    if (parsedArgs.status === 'ambiguous') {
      if (hasNextWeekKeyword && !hasSpecificDay) {
        defaultMessage = 'Bạn muốn đặt lịch vào thứ mấy tuần sau? Vui lòng cho biết cụ thể (ví dụ: "thứ 2 tuần sau", "thứ 5 tuần sau", "chủ nhật tuần sau").';
      } else {
        defaultMessage = 'Ngày bạn cung cấp chưa rõ. Vui lòng cho biết cụ thể ngày/thứ.';
      }
    } else if (parsedArgs.status === 'past') {
      defaultMessage = 'Ngày bạn chọn đã nằm trong quá khứ. Vui lòng chọn ngày trong tương lai.';
    } else {
      defaultMessage = 'Không thể xác thực ngày. Vui lòng nhập lại.';
    }
    
    const normalizedResult = {
      success: parsedArgs.status === 'valid' && !!parsedArgs.normalizedDate,
      status: parsedArgs.status || 'unknown',
      date: parsedArgs.normalizedDate || null,
      originalInput: parsedArgs.originalInputEcho || trimmedInput,
      message: parsedArgs.message || defaultMessage,
      requiresClarification: Boolean(parsedArgs.requiresClarification)
    };

    if (cache) {
      cache.set(cacheKey, normalizedResult);
    }

    return normalizedResult;
  }

  async chatWithAI(userPrompt, patientUserId, conversationHistory = []) {
    let filteredHistory = Array.isArray(conversationHistory) ? [...conversationHistory] : [];
    let processedPrompt = typeof userPrompt === 'string' ? userPrompt : '';
    try {
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // ⭐ Preprocess user input để tăng độ chính xác
      processedPrompt = this.preprocessUserInput(userPrompt);
      
      // ⭐ Filter conversation history để loại bỏ thông tin không hợp lệ
      filteredHistory = this.filterConversationHistory(conversationHistory);
      
      // ⭐ Log để debug
      console.log(`📝 [AI Booking] Conversation history: ${conversationHistory.length} messages (filtered: ${filteredHistory.length})`);
      if (filteredHistory.length > 0) {
        console.log(`📝 [AI Booking] Last few messages:`, filteredHistory.slice(-3).map(m => `${m.role}: ${m.content?.substring(0, 50)}...`));
      }
      
      // ⭐ Prepare date context - SỬ DỤNG TIMEZONE VIỆT NAM (UTC+7)
      // Sử dụng DateHelper để lấy ngày chính xác theo VN timezone
      const todayStr = DateHelper.getTodayVN();
      const tomorrowStr = DateHelper.getTomorrowVN();
      const dayAfterTomorrowStr = DateHelper.getDayAfterTomorrowVN();
      const nextWeekMondayStr = DateHelper.getNextWeekMondayVN();
      const nextWeekSameDayStr = DateHelper.getNextWeekSameDayVN(); // Tuần sau = +7 ngày (cùng thứ)
      
      // ⭐ Log chi tiết để debug - đảm bảo tính chính xác theo timezone VN
      const nowVN = DateHelper.getNowVN();
      const nowVNFormatted = nowVN.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      console.log(`📅 [AI Booking] Current time (VN timezone): ${nowVNFormatted}`);
      console.log(`📅 [AI Booking] Date context (VN timezone): TODAY=${todayStr}, TOMORROW=${tomorrowStr}, DAY_AFTER_TOMORROW=${dayAfterTomorrowStr}, NEXT_WEEK_MONDAY=${nextWeekMondayStr}, NEXT_WEEK_SAME_DAY=${nextWeekSameDayStr}`);
      console.log(`📅 [AI Booking] ⚠️ QUAN TRỌNG: {TOMORROW} trong system prompt = ${tomorrowStr} (đã được thay thế). AI PHẢI dùng giá trị này khi user nói "ngày mai", KHÔNG được lấy từ conversation history cũ!`);
      console.log(`📅 [AI Booking] ⚠️ QUAN TRỌNG: {NEXT_WEEK_SAME_DAY} trong system prompt = ${nextWeekSameDayStr} (đã được thay thế). AI PHẢI dùng giá trị này khi user nói "tuần sau", KHÔNG được lấy từ conversation history cũ!`);
      
      // Build system prompt với date context
      const systemPrompt = toolsConfig.systemPrompt
        .replace('{TODAY}', todayStr)
        .replace('{TOMORROW}', tomorrowStr)
        .replace('{DAY_AFTER_TOMORROW}', dayAfterTomorrowStr)
        .replace('{NEXT_WEEK_MONDAY}', nextWeekMondayStr)
        .replace('{NEXT_WEEK_SAME_DAY}', nextWeekSameDayStr);
      
      const todayDisplay = this.formatDateForDisplay(todayStr);
      const tomorrowDisplay = this.formatDateForDisplay(tomorrowStr);
      const dayAfterTomorrowDisplay = this.formatDateForDisplay(dayAfterTomorrowStr);
      const nextWeekMondayDisplay = this.formatDateForDisplay(nextWeekMondayStr);
      const nextWeekSameDayDisplay = this.formatDateForDisplay(nextWeekSameDayStr);
      
      const dateDisplayContext = `
⚠️ QUY ĐỊNH HIỂN THỊ NGÀY: Khi trả lời người dùng, LUÔN trình bày ngày theo định dạng DD/MM/YYYY. KHÔNG bao giờ hiển thị YYYY-MM-DD.
Ví dụ nhanh:
- Hôm nay (TODAY): ${todayDisplay}
- Ngày mai (TOMORROW): ${tomorrowDisplay}
- Ngày kia (DAY_AFTER_TOMORROW): ${dayAfterTomorrowDisplay}
- Thứ 2 tuần sau (NEXT_WEEK_MONDAY): ${nextWeekMondayDisplay}
- Cùng thứ tuần sau (NEXT_WEEK_SAME_DAY): ${nextWeekSameDayDisplay}
Luôn giữ định dạng DD/MM/YYYY khi nhắc lại, giải thích hoặc xác nhận lịch.
`.trim();
      
      const systemPromptWithDisplay = `${systemPrompt}\n\n${dateDisplayContext}`;
      
      // ⭐ CỰC KỲ QUAN TRỌNG: Kiểm tra xem user có đang chọn thời gian sau khi đã hiển thị available slots không
      // Nếu có, inject instruction message để hướng dẫn AI gọi check_appointment_conflict hoặc create_appointment
      let additionalInstruction = null;
      const lowerPrompt = processedPrompt.toLowerCase().trim();
      // ⭐ CỰC KỲ QUAN TRỌNG: Pattern matching phải tìm trong toàn bộ câu, không chỉ ở đầu
      // Ví dụ: "Tôi muốn chọn 9 giờ" → phải nhận diện được "9 giờ"
      const timePatterns = [
        /\d+\s*(?:giờ|h|hour|hours)/i, // "9 giờ", "8h", "9 hour" (không cần ^)
        /(?:giờ|h)\s*\d+/i, // "giờ 9", "h 8" (không cần ^)
        /\d{1,2}:\d{2}/, // "09:00", "9:30", "14:30" (không cần ^)
        /\d{1,2}h\d{2}/i, // "9h30", "14h30" (không cần ^)
        /\d{1,2}\s*giờ\s*\d{1,2}/i, // "9 giờ 30" (không cần ^)
        /(?:^|\s)(?:sáng|chiều|tối|trưa)(?:\s|$)/i, // "sáng", "chiều", "tối", "trưa"
        /(?:^|\s)(?:buổi sáng|buổi chiều|buổi tối)(?:\s|$)/i // "buổi sáng", "buổi chiều"
      ];
      
      const isTimeInput = timePatterns.some(pattern => pattern.test(lowerPrompt));
      const hasAvailableSlotsInHistory = filteredHistory.some(msg => {
        if (msg.role === 'assistant' && msg.content) {
          return msg.content.includes('khung giờ khả dụng') || 
                 msg.content.includes('Bạn muốn chọn giờ nào') ||
                 msg.content.includes('available slots') ||
                 msg.content.includes('Buổi sáng:') ||
                 msg.content.includes('Buổi chiều:');
        }
        return false;
      });
      
      console.log(`🔍 [AI Booking] Time input detection:`, {
        prompt: processedPrompt,
        isTimeInput,
        hasAvailableSlotsInHistory,
        shouldCallCheckConflict: isTimeInput && hasAvailableSlotsInHistory
      });
      
      if (isTimeInput && hasAvailableSlotsInHistory) {
        console.log(`✅ [AI Booking] User is selecting time after available slots displayed. Injecting instruction message.`);
        
        // ⭐ Parse thời gian từ user input - tìm trong toàn bộ câu, không chỉ ở đầu
        let parsedTime = null;
        const hourMatch = lowerPrompt.match(/(\d+)\s*(?:giờ|h|hour|hours)/i);
        if (hourMatch) {
          // "9 giờ", "8h", "Tôi muốn chọn 9 giờ" → "09:00", "08:00"
          const hour = parseInt(hourMatch[1]);
          parsedTime = `${String(hour).padStart(2, '0')}:00`;
        } else {
          const timeColonMatch = lowerPrompt.match(/(\d{1,2}):(\d{2})/);
          if (timeColonMatch) {
            // "09:00", "9:30", "Tôi muốn chọn 09:00" → giữ nguyên format
            parsedTime = `${String(parseInt(timeColonMatch[1])).padStart(2, '0')}:${timeColonMatch[2]}`;
          } else {
            const timeHMatch = lowerPrompt.match(/(\d{1,2})h(\d{2})/i);
            if (timeHMatch) {
              // "9h30", "Tôi muốn chọn 9h30" → "09:30"
              parsedTime = `${String(parseInt(timeHMatch[1])).padStart(2, '0')}:${timeHMatch[2]}`;
            }
          }
        }
        
        console.log(`🔍 [AI Booking] Parsed time from user input: "${processedPrompt}" → "${parsedTime}"`);
        
        // ⭐ Inject instruction message để hướng dẫn AI
        if (parsedTime) {
          additionalInstruction = {
            role: "user",
            content: `⚠️ CỰC KỲ QUAN TRỌNG: User đã chọn thời gian "${parsedTime}" sau khi bạn đã hiển thị available slots. Bạn PHẢI gọi check_appointment_conflict(date, time="${parsedTime}", doctorId) HOẶC create_appointment(serviceId, doctorId, date, time="${parsedTime}") để validate thời gian này. Nếu có conflict hoặc thời gian không nằm trong available slots, PHẢI trả về error message. KHÔNG được chỉ hiển thị thông tin lịch hẹn mà không validate!`
          };
        }
      }
      
      // Build messages array với filtered history
      const messages = [
        { role: "system", content: systemPromptWithDisplay },
        ...filteredHistory,
        { role: "user", content: processedPrompt }, // ⭐ Dùng processed prompt
        ...(additionalInstruction ? [additionalInstruction] : []) // ⭐ Thêm instruction nếu có
      ];
      
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // Call OpenAI with function calling (với retry logic)
      // ⭐ Tối ưu parameters cho tốc độ phản hồi nhanh
      let response;
      try {
        response = await this.retryWithBackoff(async () => {
          return await openai.chat.completions.create({
            model: AI_MODEL, // ⭐ Dùng model từ config (gpt-4o-mini)
        messages: messages,
        tools: toolsConfig.tools,
        tool_choice: "auto", // AI tự quyết định có gọi function hay không
            max_tokens: 1000, // ⭐ Tối ưu cho tốc độ: giảm xuống 1000 tokens
            temperature: 0.2, // ⭐ Tối ưu cho độ chính xác
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.2
            // ⚠️ Timeout KHÔNG được hỗ trợ trong request level, đã config ở client level
          });
        }, 2, 500); // ⭐ Giảm retry từ 3 lần xuống 2 lần, baseDelay từ 1000ms xuống 500ms để tăng tốc độ
        
        // Validate response
        if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
          throw new Error('Invalid response from OpenAI API');
        }
      } catch (error) {
        console.error('❌ [AI Booking] Error calling OpenAI:', error);
        // ⭐ Sử dụng filteredHistory đã có thay vì filter lại
        return {
          success: false,
          response: 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
          conversationHistory: filteredHistory || [],
          needsMoreInfo: false
        };
      }
      
      let assistantMessage = response.choices[0].message;
      let functionResults = [];
      
      // Loop để handle multiple function calls (AI có thể gọi nhiều function liên tiếp)
      let maxIterations = 3; // ⭐ Tối ưu tốc độ: giảm xuống 3 iterations
      let iteration = 0;
      
      // ⭐ Helper function để kiểm tra doctorId trong conversation history (dùng trong executeFunction)
      const checkDoctorIdInHistory = (history) => {
        for (let i = history.length - 1; i >= 0; i--) {
          const msg = history[i];
          if (msg.content) {
            const content = msg.content.toLowerCase();
            if (msg.role === 'assistant') {
              if (content.includes('bác sĩ bạn chọn') || 
                  content.includes('bác sĩ đã được chọn') ||
                  content.includes('bác sĩ bạn muốn') ||
                  /bác sĩ\s+[a-zà-ỹ\s]+(?:đã|được|bạn)/i.test(msg.content)) {
                const doctorMatch = msg.content.match(/Bác sĩ\s+([A-Za-zÀ-ỹ\s]+)/i);
                if (doctorMatch) return true;
              }
            } else if (msg.role === 'user') {
              const doctorKeywords = ['bác sĩ', 'bs', 'doctor', 'dr'];
              const hasDoctorKeyword = doctorKeywords.some(keyword => content.includes(keyword));
              if (hasDoctorKeyword || /(?:^|\s)(huy|thu|hiếu|lò|thuu|nguyễn\s+huy)(?:\s|$)/i.test(content)) {
                for (let j = i + 1; j < history.length; j++) {
                  const nextMsg = history[j];
                  if (nextMsg.role === 'assistant' && nextMsg.content) {
                    const nextContent = nextMsg.content.toLowerCase();
                    if (nextContent.includes('bác sĩ') && 
                        (nextContent.includes('chọn') || nextContent.includes('đã'))) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        }
        return false;
      };
      
      
      const dateValidationCache = new Map();
      
      let stopAfterIteration = false;
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iteration < maxIterations) {
        iteration++;
        
        // Execute all function calls
        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = toolCall.function.name;
          let functionArgs;

          const appointmentPreviouslyCreated = functionResults.some(fr => fr.functionName === 'create_appointment' && fr.result?.success);
          if (functionName === 'get_available_slots' && appointmentPreviouslyCreated) {
            console.log('⚠️ [AI Booking] Skipping get_available_slots after successful appointment creation');
            stopAfterIteration = true;
            break;
          }
          
          // ⭐ LOGGING: Log tất cả function calls để debug
          console.log(`🔧 [AI Booking] Iteration ${iteration}: AI wants to call function: ${functionName}`);
          console.log(`🔧 [AI Booking] User prompt: "${processedPrompt}"`);
          console.log(`🔧 [AI Booking] Conversation history length: ${filteredHistory.length}`);
          
          // ⭐ KIỂM TRA: Nếu AI gọi get_services() nhưng user đã đề cập tên bác sĩ → phải gọi find_doctor_by_name trước
          if (functionName === 'get_services') {
            const mentionedDoctorName = this.findDoctorMention(processedPrompt, filteredHistory);
            console.log(`🔍 [AI Booking] Checking doctor mention in prompt: "${processedPrompt}" → found: "${mentionedDoctorName}"`);
            if (mentionedDoctorName) {
              console.log(`⚠️ [AI Booking] BLOCKING get_services() - User already mentioned doctor "${mentionedDoctorName}". Instructing to call find_doctor_by_name first.`);
              messages.push({
                role: "assistant",
                content: null,
                tool_calls: [toolCall]
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  error: `⚠️ CỰC KỲ QUAN TRỌNG: User đã nhắc đến bác sĩ "${mentionedDoctorName}" trong prompt "${processedPrompt}". Bạn PHẢI gọi find_doctor_by_name("${mentionedDoctorName}") TRƯỚC để validate bác sĩ và workingHours. CHỈ sau khi find_doctor_by_name() trả về found=true với bác sĩ có workingHours đầy đủ → mới được gọi get_services()! Nếu find_doctor_by_name() trả về error (bác sĩ không có workingHours hoặc không tồn tại) → PHẢI hiển thị error message đó và danh sách bác sĩ khả dụng, KHÔNG được gọi get_services()!`,
                  shouldCallFindDoctorByName: true,
                  doctorNameHint: mentionedDoctorName
                })
              });
              continue;
            }
          }
          
          // ⭐ KIỂM TRA: Nếu AI gọi get_doctors() nhưng đã có doctorId trong conversation history → trả về error
          if (functionName === 'get_doctors') {
            const hasDoctorInHistory = checkDoctorIdInHistory(filteredHistory);
            if (hasDoctorInHistory) {
              console.log(`⚠️ [AI Booking] AI tried to call get_doctors() but doctorId already exists in conversation history. Returning error.`);
              
              // ⭐ Kiểm tra user prompt hiện tại để đưa ra hướng dẫn cụ thể
              const userPromptLower = processedPrompt.toLowerCase();
              let guidanceMessage = 'Bác sĩ đã được chọn từ trước. ';
              
              // Nếu user đang chọn dịch vụ (có từ khóa dịch vụ trong prompt)
              if (/dịch vụ|service|khám|răng|amidan|bọc|nhổ|tẩy|trồng|tư vấn/i.test(userPromptLower)) {
                guidanceMessage += 'Bạn đang chọn dịch vụ. Vui lòng tiếp tục xử lý dịch vụ mà user đã đề cập (gọi find_service_by_name hoặc validate_service).';
              } else if (/ngày|giờ|thời gian|time|date|tuần|mai|hôm nay/i.test(userPromptLower)) {
                guidanceMessage += 'Bạn đang xử lý ngày/giờ. Vui lòng tiếp tục với get_available_slots hoặc check_appointment_conflict.';
              } else {
                guidanceMessage += 'Vui lòng tiếp tục với bước tiếp theo: nếu thiếu dịch vụ thì gọi find_service_by_name, nếu thiếu ngày/giờ thì hỏi user.';
              }
              
              messages.push({
                role: "assistant",
                content: null,
                tool_calls: [toolCall]
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  error: guidanceMessage,
                  shouldContinue: true
                })
              });
              continue; // Skip executing get_doctors
            }
            const mentionedDoctorName = this.findDoctorMention(processedPrompt, filteredHistory);
            if (mentionedDoctorName) {
              console.log(`⚠️ [AI Booking] AI tried to call get_doctors() but user already mentioned doctor "${mentionedDoctorName}". Instructing to call find_doctor_by_name.`);
              messages.push({
                role: "assistant",
                content: null,
                tool_calls: [toolCall]
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  error: `User đã nhắc đến bác sĩ "${mentionedDoctorName}". Bạn phải gọi find_doctor_by_name với tên này (hoặc validate_doctor nếu đã có doctorId) trước khi liệt kê danh sách bác sĩ.`,
                  shouldCallFindDoctorByName: true,
                  doctorNameHint: mentionedDoctorName
                })
              });
              continue;
            }
          }
          
          // ⭐ KIỂM TRA: Nếu AI gọi find_doctor_by_name() nhưng đã có doctorId trong conversation history → trả về error
          if (functionName === 'find_doctor_by_name') {
            const hasDoctorInHistory = checkDoctorIdInHistory(filteredHistory);
            if (hasDoctorInHistory) {
              console.log(`⚠️ [AI Booking] AI tried to call find_doctor_by_name() but doctorId already exists in conversation history. Returning error.`);
              
              // Parse arguments để lấy doctorName (nếu có)
              try {
                const tempArgs = JSON.parse(toolCall.function.arguments);
                const doctorName = tempArgs.doctorName || '';
                
                // ⭐ Kiểm tra user prompt hiện tại để đưa ra hướng dẫn cụ thể
                const userPromptLower = processedPrompt.toLowerCase();
                let guidanceMessage = 'Bác sĩ đã được chọn từ trước. ';
                
                // Nếu AI đang cố gắng tìm bác sĩ với tên dịch vụ → hướng dẫn rõ ràng
                if (doctorName && (/dịch vụ|service|khám|răng|amidan|bọc|nhổ|tẩy|trồng|tư vấn|sạch/i.test(doctorName.toLowerCase()))) {
                  guidanceMessage += `"${doctorName}" là tên dịch vụ, không phải tên bác sĩ. Bác sĩ đã được chọn từ trước. Vui lòng tiếp tục với bước tiếp theo (xem khung giờ khả dụng hoặc tạo lịch hẹn).`;
                } else if (/dịch vụ|service|khám|răng|amidan|bọc|nhổ|tẩy|trồng|tư vấn/i.test(userPromptLower)) {
                  guidanceMessage += 'Bạn đang chọn dịch vụ. Vui lòng tiếp tục xử lý dịch vụ mà user đã đề cập (gọi find_service_by_name hoặc validate_service).';
                } else if (/ngày|giờ|thời gian|time|date|tuần|mai|hôm nay/i.test(userPromptLower)) {
                  guidanceMessage += 'Bạn đang xử lý ngày/giờ. Vui lòng tiếp tục với get_available_slots hoặc check_appointment_conflict.';
                } else {
                  guidanceMessage += 'Vui lòng tiếp tục với bước tiếp theo: nếu thiếu dịch vụ thì gọi find_service_by_name, nếu thiếu ngày/giờ thì hỏi user.';
                }
                
                messages.push({
                  role: "assistant",
                  content: null,
                  tool_calls: [toolCall]
                });
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ 
                    error: guidanceMessage,
                    shouldContinue: true
                  })
                });
                continue; // Skip executing find_doctor_by_name
              } catch (parseErr) {
                // Nếu không parse được arguments, vẫn block function call
                messages.push({
                  role: "assistant",
                  content: null,
                  tool_calls: [toolCall]
                });
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ 
                    error: 'Bác sĩ đã được chọn từ trước. Vui lòng tiếp tục với bước tiếp theo.',
                    shouldContinue: true
                  })
                });
                continue; // Skip executing find_doctor_by_name
              }
            }
          }
          
          // Parse và validate JSON arguments
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
            
          if (functionName === 'find_service_by_name') {
            const userMentionedService = this.hasUserMentionedServiceName(
              functionArgs.serviceName,
              processedPrompt,
              filteredHistory
            );
            if (!userMentionedService) {
              console.log(`🚫 [AI Booking] BLOCKED find_service_by_name: User has not mentioned service "${functionArgs.serviceName}"`);
              messages.push({
                role: "assistant",
                content: null,
                tool_calls: [toolCall]
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: 'User chưa chọn dịch vụ. Bạn PHẢI hiển thị danh sách dịch vụ (gọi get_services) và yêu cầu user chọn (nhập tên dịch vụ hoặc số thứ tự) trước khi gọi find_service_by_name.',
                  shouldListServices: true
                })
              });
              continue;
            }
          }

          // ⭐ DATE VALIDATION VIA LLM
            if (functionArgs.date && FUNCTIONS_REQUIRING_DATE_VALIDATION.has(functionName)) {
              const normalizedDate = await this.normalizeDateArgument(
                functionArgs.date,
                {
                  latestUserPrompt: processedPrompt,
                  conversationHistory: filteredHistory,
                  activeFunction: functionName
                },
                dateValidationCache
              );

              if (!normalizedDate.success) {
                console.log(`🚫 [AI Booking] Date validation blocked (${functionName}): ${normalizedDate.message}`);
                messages.push({
                  role: "assistant",
                  content: null,
                  tool_calls: [toolCall]
                });
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    error: normalizedDate.message,
                    shouldClarifyDate: true,
                    status: normalizedDate.status,
                    originalInput: normalizedDate.originalInput
                  })
                });
                continue;
              }

              console.log(`✅ [AI Booking] Normalized date for ${functionName}: ${normalizedDate.originalInput} → ${normalizedDate.date}`);
              functionArgs.date = normalizedDate.date;
            }
            
          } catch (parseError) {
            console.error(`❌ [AI] Error parsing function arguments for ${functionName}:`, parseError);
            messages.push({
              role: "assistant",
              content: null,
              tool_calls: [toolCall]
            });
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ 
                error: `Lỗi parse arguments: ${parseError.message}. Vui lòng thử lại với arguments hợp lệ.` 
              })
            });
            continue;
          }
          
          // ⭐ Tự động thêm doctorId vào check_appointment_conflict nếu có trong conversation history
          if (functionName === 'check_appointment_conflict' && !functionArgs.doctorId) {
            // Tìm doctorId từ các function results trước đó (tìm ngược từ mới nhất đến cũ nhất)
            for (let i = functionResults.length - 1; i >= 0; i--) {
              const prevResult = functionResults[i];
              
              // Từ validate_doctor (ưu tiên cao nhất - đã được validate)
              if (prevResult.functionName === 'validate_doctor') {
                if (prevResult.result && prevResult.result.valid && prevResult.result.doctor && prevResult.result.doctor.id) {
                  functionArgs.doctorId = prevResult.result.doctor.id;
                  console.log(`✅ [AI] Auto-added doctorId from validate_doctor: ${functionArgs.doctorId}`);
                  break;
                }
              }
              
              // Từ find_doctor_by_name (chỉ khi không có multiple hoặc đã chọn)
              if (prevResult.functionName === 'find_doctor_by_name') {
                if (prevResult.result && prevResult.result.found) {
                  // Nếu chỉ có 1 doctor (không có multiple)
                  if (prevResult.result.doctor && prevResult.result.doctor.id) {
                    functionArgs.doctorId = prevResult.result.doctor.id;
                    console.log(`✅ [AI] Auto-added doctorId from find_doctor_by_name: ${functionArgs.doctorId}`);
                    break;
                  }
                }
              }
              
              // Từ get_doctors (chỉ khi có 1 bác sĩ duy nhất)
              if (prevResult.functionName === 'get_doctors') {
                if (prevResult.result && prevResult.result.doctors && prevResult.result.doctors.length === 1) {
                  functionArgs.doctorId = prevResult.result.doctors[0].id;
                  console.log(`✅ [AI] Auto-added doctorId from get_doctors (single doctor): ${functionArgs.doctorId}`);
                  break;
                }
              }
            }
            
            // Nếu vẫn không có, tìm trong functionArgs của các function calls trước đó (get_available_slots, create_appointment)
            if (!functionArgs.doctorId) {
              for (let i = functionResults.length - 1; i >= 0; i--) {
                const prevResult = functionResults[i];
                if (prevResult.functionArgs && prevResult.functionArgs.doctorId) {
                  functionArgs.doctorId = prevResult.functionArgs.doctorId;
                  console.log(`✅ [AI] Auto-added doctorId from previous function args (${prevResult.functionName}): ${functionArgs.doctorId}`);
                  break;
                }
              }
            }
          }
          
          // Execute function với error handling tốt hơn
          console.log(`🔧 [AI Booking] Executing function: ${functionName} with args:`, JSON.stringify(functionArgs, null, 2));
          let functionResult;
          try {
            functionResult = await this.executeFunction(functionName, functionArgs, patientUserId);
            console.log(`✅ [AI Booking] Function ${functionName} executed successfully. Result type:`, functionResult ? (Array.isArray(functionResult) ? 'array' : typeof functionResult) : 'null');
            if (functionName === 'get_services' && functionResult && functionResult.services) {
              console.log(`📋 [AI Booking] get_services returned ${functionResult.services.length} services`);
              if (functionResult.services.length > 0) {
                console.log(`📋 [AI Booking] First 5 service names from result:`, functionResult.services.slice(0, 5).map(s => s.name));
              }
            }
            if (functionName === 'get_doctors' && functionResult && functionResult.doctors) {
              console.log(`👨‍⚕️ [AI Booking] get_doctors returned ${functionResult.doctors.length} doctors`);
              if (functionResult.doctors.length > 0) {
                console.log(`👨‍⚕️ [AI Booking] First 5 doctor names from result:`, functionResult.doctors.slice(0, 5).map(d => d.name));
              }
            }
          } catch (execError) {
            console.error(`❌ [AI] Error executing function ${functionName}:`, execError);
            functionResult = { 
              error: `Lỗi khi thực thi function: ${execError.message || 'Unknown error'}` 
            };
          }

          if (functionName === 'validate_service' && functionResult?.valid) {
            const confirmed = this.userConfirmedServiceChoice(
              functionResult.service?.name || '',
              processedPrompt,
              filteredHistory
            );
            if (!confirmed) {
              console.log('🚫 [AI Booking] BLOCKED validate_service: User has not confirmed any service selection');
              functionResult = {
                error: 'User chưa chọn dịch vụ. Bạn PHẢI hiển thị danh sách dịch vụ (gọi get_services) và đợi user chọn cụ thể (nhập tên dịch vụ hoặc số thứ tự). KHÔNG được tự động validate dịch vụ.',
                shouldListServices: true
              };
            }
          }
          
          // ⭐ CỰC KỲ QUAN TRỌNG: Nếu find_doctor_by_name trả về error, PHẢI dừng lại và hiển thị error ngay
          if (functionName === 'find_doctor_by_name' && functionResult && functionResult.error) {
            console.log(`⚠️ [AI Booking] find_doctor_by_name returned error. Stopping further function calls and returning error directly.`);
            
            functionResults.push({
              functionName,
              functionArgs,
              result: functionResult
            });
            
            // ⭐ TRỰC TIẾP TẠO RESPONSE TỪ ERROR, KHÔNG GỌI AI NỮA
            const errorResult = functionResult;
            let errorResponse = errorResult.error;
            
            // Nếu có suggestions, thêm vào response
            if (errorResult.suggestions && errorResult.suggestions.length > 0) {
              errorResponse = `${errorResult.error}\n\nDưới đây là danh sách bác sĩ có sẵn:\n${errorResult.suggestions.map((d, idx) => `${idx + 1}. ${d.name}${d.specialization ? ` - ${d.specialization}` : ''}`).join('\n')}\n\nBạn muốn chọn bác sĩ nào?`;
            }
            
            const updatedHistory = [
              ...filteredHistory,
              { role: 'user', content: processedPrompt },
              { role: 'assistant', content: errorResponse }
            ];
            
            return {
              success: false,
              needsMoreInfo: true,
              response: errorResponse,
              conversationHistory: updatedHistory
            };
          }
          
          // Add function result to messages
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [toolCall]
          });
          
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          });
          
          functionResults.push({
            functionName,
            functionArgs,
            result: functionResult
          });
          
          if (functionName === 'create_appointment' && functionResult?.success) {
            stopAfterIteration = true;
            break;
          }
        }
        
        if (stopAfterIteration) {
          break;
        }

        // Call OpenAI again với function results (với retry logic)
        // ⭐ Tối ưu parameters cho tốc độ phản hồi nhanh
        try {
          response = await this.retryWithBackoff(async () => {
            return await openai.chat.completions.create({
              model: AI_MODEL, // ⭐ Dùng cùng model từ config (gpt-4o-mini) cho consistency
          messages: messages,
          tools: toolsConfig.tools,
          tool_choice: "auto",
              max_tokens: 1000, // ⭐ Tối ưu cho tốc độ
              temperature: 0.2, // ⭐ Tối ưu cho độ chính xác
              top_p: 0.9,
              frequency_penalty: 0.3,
              presence_penalty: 0.2
              // ⚠️ Timeout KHÔNG được hỗ trợ trong request level, đã config ở client level
            });
          }, 1, 200); // ⭐ Tối ưu tốc độ: chỉ retry 1 lần, baseDelay 200ms
          
          // Validate response
          if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
            throw new Error('Invalid response from OpenAI API in iteration');
          }
        
        assistantMessage = response.choices[0].message;
        } catch (iterationError) {
          console.error('❌ [AI Booking] Error in iteration:', iterationError);
          // Nếu có lỗi trong iteration, break loop và trả về error message từ function results
          break;
        }
      }
      
      // Get final response from AI
      // Nếu không có content, kiểm tra function results để tạo response phù hợp
      let finalResponse = assistantMessage?.content;
      
      // Nếu không có content hoặc assistantMessage undefined, tạo response từ function results
      if (!finalResponse || !assistantMessage) {
        // Nếu có function results với error, tạo response từ đó
        const lastErrorResult = functionResults
          .filter(fr => fr.result && fr.result.error)
          .pop();
        
        if (lastErrorResult) {
          const errorResult = lastErrorResult.result;
          
          // Nếu có suggestions, tạo response với suggestions
          if (errorResult.suggestions && errorResult.suggestions.length > 0) {
            if (lastErrorResult.functionName === 'find_doctor_by_name') {
              finalResponse = `${errorResult.error}\n\nDưới đây là danh sách bác sĩ có sẵn:\n${errorResult.suggestions.map((d, idx) => `${idx + 1}. ${d.name}${d.specialization ? ` - ${d.specialization}` : ''}`).join('\n')}\n\nBạn muốn chọn bác sĩ nào?`;
            } else if (lastErrorResult.functionName === 'find_service_by_name') {
              finalResponse = `${errorResult.error}\n\n${errorResult.suggestions.map((s, idx) => `${idx + 1}. ${s.name}${s.durationMinutes ? ` (${s.durationMinutes} phút)` : ''}${s.description ? ` - ${s.description}` : ''}`).join('\n')}\n\nBạn muốn chọn dịch vụ nào?`;
            } else {
              finalResponse = errorResult.error || 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn.';
            }
          } else {
            finalResponse = errorResult.error || 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn.';
          }
        } else {
          // Nếu không có error từ function results, kiểm tra xem có function results thành công không
          const lastResult = functionResults[functionResults.length - 1];
          if (lastResult && lastResult.result && !lastResult.result.error) {
              // ⭐ Nếu có kết quả thành công nhưng AI không trả về content, tạo response dựa trên function đã gọi
              // ⭐ QUAN TRỌNG: Kiểm tra conversation history và function results để tránh hỏi lại thông tin đã có
              const functionName = lastResult.functionName;
              
              // ⭐ Helper function để extract doctorId/serviceId từ conversation history
              const extractDoctorIdFromHistory = (history) => {
                // Tìm trong tất cả messages (cả user và assistant) xem có đề cập bác sĩ không
                for (let i = history.length - 1; i >= 0; i--) {
                  const msg = history[i];
                  if (msg.content) {
                    const content = msg.content.toLowerCase();
                    
                    // ⭐ KIỂM TRA 1: Trong assistant messages - xác nhận bác sĩ
                    if (msg.role === 'assistant') {
                      // Kiểm tra xem có xác nhận bác sĩ không (ví dụ: "Bác sĩ bạn chọn là Bác sĩ Huy")
                      if (content.includes('bác sĩ bạn chọn') || 
                          content.includes('bác sĩ đã được chọn') ||
                          content.includes('bác sĩ bạn muốn') ||
                          /bác sĩ\s+[a-zà-ỹ\s]+(?:đã|được|bạn)/i.test(msg.content)) {
                        // Tìm tên bác sĩ trong message
                        const doctorMatch = msg.content.match(/Bác sĩ\s+([A-Za-zÀ-ỹ\s]+)/i);
                        if (doctorMatch) {
                          console.log(`✅ [AI Booking] Found doctor confirmation in history: "${doctorMatch[1]}"`);
                          return true; // Đã có bác sĩ được xác nhận
                        }
                      }
                    }
                    
                    // ⭐ KIỂM TRA 2: Trong user messages - user đã đề cập tên bác sĩ
                    if (msg.role === 'user') {
                      const normalizedContent = this.normalizeVietnameseText(msg.content);
                      if (!normalizedContent) continue;
                      const doctorKeywords = ['bac si', 'bs', 'doctor', 'dr'];
                      const hasDoctorKeyword = doctorKeywords.some(keyword => normalizedContent.includes(keyword));
                      
                      if (hasDoctorKeyword) {
                        const doctorMatch = msg.content.match(/(?:bác sĩ|bs|doctor|dr)\s*([a-zà-ỹ\s]+)/i);
                        if (doctorMatch) {
                          console.log(`✅ [AI Booking] Found doctor mention in user message: "${doctorMatch[1]}"`);
                          return true;
                        }
                      }
                    }
                  }
                }
                return false;
              };
              
              const extractServiceIdFromHistory = (history) => {
                // ⭐ Tìm trong TẤT CẢ messages (cả user và assistant) xem có dịch vụ đã được chọn không
                for (let i = history.length - 1; i >= 0; i--) {
                  const msg = history[i];
                  if (!msg.content) continue;
                  const content = msg.content.toLowerCase();
                  
                  // ⭐ KIỂM TRA 1: Trong assistant messages - xác nhận dịch vụ
                  if (msg.role === 'assistant') {
                    // Kiểm tra xem có xác nhận dịch vụ không (ví dụ: "Dịch vụ bạn chọn là")
                    if (content.includes('dịch vụ bạn chọn') || 
                        content.includes('dịch vụ đã được chọn') ||
                        content.includes('dịch vụ bạn muốn') ||
                        /dịch vụ\s+[a-zà-ỹ\s]+(?:đã|được|bạn)/i.test(msg.content)) {
                      console.log(`✅ [AI Booking] Found service confirmation in history: "${msg.content.substring(0, 100)}"`);
                      return true; // Đã có dịch vụ được xác nhận
                    }
                  }
                  
                  // ⭐ KIỂM TRA 2: Trong user messages - user đã nhập tên dịch vụ
                  if (msg.role === 'user') {
                    // Danh sách các dịch vụ phổ biến để check
                    const serviceKeywords = [
                      'khám tổng quát', 'bọc răng', 'gắn đinh trồng răng', 'làm sạch răng',
                      'lấy tủy', 'mài răng', 'nhổ răng', 'trồng răng hàm', 'tẩy trắng răng'
                    ];
                    
                    const hasServiceKeyword = serviceKeywords.some(keyword => content.includes(keyword));
                    
                    if (hasServiceKeyword) {
                      console.log(`✅ [AI Booking] Found service mention in user message: "${msg.content}"`);
                      // Kiểm tra xem có assistant message sau đó xác nhận không
                      for (let j = i + 1; j < history.length; j++) {
                        const nextMsg = history[j];
                        if (nextMsg.role === 'assistant' && nextMsg.content) {
                          const nextContent = nextMsg.content.toLowerCase();
                          // Nếu assistant message sau đó có đề cập dịch vụ hoặc không có lỗi
                          if (nextContent.includes('dịch vụ') || 
                              nextContent.includes('bác sĩ') ||
                              !nextContent.includes('chưa chọn dịch vụ')) {
                            console.log(`✅ [AI Booking] Service was likely confirmed after user mention`);
                            return true;
                          }
                        }
                      }
                    }
                  }
                }
                return false;
              };
              
              const getLatestServiceInfo = () => {
                for (let i = functionResults.length - 1; i >= 0; i--) {
                  const fr = functionResults[i];
                  if (!fr || !fr.result) continue;
                  if (fr.functionName === 'validate_service' && fr.result.service) {
                    return fr.result.service;
                  }
                  if (fr.functionName === 'find_service_by_name' && fr.result.service) {
                    return fr.result.service;
                  }
                }
                return null;
              };
              
              const getLatestDoctorInfo = () => {
                for (let i = functionResults.length - 1; i >= 0; i--) {
                  const fr = functionResults[i];
                  if (!fr || !fr.result) continue;
                  if (fr.functionName === 'validate_doctor' && fr.result.doctor) {
                    return fr.result.doctor;
                  }
                  if (fr.functionName === 'find_doctor_by_name' && fr.result.doctor && !fr.result.multiple) {
                    return fr.result.doctor;
                  }
                }
                return null;
              };
              
              // ⭐ Kiểm tra xem đã có thông tin gì trong function results (lần gọi hiện tại)
              const hasServiceIdInResults = functionResults.some(fr => 
                (fr.functionName === 'find_service_by_name' && fr.result.found && !fr.result.multiple) ||
                (fr.functionName === 'validate_service' && fr.result.valid)
              );
              const hasDoctorIdInResults = functionResults.some(fr => 
                (fr.functionName === 'find_doctor_by_name' && fr.result.found && !fr.result.multiple) ||
                (fr.functionName === 'validate_doctor' && fr.result.valid) ||
                (fr.functionName === 'get_doctors' && fr.result.doctors && fr.result.doctors.length > 0)
              );
              
              // ⭐ Kiểm tra trong conversation history (từ các lần gọi trước)
              const hasServiceIdInHistory = extractServiceIdFromHistory(filteredHistory);
              const hasDoctorIdInHistory = extractDoctorIdFromHistory(filteredHistory);
              
              // ⭐ Tổng hợp: có serviceId/doctorId nếu có trong results HOẶC history
              const hasServiceId = hasServiceIdInResults || hasServiceIdInHistory;
              const hasDoctorId = hasDoctorIdInResults || hasDoctorIdInHistory;
              
              console.log(`📝 [AI Booking] Checking info: hasServiceId=${hasServiceId} (results: ${hasServiceIdInResults}, history: ${hasServiceIdInHistory}), hasDoctorId=${hasDoctorId} (results: ${hasDoctorIdInResults}, history: ${hasDoctorIdInHistory})`);
              
              const ensureServiceSelected = async () => {
                return this.buildServiceSelectionFollowUp(
                  functionResults,
                  filteredHistory,
                  processedPrompt,
                  patientUserId,
                  hasServiceId
                );
              };

              const promptForNextStep = async () => {
                if (!hasServiceId) {
                  return ensureServiceSelected();
                }
                if (!hasDoctorId) {
                  const response = 'Dịch vụ đã được chọn. Bạn muốn chọn bác sĩ nào? (Nhập tên hoặc số thứ tự)';
                  const updatedHistory = [
                    ...filteredHistory,
                    { role: 'user', content: processedPrompt },
                    { role: 'assistant', content: response }
                  ];
                  return {
                    success: false,
                    needsMoreInfo: true,
                    response,
                    conversationHistory: updatedHistory
                  };
                }
                const response = 'Bạn muốn đặt lịch vào ngày và giờ nào? (VD: "hôm nay 9 giờ" hoặc "ngày mai 15h30")';
                const updatedHistory = [
                    ...filteredHistory,
                    { role: 'user', content: processedPrompt },
                    { role: 'assistant', content: response }
                ];
                return {
                  success: false,
                  needsMoreInfo: true,
                  response,
                  conversationHistory: updatedHistory
                };
              };

              if (!hasServiceId) {
                const followUp = await ensureServiceSelected();
                if (followUp) {
                  return followUp;
                }
              }
              
              const autoSlotResponse = await this.maybeAutoDisplaySlots({
                hasServiceId,
                hasDoctorId,
                functionResults,
                filteredHistory,
                processedPrompt,
                patientUserId,
                dateValidationCache,
                getLatestServiceInfo,
                getLatestDoctorInfo
              });
              if (autoSlotResponse) {
                return autoSlotResponse;
              }
              
              // Tạo response dựa trên function đã gọi, nhưng CHỈ hỏi thông tin còn thiếu
              if (functionName === 'find_service_by_name' || functionName === 'validate_service') {
                // Đã chọn dịch vụ → kiểm tra xem còn thiếu gì
                const latestService = getLatestServiceInfo();
                const servicePrefix = latestService
                  ? `Dịch vụ bạn chọn là ${latestService.name}. `
                  : 'Dịch vụ đã được chọn. ';
                if (!hasDoctorId) {
                  finalResponse = `${servicePrefix}Bạn muốn chọn bác sĩ nào?`;
                } else {
                  finalResponse = `${servicePrefix}Bạn muốn đặt lịch vào ngày và giờ nào?`;
                }
              } else if (functionName === 'find_doctor_by_name' || functionName === 'validate_doctor') {
                // Đã chọn bác sĩ → kiểm tra xem còn thiếu gì
                const latestDoctor = getLatestDoctorInfo();
                const doctorPrefix = latestDoctor
                  ? `Bác sĩ bạn chọn là ${latestDoctor.name}. `
                  : 'Bác sĩ đã được chọn. ';
                if (!hasServiceId) {
                  finalResponse = `${doctorPrefix}Bạn muốn chọn dịch vụ nào?`;
                } else {
                  finalResponse = `${doctorPrefix}Bạn muốn đặt lịch vào ngày và giờ nào?`;
                }
              } else if (functionName === 'get_services') {
                // Đã hiển thị danh sách dịch vụ → chỉ hỏi nếu chưa có serviceId
                if (!hasServiceId) {
                  finalResponse = 'Dưới đây là danh sách dịch vụ. Bạn muốn chọn dịch vụ nào?';
                } else {
                  // Đã có serviceId từ trước → hỏi thông tin còn thiếu
                  if (!hasDoctorId) {
                    finalResponse = 'Bạn muốn chọn bác sĩ nào?';
                  } else {
                    finalResponse = 'Bạn muốn đặt lịch vào ngày và giờ nào?';
                  }
                }
              } else if (functionName === 'get_doctors') {
                // Đã hiển thị danh sách bác sĩ → chỉ hỏi nếu chưa có doctorId
                if (!hasDoctorId) {
                  finalResponse = 'Dưới đây là danh sách bác sĩ. Bạn muốn chọn bác sĩ nào?';
                } else {
                  // Đã có doctorId từ trước → hỏi thông tin còn thiếu
                  if (!hasServiceId) {
                    finalResponse = 'Bạn muốn chọn dịch vụ nào?';
                  } else {
                    finalResponse = 'Bạn muốn đặt lịch vào ngày và giờ nào?';
                  }
                }
              } else if (functionName === 'get_available_slots') {
                // Đã hiển thị slots → hỏi user chọn giờ
                finalResponse = 'Dưới đây là khung giờ khả dụng. Bạn muốn chọn giờ nào?';
              } else {
                const nextStep = await promptForNextStep();
                if (nextStep) {
                  return nextStep;
                }
                finalResponse = 'Đã xử lý yêu cầu của bạn. Vui lòng tiếp tục.';
              }
          } else {
            // Nếu không có error từ function results, tạo generic response
            finalResponse = 'Xin lỗi, mình không thể xử lý yêu cầu của bạn. Vui lòng thử lại với thông tin rõ ràng hơn.';
          }
        }
      }
      
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // ⭐ QUAN TRỌNG: Kiểm tra nếu đây là input không liên quan (off-topic) - nhắc nhở người dùng về mục đích
      // ⭐ LƯU Ý: isOffTopicInput() đã được sửa để không coi input về thời gian là off-topic
      if (this.isOffTopicInput(processedPrompt)) {
        console.log(`🚫 [AI Booking] Detected off-topic input: "${processedPrompt}"`);
        const offTopicResponse = 'Xin lỗi, mình chỉ hỗ trợ đặt lịch khám răng và các dịch vụ nha khoa thôi ạ. Bạn có cần đặt lịch khám răng không?';
        const updatedHistory = [...filteredHistory,
          { role: "user", content: processedPrompt },
          { role: "assistant", content: offTopicResponse }
        ];
        
        return {
          success: true,
          needsMoreInfo: false,
          response: offTopicResponse,
          conversationHistory: updatedHistory
        };
      }
      
      // ⭐ QUAN TRỌNG: Kiểm tra nếu đây là câu hỏi thông tin (informational query) - trả lời ngay, không chuyển sang đặt lịch
      if (this.isInformationalQuery(processedPrompt)) {
        try {
          const todayStr = DateHelper.getTodayVN();
          const todayDisplay = this.formatDateForDisplay(todayStr);
          const tomorrowStr = DateHelper.getTomorrowVN();
          const tomorrowDisplay = this.formatDateForDisplay(tomorrowStr);
          
          const lowerPrompt = processedPrompt.toLowerCase();
          let infoResponse = '';
          
          if (lowerPrompt.includes('hôm nay')) {
            infoResponse = `Hôm nay là ngày ${todayDisplay}.`;
          } else if (lowerPrompt.includes('ngày mai') || lowerPrompt.includes('mai')) {
            infoResponse = `Ngày mai là ngày ${tomorrowDisplay}.`;
          } else {
            infoResponse = `Hôm nay là ngày ${todayDisplay}. Ngày mai là ngày ${tomorrowDisplay}.`;
          }
          
          const updatedHistory = [...filteredHistory,
            { role: "user", content: processedPrompt },
            { role: "assistant", content: infoResponse }
          ];

          return {
            success: true,
            needsMoreInfo: false,
            response: infoResponse,
            conversationHistory: updatedHistory
          };
        } catch (infoError) {
          console.error('❌ [AI Booking] Error handling informational query:', infoError);
          // Nếu có lỗi khi xử lý câu hỏi thông tin, trả về lỗi generic thay vì throw
          return {
            success: false,
            needsMoreInfo: false,
            response: 'Xin lỗi, mình không thể lấy thông tin ngày tháng. Vui lòng thử lại sau.',
            conversationHistory: filteredHistory || []
          };
        }
      }
      
      // ⭐ QUAN TRỌNG: Kiểm tra xem có đủ thông tin (service + doctor + date) để tự động hiển thị slots không
      const serviceAlreadyChosen = this.hasServiceContext(functionResults, filteredHistory);
      const doctorAlreadyChosen = this.hasDoctorContext(functionResults, filteredHistory);

      const appointmentCreated = functionResults.some(fr => 
        fr.functionName === 'create_appointment' && fr.result?.success
      );
      console.log(`🔍 [AI Booking] appointmentCreated=${appointmentCreated}`);
      
      // ⭐ Nếu có đủ service + doctor, thử tự động hiển thị slots
      if (!appointmentCreated && serviceAlreadyChosen && doctorAlreadyChosen) {
        const getLatestServiceInfo = () => {
          for (let i = functionResults.length - 1; i >= 0; i--) {
            const fr = functionResults[i];
            if (!fr || !fr.result) continue;
            if (fr.functionName === 'validate_service' && fr.result.service) {
              return fr.result.service;
            }
            if (fr.functionName === 'find_service_by_name' && fr.result.service) {
              return fr.result.service;
            }
          }
          return null;
        };
        
        const getLatestDoctorInfo = () => {
          for (let i = functionResults.length - 1; i >= 0; i--) {
            const fr = functionResults[i];
            if (!fr || !fr.result) continue;
            if (fr.functionName === 'validate_doctor' && fr.result.doctor) {
              return fr.result.doctor;
            }
            if (fr.functionName === 'find_doctor_by_name' && fr.result.doctor && !fr.result.multiple) {
              return fr.result.doctor;
            }
          }
          return null;
        };
        
        const autoSlotResponse = await this.maybeAutoDisplaySlots({
          hasServiceId: serviceAlreadyChosen,
          hasDoctorId: doctorAlreadyChosen,
          functionResults,
          filteredHistory,
          processedPrompt,
          patientUserId,
          dateValidationCache,
          getLatestServiceInfo,
          getLatestDoctorInfo
        });
        
        if (autoSlotResponse) {
          return autoSlotResponse;
        }
      }
      
      if (!appointmentCreated) {
        const pendingServiceFollowUp = await this.buildServiceSelectionFollowUp(functionResults, filteredHistory, processedPrompt, patientUserId, serviceAlreadyChosen);
        if (pendingServiceFollowUp) {
          return pendingServiceFollowUp;
        }
      }
      if (!serviceAlreadyChosen) {
        const summaryResponse = 'Bạn chưa chọn đầy đủ thông tin để tiếp tục. Nếu đã chọn dịch vụ, hãy cho tôi biết bác sĩ hoặc thời gian bạn muốn đặt lịch.';
        return {
          success: false,
          needsMoreInfo: true,
          response: summaryResponse,
          conversationHistory: [
            ...filteredHistory,
            { role: 'user', content: processedPrompt },
            { role: 'assistant', content: summaryResponse }
          ]
        };
      }
      
      if (appointmentCreated) {
        const appointmentResult = functionResults.find(fr => fr.functionName === 'create_appointment').result;
        finalResponse = this.buildAppointmentConfirmationMessage(appointmentResult);
        // ⭐ Sử dụng filteredHistory thay vì conversationHistory để đảm bảo format đúng
        const updatedHistory = [...filteredHistory, 
          { role: "user", content: processedPrompt }, // ⭐ Dùng processed prompt
          { role: "assistant", content: finalResponse }
        ];
        return {
          success: true,
          appointment: appointmentResult,
          response: finalResponse,
          conversationHistory: updatedHistory
        };
      }
      
      // Continuing conversation
      // ⭐ Sử dụng filteredHistory thay vì conversationHistory để đảm bảo format đúng
      const updatedHistory = [...filteredHistory,
        { role: "user", content: processedPrompt }, // ⭐ Dùng processed prompt
        { role: "assistant", content: finalResponse }
      ];
      console.log('⚠️ [AI Booking] Returning needsMoreInfo after loop; finalResponse=', finalResponse);
      return {
        success: false,
        needsMoreInfo: true,
        response: finalResponse,
        conversationHistory: updatedHistory
      };
      
    } catch (error) {
      console.error('❌ [AI Function Calling] Error:', error);
      // Trả về response lỗi thay vì throw để frontend có thể xử lý
      // ⭐ Giữ lại filteredHistory để không mất thông tin đã có
      return {
        success: false,
        response: 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
        conversationHistory: filteredHistory || [],
        needsMoreInfo: false
      };
    }
  }

  /**
   * Tạo appointment từ AI với Function Calling (mới)
   */
  async createAppointmentFromAI(userPrompt, patientUserId, appointmentFor = 'self', conversationHistory = []) {
    try {
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // 🆕 Sử dụng chatWithAI với Function Calling - AI HOÀN TOÀN TỰ DO!
      const result = await this.chatWithAI(userPrompt, patientUserId, conversationHistory);
      
      // Trả về kết quả đơn giản
      return {
        success: result.success,
        appointment: result.appointment || null,
        needsMoreInfo: result.needsMoreInfo || false,
        followUpQuestion: result.response,
        parsedData: { conversationHistory: result.conversationHistory }
      };
      
    } catch (error) {
      console.error('❌ [AI Booking] Error:', error);
      throw error;
    }
  }
}

module.exports = new AIBookingService();

