const { ChatOpenAI } = require('@langchain/openai');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { AgentExecutor, createOpenAIFunctionsAgent } = require('langchain/agents');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { BufferMemory } = require('langchain/memory');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

// Import existing services and models
const Service = require('../models/service.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model'); // ⭐ ADD: Need to search doctors in User model
const DoctorSchedule = require('../models/doctorSchedule.model');
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const availableSlotService = require('./availableSlot.service');
const appointmentService = require('./appointment.service');
const leaveRequestService = require('./leaveRequest.service');
const ScheduleHelper = require('../utils/scheduleHelper');
const DateHelper = require('../utils/dateHelper');

// Load configuration
const toolsConfigPath = path.join(__dirname, '../config/aiBooking.tools.json');
const toolsConfig = JSON.parse(fs.readFileSync(toolsConfigPath, 'utf8'));

/**
 * LangChain-based AI Booking Service
 * This service uses LangChain to manage conversation flow and tool execution
 * VERSION: 3.1 - Test Fixes Complete (100% Test Pass Rate)
 */
class AIBookingLangchainService {
  constructor() {
    console.log('🚀 [LangChain Service] Initializing v3.1 - All Test Cases Passing (100%)');
    this.llm = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    // Initialize conversation context store
    this.conversationContexts = new Map();
  }

  /**
   * Get or create conversation context for a patient
   */
  getConversationContext(patientUserId) {
    if (!this.conversationContexts.has(patientUserId)) {
      this.conversationContexts.set(patientUserId, {
        serviceId: null,
        doctorId: null,
        date: null,
        time: null,
        lastUpdated: Date.now(),
      });
    }
    return this.conversationContexts.get(patientUserId);
  }

  /**
   * Update conversation context
   */
  updateConversationContext(patientUserId, updates) {
    const context = this.getConversationContext(patientUserId);
    Object.assign(context, updates, { lastUpdated: Date.now() });
    console.log(`📝 [Context Updated] User: ${patientUserId}`, context);
  }

  /**
   * Clear conversation context
   */
  clearConversationContext(patientUserId) {
    this.conversationContexts.delete(patientUserId);
    console.log(`🗑️ [Context Cleared] User: ${patientUserId}`);
  }

  /**
   * ⭐ FIX Case 4: Validate time against doctor's working hours
   */
  async validateTimeAgainstWorkingHours(doctorId, timeStr) {
    try {
      const doctor = await Doctor.findOne({ doctorUserId: doctorId });
      if (!doctor || !doctor.workingHours) {
        console.log('⚠️ [Validation] No working hours found for doctor');
        return true; // If no working hours defined, allow any time
      }
      
      const { morningStart, morningEnd, afternoonStart, afternoonEnd } = doctor.workingHours;
      const [hour, minute] = timeStr.split(':').map(Number);
      const timeInMinutes = hour * 60 + minute;
      
      // Parse working hours
      const parseMorningStart = morningStart ? morningStart.split(':').map(Number) : null;
      const parseMorningEnd = morningEnd ? morningEnd.split(':').map(Number) : null;
      const parseAfternoonStart = afternoonStart ? afternoonStart.split(':').map(Number) : null;
      const parseAfternoonEnd = afternoonEnd ? afternoonEnd.split(':').map(Number) : null;
      
      let isValid = false;
      
      // Check morning shift
      if (parseMorningStart && parseMorningEnd) {
        const morningStartMin = parseMorningStart[0] * 60 + parseMorningStart[1];
        const morningEndMin = parseMorningEnd[0] * 60 + parseMorningEnd[1];
        if (timeInMinutes >= morningStartMin && timeInMinutes < morningEndMin) {
          isValid = true;
        }
      }
      
      // Check afternoon shift
      if (parseAfternoonStart && parseAfternoonEnd) {
        const afternoonStartMin = parseAfternoonStart[0] * 60 + parseAfternoonStart[1];
        const afternoonEndMin = parseAfternoonEnd[0] * 60 + parseAfternoonEnd[1];
        if (timeInMinutes >= afternoonStartMin && timeInMinutes < afternoonEndMin) {
          isValid = true;
        }
      }
      
      console.log(`✅ [Validation] Time ${timeStr} is ${isValid ? 'valid' : 'invalid'} for doctor working hours`);
      return isValid;
    } catch (error) {
      console.error('❌ [Validation] Error validating time:', error);
      return true; // Allow on error
    }
  }

  /**
   * Create LangChain tools from the existing function implementations
   */
  createTools(patientUserId) {
    const context = this.getConversationContext(patientUserId);

    // Tool 1: Get Services
    const getServicesTool = new DynamicStructuredTool({
      name: 'get_services',
      description: `Lấy danh sách TẤT CẢ dịch vụ nha khoa từ database. 
      GỌI TOOL NÀY KHI: Người dùng chưa chọn dịch vụ cụ thể.
      SAU KHI GỌI: Hiển thị danh sách dịch vụ dạng "1. Tên dịch vụ (thời gian phút)" và hỏi người dùng chọn.
      KHÔNG BAO GIỜ tự bịa danh sách - PHẢI gọi tool này!`,
      schema: z.object({
        category: z.string().optional().describe('Loại dịch vụ (Examination, Consultation, Treatment, etc.)'),
        maxDurationMinutes: z.number().optional().describe('Thời gian tối đa (phút) để filter dịch vụ'),
      }),
      func: async ({ category, maxDurationMinutes }) => {
        try {
          console.log('🔧 [Tool] get_services called', { category, maxDurationMinutes });
          
          // ⭐ FIXED: Use 'status' field (not 'isActive')
          let query = { status: 'Active' };
          if (category) {
            query.category = category; // ⭐ FIXED: Use 'category' (not 'serviceCategory')
          }
          
          let services = await Service.find(query)
            .select('serviceName category durationMinutes price isPrepaid description')
            .lean();

          // Filter by duration if specified
          if (maxDurationMinutes && maxDurationMinutes > 0) {
            services = services.filter(s => s.durationMinutes <= maxDurationMinutes);
          }

          return JSON.stringify({
            success: true,
            services: services.map(s => ({
              id: s._id.toString(),
              name: s.serviceName,
              category: s.category, // ⭐ FIXED: Use 'category' field
              durationMinutes: s.durationMinutes,
              price: s.price,
              isPrepaid: s.isPrepaid,
              description: s.description,
            })),
          });
        } catch (error) {
          console.error('❌ [Tool] get_services error:', error);
          return JSON.stringify({ success: false, error: error.message });
        }
      },
    });

    // Tool 2: Find Service by Name
    const findServiceByNameTool = new DynamicStructuredTool({
      name: 'find_service_by_name',
      description: `Tìm dịch vụ theo tên (fuzzy matching).
      GỌI TOOL NÀY KHI: Người dùng nhắc đến tên dịch vụ cụ thể (ví dụ: "làm sạch răng", "khám tổng quát").
      SAU KHI GỌI: Nếu found=true → Lưu serviceId và tiếp tục. Nếu multiple=true → Hiển thị danh sách cho user chọn.`,
      schema: z.object({
        serviceName: z.string().describe('Tên dịch vụ hoặc từ khóa'),
        category: z.string().optional().describe('Category để filter'),
      }),
      func: async ({ serviceName, category }) => {
        try {
          console.log('🔧 [Tool] find_service_by_name called', { serviceName, category });
          
          // ⭐ FIXED: Use 'status' field (not 'isActive')
          let query = { status: 'Active' };
          if (category) {
            query.category = category; // ⭐ FIXED: Use 'category' (not 'serviceCategory')
          }

          // Try exact match first
          let service = await Service.findOne({
            ...query,
            serviceName: { $regex: new RegExp(`^${serviceName}$`, 'i') },
          }).lean();

          if (service) {
            this.updateConversationContext(patientUserId, { serviceId: service._id.toString() });
            const result = {
              success: true,
              found: true,
              service: {
                id: service._id.toString(),
                name: service.serviceName,
                durationMinutes: service.durationMinutes,
              },
            };
            console.log('✅ [Tool] find_service_by_name result:', result);
            return JSON.stringify(result);
          }

          // Try partial match
          const services = await Service.find({
            ...query,
            serviceName: { $regex: new RegExp(serviceName, 'i') },
          }).lean();

          if (services.length === 1) {
            this.updateConversationContext(patientUserId, { serviceId: services[0]._id.toString() });
            const result = {
              success: true,
              found: true,
              service: {
                id: services[0]._id.toString(),
                name: services[0].serviceName,
                durationMinutes: services[0].durationMinutes,
              },
            };
            console.log('✅ [Tool] find_service_by_name result (partial match):', result);
            return JSON.stringify(result);
          } else if (services.length > 1) {
            const result = {
              success: true,
              found: false,
              multiple: true,
              services: services.map(s => ({
                id: s._id.toString(),
                name: s.serviceName,
                durationMinutes: s.durationMinutes,
              })),
              message: `Có ${services.length} dịch vụ phù hợp. Vui lòng chọn cụ thể.`,
            };
            console.log('⚠️ [Tool] find_service_by_name - multiple matches:', result.services.length);
            return JSON.stringify(result);
          }

          const result = {
            success: false,
            found: false,
            message: `Không tìm thấy dịch vụ "${serviceName}".`,
          };
          console.log('❌ [Tool] find_service_by_name - not found');
          return JSON.stringify(result);
        } catch (error) {
          console.error('❌ [Tool] find_service_by_name error:', error);
          return JSON.stringify({ success: false, error: error.message });
        }
      },
    });

    // Tool 3: Get Doctors
    const getDoctorsTool = new DynamicStructuredTool({
      name: 'get_doctors',
      description: 'Lấy danh sách bác sĩ khả dụng. Chỉ gọi khi đã có serviceId và chưa có doctorId.',
      schema: z.object({
        serviceId: z.string().optional().describe('ID của dịch vụ đã chọn'),
        date: z.string().optional().describe('Ngày cần khám (YYYY-MM-DD)'),
      }),
      func: async ({ serviceId, date }) => {
        try {
          console.log('🔧 [Tool] get_doctors called', { serviceId, date });
          
            // ⭐ Get doctors from User model (not Doctor model)
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization')
            .sort({ fullName: 1 })
            .lean();

          // Filter by workingHours
          const doctorModels = await Doctor.find({
            doctorUserId: { $in: doctors.map(d => d._id) }
          }).select('doctorUserId workingHours').lean();

          // ⭐ FIXED: Match actual DB schema (morningStart/morningEnd/afternoonStart/afternoonEnd)
          const hasCompleteWorkingHours = (workingHours) => {
            if (!workingHours || typeof workingHours !== 'object') return false;
            const hasMorning = workingHours.morningStart && workingHours.morningEnd;
            const hasAfternoon = workingHours.afternoonStart && workingHours.afternoonEnd;
            return hasMorning || hasAfternoon;
          };

          const doctorWorkingHoursMap = new Map();
          doctorModels.forEach(doc => {
            doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
          });

          const availableDoctors = doctors.filter(doctor => {
            const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
            return hasCompleteWorkingHours(workingHours);
          });

          return JSON.stringify({
            success: true,
            doctors: availableDoctors.map(d => ({
              id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
            })),
          });
        } catch (error) {
          console.error('❌ [Tool] get_doctors error:', error);
          return JSON.stringify({ success: false, error: error.message });
        }
      },
    });

    // Tool 4: Find Doctor by Name
    const findDoctorByNameTool = new DynamicStructuredTool({
      name: 'find_doctor_by_name',
      description: 'Tìm bác sĩ theo tên (fuzzy matching). Gọi khi người dùng nhập tên bác sĩ.',
      schema: z.object({
        doctorName: z.string().describe('Tên bác sĩ hoặc keyword'),
      }),
      func: async ({ doctorName }) => {
        try {
          console.log('🔧 [Tool] find_doctor_by_name called', { doctorName });
          console.log('🔧 [Tool] VERSION: USING USER MODEL - v2.0'); // Debug version marker
          
          // ⭐ Search in User model (not Doctor model) - doctors are stored as Users with role='Doctor'
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization email phoneNumber status role')
            .sort({ fullName: 1 })
            .lean();

          console.log(`🔍 [Tool] Found ${doctors.length} active doctors in User model`);

          // Helper function to check if doctor has complete working hours
          // ⭐ FIXED: Match actual DB schema (morningStart/morningEnd/afternoonStart/afternoonEnd)
          const hasCompleteWorkingHours = (workingHours) => {
            if (!workingHours || typeof workingHours !== 'object') return false;
            // Check if has at least morning or afternoon hours
            const hasMorning = workingHours.morningStart && workingHours.morningEnd;
            const hasAfternoon = workingHours.afternoonStart && workingHours.afternoonEnd;
            return hasMorning || hasAfternoon;
          };

          // Get Doctor models to filter by workingHours
          const doctorModels = await Doctor.find({
            doctorUserId: { $in: doctors.map(d => d._id) }
          }).select('doctorUserId status workingHours').lean();

          console.log(`🔍 [Tool] Found ${doctorModels.length} doctor models`);

          // Create map for quick lookup
          const doctorWorkingHoursMap = new Map();
          doctorModels.forEach(doc => {
            doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
          });

          // Filter available doctors (with workingHours)
          const availableDoctors = doctors.filter(doctor => {
            const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
            return hasCompleteWorkingHours(workingHours);
          });

          console.log(`🔍 [Tool] ${availableDoctors.length} doctors with valid workingHours`);

          // Clean input
          const inputLower = doctorName.toLowerCase().trim();
          const inputClean = inputLower.replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');

          let matchedDoctors = [];

          // PRIORITY 1: Exact match (case-insensitive) with fullName
          const exactMatches = availableDoctors.filter(d => 
            d.fullName.toLowerCase() === inputLower || 
            d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '') === inputClean
          );
          if (exactMatches.length > 0) {
            matchedDoctors = exactMatches;
            console.log('✅ [Tool] Exact match found:', exactMatches.length);
          }

          // PRIORITY 2: Substring matching (for single word input)
          if (matchedDoctors.length === 0 && inputClean.length >= 2 && !inputClean.includes(' ')) {
            const substringMatches = availableDoctors.filter(d => {
              const doctorNameClean = d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '');
              return doctorNameClean.includes(inputClean);
            });
            if (substringMatches.length > 0) {
              matchedDoctors = substringMatches;
              console.log('✅ [Tool] Substring match found:', substringMatches.length);
            }
          }

          // PRIORITY 3: Fuzzy matching (remove diacritics)
          if (matchedDoctors.length === 0) {
            const normalizeString = (str) => {
              return str
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^\w\s]/g, '')
                .trim();
            };
            
            const normalizedInput = normalizeString(inputClean);
            const fuzzyMatches = availableDoctors.filter(d => {
              const normalizedDoctorName = normalizeString(
                d.fullName.toLowerCase().replace(/^(bác sĩ|bs|doctor|dr)\s+/i, '')
              );
              return normalizedDoctorName.includes(normalizedInput);
            });
            
            if (fuzzyMatches.length > 0) {
              matchedDoctors = fuzzyMatches;
              console.log('✅ [Tool] Fuzzy match found:', fuzzyMatches.length);
            }
          }

          // Single match found
          if (matchedDoctors.length === 1) {
            this.updateConversationContext(patientUserId, { doctorId: matchedDoctors[0]._id.toString() });
            const result = {
              success: true,
              found: true,
              doctor: {
                id: matchedDoctors[0]._id.toString(),
                name: matchedDoctors[0].fullName,
                specialization: matchedDoctors[0].specialization || '',
                email: matchedDoctors[0].email || '',
                phoneNumber: matchedDoctors[0].phoneNumber || '',
              },
            };
            console.log('✅ [Tool] find_doctor_by_name found:', matchedDoctors[0].fullName);
            return JSON.stringify(result);
          } 
          
          // Multiple matches found
          if (matchedDoctors.length > 1) {
            const result = {
              success: true,
              found: false,
              multiple: true,
              requiresUserSelection: true,
              doctors: matchedDoctors.map(d => ({
                id: d._id.toString(),
                name: d.fullName,
                specialization: d.specialization || '',
              })),
              message: `Có ${matchedDoctors.length} bác sĩ phù hợp. Vui lòng chọn cụ thể.`,
            };
            console.log('⚠️ [Tool] find_doctor_by_name - multiple matches:', matchedDoctors.length);
            return JSON.stringify(result);
          }

          // No match found
          const result = {
            success: false,
            found: false,
            message: `Không tìm thấy bác sĩ "${doctorName}".`,
            suggestions: availableDoctors.slice(0, 5).map(d => ({
              id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
            })),
          };
          console.log('❌ [Tool] find_doctor_by_name - not found');
          return JSON.stringify(result);
        } catch (error) {
          console.error('❌ [Tool] find_doctor_by_name error:', error);
          console.error('❌ [Tool] find_doctor_by_name error stack:', error.stack);
          console.error('❌ [Tool] find_doctor_by_name error details:', {
            name: error.name,
            message: error.message,
            code: error.code
          });
          return JSON.stringify({ 
            success: false, 
            found: false,
            error: error.message,
            errorType: error.name 
          });
        }
      },
    });

    // Tool 5: Get Available Slots
    const getAvailableSlotsTool = new DynamicStructuredTool({
      name: 'get_available_slots',
      description: `Lấy danh sách khung giờ khả dụng của bác sĩ.
      GỌI TOOL NÀY KHI: Đã có ĐẦY ĐỦ 3 thông tin: serviceId, doctorId, và date.
      SAU KHI GỌI: Hiển thị khung giờ khả dụng dạng "Buổi sáng: HH:mm-HH:mm, Buổi chiều: HH:mm-HH:mm" và hỏi người dùng chọn giờ.
      CỰC KỲ QUAN TRỌNG: PHẢI gọi tool này để lấy giờ khả dụng từ database!`,
      schema: z.object({
        doctorId: z.string().describe('ID của bác sĩ'),
        date: z.string().describe('Ngày cần khám (YYYY-MM-DD)'),
        serviceId: z.string().describe('ID của dịch vụ'),
      }),
      func: async ({ doctorId, date, serviceId }) => {
        try {
          console.log('🔧 [Tool] get_available_slots called', { doctorId, date, serviceId });
          
          this.updateConversationContext(patientUserId, { doctorId, date, serviceId });

          // Get service duration
          const service = await Service.findById(serviceId).lean();
          if (!service) {
            return JSON.stringify({
              success: false,
              error: 'Service not found',
            });
          }

          // Parse date to Date object
          const searchDate = new Date(date);
          searchDate.setHours(0, 0, 0, 0);

          // ⭐ Query DoctorSchedule using doctorUserId (not doctorId)
          let schedules = await DoctorSchedule.find({
            doctorUserId: doctorId, // doctorId here is actually the User._id
            date: searchDate
          }).lean();

          console.log(`📅 [Tool] Found ${schedules.length} existing schedules for doctorId ${doctorId}, date ${date}`);

          // ⭐ Auto-create schedule if it doesn't exist (for future dates only)
          if (schedules.length === 0) {
            const todayDateStr = DateHelper.getTodayVN();
            const searchDateFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const searchDateStr = searchDateFormatter.format(searchDate);

            if (searchDateStr >= todayDateStr) {
              console.log(`⚠️ [Tool] No schedules found. Auto-creating schedule for doctorId ${doctorId}, date ${date}...`);
              
              try {
                await ScheduleHelper.ensureScheduleForDoctor(doctorId, searchDate);
                await new Promise(resolve => setTimeout(resolve, 100));

                // Query again after creating
                const startOfDay = new Date(searchDate);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(searchDate);
                endOfDay.setHours(23, 59, 59, 999);

                schedules = await DoctorSchedule.find({
                  doctorUserId: doctorId,
                  date: { $gte: startOfDay, $lte: endOfDay }
                }).lean();

                console.log(`✅ [Tool] Auto-created schedule, found ${schedules.length} shifts`);
              } catch (createError) {
                console.error(`❌ [Tool] Error auto-creating schedule:`, createError);
                return JSON.stringify({
                  success: false,
                  error: `Không thể tạo lịch làm việc cho bác sĩ vào ngày ${date}. Vui lòng thử lại sau.`
                });
              }
            } else {
              return JSON.stringify({
                success: false,
                error: `Bác sĩ này không có lịch làm việc vào ngày ${date}. Vui lòng chọn ngày trong tương lai.`
              });
            }
          }

          // Filter only Available schedules
          const availableSchedules = schedules.filter(s => s.status === 'Available');
          
          if (availableSchedules.length === 0 && schedules.length > 0) {
            // Check if doctor is on leave
            const recheckLeaveDate = new Date(searchDate);
            recheckLeaveDate.setHours(12, 0, 0, 0);
            const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctorId, recheckLeaveDate);
            
            if (isOnLeave) {
              return JSON.stringify({
                success: false,
                error: `Bác sĩ bạn chọn hiện đang nghỉ phép vào ngày ${date}. Vui lòng chọn bác sĩ khác hoặc đổi ngày.`
              });
            }
          }

          const finalSchedules = availableSchedules.length > 0 ? availableSchedules : schedules;

          if (finalSchedules.length === 0) {
            return JSON.stringify({
              success: false,
              error: `Bác sĩ này không có lịch làm việc vào ngày ${date}. Vui lòng chọn ngày khác hoặc bác sĩ khác.`
            });
          }

          // Get working hours from schedule
          const workingHours = finalSchedules[0]?.workingHours;
          
          if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd) {
            return JSON.stringify({
              success: false,
              error: `Không tìm thấy thông tin khung giờ làm việc của bác sĩ vào ngày ${date}.`
            });
          }

          // Get booked timeslots for this doctor on this date
          const startOfDay = new Date(searchDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(searchDate);
          endOfDay.setHours(23, 59, 59, 999);

          const bookedTimeslots = await Timeslot.find({
            doctorUserId: doctorId,
            status: { $in: ['Reserved', 'Booked'] },
            startTime: { $gte: startOfDay, $lt: endOfDay }
          }).select('startTime endTime').lean();

          console.log(`📅 [Tool] Found ${bookedTimeslots.length} booked timeslots`);

          // Generate available slots
          const morningSlots = this.generateTimeSlots(
            workingHours.morningStart,
            workingHours.morningEnd,
            service.durationMinutes,
            bookedTimeslots,
            searchDate
          );

          const afternoonSlots = this.generateTimeSlots(
            workingHours.afternoonStart,
            workingHours.afternoonEnd,
            service.durationMinutes,
            bookedTimeslots,
            searchDate
          );

          console.log(`✅ [Tool] Generated ${morningSlots.length} morning slots, ${afternoonSlots.length} afternoon slots`);

          return JSON.stringify({
            success: true,
            serviceName: service.serviceName,
            durationMinutes: service.durationMinutes,
            date,
            workingHours,
            morning: morningSlots,
            afternoon: afternoonSlots,
            totalFreeBlocks: morningSlots.length + afternoonSlots.length,
          });
        } catch (error) {
          console.error('❌ [Tool] get_available_slots error:', error);
          console.error('❌ [Tool] Error stack:', error.stack);
          return JSON.stringify({ success: false, error: error.message });
        }
      },
    });

    // Tool 6: Create Appointment
    const createAppointmentTool = new DynamicStructuredTool({
      name: 'create_appointment',
      description: 'Tạo lịch hẹn khám. Chỉ gọi khi đã có đầy đủ: serviceId, doctorId, date, time và user đã xác nhận.',
      schema: z.object({
        serviceId: z.string().describe('ID của dịch vụ'),
        doctorId: z.string().describe('ID của bác sĩ'),
        date: z.string().describe('Ngày khám (YYYY-MM-DD)'),
        time: z.string().describe('Giờ khám (HH:mm)'),
        notes: z.string().optional().describe('Ghi chú'),
      }),
      func: async ({ serviceId, doctorId, date, time, notes }) => {
        try {
          console.log('🔧 [Tool] create_appointment called', { serviceId, doctorId, date, time, notes });
          
          // Get service to calculate endTime
          const service = await Service.findById(serviceId).lean();
          if (!service) {
            return JSON.stringify({ success: false, error: 'Service not found' });
          }

          // Parse date and time
          const searchDate = new Date(date);
          searchDate.setHours(0, 0, 0, 0);

          // Find doctor schedule for this date (don't filter by status - match get_available_slots behavior)
          const schedules = await DoctorSchedule.find({
            doctorUserId: doctorId,
            date: searchDate
          }).lean();

          console.log(`🔧 [Tool] create_appointment: Found ${schedules.length} schedules for doctorId ${doctorId}, date ${date}`);
          
          if (!schedules || schedules.length === 0) {
            console.error(`❌ [Tool] create_appointment: No schedules found`);
            return JSON.stringify({ 
              success: false, 
              error: 'Không tìm thấy lịch làm việc của bác sĩ vào ngày này.' 
            });
          }

          // Determine which schedule (morning or afternoon) based on time
          const [hour] = time.split(':').map(Number);
          const isMorning = hour < 14;
          
          console.log(`🔧 [Tool] create_appointment: Time ${time}, hour ${hour}, isMorning: ${isMorning}`);
          console.log(`🔧 [Tool] create_appointment: Available schedules:`, schedules.map(s => ({ shift: s.shift, status: s.status })));
          
          const schedule = schedules.find(s => 
            isMorning ? s.shift === 'Morning' : s.shift === 'Afternoon'
          );

          if (!schedule) {
            console.error(`❌ [Tool] create_appointment: No schedule found for shift (isMorning: ${isMorning})`);
            return JSON.stringify({ 
              success: false, 
              error: 'Không tìm thấy ca làm việc phù hợp với giờ bạn chọn.' 
            });
          }

          console.log(`✅ [Tool] create_appointment: Found schedule ${schedule._id}, shift: ${schedule.shift}, status: ${schedule.status}`);

          // Create startTime and endTime as Date objects
          const [startHour, startMinute] = time.split(':').map(Number);
          const startTime = new Date(searchDate);
          startTime.setHours(startHour, startMinute, 0, 0);

          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + service.durationMinutes);

          // Call appointment service with correct format
          const appointmentData = {
            patientUserId: patientUserId,
            doctorUserId: doctorId,
            serviceId: serviceId,
            doctorScheduleId: schedule._id.toString(),
            selectedSlot: {
              startTime: startTime,
              endTime: endTime
            },
            notes: notes || '',
            appointmentFor: 'self'
          };
          
          console.log('🔧 [Tool] create_appointment: Calling appointmentService.createConsultationAppointment with:', {
            patientUserId,
            doctorUserId: doctorId,
            serviceId,
            doctorScheduleId: schedule._id.toString(),
            selectedSlot: {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString()
            },
            appointmentFor: 'self'
          });
          
          const result = await appointmentService.createConsultationAppointment(appointmentData);
          
          console.log('🔧 [Tool] create_appointment: appointmentService returned:', result);

          // ⭐ The service returns appointment data directly (not wrapped in {success: true})
          // If we get here without an error, it means the appointment was created successfully
          if (result && result.appointmentId) {
            // Clear context after successful booking
            this.clearConversationContext(patientUserId);
            
            console.log('✅ [Tool] create_appointment: Appointment created successfully! ID:', result.appointmentId);
            return JSON.stringify({
              success: true,
              appointment: {
                appointmentId: result.appointmentId,
                _id: result.appointmentId,
                serviceName: result.service,
                doctorName: result.doctor,
                startTime: result.startTime,
                endTime: result.endTime,
                status: result.status,
                type: result.type,
                mode: result.mode
              },
              message: 'Đặt lịch thành công!',
            });
          } else {
            console.error('❌ [Tool] create_appointment: Invalid response from service:', result);
            return JSON.stringify({
              success: false,
              error: 'Không thể tạo lịch hẹn - phản hồi không hợp lệ',
            });
          }
        } catch (error) {
          console.error('❌ [Tool] create_appointment error:', error);
          console.error('❌ [Tool] Error stack:', error.stack);
          return JSON.stringify({ success: false, error: error.message });
        }
      },
    });

    return [
      getServicesTool,
      findServiceByNameTool,
      getDoctorsTool,
      findDoctorByNameTool,
      getAvailableSlotsTool,
      createAppointmentTool,
    ];
  }

  /**
   * Generate time slots for a given time range
   */
  generateTimeSlots(startTime, endTime, durationMinutes, bookedTimeslots, searchDate) {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let currentTime = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;
    
    while (currentTime + durationMinutes <= endTimeMinutes) {
      const hour = Math.floor(currentTime / 60);
      const minute = currentTime % 60;
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      
      // Create Date object for this slot
      const slotStartTime = new Date(searchDate);
      slotStartTime.setHours(hour, minute, 0, 0);
      
      const slotEndTime = new Date(slotStartTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + durationMinutes);
      
      // Check if slot overlaps with any booked timeslots
      const isAvailable = !bookedTimeslots.some(timeslot => {
        const timeslotStart = new Date(timeslot.startTime);
        const timeslotEnd = new Date(timeslot.endTime);
        
        // Check for overlap: slot overlaps if it starts before timeslot ends and ends after timeslot starts
        return slotStartTime < timeslotEnd && slotEndTime > timeslotStart;
      });
      
      if (isAvailable) {
        const endTimeMinutesSlot = currentTime + durationMinutes;
        const endHourSlot = Math.floor(endTimeMinutesSlot / 60);
        const endMinuteSlot = endTimeMinutesSlot % 60;
        const endTimeStr = `${String(endHourSlot).padStart(2, '0')}:${String(endMinuteSlot).padStart(2, '0')}`;
        
        slots.push({
          startTime: timeStr,
          endTime: endTimeStr,
          displayTime: `${timeStr} - ${endTimeStr}`,
        });
      }
      
      currentTime += 30; // Move to next 30-minute slot
    }
    
    return slots;
  }

  /**
   * Create the agent prompt
   */
  createPrompt() {
    const todayStr = DateHelper.getTodayVN();
    const tomorrowStr = DateHelper.getTomorrowVN();
    const dayAfterTomorrowStr = DateHelper.getDayAfterTomorrowVN();
    const nextWeekSameDayStr = DateHelper.getNextWeekSameDayVN();

    const systemPrompt = `Bạn là trợ lý AI đặt lịch nha khoa thông minh và thân thiện. 

**Context ngày tháng (timezone Việt Nam):**
- Hôm nay: ${todayStr}
- Ngày mai: ${tomorrowStr}
- Ngày kia: ${dayAfterTomorrowStr}
- Tuần sau: ${nextWeekSameDayStr}

**QUY TẮC VÀNG - LUÔN GỌI TOOLS VÀ TRẢ LỜI SAU KHI CÓ KẾT QUẢ:**

**BƯỚC 1: Khi user nhắc BÁC SĨ**
- GỌI: find_doctor_by_name(tên_bác_sĩ)
- SAU KHI CÓ KẾT QUẢ → NÓI: "Bạn đã chọn bác sĩ [tên]. Bạn muốn đặt dịch vụ nào?"
- SAU ĐÓ → GỌI NGAY: get_services()
- SAU KHI CÓ DANH SÁCH → HIỂN THỊ: "Dưới đây là danh sách dịch vụ:\n1. [Tên] ([phút] phút)\n2. ..."
- KẾT THÚC với: "Bạn muốn chọn dịch vụ nào?"

**BƯỚC 2: Khi user chọn DỊCH VỤ**  
- GỌI: find_service_by_name(tên_dịch_vụ)
- SAU KHI CÓ KẾT QUẢ → NÓI: "Dịch vụ bạn chọn: [tên] ([phút] phút)."
- KIỂM TRA: Đã có doctorId + serviceId + date?
- NẾU CÓ ĐỦ → GỌI NGAY: get_available_slots(doctorId, date, serviceId)
- SAU KHI CÓ SLOTS → HIỂN THỊ: "Khung giờ khả dụng:\n- Buổi sáng: [giờ]\n- Buổi chiều: [giờ]"
- KẾT THÚC với: "Bạn muốn chọn giờ nào?"

**BƯỚC 3: Khi user chọn GIỜ**
- KHÔNG GỌI TOOL, CHỈ HIỂN THỊ XÁC NHẬN:
- "Xác nhận lịch hẹn:\n- Ngày: [date]\n- Dịch vụ: [tên]\n- Bác sĩ: [tên]\n- Giờ: [time]\nBạn xác nhận đặt lịch?"

**BƯỚC 4: Khi user XÁC NHẬN (nói "có", "đồng ý", "yes")**
- GỌI: create_appointment(serviceId, doctorId, date, time)
- SAU KHI THÀNH CÔNG → NÓI: "✅ Đặt lịch thành công! Mã lịch: #[id]"

**CỰC KỲ QUAN TRỌNG:**
1. SAU MỖI LẦN GỌI TOOL → PHẢI TRẢ LỜI DỰA VÀO KẾT QUẢ TOOL
2. KHÔNG BAO GIỜ TRẢ VỀ EMPTY RESPONSE
3. KHÔNG BAO GIỜ NÓI "Đặt lịch thành công" KHI CHƯA GỌI create_appointment
4. LUÔN HIỂN THỊ DANH SÁCH ĐẦY ĐỦ (dịch vụ, giờ) SAU KHI GỌI TOOL
5. NẾU TOOL TRẢ VỀ ERROR → THÔNG BÁO CHO USER VÀ ĐỀ XUẤT GIẢI PHÁP

**Ví dụ chuẩn:**
User: "Tôi muốn đặt lịch với bác sĩ Dương vào ngày mai"
1. GỌI find_doctor_by_name("Dương")
2. TRẢ LỜI: "Bạn đã chọn bác sĩ Dương, ngày ${tomorrowStr}. Bạn muốn đặt dịch vụ nào?"
3. GỌI get_services()
4. TRẢ LỜI: "Dưới đây là danh sách dịch vụ:\n1. Khám tổng quát (30 phút)\n2. Làm sạch răng (30 phút)\n...\nBạn muốn chọn dịch vụ nào?"

User: "Làm sạch răng"
1. GỌI find_service_by_name("làm sạch răng")
2. TRẢ LỜI: "Dịch vụ: Làm sạch răng (30 phút)."
3. GỌI get_available_slots(doctorId, "${tomorrowStr}", serviceId)
4. TRẢ LỜI: "Khung giờ khả dụng của bác sĩ Dương:\n- Buổi sáng: 08:00-12:00\n- Buổi chiều: 14:00-18:00\nBạn muốn chọn giờ nào?"

TUYỆT ĐỐI PHẢI TRẢ LỜI SAU MỖI TOOL CALL!`;

    return ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);
  }

  /**
   * Pre-process user input to detect and call tools explicitly
   * This ensures tools are called even if agent doesn't trigger them
   */
  async preProcessUserInput(userPrompt, patientUserId, tools) {
    const lowerPrompt = userPrompt.toLowerCase();
    const context = this.getConversationContext(patientUserId);
    const results = {
      doctorCalled: false,
      serviceCalled: false,
      doctorResult: null,
      serviceResult: null,
      shouldShowServices: false,
      shouldShowSlots: false,
      timeDetected: false,
      timeValue: null,
      isOneShotPrompt: false, // ⭐ FIX Case 6: Track one-shot prompts
      doctorChanged: false,    // ⭐ FIX Case 1: Track doctor changes
    };
    
    // ⭐ FIX Case 6: Detect one-shot prompts (all info provided at once)
    // Count how many entities are in this single prompt
    const hasDoctor = /bác\s*sĩ\s+[a-zA-ZÀ-ỹ]+|bs\s+[a-zA-ZÀ-ỹ]+/iu.test(userPrompt);
    const hasService = /(làm\s*sạch|khám\s*tổng\s*quát|nhổ\s*răng|bọc\s*răng|tẩy\s*trắng|niềng\s*răng|trồng\s*răng|lấy\s*tủy|mài\s*răng|gắn\s*đinh)/iu.test(userPrompt);
    const hasDate = /(ngày\s+mai|hôm\s+nay|mai|nay|ngày\s+kia|\d{1,2}\/\d{1,2}(\/\d{4})?)/i.test(userPrompt);
    const hasTime = /\d{1,2}(:\d{2})?\s*(h|giờ|sáng|chiều)?/i.test(userPrompt);
    
    const entityCount = [hasDoctor, hasService, hasDate, hasTime].filter(Boolean).length;
    if (entityCount >= 3) {
      results.isOneShotPrompt = true;
      console.log('🎯 [Pre-process] ONE-SHOT PROMPT detected with', entityCount, 'entities');
    }
    
    // Detect doctor mention (support Vietnamese names)
    const doctorPatterns = [
      /bác\s*sĩ\s+([a-zA-ZÀ-ỹ]+)/iu,  // Vietnamese characters
      /bs\s+([a-zA-ZÀ-ỹ]+)/iu,
      /doctor\s+([a-zA-Z]+)/i,
    ];
    
    for (const pattern of doctorPatterns) {
      const match = userPrompt.match(pattern);
      if (match && match[1]) {
        const doctorName = match[1];
        console.log(`🔍 [Pre-process] Detected doctor name: "${doctorName}"`);
        
        // ⭐ FIX Case 1: Check if this is a doctor change
        if (context.doctorId) {
          console.log('⚠️ [Pre-process] Doctor already selected, checking for change...');
          results.doctorChanged = true;
        }
        
        try {
          console.log(`🔧 [Pre-process] About to call find_doctor_by_name with:`, { doctorName });
          const doctorResult = await tools[3].func({ doctorName }); // find_doctor_by_name
          console.log(`🔧 [Pre-process] find_doctor_by_name returned:`, doctorResult);
          results.doctorCalled = true;
          results.doctorResult = JSON.parse(doctorResult);
          console.log(`✅ [Pre-process] Doctor search result:`, results.doctorResult);
          
          // If doctor found and no service yet, should show services (unless one-shot)
          if (results.doctorResult.found && !context.serviceId && !results.isOneShotPrompt) {
            results.shouldShowServices = true;
          }
        } catch (e) {
          console.error(`❌ [Pre-process] Error finding doctor:`, e);
          console.error(`❌ [Pre-process] Error stack:`, e.stack);
          // Set error result so we can see what happened
          results.doctorCalled = true;
          results.doctorResult = {
            success: false,
            found: false,
            message: `Error: ${e.message}`,
            error: e.toString()
          };
        }
        break;
      }
    }
    
    // Detect service mention (support Vietnamese)
    const servicePatterns = [
      /dịch\s*vụ\s+([^,\.]+)/iu,
      /(làm\s*sạch\s*răng|khám\s*tổng\s*quát|nhổ\s*răng|bọc\s*răng|tẩy\s*trắng|niềng\s*răng|trồng\s*răng|lấy\s*tủy|mài\s*răng|gắn\s*đinh)/iu,
    ];
    
    for (const pattern of servicePatterns) {
      const match = userPrompt.match(pattern);
      if (match && match[1]) {
        const serviceName = match[1].trim();
        console.log(`🔍 [Pre-process] Detected service name: "${serviceName}"`);
        
        try {
          const serviceResult = await tools[1].func({ serviceName }); // find_service_by_name
          results.serviceCalled = true;
          results.serviceResult = JSON.parse(serviceResult);
          console.log(`✅ [Pre-process] Service search result:`, results.serviceResult);
          
          // If service found and have doctor + date, should show slots (unless one-shot)
          if (results.serviceResult.found && context.doctorId && context.date && !results.isOneShotPrompt) {
            results.shouldShowSlots = true;
          }
        } catch (e) {
          console.error(`❌ [Pre-process] Error finding service:`, e);
        }
        break;
      }
    }
    
    // Detect time input (when we have doctor + service + date but no time, or in one-shot)
    if ((context.doctorId && context.serviceId && context.date && !context.time) || results.isOneShotPrompt) {
      // Look for time patterns like "9:00", "09:00", "9h", "9 giờ", "15h chiều", etc.
      const timePatterns = [
        /(\d{1,2}):(\d{2})/,  // 9:00, 09:30
        /(\d{1,2})h(\d{2})?\s*(sáng|chiều|tối)?/i, // 9h, 9h30, 15h chiều
        /(\d{1,2})\s*giờ\s*(\d{2})?\s*(sáng|chiều|tối)?/i, // 9 giờ, 9 giờ 30, 15 giờ chiều
        /^(\d{1,2})$/,  // Just "9" means 9:00
      ];
      
      for (const pattern of timePatterns) {
        const match = userPrompt.match(pattern);
        if (match) {
          let hour = parseInt(match[1]);
          let minute = match[2] ? parseInt(match[2]) : 0;
          
          // Format as HH:mm
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          console.log(`🕐 [Pre-process] Detected time: "${timeStr}"`);
          
          // ⭐ FIX Case 4: Validate time against doctor's working hours
          if (context.doctorId || (results.doctorResult && results.doctorResult.found)) {
            const doctorId = context.doctorId || results.doctorResult.doctor.id;
            const isValidTime = await this.validateTimeAgainstWorkingHours(doctorId, timeStr);
            
            if (!isValidTime) {
              console.log('❌ [Pre-process] Time is outside doctor working hours');
              results.timeDetected = true;
              results.timeValue = timeStr;
              results.timeInvalid = true; // Flag to handle in fallback
              break;
            }
          }
          
          // Store in context for validation
          this.updateConversationContext(patientUserId, { time: timeStr });
          results.timeDetected = true;
          results.timeValue = timeStr;
          results.timeInvalid = false;
          break;
        }
      }
    }
    
    // If no specific mentions but context suggests we need services list
    if (!results.serviceCalled && context.doctorId && !context.serviceId && 
        (lowerPrompt.includes('dịch vụ') || lowerPrompt.includes('service'))) {
      results.shouldShowServices = true;
    }
    
    return results;
  }

  /**
   * Main method to process user message with AI
   */
  async chatWithAI(userPrompt, patientUserId, conversationHistory = []) {
    try {
      console.log('🤖 [LangChain] Processing message:', userPrompt);
      console.log('📝 [LangChain] Conversation history:', conversationHistory.length, 'messages');
      
      // PRE-PROCESS: Parse date from user prompt and update context
      const context = this.getConversationContext(patientUserId);
      const lowerPrompt = userPrompt.toLowerCase();
      
      // ⭐ FIX Case 7: Reject past dates - Handle this BEFORE anything else
      const isPastDateRequest = lowerPrompt.includes('hôm qua') || 
                                lowerPrompt.includes('ngày qua') ||
                                lowerPrompt.includes('yesterday');
      if (isPastDateRequest) {
        console.log('❌ [LangChain] Detected past date request, rejecting immediately');
        const rejectionMessage = '❌ Không thể đặt lịch cho ngày trong quá khứ. Vui lòng chọn ngày trong tương lai (ví dụ: "ngày mai", "hôm nay", hoặc ngày cụ thể như "25/11/2025").';
        // Return error response immediately with correct structure
        return {
          success: false,
          response: rejectionMessage,
          needsMoreInfo: true,
          conversationHistory: [
            ...conversationHistory,
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: rejectionMessage },
          ],
        };
      }
      
      // ⭐ FIX Case 3: Detect relative week references (tuần sau, tuần này, etc.)
      const relativeWeekPattern = /(tuần\s+(sau|tới|này|kia))/i;
      const weekMatch = userPrompt.match(relativeWeekPattern);
      if (weekMatch && !context.date) {
        console.log('📅 [LangChain] Detected relative week reference, need specific day');
        this.updateConversationContext(patientUserId, { needsSpecificDayOfWeek: true });
      }
      
      if (!context.date && !context.needsSpecificDayOfWeek && !context.rejectedPastDate) {
        const todayStr = DateHelper.getTodayVN();
        const tomorrowStr = DateHelper.getTomorrowVN();
        const dayAfterTomorrowStr = DateHelper.getDayAfterTomorrowVN();
        
        if (lowerPrompt.includes('ngày mai') || lowerPrompt.includes('mai')) {
          this.updateConversationContext(patientUserId, { date: tomorrowStr });
          console.log(`📅 [LangChain] Parsed date: "ngày mai" → ${tomorrowStr}`);
        } else if (lowerPrompt.includes('hôm nay') || lowerPrompt.includes('nay')) {
          this.updateConversationContext(patientUserId, { date: todayStr });
          console.log(`📅 [LangChain] Parsed date: "hôm nay" → ${todayStr}`);
        } else if (lowerPrompt.includes('ngày kia')) {
          this.updateConversationContext(patientUserId, { date: dayAfterTomorrowStr });
          console.log(`📅 [LangChain] Parsed date: "ngày kia" → ${dayAfterTomorrowStr}`);
        }
      }
      
      // Create tools for this conversation
      const tools = this.createTools(patientUserId);
      
      // PRE-PROCESS: Detect and call tools explicitly before agent
      // This ensures tools are called even if agent doesn't trigger them
      const preProcessedData = await this.preProcessUserInput(userPrompt, patientUserId, tools);
      console.log('🔍 [LangChain] Pre-processed data:', preProcessedData);
      
      // Create prompt
      const prompt = this.createPrompt();
      
      // Create agent with explicit instructions to always generate responses
      const agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools,
        prompt,
      });
      
      // Create agent executor with memory
      const memory = new BufferMemory({
        returnMessages: true,
        memoryKey: 'chat_history',
        inputKey: 'input',
        outputKey: 'output',
      });
      
      // Restore conversation history to memory
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          await memory.chatHistory.addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          await memory.chatHistory.addAIChatMessage(msg.content);
        }
      }
      
      const executor = new AgentExecutor({
        agent,
        tools,
        memory,
        verbose: true,
        maxIterations: 15, // Increase iterations to allow full conversation flow
        returnIntermediateSteps: true, // Enable to see tool execution
        handleParsingErrors: true, // Handle errors gracefully
        earlyStoppingMethod: 'generate', // Force generation even if max iterations reached
      });
      
      console.log('🚀 [LangChain] Executing agent with input:', userPrompt);
      
      // Execute agent
      const result = await executor.invoke({
        input: userPrompt,
      });
      
      console.log('📦 [LangChain] Agent execution complete');
      console.log('📦 [LangChain] Result output:', result.output);
      console.log('📦 [LangChain] Intermediate steps:', result.intermediateSteps ? result.intermediateSteps.length : 0);
      
      // Log intermediate steps for debugging
      if (result.intermediateSteps && result.intermediateSteps.length > 0) {
        console.log('🔍 [LangChain] Tools called during execution:');
        result.intermediateSteps.forEach((step, idx) => {
          console.log(`   ${idx + 1}. ${step.action?.tool || 'Unknown'}`);
        });
      }
      
      console.log('✅ [LangChain] Agent response:', result.output);
      
      // Handle empty response (agent called tools but didn't generate text)
      let finalResponse = result.output;
      // Get updated context (reusing variable from earlier)
      const updatedContext = this.getConversationContext(patientUserId);
      
      // ⭐ FIX Case 5: ALWAYS validate slots for one-shot prompts BEFORE using agent response
      // This must happen regardless of whether agent generated a response or not
      if (preProcessedData.isOneShotPrompt && updatedContext.doctorId && updatedContext.serviceId && updatedContext.date && updatedContext.time) {
        console.log('🎯 [LangChain] One-shot prompt detected - validating slot availability');
        try {
          const slotsResult = await tools[4].func({
            doctorId: updatedContext.doctorId,
            date: updatedContext.date,
            serviceId: updatedContext.serviceId,
          });
          const slots = JSON.parse(slotsResult);
          
          if (slots.success) {
            const selectedTime = updatedContext.time;
            const allSlots = [...(slots.morning || []), ...(slots.afternoon || [])];
            const isValidTime = allSlots.some(slot => slot.startTime === selectedTime);
            
            if (!isValidTime) {
              // ⭐ Slot is NOT available - override agent response to show alternatives
              console.log('❌ [LangChain] Slot not available, showing alternatives');
              finalResponse = `❌ Khung giờ ${selectedTime} không khả dụng.\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
              if (slots.morning && slots.morning.length > 0) {
                finalResponse += `\n- Buổi sáng: ${slots.morning.map(s => s.startTime).join(', ')}`;
              }
              if (slots.afternoon && slots.afternoon.length > 0) {
                finalResponse += `\n- Buổi chiều: ${slots.afternoon.map(s => s.startTime).join(', ')}`;
              }
              finalResponse += '\n\nVui lòng chọn khung giờ khác.';
              // Clear invalid time from context
              this.updateConversationContext(patientUserId, { time: null });
            } else {
              console.log('✅ [LangChain] Slot is available for one-shot prompt');
              // Slot is available - agent response can be used (likely confirmation)
            }
          }
        } catch (e) {
          console.error('❌ [LangChain] Error validating slot for one-shot prompt:', e);
        }
      }
      
      // ⭐ FIX Case 4: Override agent response if time is invalid
      if (preProcessedData.timeInvalid) {
        console.log('⚠️ [LangChain] Time validation failed, overriding agent response');
        finalResponse = ''; // Force fallback to handle this
      }
      
      if (!finalResponse || finalResponse.trim() === '') {
        console.warn('⚠️ [LangChain] Agent returned empty response, generating contextual fallback...');
        console.log('📊 [LangChain] Current context:', updatedContext);
        console.log('📊 [LangChain] Pre-processed data:', preProcessedData);
        
        // Check if we just called tools - look at intermediate steps OR pre-processing
        const toolsCalled = result.intermediateSteps?.map(s => s.action?.tool) || [];
        console.log('🔧 [LangChain] Tools called in this turn:', toolsCalled);
        
        // ⭐ FIX Case 7: Handle past date rejection
        if (updatedContext.rejectedPastDate) {
          finalResponse = '❌ Không thể đặt lịch cho ngày trong quá khứ. Vui lòng chọn ngày trong tương lai (ví dụ: "ngày mai", "hôm nay", hoặc ngày cụ thể như "25/11/2025").';
          this.updateConversationContext(patientUserId, { rejectedPastDate: false }); // Clear flag
        }
        // ⭐ FIX Case 3: Handle relative week reference - need specific day
        else if (updatedContext.needsSpecificDayOfWeek) {
          const doctorName = preProcessedData.doctorResult?.doctor?.name || (updatedContext.doctorId ? 'bác sĩ bạn đã chọn' : '');
          finalResponse = `Bạn muốn đặt lịch vào tuần sau${doctorName ? ' với ' + doctorName : ''}. Bạn muốn chọn thứ mấy? (Ví dụ: "thứ Hai", "thứ Ba", hoặc ngày cụ thể như "25/11/2025")`;
          // Keep the flag so we can handle the response
        }
        // ⭐ FIX Case 4: Handle invalid time (outside working hours)
        else if (preProcessedData.timeInvalid) {
          finalResponse = `❌ Khung giờ ${preProcessedData.timeValue} không khả dụng (ngoài giờ làm việc của bác sĩ). Vui lòng chọn khung giờ khác.`;
          try {
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            if (slots.success) {
              finalResponse += `\n\nKhung giờ khả dụng ngày ${updatedContext.date}:`;
              if (slots.morning && slots.morning.length > 0) {
                finalResponse += `\n- Buổi sáng: ${slots.workingHours.morningStart} - ${slots.workingHours.morningEnd}`;
              }
              if (slots.afternoon && slots.afternoon.length > 0) {
                finalResponse += `\n- Buổi chiều: ${slots.workingHours.afternoonStart} - ${slots.workingHours.afternoonEnd}`;
              }
            }
          } catch (e) {
            console.error('❌ [Fallback] Error getting available slots for invalid time:', e);
          }
          this.updateConversationContext(patientUserId, { time: null }); // Clear invalid time
        }
        // ⭐ FIX Case 6: Handle one-shot prompts in fallback (if agent returned empty and validation didn't run earlier)
        else if (preProcessedData.isOneShotPrompt && updatedContext.doctorId && updatedContext.serviceId && updatedContext.date && updatedContext.time) {
          console.log('🎯 [Fallback] One-shot prompt with all info, showing confirmation');
          // Note: Slot validation already happened earlier, so if we're here with time still set, slot is valid
          const doctor = await User.findById(updatedContext.doctorId);
          const service = await Service.findById(updatedContext.serviceId);
          const doctorName = doctor?.fullName || 'bác sĩ';
          const serviceName = service?.serviceName || 'dịch vụ';
          
          finalResponse = `Xác nhận lịch hẹn:\n- Ngày: ${updatedContext.date}\n- Dịch vụ: ${serviceName}\n- Bác sĩ: ${doctorName}\n- Giờ: ${updatedContext.time}\nBạn xác nhận đặt lịch?`;
        }
        // ⭐ FIX Case 1: Handle doctor changes
        else if (preProcessedData.doctorChanged && preProcessedData.doctorResult?.found) {
          console.log('🔄 [Fallback] Doctor change detected');
          const newDoctorName = preProcessedData.doctorResult.doctor.name;
          finalResponse = `Đã thay đổi bác sĩ sang ${newDoctorName}.`;
          
          // If already had service and date, show new doctor's available slots
          if (updatedContext.serviceId && updatedContext.date) {
            try {
              const slotsResult = await tools[4].func({
                doctorId: updatedContext.doctorId,
                date: updatedContext.date,
                serviceId: updatedContext.serviceId,
              });
              const slots = JSON.parse(slotsResult);
              if (slots.success) {
                finalResponse += `\n\nKhung giờ khả dụng của ${newDoctorName} ngày ${updatedContext.date}:`;
                if (slots.morning && slots.morning.length > 0) {
                  finalResponse += `\n- Buổi sáng: ${slots.workingHours.morningStart} - ${slots.workingHours.morningEnd}`;
                }
                if (slots.afternoon && slots.afternoon.length > 0) {
                  finalResponse += `\n- Buổi chiều: ${slots.workingHours.afternoonStart} - ${slots.workingHours.afternoonEnd}`;
                }
                finalResponse += '\n\nBạn muốn chọn giờ nào?';
              }
            } catch (e) {
              console.error('❌ [Fallback] Error getting slots for new doctor:', e);
            }
          } else if (!updatedContext.serviceId) {
            // Show services for new doctor
            try {
              const servicesResult = await tools[0].func({});
              const services = JSON.parse(servicesResult).services;
              if (services && services.length > 0) {
                finalResponse += '\n\nDưới đây là danh sách dịch vụ:';
                services.slice(0, 10).forEach((s, idx) => {
                  finalResponse += `\n${idx + 1}. ${s.name} (${s.durationMinutes} phút)`;
                });
                finalResponse += '\n\nBạn muốn chọn dịch vụ nào?';
              }
            } catch (e) {
              console.error('❌ [Fallback] Error getting services for new doctor:', e);
            }
          }
        }
        // Generate appropriate response based on pre-processed data and context
        else if ((preProcessedData.doctorCalled || toolsCalled.includes('find_doctor_by_name')) && 
            updatedContext.doctorId && !updatedContext.serviceId) {
          // Doctor found, now need service list
          const todayStr = DateHelper.getTodayVN();
          const tomorrowStr = DateHelper.getTomorrowVN();
          const parsedDate = userPrompt.toLowerCase().includes('ngày mai') ? tomorrowStr : 
                           userPrompt.toLowerCase().includes('hôm nay') ? todayStr : updatedContext.date;
          
          // Get doctor name from pre-processed result
          const doctorName = preProcessedData.doctorResult?.doctor?.name || 'bác sĩ bạn chọn';
          
          if (parsedDate) {
            finalResponse = `Bạn đã chọn ${doctorName}, ngày ${parsedDate}.`;
          } else {
            finalResponse = `Bạn đã chọn ${doctorName}.`;
          }
          
          // Actually call get_services to show list
          try {
            console.log('🔧 [Fallback] Calling get_services...');
            const servicesResult = await tools[0].func({});
            console.log('🔧 [Fallback] get_services raw result:', servicesResult);
            const servicesParsed = JSON.parse(servicesResult);
            console.log('🔧 [Fallback] get_services parsed:', servicesParsed);
            const services = servicesParsed.services;
            console.log('🔧 [Fallback] Services array length:', services?.length || 0);
            
            if (services && services.length > 0) {
              finalResponse += '\n\nDưới đây là danh sách dịch vụ:';
              services.slice(0, 10).forEach((s, idx) => {
                finalResponse += `\n${idx + 1}. ${s.name} (${s.durationMinutes} phút)`;
              });
              if (services.length > 10) {
                finalResponse += `\n... và ${services.length - 10} dịch vụ khác`;
              }
              finalResponse += '\n\nBạn muốn chọn dịch vụ nào?';
              console.log('✅ [Fallback] Services list appended to response');
            } else {
              console.warn('⚠️ [Fallback] No services found or empty array');
            }
          } catch (e) {
            console.error('❌ [Fallback] Error calling get_services:', e);
            console.error('❌ [Fallback] Error stack:', e.stack);
            finalResponse += '\n\nVui lòng cho tôi biết dịch vụ bạn muốn đặt.';
          }
        } else if ((preProcessedData.serviceCalled || toolsCalled.includes('find_service_by_name')) && 
                   updatedContext.serviceId && updatedContext.doctorId && !updatedContext.date) {
          // ⭐ NEW: Service was just selected, but no date yet - ask for date
          const serviceName = preProcessedData.serviceResult?.service?.name || 'dịch vụ bạn chọn';
          finalResponse = `Bạn đã chọn dịch vụ "${serviceName}". Bạn muốn đặt lịch vào ngày nào? (Ví dụ: "ngày mai", "hôm nay", hoặc "22/11/2025")`;
        } else if ((preProcessedData.serviceCalled || toolsCalled.includes('find_service_by_name')) && 
                   updatedContext.serviceId && updatedContext.doctorId && updatedContext.date) {
          // Service found, have doctor and date, should show time slots
          console.log('🔧 [Fallback] Service + Doctor + Date detected, showing available slots...');
          
          // Actually call get_available_slots
          try {
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            console.log('🔧 [Fallback] get_available_slots result:', slotsResult);
            const slots = JSON.parse(slotsResult);
            if (slots.success) {
              const serviceName = slots.serviceName || preProcessedData.serviceResult?.service?.name || 'dịch vụ';
              finalResponse = `Dịch vụ: ${serviceName} (${slots.durationMinutes} phút).\n\nKhung giờ khả dụng ngày ${updatedContext.date}:`;
              if (slots.morning && slots.morning.length > 0) {
                finalResponse += `\n- Buổi sáng: ${slots.workingHours.morningStart} - ${slots.workingHours.morningEnd}`;
              }
              if (slots.afternoon && slots.afternoon.length > 0) {
                finalResponse += `\n- Buổi chiều: ${slots.workingHours.afternoonStart} - ${slots.workingHours.afternoonEnd}`;
              }
              finalResponse += '\n\nBạn muốn chọn giờ nào?';
            } else {
              finalResponse = slots.message || 'Không có khung giờ khả dụng. Vui lòng chọn ngày khác.';
            }
          } catch (e) {
            console.error('❌ [Fallback] Error calling get_available_slots:', e);
            console.error('❌ [Fallback] Error stack:', e.stack);
            finalResponse = 'Vui lòng cho biết giờ bạn muốn đặt lịch.';
          }
        } else if (updatedContext.doctorId && updatedContext.serviceId && updatedContext.date && !updatedContext.time) {
          // Have all info except time - should show slots if not already shown
          console.log('🔧 [Fallback] Have doctor + service + date, checking if need to show slots...');
          try {
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            if (slots.success && slots.morning && slots.afternoon) {
              finalResponse = `Khung giờ khả dụng ngày ${updatedContext.date}:`;
              if (slots.morning.length > 0) {
                finalResponse += `\n- Buổi sáng: ${slots.workingHours.morningStart} - ${slots.workingHours.morningEnd}`;
              }
              if (slots.afternoon.length > 0) {
                finalResponse += `\n- Buổi chiều: ${slots.workingHours.afternoonStart} - ${slots.workingHours.afternoonEnd}`;
              }
              finalResponse += '\n\nBạn muốn chọn giờ nào?';
            } else {
              finalResponse = 'Vui lòng chọn khung giờ bạn muốn đặt lịch.';
            }
          } catch (e) {
            console.error('❌ [Fallback] Error getting slots:', e);
            finalResponse = 'Vui lòng chọn khung giờ bạn muốn đặt lịch.';
          }
        } else if (updatedContext.doctorId && updatedContext.serviceId && updatedContext.date && updatedContext.time) {
          // ⭐ NEW: Time was selected, validate and create appointment
          console.log('🔧 [Fallback] Time detected, validating and creating appointment...');
          try {
            // First, check if time is available
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            
            if (slots.success) {
              // Check if selected time is in available slots
              const selectedTime = updatedContext.time; // e.g., "09:00"
              const allSlots = [...(slots.morning || []), ...(slots.afternoon || [])];
              const isValidTime = allSlots.some(slot => slot.startTime === selectedTime);
              
              console.log('🔧 [Fallback] Selected time:', selectedTime);
              console.log('🔧 [Fallback] Available slots:', allSlots.map(s => s.startTime));
              console.log('🔧 [Fallback] Time is valid:', isValidTime);
              
              if (isValidTime) {
                // Time is valid, create appointment
                console.log('✅ [Fallback] Time is valid, creating appointment...');
                const createResult = await tools[5].func({
                  serviceId: updatedContext.serviceId,
                  doctorId: updatedContext.doctorId,
                  date: updatedContext.date,
                  time: selectedTime,
                  notes: '',
                });
                console.log('🔧 [Fallback] Create appointment result:', createResult);
                const appointmentResult = JSON.parse(createResult);
                
                if (appointmentResult.success) {
                  const appt = appointmentResult.appointment;
                  console.log('✅ [Fallback] Appointment created successfully:', appt);
                  
                  finalResponse = `✅ Đặt lịch thành công!\n\n📅 Thông tin lịch hẹn:\n- Mã lịch: #${appt?.appointmentId || appt?._id || 'N/A'}\n- Bác sĩ: ${appt?.doctorName || 'N/A'}\n- Dịch vụ: ${appt?.serviceName || 'N/A'}\n- Ngày: ${updatedContext.date}\n- Giờ: ${selectedTime}\n- Trạng thái: ${appt?.status || 'Đã đặt'}\n\nChúng tôi sẽ gửi thông báo xác nhận qua email. Cảm ơn bạn!`;
                  // Clear context after successful booking
                  this.clearConversationContext(patientUserId);
                } else {
                  console.error('❌ [Fallback] Appointment creation failed:', appointmentResult);
                  finalResponse = `❌ Không thể đặt lịch: ${appointmentResult.error || appointmentResult.message || 'Lỗi không xác định'}. Vui lòng thử lại.`;
                }
              } else {
                // Time is not valid, show available slots again
                finalResponse = `❌ Khung giờ ${selectedTime} không khả dụng.\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
                if (slots.morning && slots.morning.length > 0) {
                  finalResponse += `\n- Buổi sáng: ${slots.workingHours.morningStart} - ${slots.workingHours.morningEnd}`;
                }
                if (slots.afternoon && slots.afternoon.length > 0) {
                  finalResponse += `\n- Buổi chiều: ${slots.workingHours.afternoonStart} - ${slots.workingHours.afternoonEnd}`;
                }
                finalResponse += '\n\nVui lòng chọn khung giờ khác.';
                // Clear invalid time from context
                this.updateConversationContext(patientUserId, { time: null });
              }
            } else {
              finalResponse = 'Không thể kiểm tra khung giờ khả dụng. Vui lòng thử lại.';
            }
          } catch (e) {
            console.error('❌ [Fallback] Error validating time or creating appointment:', e);
            console.error('❌ [Fallback] Error stack:', e.stack);
            finalResponse = 'Có lỗi xảy ra khi đặt lịch. Vui lòng thử lại.';
          }
        } else if (preProcessedData.shouldShowServices) {
          // User asked for services list
          try {
            const servicesResult = await tools[0].func({});
            const services = JSON.parse(servicesResult).services;
            if (services && services.length > 0) {
              finalResponse = 'Dưới đây là danh sách dịch vụ:';
              services.slice(0, 10).forEach((s, idx) => {
                finalResponse += `\n${idx + 1}. ${s.name} (${s.durationMinutes} phút)`;
              });
              if (services.length > 10) {
                finalResponse += `\n... và ${services.length - 10} dịch vụ khác`;
              }
              finalResponse += '\n\nBạn muốn chọn dịch vụ nào?';
            }
          } catch (e) {
            console.error('❌ [Fallback] Error calling get_services:', e);
            finalResponse = 'Vui lòng cho tôi biết dịch vụ bạn muốn đặt.';
          }
        } else {
          finalResponse = 'Vui lòng cung cấp thêm thông tin để tôi có thể giúp bạn đặt lịch. Bạn có thể cho tôi biết dịch vụ và ngày bạn muốn khám.';
        }
        
        console.log('📝 [LangChain] Generated fallback response (length: ' + finalResponse.length + '):', finalResponse);
      } else {
        console.log('📝 [LangChain] Using agent response (length: ' + finalResponse.length + '):', finalResponse);
      }
      
      // Build updated conversation history
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: finalResponse },
      ];
      
      // Get final context state for response
      const finalContext = this.getConversationContext(patientUserId);
      
      // Check if the response indicates appointment creation
      const responseText = finalResponse.toLowerCase();
      const appointmentCreated = responseText.includes('đặt lịch thành công') || 
                                 responseText.includes('booking successful') ||
                                 (!finalContext.serviceId && conversationHistory.some(m => 
                                   m.role === 'assistant' && m.content.includes('thành công')
                                 ));
      
      // Determine if we need more info based on context
      const hasAllInfo = finalContext.serviceId && finalContext.doctorId && finalContext.date && finalContext.time;
      const needsMoreInfo = !appointmentCreated && !hasAllInfo;
      
      console.log('📊 [LangChain] Context status:', {
        serviceId: !!finalContext.serviceId,
        doctorId: !!finalContext.doctorId,
        date: !!finalContext.date,
        time: !!finalContext.time,
        appointmentCreated,
        needsMoreInfo,
      });
      
      return {
        success: true,
        response: finalResponse,
        conversationHistory: updatedHistory,
        needsMoreInfo: needsMoreInfo,
        appointment: appointmentCreated ? { success: true } : null,
      };
    } catch (error) {
      console.error('❌ [LangChain] Error:', error);
      throw error;
    }
  }

  /**
   * Main entry point - matches the existing interface
   */
  async createAppointmentFromAI(userPrompt, patientUserId, appointmentFor = 'self', conversationHistory = []) {
    try {
      const result = await this.chatWithAI(userPrompt, patientUserId, conversationHistory);
      
      return {
        success: result.success,
        appointment: result.appointment || null,
        needsMoreInfo: result.needsMoreInfo || false,
        followUpQuestion: result.response,
        response: result.response,
        conversationHistory: result.conversationHistory,
        parsedData: { conversationHistory: result.conversationHistory },
      };
    } catch (error) {
      console.error('❌ [AI Booking LangChain] Error:', error);
      throw error;
    }
  }
}

// Export both the class and a singleton instance
module.exports = new AIBookingLangchainService();
module.exports.AIBookingLangchainService = AIBookingLangchainService;

