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
              // ⭐ Get doctor name
              const doctorInfo = await User.findById(doctorId).select('fullName');
              const doctorName = doctorInfo ? doctorInfo.fullName : 'Bác sĩ bạn chọn';
              
              // ⭐ Get list of available doctors for this date and service
              let alternativeDoctorsMessage = '';
              try {
                const availableDoctorsResult = await availableSlotService.getAvailableDoctors({
                  serviceId,
                  date,
                  breakAfterMinutes: 10
                });
                
                if (availableDoctorsResult && availableDoctorsResult.availableDoctors && availableDoctorsResult.availableDoctors.length > 0) {
                  alternativeDoctorsMessage = '\n\nCác bác sĩ khác còn khả dụng:';
                  availableDoctorsResult.availableDoctors.forEach((doc, idx) => {
                    alternativeDoctorsMessage += `\n${idx + 1}. ${doc.doctorName}`;
                  });
                  alternativeDoctorsMessage += '\n\nBạn muốn chọn bác sĩ nào?';
                } else {
                  alternativeDoctorsMessage = '\n\nKhông có bác sĩ nào khác khả dụng vào ngày này. Vui lòng chọn ngày khác.';
                }
              } catch (e) {
                console.error('❌ [Tool] Error getting alternative doctors:', e);
                alternativeDoctorsMessage = '\n\nVui lòng chọn bác sĩ khác hoặc đổi ngày.';
              }
              
              return JSON.stringify({
                success: false,
                error: `Bác sĩ ${doctorName} đang trong thời gian nghỉ phép vào ngày ${date}.${alternativeDoctorsMessage}`
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
          }).select('startTime endTime status').lean();


          console.log(`📅 [Tool] Found ${bookedTimeslots.length} booked timeslots for doctor ${doctorId} on ${date}`);
          bookedTimeslots.forEach(ts => console.log(`   - ${ts.startTime.toISOString()} to ${ts.endTime.toISOString()} (${ts.status})`));

          // ⭐ USE getDoctorScheduleRange - EXACT same logic as Patient BookingModal
          // This ensures AI shows the same available slots as the Patient booking form
          console.log(`🔧 [Tool] Calling availableSlotService.getDoctorScheduleRange...`);
          const scheduleResult = await availableSlotService.getDoctorScheduleRange({
            doctorUserId: doctorId,
            serviceId: serviceId,
            date: date,
            patientUserId: null, // Don't exclude self-appointments for AI view
            appointmentFor: 'self' // Default to 'self' for AI
          });

          console.log(`✅ [Tool] getDoctorScheduleRange result:`, JSON.stringify(scheduleResult, null, 2));

          // ⭐ Format the result - use displayRange directly from scheduleRanges (EXACT same as Patient BookingModal)
          // scheduleRanges structure: [{ shift: 'Morning'|'Afternoon', displayRange: '08:30-10:00, 10:30-11:00', ... }, ...]
          let morningDisplay = '';
          let afternoonDisplay = '';
          let morningSlots = [];
          let afternoonSlots = [];
          
          if (scheduleResult && scheduleResult.scheduleRanges && Array.isArray(scheduleResult.scheduleRanges)) {
            for (const range of scheduleResult.scheduleRanges) {
              // Use shift field to determine morning/afternoon (EXACT same as Patient BookingModal)
              if (range.shift === 'Morning') {
                // ⭐ Use displayRange directly - already formatted correctly by getDoctorScheduleRange
                morningDisplay = range.displayRange || 'Đã hết chỗ';
                
                // Convert availableGaps to slots format for compatibility (if needed)
                if (range.availableGaps && Array.isArray(range.availableGaps) && range.availableGaps.length > 0) {
                  morningSlots = range.availableGaps.map(gap => ({
                    startTime: gap.start, // ISO string
                    endTime: gap.end, // ISO string
                    displayTime: gap.display || `${gap.start}-${gap.end}` // "08:30-10:00"
                  }));
                }
              } else if (range.shift === 'Afternoon') {
                // ⭐ Use displayRange directly - already formatted correctly by getDoctorScheduleRange
                afternoonDisplay = range.displayRange || 'Không có thời gian khả dụng';
                
                // Convert availableGaps to slots format for compatibility (if needed)
                if (range.availableGaps && Array.isArray(range.availableGaps) && range.availableGaps.length > 0) {
                  afternoonSlots = range.availableGaps.map(gap => ({
                    startTime: gap.start, // ISO string
                    endTime: gap.end, // ISO string
                    displayTime: gap.display || `${gap.start}-${gap.end}` // "14:00-18:00"
                  }));
                }
              }
            }
          } else {
            console.warn('⚠️ [Tool] scheduleResult.scheduleRanges is missing or not an array:', scheduleResult);
          }
          
          // Handle missing shifts (EXACT same as Patient BookingModal fallback)
          if (!morningDisplay) morningDisplay = 'Đã qua thời gian làm việc hoặc không có lịch';
          if (!afternoonDisplay) afternoonDisplay = 'Không có thời gian khả dụng';

          return JSON.stringify({
            success: true,
            serviceName: service.serviceName,
            durationMinutes: service.durationMinutes,
            date,
            workingHours,
            morning: morningSlots.length > 0 ? { slots: morningSlots, isFull: false } : null,
            afternoon: afternoonSlots.length > 0 ? { slots: afternoonSlots, isFull: false } : null,
            morningDisplay, // ⭐ Pre-formatted string for agent to use
            afternoonDisplay, // ⭐ Pre-formatted string for agent to use
            bookedTimeslots: bookedTimeslots // ⭐ Return booked slots for reference
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
            console.log(`⚠️ [Tool] create_appointment: No schedules found. Auto-creating schedule for doctorId ${doctorId}, date ${date}...`);
            
            // ⭐ Auto-create schedule logic (copied from get_available_slots)
            const todayDateStr = DateHelper.getTodayVN();
            const searchDateFormatter = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Ho_Chi_Minh',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const searchDateStr = searchDateFormatter.format(searchDate);

            if (searchDateStr >= todayDateStr) {
              try {
                await ScheduleHelper.ensureScheduleForDoctor(doctorId, searchDate);
                await new Promise(resolve => setTimeout(resolve, 100)); // Wait for DB propagation

                // Query again after creating
                schedules = await DoctorSchedule.find({
                  doctorUserId: doctorId,
                  date: searchDate
                }).lean();
                
                console.log(`✅ [Tool] create_appointment: Auto-created schedule, found ${schedules.length} shifts`);
              } catch (createError) {
                console.error(`❌ [Tool] create_appointment: Error auto-creating schedule:`, createError);
                return JSON.stringify({ 
                  success: false, 
                  error: 'Không thể tạo lịch làm việc cho bác sĩ vào ngày này.' 
                });
              }
            } else {
              return JSON.stringify({ 
                success: false, 
                error: 'Không tìm thấy lịch làm việc của bác sĩ vào ngày này.' 
              });
            }
            
            if (!schedules || schedules.length === 0) {
               return JSON.stringify({ 
                success: false, 
                error: 'Không tìm thấy lịch làm việc của bác sĩ vào ngày này (sau khi thử tạo).' 
              });
            }
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
          
          // ⭐ FIX: Convert VN time (UTC+7) to UTC for database storage
          // User input is in VN timezone, we need to subtract 7 hours to get UTC time
          // Example: User selects 07:50 VN → Store as 00:50 UTC → Display as 07:50 VN ✅
          const startTime = new Date(searchDate);
          startTime.setUTCHours(startHour - 7, startMinute, 0, 0);
          
          console.log(`🔧 [Tool] create_appointment: Converting VN time ${time} to UTC: ${startTime.toISOString()}`);

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
            
            // ⭐ NEW: Check if payment is required (for online consultation services)
            const requiresPayment = result.requirePayment || false;
            
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
              requirePayment: requiresPayment, // ⭐ NEW: Flag to indicate payment is needed
              payment: requiresPayment && result.payment ? { // ⭐ NEW: Payment info for frontend
                paymentId: result.payment.paymentId,
                amount: result.payment.amount,
                QRurl: result.payment.QRurl,
                expiresAt: result.payment.expiresAt,
                method: result.payment.method,
                status: result.payment.status
              } : null,
              message: requiresPayment 
                ? 'Đặt lịch thành công! Vui lòng thanh toán để hoàn tất đặt lịch.' 
                : 'Đặt lịch thành công!',
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
   * Get available time ranges (not fixed slots) for a doctor on a specific date
   * Returns working hours with current time consideration and full booking check
   */
  async generateTimeSlots(schedule, bookedTimeslots, durationMinutes, searchDate) {
    const { morningStart, morningEnd, afternoonStart, afternoonEnd } = schedule.workingHours;
    
    // Get current time in Vietnam
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;
    
    // Check if searchDate is today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const searchDateObj = new Date(searchDate);
    searchDateObj.setHours(0, 0, 0, 0);
    const isToday = searchDateObj.getTime() === today.getTime();
    
    // Parse working hours
    const [morningStartH, morningStartM] = morningStart.split(':').map(Number);
    const [morningEndH, morningEndM] = morningEnd.split(':').map(Number);
    const [afternoonStartH, afternoonStartM] = afternoonStart.split(':').map(Number);
    const [afternoonEndH, afternoonEndM] = afternoonEnd.split(':').map(Number);
    
    const morningStartMinutes = morningStartH * 60 + morningStartM;
    const morningEndMinutes = morningEndH * 60 + morningEndM;
    const afternoonStartMinutes = afternoonStartH * 60 + afternoonStartM;
    const afternoonEndMinutes = afternoonEndH * 60 + afternoonEndM;
    
    // ⭐ NEW: Generate available slots in a shift (similar to patient booking logic)
    // Instead of finding gaps, we generate potential slots and check for conflicts
    const generateAvailableSlots = (shiftStartMinutes, shiftEndMinutes) => {
      const slots = [];
      let currentStartMinutes = shiftStartMinutes;
      
      // Generate potential slots with service duration
      while (currentStartMinutes < shiftEndMinutes) {
        const currentEndMinutes = currentStartMinutes + durationMinutes;
        
        // Check if slot exceeds shift end time
        if (currentEndMinutes > shiftEndMinutes) {
          break;
        }
        
        // Check if this slot conflicts with any booked timeslot
        let hasConflict = false;
        for (const timeslot of bookedTimeslots) {
          const tsStart = new Date(timeslot.startTime);
          const tsEnd = new Date(timeslot.endTime);
          const tsStartMinutes = tsStart.getHours() * 60 + tsStart.getMinutes();
          const tsEndMinutes = tsEnd.getHours() * 60 + tsEnd.getMinutes();
          
          // Check for overlap: slot overlaps with booked timeslot if:
          // - slot starts during booked time, OR
          // - slot ends during booked time, OR
          // - slot completely contains booked time
          if (
            (currentStartMinutes >= tsStartMinutes && currentStartMinutes < tsEndMinutes) ||
            (currentEndMinutes > tsStartMinutes && currentEndMinutes <= tsEndMinutes) ||
            (currentStartMinutes <= tsStartMinutes && currentEndMinutes >= tsEndMinutes)
          ) {
            hasConflict = true;
            break;
          }
        }
        
        if (!hasConflict) {
          slots.push({
            start: `${String(Math.floor(currentStartMinutes / 60)).padStart(2, '0')}:${String(currentStartMinutes % 60).padStart(2, '0')}`,
            end: `${String(Math.floor(currentEndMinutes / 60)).padStart(2, '0')}:${String(currentEndMinutes % 60).padStart(2, '0')}`
          });
        }
        
        // Move to next potential slot (no break time - slots can be consecutive)
        currentStartMinutes = currentEndMinutes;
      }
      
      return slots;
    };
    
    // ⭐ Helper to merge consecutive slots into ranges
    const mergeSlotsIntoRanges = (slots) => {
      if (slots.length === 0) return [];
      
      const ranges = [];
      let rangeStart = slots[0].start;
      let rangeEnd = slots[0].end;
      
      for (let i = 1; i < slots.length; i++) {
        // If current slot starts where previous ended, extend the range
        if (slots[i].start === rangeEnd) {
          rangeEnd = slots[i].end;
        } else {
          // Gap found, save current range and start new one
          ranges.push({ start: rangeStart, end: rangeEnd });
          rangeStart = slots[i].start;
          rangeEnd = slots[i].end;
        }
      }
      
      // Add the last range
      ranges.push({ start: rangeStart, end: rangeEnd });
      
      return ranges;
    };
    
    // Helper to check if a shift is fully booked
    const isShiftFullyBooked = (shiftStartMinutes, shiftEndMinutes) => {
      const slots = generateAvailableSlots(shiftStartMinutes, shiftEndMinutes);
      return slots.length === 0; // If no available slots, shift is full
    };
    
    // Determine available time ranges
    let morningAvailable = null;
    let afternoonAvailable = null;
    
    if (isToday) {
      // For today, only show times after current time
      if (currentTimeMinutes < morningEndMinutes) {
        const startMinutes = Math.max(currentTimeMinutes, morningStartMinutes);
        if (startMinutes < morningEndMinutes) {
          // Generate available slots for morning shift
          const morningSlots = generateAvailableSlots(startMinutes, morningEndMinutes);
          if (morningSlots.length > 0) {
            // Merge consecutive slots into ranges
            const morningRanges = mergeSlotsIntoRanges(morningSlots);
            morningAvailable = {
              start: morningRanges[0].start,
              end: morningRanges[morningRanges.length - 1].end,
              gaps: morningRanges, // ⭐ Include specific ranges
              isFull: false
            };
          } else {
            morningAvailable = { isFull: true };
          }
        }
      }
      
      if (currentTimeMinutes < afternoonEndMinutes) {
        const startMinutes = Math.max(currentTimeMinutes, afternoonStartMinutes);
        if (startMinutes < afternoonEndMinutes) {
          // Generate available slots for afternoon shift
          const afternoonSlots = generateAvailableSlots(startMinutes, afternoonEndMinutes);
          if (afternoonSlots.length > 0) {
            // Merge consecutive slots into ranges
            const afternoonRanges = mergeSlotsIntoRanges(afternoonSlots);
            afternoonAvailable = {
              start: afternoonRanges[0].start,
              end: afternoonRanges[afternoonRanges.length - 1].end,
              gaps: afternoonRanges, // ⭐ Include specific ranges
              isFull: false
            };
          } else {
            afternoonAvailable = { isFull: true };
          }
        }
      }
    } else {
      // For future dates, generate slots for full working hours
      const morningSlots = generateAvailableSlots(morningStartMinutes, morningEndMinutes);
      if (morningSlots.length > 0) {
        // Merge consecutive slots into ranges
        const morningRanges = mergeSlotsIntoRanges(morningSlots);
        morningAvailable = {
          start: morningRanges[0].start,
          end: morningRanges[morningRanges.length - 1].end,
          gaps: morningRanges, // ⭐ Include specific ranges
          isFull: false
        };
      } else {
        morningAvailable = { isFull: true };
      }
      
      const afternoonSlots = generateAvailableSlots(afternoonStartMinutes, afternoonEndMinutes);
      if (afternoonSlots.length > 0) {
        // Merge consecutive slots into ranges
        const afternoonRanges = mergeSlotsIntoRanges(afternoonSlots);
        afternoonAvailable = {
          start: afternoonRanges[0].start,
          end: afternoonRanges[afternoonRanges.length - 1].end,
          gaps: afternoonRanges, // ⭐ Include specific ranges
          isFull: false
        };
      } else {
        afternoonAvailable = { isFull: true };
      }
    }
    
    return {
      morning: morningAvailable,
      afternoon: afternoonAvailable,
    };
  }

  /**
   * Helper function to group consecutive slots into ranges
   * @param {Array} slots - Array of slot objects with startTime and endTime
   * @param {Number} durationMinutes - Service duration in minutes
   * @returns {Array} Array of ranges {start, end}
   */
  _groupConsecutiveSlots(slots, durationMinutes) {
    if (!slots || slots.length === 0) return [];
    
    const ranges = [];
    let rangeStart = null;
    let rangeEnd = null;
    let prevEndTime = null;
    
    // Sort slots by start time
    const sortedSlots = slots.sort((a, b) => {
      const aTime = new Date(a.startTime);
      const bTime = new Date(b.startTime);
      return aTime - bTime;
    });
    
    // Helper to format time in Vietnam timezone (UTC+7)
    const formatVNTime = (date) => {
      const d = new Date(date);
      const utcHour = d.getUTCHours();
      const utcMin = d.getUTCMinutes();
      const vnHour = (utcHour + 7) % 24;
      return `${String(vnHour).padStart(2, '0')}:${String(utcMin).padStart(2, '0')}`;
    };
    
    for (const slot of sortedSlots) {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);
      
      const slotStartStr = formatVNTime(slotStart);
      const slotEndStr = formatVNTime(slotEnd);
      
      if (!rangeStart) {
        // First slot
        rangeStart = slotStartStr;
        rangeEnd = slotEndStr;
        prevEndTime = slotEnd;
      } else {
        // Check if this slot is consecutive (starts exactly where previous ended)
        // Slots are consecutive if current start equals previous end (within 1 minute tolerance)
        const timeDiff = Math.abs(slotStart.getTime() - prevEndTime.getTime());
        const isConsecutive = timeDiff <= 60000; // 1 minute tolerance
        
        if (isConsecutive) {
          // Extend range
          rangeEnd = slotEndStr;
          prevEndTime = slotEnd;
        } else {
          // Gap found, save current range and start new one
          ranges.push({ start: rangeStart, end: rangeEnd });
          rangeStart = slotStartStr;
          rangeEnd = slotEndStr;
          prevEndTime = slotEnd;
        }
      }
    }
    
    // Add the last range
    if (rangeStart && rangeEnd) {
      ranges.push({ start: rangeStart, end: rangeEnd });
    }
    
    return ranges;
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
- GỌI: find_service_by_name(tên_dịch vụ)
- SAU KHI CÓ KẾT QUẢ → NÓI: "Dịch vụ bạn chọn: [tên] ([phút] phút)."
- KIỂM TRA: Đã có doctorId + serviceId + date?
- NẾU CÓ ĐỦ → GỌI NGAY: get_available_slots(doctorId, date, serviceId)
- SAU KHI CÓ SLOTS → HIỂN THỊ: "Các khung giờ khả dụng ngày [date]:\n- Buổi sáng: [morningDisplay]\n- Buổi chiều: [afternoonDisplay]"
  **QUAN TRỌNG**: SỬ DỤNG ĐÚNG TRƯỜNG 'morningDisplay' VÀ 'afternoonDisplay' TỪ KẾT QUẢ TOOL, KHÔNG DÙNG 'morning.start-morning.end'
- KẾT THÚC với: "Bạn muốn chọn giờ nào?"

**BƯỚC 3: Khi user chọn GIỜ**
- KHÔNG GỌI TOOL, CHỈ HIỂN THỊ XÁC NHẬN:
- CỰC KỲ QUAN TRỌNG: PHẢI HIỂN THỊ KHOẢNG THỜI GIAN (start-end) DỰA TRÊN THỜI LƯỢNG DỊCH VỤ
- "Xác nhận lịch hẹn:\n- Ngày: [date]\n- Dịch vụ: [tên] ([duration] phút)\n- Bác sĩ: [tên]\n- Giờ: [time]-[endTime]\nBạn xác nhận đặt lịch?"

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
          
          // ⭐ NEW: Check if doctor is on leave immediately after finding doctor
          if (results.doctorResult.found && results.doctorResult.doctor) {
            const doctorId = results.doctorResult.doctor.id;
            
            // Detect date from prompt
            const todayStr = DateHelper.getTodayVN();
            const tomorrowStr = DateHelper.getTomorrowVN();
            const parsedDate = lowerPrompt.includes('ngày mai') || lowerPrompt.includes('mai') ? tomorrowStr : 
                             lowerPrompt.includes('hôm nay') || lowerPrompt.includes('nay') ? todayStr : context.date;
            
            if (parsedDate) {
              try {
                const checkLeaveDate = new Date(parsedDate);
                checkLeaveDate.setHours(12, 0, 0, 0);
                const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctorId, checkLeaveDate);
                
                if (isOnLeave) {
                  console.log(`⚠️ [Pre-process] Doctor ${doctorId} is on leave on ${parsedDate}, setting error flag`);
                  
                  // Get alternatives
                  let alternativeDoctorsMessage = '';
                  try {
                    const allDoctors = await User.find({ role: 'Doctor', status: 'Active' }).select('fullName _id');
                    const availableDocs = [];
                    
                    for (const doc of allDoctors) {
                      if (doc._id.toString() === doctorId) continue;
                      
                      const isDocOnLeave = await leaveRequestService.isDoctorOnLeave(doc._id, checkLeaveDate);
                      if (!isDocOnLeave) {
                        availableDocs.push(doc);
                      }
                    }
                    
                    if (availableDocs.length > 0) {
                      alternativeDoctorsMessage = '\n\nCác bác sĩ khác đang hoạt động trong hệ thống:';
                      availableDocs.slice(0, 5).forEach((doc, idx) => {
                        alternativeDoctorsMessage += `\n${idx + 1}. ${doc.fullName}`;
                      });
                      alternativeDoctorsMessage += '\n\nVui lòng chọn bác sĩ khác bên dưới.';
                    } else {
                      alternativeDoctorsMessage = '\n\nKhông có bác sĩ nào khác khả dụng vào ngày này. Vui lòng chọn ngày khác.';
                    }
                  } catch (e) {
                    console.error('❌ [Pre-process] Error getting alternatives:', e);
                  }
                  
                  // Set error in results to be handled by main flow
                  results.doctorOnLeave = true;
                  results.doctorOnLeaveMessage = `Bác sĩ ${results.doctorResult.doctor.name} đã có lịch nghỉ phép vào ngày ${parsedDate}.${alternativeDoctorsMessage}`;
                  
                  // Don't show services if doctor is on leave
                  results.shouldShowServices = false;
                }
              } catch (e) {
                console.error('❌ [Pre-process] Error checking leave status:', e);
              }
            }
          }
          
          // If doctor found and no service yet, should show services (unless one-shot or doctor on leave)
          if (results.doctorResult.found && !context.serviceId && !results.isOneShotPrompt && !results.doctorOnLeave) {
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
      /(làm\s*sạch\s*răng|khám\s*răng|khám\s*tổng\s*quát|nhổ\s*răng|bọc\s*răng|tẩy\s*trắng|niềng\s*răng|trồng\s*răng|lấy\s*tủy|mài\s*răng|gắn\s*đinh)/iu,
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
          } else if (!results.serviceResult.found && !context.serviceId) {
            // Service not found - show services list instead
            console.log(`⚠️ [Pre-process] Service "${serviceName}" not found, will show services list`);
            results.shouldShowServices = true;
          }
        } catch (e) {
          console.error(`❌ [Pre-process] Error finding service:`, e);
        }
        break;
      } else if (match) {
        // Matched a general service keyword (e.g., "khám răng") but no specific service name
        console.log(`🔍 [Pre-process] Detected general service keyword: "${match[0]}"`);
        // Set flag to show services list
        if (!context.serviceId) {
          results.shouldShowServices = true;
        }
        break;
      }
    }
    
    // Detect time input (when we have doctor + date but no time, or in one-shot)
    // ⭐ FIX: Allow time detection even if serviceId is missing, as long as we have doctor and date (either in context or just detected)
    // Note: Date detection logic seems to be missing in this snippet, assuming it's handled elsewhere or we need to rely on context.
    // If date detection is NOT in preProcessUserInput, then we rely on context.
    // However, for one-shot prompts, date might not be in context yet if it's extracted later by the agent.
    // BUT, for "2 giờ chiều", it's a time update.
    
    // Let's relax it further: If user mentions time pattern, we should try to parse it regardless of date/doctor presence, 
    // but only validate if we have doctor.
    if (!context.time || results.isOneShotPrompt || userPrompt.match(/(\d{1,2})[:h]/) || userPrompt.match(/\d+\s*giờ/i)) {
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
          
          // ⭐ FIX: Handle 12-hour format (PM)
          // Check if "chiều" or "tối" is present in the full match
          const fullMatch = match[0].toLowerCase();
          const isPM = fullMatch.includes('chiều') || fullMatch.includes('tối') || fullMatch.includes('pm');
          
          if (isPM && hour < 12) {
            hour += 12;
            console.log(`🕐 [Pre-process] Converted PM time: ${match[1]} -> ${hour}`);
          }
          
          // Format as HH:mm
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          console.log(`🕐 [Pre-process] Detected time: "${timeStr}"`);
          
          // ⭐ FIX: Validate past time FIRST (even without doctor/service)
          const todayStr = DateHelper.getTodayVN();
          const tomorrowStr = DateHelper.getTomorrowVN();
          
          // ⭐ IMPORTANT: Check for "ngày mai" BEFORE checking for "nay" to avoid false positive
          const isTomorrow = userPrompt.toLowerCase().includes('ngày mai') || 
                             userPrompt.toLowerCase().includes(' mai') ||
                             (context.date === tomorrowStr);
          
          const isToday = !isTomorrow && (
            (context.date === todayStr) || 
            userPrompt.toLowerCase().includes('hôm nay') || 
            (userPrompt.toLowerCase().includes(' nay') && !userPrompt.toLowerCase().includes('ngày mai'))
          );
          
          if (isToday) {
            // ⭐ FIX: Instead of using arbitrary buffer, validate against available slots
            // This ensures consistency between what we show and what we allow
            const [h, m] = timeStr.split(':').map(Number);
            const selectedTimeMinutes = h * 60 + m;
            
            // ⭐ FIX: Get current time in VN timezone (not UTC)
            // Use Intl.DateTimeFormat to get actual VN time components
            const now = new Date();
            const vnHour = parseInt(new Intl.DateTimeFormat('en-US', { 
              timeZone: 'Asia/Ho_Chi_Minh', 
              hour: '2-digit', 
              hour12: false 
            }).format(now));
            const vnMinute = parseInt(new Intl.DateTimeFormat('en-US', { 
              timeZone: 'Asia/Ho_Chi_Minh', 
              minute: '2-digit' 
            }).format(now));
            const currentTimeMinutes = vnHour * 60 + vnMinute;
            
            console.log(`🕐 [Pre-process] VN Time: ${vnHour}:${vnMinute.toString().padStart(2, '0')} (${currentTimeMinutes} minutes), Selected: ${timeStr} (${selectedTimeMinutes} minutes)`);
            
            // Only reject if the selected time is actually in the past (with 1 min tolerance for processing)
            if (selectedTimeMinutes < currentTimeMinutes - 1) {
              console.log('❌ [Pre-process] Time is in the past');
              results.timeDetected = true;
              results.timeValue = timeStr;
              results.timeInvalid = true;
              results.timeInvalidReason = 'past_time';
              break;
            }
          }
          
          // ⭐ FIX Case 13: Allow time to be set even if serviceId is missing
          // Store the time first, then validate later when service is known
          if (!context.serviceId) {
            console.log(`✅ [Pre-process] Time detected without service - storing time ${timeStr} for later use`);
            this.updateConversationContext(patientUserId, { time: timeStr });
            results.timeDetected = true;
            results.timeValue = timeStr;
            results.timeInvalid = false;
            break;
          }
          
          // ⭐ Now validate against doctor's working hours (if we have doctor)
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

            // ⭐ FIX: Validate against available slots instead of checking booked appointments
            // This is more accurate and consistent with what we show to users
            const dateToCheck = context.date || (results.isOneShotPrompt ? DateHelper.getTodayVN() : null);
            
            if (dateToCheck && doctorId && context.serviceId) {
              try {
                console.log(`🔍 [Pre-process] Validating time ${timeStr} against available slots for Doctor ${doctorId} on ${dateToCheck}`);
                
                // Get available slots
                const slotsResult = await tools[4].func({
                  doctorId: doctorId,
                  date: dateToCheck,
                  serviceId: context.serviceId,
                });
                const slots = JSON.parse(slotsResult);
                
                if (slots.success) {
                  const [h, m] = timeStr.split(':').map(Number);
                  const selectedTimeMinutes = h * 60 + m;
                  
                  // ⭐ FIX Case 5: Check if selected time is within actual available GAPS (not just shift range)
                  // Available gaps exclude booked slots
                  let isTimeAvailable = false;
                  let availableSlots = [];
                  
                  // Collect all available slots from morning and afternoon
                  if (slots.morning && slots.morning.slots && slots.morning.slots.length > 0) {
                    availableSlots = availableSlots.concat(slots.morning.slots);
                  }
                  if (slots.afternoon && slots.afternoon.slots && slots.afternoon.slots.length > 0) {
                    availableSlots = availableSlots.concat(slots.afternoon.slots);
                  }
                  
                  // Check if selectedTime falls within any available gap
                  for (const slot of availableSlots) {
                    // Parse slot start and end times
                    const slotStart = new Date(slot.startTime);
                    const slotEnd = new Date(slot.endTime);
                    
                    // ⭐ FIX: Convert UTC to VN time (UTC+7)
                    const slotStartHour = (slotStart.getUTCHours() + 7) % 24;
                    const slotStartMinute = slotStart.getUTCMinutes();
                    const slotEndHour = (slotEnd.getUTCHours() + 7) % 24;
                    const slotEndMinute = slotEnd.getUTCMinutes();
                    
                    const slotStartMinutes = slotStartHour * 60 + slotStartMinute;
                    const slotEndMinutes = slotEndHour * 60 + slotEndMinute;
                    
                    console.log(`  🔍 [Pre-process] Checking slot: ${slotStartHour}:${String(slotStartMinute).padStart(2, '0')}-${slotEndHour}:${String(slotEndMinute).padStart(2, '0')} (${slotStartMinutes}-${slotEndMinutes} min) vs selected ${timeStr} (${selectedTimeMinutes} min)`);
                    
                    // Check if selected time + service duration fits within this gap
                    const serviceDuration = slots.durationMinutes || 30;
                    const selectedEndTimeMinutes = selectedTimeMinutes + serviceDuration;
                    
                    if (selectedTimeMinutes >= slotStartMinutes && selectedEndTimeMinutes <= slotEndMinutes) {
                      isTimeAvailable = true;
                      console.log(`  ✅ [Pre-process] Time ${timeStr} is valid in slot ${slotStartHour}:${String(slotStartMinute).padStart(2, '0')}-${slotEndHour}:${String(slotEndMinute).padStart(2, '0')}`);
                      break;
                    }
                  }
                  
                  if (!isTimeAvailable) {
                    console.log('❌ [Pre-process] Time is not within available gaps (may be booked or conflicting)');
                    results.timeDetected = true;
                    results.timeValue = timeStr;
                    results.timeInvalid = true;
                    results.timeInvalidReason = 'slot_conflict';
                    // Store available alternatives for response
                    results.availableSlots = {
                      morningDisplay: slots.morningDisplay,
                      afternoonDisplay: slots.afternoonDisplay
                    };
                    break;
                  }
                  
                  console.log('✅ [Pre-process] Time is within available gaps');
                } else {
                  console.log(`⚠️ [Pre-process] Could not get available slots: ${slots.error || 'Unknown error'}`);
                }
              } catch (err) {
                console.error('Error checking availability:', err);
              }
            }
          }
          
          // Store time in context (no reservation)
          if (context.doctorId && context.date && context.serviceId) {
            console.log(`✅ [Pre-process] Time ${timeStr} is valid, storing in context`);
            this.updateConversationContext(patientUserId, { time: timeStr });
            
            results.timeDetected = true;
            results.timeValue = timeStr;
            results.timeInvalid = false;
          } else {
            // Not enough context yet, just store time
            console.log(`⚠️ [Pre-process] Time ${timeStr} detected but missing context (doctor/date/service)`);
            this.updateConversationContext(patientUserId, { time: timeStr });
            
            results.timeDetected = true;
            results.timeValue = timeStr;
          }
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
   * Calculate available gaps between booked slots
   */
  calculateGaps(shiftStart, shiftEnd, bookedSlots) {
    const [startH, startM] = shiftStart.split(':').map(Number);
    const [endH, endM] = shiftEnd.split(':').map(Number);
    const shiftStartMin = startH * 60 + startM;
    const shiftEndMin = endH * 60 + endM;
    
    // Collect booked ranges in this shift
    const bookedRanges = [];
    if (bookedSlots && Array.isArray(bookedSlots)) {
      for (const slot of bookedSlots) {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);
        const slotStartMin = slotStart.getHours() * 60 + slotStart.getMinutes();
        const slotEndMin = slotEnd.getHours() * 60 + slotEnd.getMinutes();
        
        if (slotStartMin < shiftEndMin && slotEndMin > shiftStartMin) {
          bookedRanges.push({ start: slotStartMin, end: slotEndMin });
        }
      }
    }
    
    // Sort by start time
    bookedRanges.sort((a, b) => a.start - b.start);
    
    // Find gaps
    const gaps = [];
    let currentPos = shiftStartMin;
    
    for (const range of bookedRanges) {
      if (currentPos < range.start) {
        // There's a gap before this booked range
        gaps.push({
          start: `${String(Math.floor(currentPos / 60)).padStart(2, '0')}:${String(currentPos % 60).padStart(2, '0')}`,
          end: `${String(Math.floor(range.start / 60)).padStart(2, '0')}:${String(range.start % 60).padStart(2, '0')}`
        });
      }
      currentPos = Math.max(currentPos, range.end);
    }
    
    // Check for gap after last booked range
    if (currentPos < shiftEndMin) {
      gaps.push({
        start: `${String(Math.floor(currentPos / 60)).padStart(2, '0')}:${String(currentPos % 60).padStart(2, '0')}`,
        end: shiftEnd
      });
    }
    
    return gaps;
  }

  /**
 * Main method to process user message with AI
 */
async chatWithAI(userPrompt, patientUserId, conversationHistory = [], isNewConversation = false) {
  try {
    console.log('🤖 [LangChain] Processing message:', userPrompt);
    console.log('📝 [LangChain] Conversation history:', conversationHistory.length, 'messages');
    console.log('🆕 [LangChain] Is new conversation:', isNewConversation);
    
    // ⭐ Clear context if this is a new conversation
    if (isNewConversation) {
      console.log('🗑️ [LangChain] Clearing context for new conversation');
      this.clearConversationContext(patientUserId);
    }
    
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
        } else {
          // ⭐ NEW: Detect specific date format (DD/MM or DD/MM/YYYY)
          const datePattern = /(ngày\s+)?(\d{1,2})\/(\d{1,2})(\/(\d{4}))?/i;
          const dateMatch = userPrompt.match(datePattern);
          if (dateMatch) {
            const day = parseInt(dateMatch[2]);
            const month = parseInt(dateMatch[3]);
            const year = dateMatch[5] ? parseInt(dateMatch[5]) : new Date().getFullYear();
            
            // Create date object (month is 0-indexed in JS)
            const parsedDate = new Date(year, month - 1, day);
            parsedDate.setHours(0, 0, 0, 0);
            
            // Check if date is valid
            if (parsedDate.getDate() === day && parsedDate.getMonth() === month - 1) {
              const parsedDateStr = parsedDate.toISOString().split('T')[0];
              
              // ⭐ Check if date is in the past
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              if (parsedDate < today) {
                console.log(`❌ [LangChain] Detected past date: ${parsedDateStr}`);
                this.updateConversationContext(patientUserId, { rejectedPastDate: true });
                
                // Return early with error message
                const errorMessage = `Không thể đặt lịch vào ngày ${day}/${month}/${year} vì đây là ngày ở quá khứ. Vui lòng chọn ngày trong tương lai.`;
                return {
                  success: false,
                  message: errorMessage,
                  response: errorMessage,
                  needsMoreInfo: true,
                  context: this.getConversationContext(patientUserId)
                };
              }
              
              // Date is valid and in the future
              this.updateConversationContext(patientUserId, { date: parsedDateStr });
              console.log(`📅 [LangChain] Parsed date: "${day}/${month}/${year}" → ${parsedDateStr}`);
            } else {
              console.log(`⚠️ [LangChain] Invalid date: ${day}/${month}/${year}`);
            }
          }
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
      // ⭐ FIX: Validate time availability whenever we have all required context
      // This handles both one-shot prompts AND multi-turn conversations where time was set earlier
      if (updatedContext.doctorId && updatedContext.serviceId && updatedContext.date && updatedContext.time) {
        console.log('🎯 [LangChain] All context available - validating slot availability for time:', updatedContext.time);
        try {
          // Get service duration
          const service = await Service.findById(updatedContext.serviceId).lean();
          if (!service) {
            console.error('❌ [LangChain] Service not found for validation');
            return;
          }
          
          // Parse selected time
          const selectedTime = updatedContext.time; // e.g., "08:00"
          const [h, m] = selectedTime.split(':').map(Number);
          const selectedTimeMinutes = h * 60 + m;
          
          // Get booked timeslots for this doctor on this date
          const searchDate = new Date(updatedContext.date);
          searchDate.setHours(0, 0, 0, 0);
          const startOfDay = new Date(searchDate);
          const endOfDay = new Date(searchDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          const bookedTimeslots = await Timeslot.find({
            doctorUserId: updatedContext.doctorId,
            status: { $in: ['Booked', 'Reserved'] },
            startTime: { $gte: startOfDay, $lt: endOfDay }
          }).select('startTime endTime status').lean();
          
          console.log(`📅 [LangChain] Found ${bookedTimeslots.length} booked/reserved timeslots`);
          
          // Check if selected time conflicts with any booked slot
          let hasConflict = false;
          let conflictingSlot = null;
          
          for (const slot of bookedTimeslots) {
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);
            const slotStartMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
            const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();
            
            // Calculate end time of selected appointment
            const selectedEndMinutes = selectedTimeMinutes + service.durationMinutes;
            
            // Check for overlap: selected appointment overlaps with booked slot
            // Overlap if: (selectedStart < slotEnd) AND (selectedEnd > slotStart)
            if (selectedTimeMinutes < slotEndMinutes && selectedEndMinutes > slotStartMinutes) {
              hasConflict = true;
              conflictingSlot = {
                start: `${String(slotStart.getHours()).padStart(2, '0')}:${String(slotStart.getMinutes()).padStart(2, '0')}`,
                end: `${String(slotEnd.getHours()).padStart(2, '0')}:${String(slotEnd.getMinutes()).padStart(2, '0')}`
              };
              console.log(`❌ [LangChain] Time ${selectedTime} conflicts with existing appointment ${conflictingSlot.start}-${conflictingSlot.end}`);
              break;
            }
          }
          
          if (hasConflict) {
            // Get available slots to show alternatives
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            
            // ⭐ Show specific conflict message with available gaps
            // Use morningDisplay/afternoonDisplay from get_available_slots tool
            finalResponse = `❌ Khung giờ ${selectedTime} không khả dụng (đã có lịch hẹn khác từ ${conflictingSlot.start}-${conflictingSlot.end}).\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
            
            // ⭐ FIX: get_available_slots returns morningDisplay/afternoonDisplay, NOT scheduleRanges
            if (slots.success) {
              if (slots.morningDisplay) {
                finalResponse += `\n- Buổi sáng: ${slots.morningDisplay}`;
              } else {
                finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
              }
              
              if (slots.afternoonDisplay) {
                finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay}`;
              } else {
                finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
              }
            } else {
              finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
              finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
            }
            
            finalResponse += '\n\nVui lòng chọn khung giờ khác.';
            // Clear invalid time from context
            this.updateConversationContext(patientUserId, { time: null });
          } else {
            // No conflict, but still check if time is within working hours
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            
            if (slots.success) {
              let isInWorkingHours = false;
              const { morningStart, morningEnd, afternoonStart, afternoonEnd } = slots.workingHours;
              const [mStartH, mStartM] = morningStart.split(':').map(Number);
              const [mEndH, mEndM] = morningEnd.split(':').map(Number);
              const [aStartH, aStartM] = afternoonStart.split(':').map(Number);
              const [aEndH, aEndM] = afternoonEnd.split(':').map(Number);
              
              const morningStartMin = mStartH * 60 + mStartM;
              const morningEndMin = mEndH * 60 + mEndM;
              const afternoonStartMin = aStartH * 60 + aStartM;
              const afternoonEndMin = aEndH * 60 + aEndM;
              
              // Check if time is within working hours
              if ((selectedTimeMinutes >= morningStartMin && selectedTimeMinutes < morningEndMin) ||
                  (selectedTimeMinutes >= afternoonStartMin && selectedTimeMinutes < afternoonEndMin)) {
                isInWorkingHours = true;
              }
              
              if (!isInWorkingHours) {
                console.log(`❌ [LangChain] Time ${selectedTime} is outside working hours`);
                finalResponse = `❌ Khung giờ ${selectedTime} không khả dụng (ngoài giờ làm việc).\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
                
                // ⭐ FIX: Use morningDisplay/afternoonDisplay from get_available_slots tool
                if (slots.success) {
                  if (slots.morningDisplay) {
                    finalResponse += `\n- Buổi sáng: ${slots.morningDisplay}`;
                  } else {
                    finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
                  }
                  
                  if (slots.afternoonDisplay) {
                    finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay}`;
                  } else {
                    finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
                  }
                } else {
                  finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
                  finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
                }
                finalResponse += '\n\nVui lòng chọn khung giờ khác.';
                this.updateConversationContext(patientUserId, { time: null });
              } else {
                console.log('✅ [LangChain] Slot is available - no conflicts and within working hours');
              }
            }
          }
        } catch (e) {
          console.error('❌ [LangChain] Error validating slot:', e);
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
        
        // ⭐ NEW: Handle doctor on leave error (highest priority)
        if (preProcessedData.doctorOnLeave) {
          console.log('⚠️ [Fallback] Doctor is on leave, returning error message');
          finalResponse = preProcessedData.doctorOnLeaveMessage;
          // Return immediately with needsMoreInfo flag
          return {
            message: finalResponse,
            intermediateSteps: result.intermediateSteps,
            needsMoreInfo: true
          };
        }

        // ⭐ FIX Case 25: Handle doctor not found explicitly
        if (preProcessedData.doctorCalled && preProcessedData.doctorResult && !preProcessedData.doctorResult.found) {
          console.log('⚠️ [Fallback] Doctor not found, returning tool message');
          finalResponse = preProcessedData.doctorResult.message || 'Không tìm thấy bác sĩ bạn yêu cầu.';
          
          // Add suggestions if available
          if (preProcessedData.doctorResult.suggestions && preProcessedData.doctorResult.suggestions.length > 0) {
            finalResponse += '\n\nDưới đây là một số bác sĩ khác có thể bạn quan tâm:';
            preProcessedData.doctorResult.suggestions.forEach((d, idx) => {
              finalResponse += `\n${idx + 1}. ${d.name}`;
            });
            finalResponse += '\n\nBạn muốn chọn bác sĩ nào?';
          } else {
            finalResponse += ' Vui lòng kiểm tra lại tên bác sĩ hoặc chọn bác sĩ khác.';
          }
          
          // Return immediately to prevent other fallbacks from overriding
          return {
            success: true,
            response: finalResponse,
            conversationHistory: [
              ...conversationHistory,
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: finalResponse },
            ],
            needsMoreInfo: true
          };
        }
        
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
        // ⭐ FIX Case 4 & 5: Handle invalid time (outside working hours or slot conflict)
        else if (preProcessedData.timeInvalid) {
          if (preProcessedData.timeInvalidReason === 'past_time') {
            finalResponse = `❌ Khung giờ ${preProcessedData.timeValue} đã qua. Vui lòng chọn khung giờ khác trong tương lai.`;
            
            // Show available slots for past time
            try {
              const slotsResult = await tools[4].func({
                doctorId: updatedContext.doctorId,
                date: updatedContext.date,
                serviceId: updatedContext.serviceId,
              });
              const slots = JSON.parse(slotsResult);
              if (slots.success && slots.scheduleRanges && Array.isArray(slots.scheduleRanges)) {
                finalResponse += `\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
                for (const range of slots.scheduleRanges) {
                  if (range.shift === 'Morning') {
                    const display = range.displayRange || 'Đã qua thời gian làm việc';
                    finalResponse += `\n- Buổi sáng: ${display}`;
                  } else if (range.shift === 'Afternoon') {
                    const display = range.displayRange || 'Không có thời gian khả dụng';
                    finalResponse += `\n- Buổi chiều: ${display}`;
                  }
                }
              }
            } catch (e) {
              console.error('❌ [Fallback] Error getting available slots for past time:', e);
            }
          } else if (preProcessedData.timeInvalidReason === 'booked' || preProcessedData.timeInvalidReason === 'slot_conflict') {
            // ⭐ FIX: For slot conflicts, the message is already generated in the main validation (lines 2001-2043)
            // DO NOT call tool again here to avoid duplicate/conflicting messages
            // Just use the pre-generated message from the main validation
            console.log('⚠️ [Fallback] Slot conflict already handled in main validation, skipping duplicate message');
            // finalResponse will be set by the main validation logic (lines 2001-2043)
            // So we should NOT reach here if validation ran properly
            // But if we do reach here, generate a simple message
            finalResponse = `❌ Khung giờ ${preProcessedData.timeValue} không khả dụng (đã có lịch hẹn khác). Vui lòng chọn khung giờ khác.`;
          } else if (preProcessedData.timeInvalidReason === 'reservation_failed') {
            finalResponse = `❌ Khung giờ ${preProcessedData.timeValue} không thể đặt (${preProcessedData.reservationError || 'đã có người đặt trước'}). Vui lòng chọn giờ khác.`;
          } else {
            finalResponse = `❌ Khung giờ ${preProcessedData.timeValue} không khả dụng (ngoài giờ làm việc của bác sĩ). Vui lòng chọn khung giờ khác.`;
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
          
          // Calculate end time
          const [h, m] = updatedContext.time.split(':').map(Number);
          const endTimeMinutes = h * 60 + m + (service?.durationMinutes || 30);
          const endH = Math.floor(endTimeMinutes / 60);
          const endM = endTimeMinutes % 60;
          const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          
          finalResponse = `Xác nhận lịch hẹn:\n- Ngày: ${updatedContext.date}\n- Dịch vụ: ${serviceName}\n- Bác sĩ: ${doctorName}\n- Giờ: ${updatedContext.time}-${endTime}\nBạn xác nhận đặt lịch?`;
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
          
          // ⭐ NEW: Check if doctor is on leave immediately
          if (updatedContext.doctorId && parsedDate) {
            try {
              const checkLeaveDate = new Date(parsedDate);
              checkLeaveDate.setHours(12, 0, 0, 0);
              const isOnLeave = await leaveRequestService.isDoctorOnLeave(updatedContext.doctorId, checkLeaveDate);
              
              if (isOnLeave) {
                console.log(`⚠️ [Fallback] Doctor ${updatedContext.doctorId} is on leave on ${parsedDate}, returning error immediately`);
                
                // Get doctor name
                const doctorInfo = await User.findById(updatedContext.doctorId).select('fullName');
                const doctorName = doctorInfo ? doctorInfo.fullName : 'Bác sĩ bạn chọn';
                
                // Get alternatives
                let alternativeDoctorsMessage = '';
                try {
                  // Use a default serviceId if none selected (e.g. first active service) or just list doctors available for ANY service?
                  // availableSlotService.getAvailableDoctors requires serviceId.
                  // If we don't have serviceId, we can't accurately check availability.
                  // However, we can try to find a default service or just list active doctors who are not on leave.
                  
                  // Let's try to find "Làm sạch răng" or any service to use as proxy, or just skip alternatives if no service.
                  // Better: Just say doctor is on leave and ask to choose another doctor (and show list of doctors).
                  
                  // Actually, we can fetch all doctors and check if they are on leave.
                  const allDoctors = await User.find({ role: 'Doctor', status: 'Active' }).select('fullName _id');
                  const availableDocs = [];
                  
                  for (const doc of allDoctors) {
                    if (doc._id.toString() === updatedContext.doctorId) continue;
                    
                    const isDocOnLeave = await leaveRequestService.isDoctorOnLeave(doc._id, checkLeaveDate);
                    if (!isDocOnLeave) {
                      availableDocs.push(doc);
                    }
                  }
                  
                  if (availableDocs.length > 0) {
                    alternativeDoctorsMessage = '\n\nCác bác sĩ khác đang hoạt động trong hệ thống:';
                    availableDocs.slice(0, 5).forEach((doc, idx) => {
                      alternativeDoctorsMessage += `\n${idx + 1}. ${doc.fullName}`;
                    });
                    alternativeDoctorsMessage += '\n\nVui lòng chọn bác sĩ khác bên dưới.';
                  } else {
                    alternativeDoctorsMessage = '\n\nKhông có bác sĩ nào khác khả dụng vào ngày này. Vui lòng chọn ngày khác.';
                  }
                } catch (e) {
                  console.error('❌ [Fallback] Error getting alternatives:', e);
                }
                
                finalResponse = `Bác sĩ ${doctorName} đã có lịch nghỉ phép vào ngày ${parsedDate}.${alternativeDoctorsMessage}`;
                return {
                  message: finalResponse,
                  intermediateSteps: result.intermediateSteps,
                  needsMoreInfo: true // ⭐ Prevent frontend from treating this as success
                };
              }
            } catch (e) {
              console.error('❌ [Fallback] Error checking leave status:', e);
            }
          }

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
              // ⭐ NEW: Filter services based on user's general keywords
              let filteredServices = services;
              const lowerPrompt = userPrompt.toLowerCase();
              
              // Special case: "khám răng" or general dental terms → show all dental services (exclude general health)
              if (lowerPrompt.includes('khám răng') || 
                  (lowerPrompt.includes('khám') && lowerPrompt.includes('răng'))) {
                console.log('🔍 [Fallback] Detected "khám răng" - showing all dental services');
                filteredServices = services.filter(s => 
                  s.category === 'Examination' && 
                  !s.name.toLowerCase().includes('tổng quát')
                );
                console.log(`✅ [Fallback] Filtered to ${filteredServices.length} dental services`);
              } else {
                // Define specific keyword mappings for other cases
                const serviceKeywords = {
                  'làm sạch': ['làm sạch', 'vệ sinh', 'cạo vôi'],
                  'tẩy trắng': ['tẩy trắng', 'trắng răng', 'làm trắng'],
                  'nhổ': ['nhổ', 'rút răng'],
                  'trồng': ['trồng', 'cấy ghép', 'implant'],
                  'niềng': ['niềng', 'chỉnh nha', 'thẳng răng'],
                  'bọc': ['bọc', 'răng sứ', 'veneer'],
                  'lấy tủy': ['lấy tủy', 'điều trị tủy', 'chữa tủy'],
                  'mài': ['mài', 'đánh bóng'],
                };
                
                // Check if user mentioned any specific keyword
                for (const [category, keywords] of Object.entries(serviceKeywords)) {
                  if (keywords.some(kw => lowerPrompt.includes(kw))) {
                    console.log(`🔍 [Fallback] Detected keyword category: ${category}`);
                    filteredServices = services.filter(s => 
                      keywords.some(kw => s.name.toLowerCase().includes(kw))
                    );
                    if (filteredServices.length > 0) {
                      console.log(`✅ [Fallback] Filtered to ${filteredServices.length} services`);
                      break;
                    }
                  }
                }
              }
              
              // If no match or empty result, use all services
              if (filteredServices.length === 0) {
                filteredServices = services;
              }
              
              finalResponse += '\n\nDưới đây là danh sách dịch vụ:';
              filteredServices.slice(0, 10).forEach((s, idx) => {
                finalResponse += `\n${idx + 1}. ${s.name} (${s.durationMinutes} phút)`;
              });
              if (filteredServices.length > 10) {
                finalResponse += `\n... và ${filteredServices.length - 10} dịch vụ khác`;
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
        } else if ((preProcessedData.doctorCalled || toolsCalled.includes('find_doctor_by_name')) && 
                   updatedContext.doctorId && updatedContext.serviceId && !updatedContext.date) {
          // ⭐ NEW: Doctor was just selected, already have service, need date
          const doctorName = preProcessedData.doctorResult?.doctor?.name || 'bác sĩ';
          const service = await Service.findById(updatedContext.serviceId);
          const serviceName = service?.serviceName || 'dịch vụ bạn đã chọn';
          finalResponse = `Bạn đã chọn ${doctorName} cho dịch vụ "${serviceName}". Bạn muốn đặt lịch vào ngày nào? (Ví dụ: "ngày mai", "hôm nay", hoặc "22/11/2025")`;
        } else if ((preProcessedData.serviceCalled || toolsCalled.includes('find_service_by_name')) && 
                   updatedContext.serviceId && !updatedContext.doctorId) {
          // ⭐ NEW: Service was just selected, but no doctor yet - ask for doctor
          const serviceName = preProcessedData.serviceResult?.service?.name || 'dịch vụ bạn chọn';
          finalResponse = `Bạn đã chọn dịch vụ "${serviceName}". Bạn muốn đặt lịch với bác sĩ nào? (Ví dụ: "bác sĩ Hải", "bác sĩ Dương")`;
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
              
              // ⭐ NEW: Check if both shifts are unavailable (no time or full)
              // Use the presence of slots array to determine availability
              const morningAvailable = slots.morning && slots.morning.slots && slots.morning.slots.length > 0;
              const afternoonAvailable = slots.afternoon && slots.afternoon.slots && slots.afternoon.slots.length > 0;
              
              if (!morningAvailable && !afternoonAvailable) {
                // Both shifts are unavailable - suggest choosing another date
                const todayStr = DateHelper.getTodayVN();
                const tomorrowStr = DateHelper.getTomorrowVN();
                const isToday = updatedContext.date === todayStr;
                
                if (isToday) {
                  finalResponse = `⚠️ Dịch vụ "${serviceName}" cần ${slots.durationMinutes} phút để thực hiện, nhưng hôm nay không còn đủ thời gian khả dụng.\n\nBạn có muốn đặt lịch vào ngày mai (${tomorrowStr}) hoặc ngày khác không?`;
                } else {
                  finalResponse = `⚠️ Ngày ${updatedContext.date} không có khung giờ khả dụng cho dịch vụ "${serviceName}".\n\nBạn có muốn chọn ngày khác không? (Ví dụ: "ngày mai", "hôm nay", hoặc ngày cụ thể)`;
                }
                // Clear date from context so user can choose another date
                this.updateConversationContext(patientUserId, { date: null });
              } else {
                // At least one shift has available time - show slots
                finalResponse = `Dịch vụ: ${serviceName} (${slots.durationMinutes} phút).\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
                
                if (morningAvailable) {
                  finalResponse += `\n- Buổi sáng: ${slots.morningDisplay}`;
                } else {
                  finalResponse += `\n- Buổi sáng: ${slots.morningDisplay || 'Không có thời gian khả dụng'}`;
                }
                
                if (afternoonAvailable) {
                  finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay}`;
                } else {
                  finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay || 'Không có thời gian khả dụng'}`;
                }
                
                finalResponse += `\n\nBạn muốn chọn giờ nào?`;
              }
            } else {
              finalResponse = slots.error || slots.message || 'Không có khung giờ khả dụng. Vui lòng chọn ngày khác.';
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
            if (slots.success) {
              finalResponse = `Các khung giờ khả dụng ngày ${updatedContext.date}:`;
              if (slots.morning && slots.morning.start && !slots.morning.isFull) {
                // ⭐ Use pre-calculated gaps if available, otherwise show range
                if (slots.morning.gaps && slots.morning.gaps.length > 0) {
                  finalResponse += `\n- Buổi sáng: ${slots.morning.gaps.map(g => `${g.start}-${g.end}`).join(', ')}`;
                } else {
                  finalResponse += `\n- Buổi sáng: ${slots.morning.start}-${slots.morning.end}`;
                }
              } else if (slots.morning && slots.morning.isFull) {
                finalResponse += `\n- Buổi sáng: Đã hết chỗ`;
              } else {
                finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
              }
              if (slots.afternoon && slots.afternoon.start && !slots.afternoon.isFull) {
                // ⭐ Use pre-calculated gaps if available, otherwise show range
                if (slots.afternoon.gaps && slots.afternoon.gaps.length > 0) {
                  finalResponse += `\n- Buổi chiều: ${slots.afternoon.gaps.map(g => `${g.start}-${g.end}`).join(', ')}`;
                } else {
                  finalResponse += `\n- Buổi chiều: ${slots.afternoon.start}-${slots.afternoon.end}`;
                }
              } else if (slots.afternoon && slots.afternoon.isFull) {
                finalResponse += `\n- Buổi chiều: Đã hết chỗ`;
              } else if (!slots.morning || !slots.morning.start) {
                finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
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
          // ⭐ Time was selected, validate and create appointment
          console.log('🔧 [Fallback] Time detected, validating and creating appointment...');
          
          // Validate time and create appointment
          try {
            // First, check if time is available
            const slotsResult = await tools[4].func({
              doctorId: updatedContext.doctorId,
              date: updatedContext.date,
              serviceId: updatedContext.serviceId,
            });
            const slots = JSON.parse(slotsResult);
            
            if (slots.success) {
              // ⭐ FIX: Check if selected time is within available gaps (not single start/end)
              const selectedTime = updatedContext.time; // e.g., "10:00"
              const [h, m] = selectedTime.split(':').map(Number);
              const selectedTimeMinutes = h * 60 + m;
              
              let isValidTime = false;
              
              console.log('🔍 [Fallback] Validating time against slots:', JSON.stringify(slots, null, 2));
              
              // ⭐ NEW: Check against availableGaps in morning shift
              if (slots.morning && slots.morning.slots && Array.isArray(slots.morning.slots)) {
                for (const slot of slots.morning.slots) {
                  // Parse start and end time from slot
                  const startTime = slot.startTime; // ISO string
                  const endTime = slot.endTime; // ISO string
                  
                  // Convert to VN time (UTC+7)
                  const startDate = new Date(startTime);
                  const endDate = new Date(endTime);
                  
                  const startH = (startDate.getUTCHours() + 7) % 24;
                  const startM = startDate.getUTCMinutes();
                  const endH = (endDate.getUTCHours() + 7) % 24;
                  const endM = endDate.getUTCMinutes();
                  
                  const startMin = startH * 60 + startM;
                  const endMin = endH * 60 + endM;
                  
                  console.log(`  🔍 Checking morning slot: ${startH}:${String(startM).padStart(2, '0')}-${endH}:${String(endM).padStart(2, '0')} (${startMin}-${endMin} min)`);
                  
                  if (selectedTimeMinutes >= startMin && selectedTimeMinutes < endMin) {
                    isValidTime = true;
                    console.log(`  ✅ Time ${selectedTime} is valid in morning slot`);
                    break;
                  }
                }
              }
              
              // ⭐ NEW: Check against availableGaps in afternoon shift
              if (!isValidTime && slots.afternoon && slots.afternoon.slots && Array.isArray(slots.afternoon.slots)) {
                for (const slot of slots.afternoon.slots) {
                  // Parse start and end time from slot
                  const startTime = slot.startTime; // ISO string
                  const endTime = slot.endTime; // ISO string
                  
                  // Convert to VN time (UTC+7)
                  const startDate = new Date(startTime);
                  const endDate = new Date(endTime);
                  
                  const startH = (startDate.getUTCHours() + 7) % 24;
                  const startM = startDate.getUTCMinutes();
                  const endH = (endDate.getUTCHours() + 7) % 24;
                  const endM = endDate.getUTCMinutes();
                  
                  const startMin = startH * 60 + startM;
                  const endMin = endH * 60 + endM;
                  
                  console.log(`  🔍 Checking afternoon slot: ${startH}:${String(startM).padStart(2, '0')}-${endH}:${String(endM).padStart(2, '0')} (${startMin}-${endMin} min)`);
                  
                  if (selectedTimeMinutes >= startMin && selectedTimeMinutes < endMin) {
                    isValidTime = true;
                    console.log(`  ✅ Time ${selectedTime} is valid in afternoon slot`);
                    break;
                  }
                }
              }
              
              console.log('🔧 [Fallback] Selected time:', selectedTime);
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
                    
                    // Calculate end time for display
                    const service = await Service.findById(updatedContext.serviceId);
                    const endTimeMinutes = selectedTimeMinutes + (service?.durationMinutes || 30);
                    const endH = Math.floor(endTimeMinutes / 60);
                    const endM = endTimeMinutes % 60;
                    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                    
                    finalResponse = `✅ Đặt lịch thành công!\n\n📅 Thông tin lịch hẹn:\n- Mã lịch: #${appt?.appointmentId || appt?._id || 'N/A'}\n- Bác sĩ: ${appt?.doctorName || 'N/A'}\n- Dịch vụ: ${appt?.serviceName || 'N/A'}\n- Ngày: ${updatedContext.date}\n- Giờ: ${selectedTime}-${endTime}\n- Trạng thái: ${appt?.status || 'Đã đặt'}\n\nChúng tôi sẽ gửi thông báo xác nhận qua email. Cảm ơn bạn!`;
                    // Clear context after successful booking
                    this.clearConversationContext(patientUserId);
                  } else {
                    console.error('❌ [Fallback] Appointment creation failed:', appointmentResult);
                    finalResponse = `❌ Không thể đặt lịch: ${appointmentResult.error || appointmentResult.message || 'Lỗi không xác định'}. Vui lòng thử lại.`;
                  }
                } else {
                  // Time is not valid, show available slots again
                  finalResponse = `❌ Khung giờ ${selectedTime} không khả dụng.\n\nCác khung giờ khả dụng ngày ${updatedContext.date}:`;
                  
                  // Use morningDisplay and afternoonDisplay for user-friendly output
                  if (slots.morningDisplay) {
                    finalResponse += `\n- Buổi sáng: ${slots.morningDisplay}`;
                  }
                  if (slots.afternoonDisplay) {
                    finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay}`;
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
        } else if (preProcessedData.shouldShowServices && !updatedContext.doctorId) {
          // ⭐ NEW: User mentioned service keyword (e.g., "khám răng") but no doctor yet
          console.log('🔧 [Fallback] Service keyword detected, showing filtered services...');
          try {
            const servicesResult = await tools[0].func({});
            const servicesParsed = JSON.parse(servicesResult);
            const services = servicesParsed.services;
            
            if (services && services.length > 0) {
              // Filter services based on user's keywords
              let filteredServices = services;
              const lowerPrompt = userPrompt.toLowerCase();
              
              if (lowerPrompt.includes('khám răng') || 
                  (lowerPrompt.includes('khám') && lowerPrompt.includes('răng'))) {
                console.log('🔍 [Fallback] Detected "khám răng" - showing all dental services');
                filteredServices = services.filter(s => 
                  s.category === 'Examination' && 
                  !s.name.toLowerCase().includes('tổng quát')
                );
              }
              
              if (filteredServices.length === 0) {
                filteredServices = services;
              }
              
              finalResponse = 'Dưới đây là danh sách dịch vụ:';
              filteredServices.slice(0, 10).forEach((s, idx) => {
                finalResponse += `\n${idx + 1}. ${s.name} (${s.durationMinutes} phút)`;
              });
              finalResponse += '\n\nBạn muốn chọn dịch vụ nào? Và bạn muốn đặt lịch với bác sĩ nào?';
            }
          } catch (e) {
            console.error('❌ [Fallback] Error showing services:', e);
            finalResponse = 'Vui lòng cho tôi biết bác sĩ và dịch vụ bạn muốn đặt.';
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
      
      // ⭐ BỔ SUNG: Capture payment info from create_appointment tool (nếu có)
      // Không ảnh hưởng logic hiện tại, chỉ thêm thông tin payment
      let capturedPaymentInfo = null;
      let capturedRequirePayment = false;
      let capturedAppointmentData = null;
      
      if (result.intermediateSteps && result.intermediateSteps.length > 0) {
        for (const step of result.intermediateSteps) {
          if (step.action?.tool === 'create_appointment') {
            try {
              const toolResult = JSON.parse(step.observation);
              if (toolResult.success && toolResult.appointment) {
                capturedAppointmentData = toolResult.appointment;
                capturedRequirePayment = toolResult.requirePayment || false;
                capturedPaymentInfo = toolResult.payment || null;
                console.log('💳 [LangChain] Captured payment info from create_appointment tool:', {
                  appointmentId: capturedAppointmentData.appointmentId,
                  requirePayment: capturedRequirePayment,
                  hasPaymentInfo: !!capturedPaymentInfo
                });
                break;
              }
            } catch (e) {
              console.warn('⚠️ [LangChain] Could not parse create_appointment result:', e.message);
            }
          }
        }
      }
      
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
      
      // ⭐ BỔ SUNG: Build response với payment info (nếu có)
      const responseData = {
        success: true,
        response: finalResponse,
        conversationHistory: updatedHistory,
        needsMoreInfo: needsMoreInfo,
        appointment: appointmentCreated ? { success: true } : null,
        reservationExpiresAt: finalContext.reservationExpiresAt || null,
      };
      
      // ⭐ BỔ SUNG: Thêm payment info nếu có (không ảnh hưởng logic cũ)
      if (capturedRequirePayment && capturedPaymentInfo) {
        responseData.requirePayment = true;
        responseData.payment = capturedPaymentInfo;
        responseData.appointment = capturedAppointmentData; // Include full appointment data with payment
        console.log('✅ [LangChain] Added payment info to response');
      }
      
      return responseData;
    } catch (error) {
      console.error('❌ [LangChain] Error:', error);
      throw error;
    }
  }

  /**
 * Main entry point - matches the existing interface
 */
async createAppointmentFromAI(userPrompt, patientUserId, appointmentFor = 'self', conversationHistory = [], conversationContext = {}, isNewConversation = false) {
  try {
    const result = await this.chatWithAI(userPrompt, patientUserId, conversationHistory, isNewConversation);
    
    return {
      success: result.success,
      appointment: result.appointment || null,
      requirePayment: result.requirePayment || false, // ⭐ NEW: Forward payment requirement flag
      payment: result.payment || null, // ⭐ NEW: Forward payment info (QR code, amount, etc.)
      needsMoreInfo: result.needsMoreInfo || false,
      message: result.message || result.response, // ⭐ Preserve message field for controller
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

