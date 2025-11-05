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
const { calculateServicePrice } = require('../utils/promotionHelper');

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

class AIBookingService {
  /**
   * Retry helper với exponential backoff
   * @param {Function} fn - Function cần retry
   * @param {number} maxRetries - Số lần retry tối đa
   * @param {number} baseDelay - Base delay (ms)
   * @returns {Promise} Result của function
   */
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

  /**
   * Validate function arguments trước khi execute
   * @param {string} functionName - Tên function
   * @param {Object} functionArgs - Arguments
   * @returns {Object} Validated arguments
   */
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
            throw new Error('date phải là chuỗi format YYYY-MM-DD');
          }
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(val)) {
            throw new Error('date phải có format YYYY-MM-DD');
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
            throw new Error('date phải là chuỗi format YYYY-MM-DD');
          }
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(val)) {
            throw new Error('date phải có format YYYY-MM-DD');
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
            throw new Error('date phải là chuỗi format YYYY-MM-DD');
          }
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(val)) {
            throw new Error('date phải có format YYYY-MM-DD');
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

    const validated = {};
    for (const [key, validator] of Object.entries(rules)) {
      if (functionArgs.hasOwnProperty(key)) {
        validated[key] = validator(functionArgs[key]);
      } else if (validationRules[functionName][key]) {
        // Required field missing
        throw new Error(`Thiếu tham số bắt buộc: ${key}`);
      }
    }

    // Copy các fields không cần validate
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
          const { date, time } = validatedArgs;
          
          if (!patientUserId) {
            return { hasConflict: false }; // Không có patientUserId thì không check
          }
          
          // Parse date và time - QUAN TRỌNG: Convert về VN timezone (UTC+7)
          const [hours, minutes] = time.split(':').map(Number);
          
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
              
              return {
                hasConflict: true,
                conflictMessage: `Bạn đã có lịch khám vào ${conflictDateVN} từ ${conflictStartVN} - ${conflictEndVN}. Vui lòng chọn thời gian khác hoặc hủy lịch cũ trước!`
              };
            }
            
            return {
              hasConflict: true,
              conflictMessage: 'Bạn đã có lịch khám vào khung giờ này. Vui lòng chọn thời gian khác hoặc hủy lịch cũ trước!'
            };
          }
          
          return { hasConflict: false };
        }
        
        case 'get_services': {
          const { category } = validatedArgs;
          const query = { status: 'Active' };
          if (category) {
            query.category = category;
          }
          
          const services = await Service.find(query)
            .select('_id serviceName category durationMinutes price isPrepaid description')
            .sort({ category: 1, serviceName: 1 })
        .lean();

          // ⭐ Tính giá sau khuyến mãi cho mỗi service
          const servicesWithPrice = await Promise.all(services.map(async (s) => {
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

          return {
            services: servicesWithPrice
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
          const inputLower = serviceName.toLowerCase().trim();
          const normalizedInput = inputLower.replace(/[^\w\s]/g, '').trim();
          
          // Danh sách từ chung chung cần loại bỏ
          const commonWords = ['cho', 'và', 'của', 'có', 'là', 'để', 'với', 'từ', 'trong', 'theo', 'người', 'mới', 'đầu'];
          
          // ✅ PRIORITY 1: Exact match (case-insensitive)
          let matchedServices = servicesWithPrice.filter(s => {
            const serviceNameNormalized = s.serviceName.toLowerCase().replace(/[^\w\s]/g, '').trim();
            return serviceNameNormalized === normalizedInput;
          });
          
          // ✅ PRIORITY 2: Contains match - CHỈ khi input có ít nhất 3 ký tự và service name chứa input
          // ⭐ CHẶT CHẼ: Chỉ match khi service name chứa toàn bộ input (hoặc input là một phần của service name)
          // Ví dụ: "khám tổng quát" chỉ match với "Khám tổng quát định kỳ", không match với "Trồng răng hàm"
          if (matchedServices.length === 0 && normalizedInput.length >= 3) {
            matchedServices = servicesWithPrice.filter(s => {
              const serviceNameLower = s.serviceName.toLowerCase();
              const serviceNameNormalized = serviceNameLower.replace(/[^\w\s]/g, '').trim();
              
              // ⭐ Chỉ match nếu service name chứa input (không match ngược lại)
              // Và input phải có ít nhất 2 từ để tránh match quá rộng
              const inputWordCount = normalizedInput.split(/\s+/).filter(w => w.length >= 2).length;
              if (inputWordCount < 2) {
                return false; // Nếu input chỉ có 1 từ, bỏ qua contains match, dùng word-based matching
              }
              
              return serviceNameNormalized.includes(normalizedInput);
            });
          }
          
          // ✅ PRIORITY 3: Word-based matching - CHỈ match các từ có ý nghĩa (ít nhất 2 ký tự, không phải từ chung chung)
          if (matchedServices.length === 0) {
            const inputWords = normalizedInput.split(/\s+/)
              .filter(w => w.length >= 2) // Lấy từ có ít nhất 2 ký tự
              .filter(w => !commonWords.includes(w)); // Loại bỏ từ chung chung
            
            // Phải có ít nhất 1 từ có ý nghĩa mới match
            if (inputWords.length > 0) {
              // ⭐ Từ khóa chung cho các loại dịch vụ (category keywords) - ƯU TIÊN CAO NHẤT
              const categoryKeywords = ['răng', 'tim', 'mạch', 'mắt'];
              
              // ⭐ QUAN TRỌNG: Kiểm tra xem có từ khóa category trong input không
              const categoryKeywordInInput = inputWords.find(word => 
                categoryKeywords.some(keyword => 
                  word === keyword || word.includes(keyword) || keyword.includes(word)
                )
              );
              
              // ⭐ Nếu có category keyword → match với tất cả service có chứa từ khóa đó (ƯU TIÊN)
              if (categoryKeywordInInput) {
                const matchedCategory = categoryKeywords.find(keyword => 
                  categoryKeywordInInput === keyword || 
                  categoryKeywordInInput.includes(keyword) || 
                  keyword.includes(categoryKeywordInInput)
                );
                
                if (matchedCategory) {
                  // ✅ Match với tất cả service có chứa category keyword
                  matchedServices = servicesWithPrice.filter(s => {
                    const serviceNameNormalized = s.serviceName.toLowerCase().replace(/[^\w\s]/g, '').trim();
                    return serviceNameNormalized.includes(matchedCategory);
                  });
                }
              }
              
              // Nếu chưa match (không có category keyword hoặc không tìm thấy), dùng logic word-based matching
          if (matchedServices.length === 0) {
                matchedServices = servicesWithPrice.filter(s => {
                  const serviceNameLower = s.serviceName.toLowerCase();
                  const serviceNameNormalized = serviceNameLower.replace(/[^\w\s]/g, '').trim();
                  const serviceWords = serviceNameLower.split(/\s+/);
                  
                  // ⭐ STRICT MATCHING: Đếm số từ có ý nghĩa khớp
                  const matchedWords = inputWords.filter(inputWord => {
                    const inputWordClean = inputWord.replace(/[^\w]/g, '');
                    
                    // Check 1: Match với từng từ trong service name (EXACT match hoặc contains)
                    const wordMatch = serviceWords.some(serviceWord => {
                      const serviceWordClean = serviceWord.replace(/[^\w]/g, '');
                      if (inputWordClean.length < 2 || serviceWordClean.length < 2) {
                        return false;
                      }
                      return serviceWordClean === inputWordClean || 
                             serviceWordClean.includes(inputWordClean);
                    });
                    
                    // Check 2: Match với toàn bộ service name
                    const fullMatch = serviceNameNormalized.includes(inputWordClean);
                    
                    return wordMatch || fullMatch;
                  });
                  
                  // Loại bỏ các từ chung chung
                  const meaningfulMatches = matchedWords.filter(word => !commonWords.includes(word));
                  
                  const importantWords = ['khám', 'răng', 'tim', 'mạch', 'tổng', 'quát', 'định', 'kỳ', 'mắt'];
                  
                  if (inputWords.length === 1) {
                    return meaningfulMatches.length > 0;
                  } else if (inputWords.length === 2) {
                    const hasImportantMatch = meaningfulMatches.some(word => importantWords.includes(word));
                    return meaningfulMatches.length >= 1 && hasImportantMatch;
                  } else {
                    return meaningfulMatches.length >= 2;
                  }
                });
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
          
          // ✅ Chỉ có 1 dịch vụ match → Auto-select
          if (matchedServices.length === 1) {
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
          
          const serviceIdStr = serviceId.toString();
          
          // Check nếu serviceId là ObjectId hợp lệ
          let service = null;
          if (mongoose.Types.ObjectId.isValid(serviceIdStr)) {
            service = await Service.findOne({ 
              _id: serviceIdStr, 
              status: 'Active' 
            })
            .select('_id serviceName category durationMinutes price isPrepaid description status')
            .lean();
          } else {
            // Nếu không phải ObjectId → có thể là tên dịch vụ (sai)
            return { 
              valid: false, 
              error: `ServiceId "${serviceIdStr}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId) từ find_service_by_name hoặc validate_service.` 
            };
          }
          
          if (!service) {
            return { valid: false, error: 'Service not found or inactive' };
      }

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
          
          // Check nếu input là số thứ tự
          const numberMatch = doctorName.match(/^\d+$/);
          if (numberMatch) {
            const index = parseInt(doctorName) - 1; // Convert to 0-based index
            if (index >= 0 && index < availableDoctors.length) {
              const selectedDoctor = availableDoctors[index];
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
          
          // Tập hợp tất cả matches (không return ngay, để check xem có nhiều match không)
          // ⭐ Sử dụng availableDoctors thay vì doctors để chỉ tìm trong các bác sĩ khả dụng
          let matchedDoctors = [];
          
          // ✅ PRIORITY 1: Exact match (case-insensitive)
          const exactMatches = availableDoctors.filter(d => 
            d.fullName.toLowerCase() === inputLower
          );
          if (exactMatches.length > 0) {
            matchedDoctors = exactMatches;
          }
          
          // ✅ PRIORITY 2: Exact match bỏ "bác sĩ" prefix
          if (matchedDoctors.length === 0) {
            const prefixMatches = availableDoctors.filter(d => {
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
            const substringMatches = availableDoctors.filter(d => {
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
            const wordMatches = availableDoctors.filter(d => {
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
          
          // ❌ Không tìm thấy
          if (matchedDoctors.length === 0) {
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
          
          // ✅ Chỉ có 1 bác sĩ match → Auto-select
          if (matchedDoctors.length === 1) {
            return {
              found: true,
              doctor: {
                id: matchedDoctors[0]._id.toString(),
                name: matchedDoctors[0].fullName,
                specialization: matchedDoctors[0].specialization || '',
                email: matchedDoctors[0].email || '',
                phoneNumber: matchedDoctors[0].phoneNumber || '',
                status: matchedDoctors[0].status || 'Active'
              }
            };
          }
          
          // ⚠️ Nhiều bác sĩ match → Trả về danh sách để user chọn
          return {
            found: true,
            multiple: true,
            doctors: matchedDoctors.map(d => ({
              id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
              email: d.email || '',
              phoneNumber: d.phoneNumber || '',
              status: d.status || 'Active'
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
            // Nếu không phải ObjectId → có thể là tên bác sĩ (sai)
            return { 
              valid: false, 
              error: `DoctorId "${doctorIdStr}" không hợp lệ. Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc validate_doctor.` 
            };
          }
          
          if (!doctor) {
            return { valid: false, error: 'Doctor not found or inactive' };
          }
          
          // ⭐ THÊM: Kiểm tra Doctor status (On Leave/Inactive)
          const doctorStatus = await Doctor.findOne({ doctorUserId: doctor._id }).select('status');
          if (doctorStatus && (doctorStatus.status === 'On Leave' || doctorStatus.status === 'Inactive')) {
            return { valid: false, error: 'Bác sĩ bạn chọn hiện đang nghỉ phép hoặc không khả dụng. Vui lòng chọn bác sĩ khác.' };
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
          // Lấy tất cả bác sĩ Active từ User
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization email phoneNumber status role')
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
          
        return {
            doctors: availableDoctors.map(d => ({
        id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || '',
              email: d.email || '',
              phoneNumber: d.phoneNumber || '',
              status: d.status || 'Active'
            }))
          };
        }
        
        case 'get_available_slots': {
          const { doctorId, date, serviceId } = validatedArgs;
          
          if (!doctorId || !date || !serviceId) {
            return { error: 'Missing required parameters: doctorId, date, serviceId' };
          }
          
          // Xử lý serviceId: có thể là ObjectId, số thứ tự, hoặc tên dịch vụ (sai)
          let service = null;
          const serviceIdStr = serviceId.toString();
          
          // Check nếu serviceId là số thứ tự
          const serviceNumberMatch = serviceIdStr.match(/^\d+$/);
          if (serviceNumberMatch) {
            // Lấy danh sách dịch vụ và chọn theo index
            const services = await Service.find({ status: 'Active' })
              .select('_id serviceName durationMinutes price isPrepaid category description')
              .sort({ category: 1, serviceName: 1 })
              .lean();
            
            const index = parseInt(serviceIdStr) - 1; // Convert to 0-based index
            if (index >= 0 && index < services.length) {
              service = services[index];
            } else {
              return { error: `Số thứ tự ${serviceIdStr} không hợp lệ. Vui lòng chọn lại dịch vụ.` };
            }
          } else {
            // Check nếu serviceId là ObjectId hợp lệ
            if (mongoose.Types.ObjectId.isValid(serviceIdStr)) {
              // Dùng serviceId trực tiếp (ObjectId)
              service = await Service.findById(serviceIdStr)
                .select('_id serviceName durationMinutes price isPrepaid category description')
                .lean();
            } else {
              // Nếu không phải ObjectId và không phải số → có thể là tên dịch vụ (sai)
              // Tìm dịch vụ theo tên
              const serviceByName = await Service.findOne({ 
                serviceName: { $regex: new RegExp(`^${serviceIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                status: 'Active' 
              })
              .select('_id serviceName durationMinutes price isPrepaid category description')
              .lean();
              
              if (serviceByName) {
                service = serviceByName;
              } else {
                return { 
                  error: `ServiceId "${serviceIdStr}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId) hoặc số thứ tự từ danh sách dịch vụ.` 
                };
              }
            }
          }
          
          if (!service) {
            return { error: 'Dịch vụ không tồn tại. Vui lòng chọn lại dịch vụ.' };
          }
          
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
              // Dùng doctorId trực tiếp (ObjectId)
              doctor = await User.findById(doctorIdStr)
                .select('_id fullName specialization email phoneNumber status role')
                .lean();
            } else {
              // Nếu không phải ObjectId và không phải số → có thể là tên bác sĩ (sai)
              // Tìm bác sĩ theo tên
              const doctorByName = await User.findOne({ 
                fullName: { $regex: new RegExp(`^${doctorIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                role: 'Doctor',
                status: 'Active'
              })
              .select('_id fullName specialization email phoneNumber status role')
              .lean();
              
              if (doctorByName) {
                doctor = doctorByName;
              } else {
                return { 
                  error: `DoctorId "${doctorIdStr}" không hợp lệ. Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.` 
                };
              }
            }
          }
          
          if (!doctor) {
            return { error: 'Bác sĩ không tồn tại. Vui lòng chọn lại bác sĩ.' };
          }
          
          // ⭐ THÊM: Kiểm tra Doctor status (On Leave/Inactive)
          const doctorStatus = await Doctor.findOne({ doctorUserId: doctor._id }).select('status');
          if (doctorStatus && (doctorStatus.status === 'On Leave' || doctorStatus.status === 'Inactive')) {
            return { error: 'Bác sĩ bạn chọn hiện đang nghỉ phép hoặc không khả dụng. Vui lòng chọn bác sĩ khác.' };
          }
          
          // Parse date
          const searchDate = new Date(date);
          searchDate.setHours(0, 0, 0, 0);
          
          // Lấy DoctorSchedule của bác sĩ cho ngày đó (Morning và Afternoon)
          const schedules = await DoctorSchedule.find({
            doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
            date: searchDate,
            status: 'Available'
          }).lean();
          
          if (schedules.length === 0) {
            return { error: `Bác sĩ này không có lịch làm việc vào ngày ${date}` };
          }
          
          // Lấy working hours từ schedule (lấy từ schedule đầu tiên, vì tất cả đều có cùng workingHours)
          const workingHours = schedules[0].workingHours || {
            morningStart: '08:00',
            morningEnd: '12:00',
            afternoonStart: '13:00',
            afternoonEnd: '17:00'
          };
          
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
            const now = new Date();
            
            // So sánh ngày: searchDate và today (lấy year, month, date)
            // searchDate đã được set về 00:00:00 local time, nên lấy local date
            const searchYear = searchDate.getFullYear();
            const searchMonth = searchDate.getMonth();
            const searchDay = searchDate.getDate();
            
            const nowYear = now.getFullYear();
            const nowMonth = now.getMonth();
            const nowDay = now.getDate();
            
            const isToday = 
              searchYear === nowYear &&
              searchMonth === nowMonth &&
              searchDay === nowDay;
            
            // Nếu là hôm nay, tính thời gian hiện tại và điều chỉnh shiftStart
            let actualShiftStart = shiftStart;
            if (isToday) {
              // Lấy thời gian hiện tại theo VN timezone (UTC+7)
              // Convert sang UTC để so sánh với shiftStart/shiftEnd
              const nowVN = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
              const currentTimeUTC = new Date(Date.UTC(
                nowVN.getFullYear(),
                nowVN.getMonth(),
                nowVN.getDate(),
                nowVN.getHours() - 7, // Convert VN time (UTC+7) to UTC
                nowVN.getMinutes(),
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
            
            // 2. Validate service (có thể là ObjectId, số thứ tự, hoặc tên dịch vụ - sai)
            let service = null;
            const serviceIdStr = serviceId.toString();
            const serviceNumberMatch = serviceIdStr.match(/^\d+$/);
            
            if (serviceNumberMatch) {
              const services = await Service.find({ status: 'Active' })
                .select('_id serviceName durationMinutes category price isPrepaid status description')
                .sort({ category: 1, serviceName: 1 })
                .lean();
              
              const index = parseInt(serviceIdStr) - 1;
              if (index >= 0 && index < services.length) {
                service = services[index];
              }
            } else {
              // Check nếu serviceId là ObjectId hợp lệ
              if (mongoose.Types.ObjectId.isValid(serviceIdStr)) {
                service = await Service.findById(serviceIdStr)
                  .select('_id serviceName durationMinutes category price isPrepaid status description')
                  .lean();
              } else {
                // Nếu không phải ObjectId và không phải số → có thể là tên dịch vụ (sai)
                // Tìm dịch vụ theo tên
                const serviceByName = await Service.findOne({ 
                  serviceName: { $regex: new RegExp(`^${serviceIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                  status: 'Active' 
                })
                .select('_id serviceName durationMinutes category price isPrepaid status description')
                .lean();
                
                if (serviceByName) {
                  service = serviceByName;
                } else {
                  return { 
                    error: `ServiceId "${serviceIdStr}" không hợp lệ. Vui lòng sử dụng serviceId (ObjectId) từ find_service_by_name hoặc số thứ tự từ danh sách dịch vụ.` 
                  };
                }
              }
            }
            
            if (!service) {
              return { error: 'Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.' };
            }
            if (service.status !== 'Active') {
              return { error: 'Dịch vụ này hiện không khả dụng' };
            }
            
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
                // Nếu không phải ObjectId và không phải số → có thể là tên bác sĩ (sai)
                // Tìm bác sĩ theo tên
                const doctorByName = await User.findOne({ 
                  fullName: { $regex: new RegExp(`^${doctorIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                  role: 'Doctor',
                  status: 'Active'
                })
                .select('_id fullName specialization role status email phoneNumber')
                .lean();
                
                if (doctorByName) {
                  doctor = doctorByName;
                } else {
                  return { 
                    error: `DoctorId "${doctorIdStr}" không hợp lệ. Vui lòng sử dụng doctorId (ObjectId) từ find_doctor_by_name hoặc số thứ tự từ danh sách bác sĩ.` 
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
                  return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo format YYYY-MM-DD (ví dụ: 2025-11-05).` };
                }
                
                // Chuyển đổi thành YYYY-MM-DD
                normalizedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              } else {
                // Format không hợp lệ
                return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo format YYYY-MM-DD (ví dụ: 2025-11-05). Nếu bạn nhập "5-11-2025" hoặc "5/11/2025", hệ thống sẽ tự động chuyển đổi.` };
              }
            }
            
            // Validate date sau khi normalize
            const appointmentDate = new Date(normalizedDate);
            if (isNaN(appointmentDate.getTime())) {
              return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo format YYYY-MM-DD (ví dụ: 2025-11-05).` };
            }
            
            // Kiểm tra date có hợp lệ không (ví dụ: 31/02/2025 không hợp lệ)
            const checkDate = new Date(normalizedDate);
            const [year, month, day] = normalizedDate.split('-').map(Number);
            if (checkDate.getFullYear() !== year || checkDate.getMonth() + 1 !== month || checkDate.getDate() !== day) {
              return { error: `Ngày không hợp lệ: "${date}". Vui lòng nhập ngày theo format YYYY-MM-DD (ví dụ: 2025-11-05).` };
            }
            
            appointmentDate.setHours(0, 0, 0, 0);
            
            // Parse time (format: HH:mm)
            const [hours, minutes] = time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
              return { error: 'Thời gian không hợp lệ. Vui lòng nhập theo format HH:mm (ví dụ: 09:00)' };
            }
            
            // Create startTime and endTime (VN timezone)
            const slotStartTime = new Date(Date.UTC(
              appointmentDate.getFullYear(),
              appointmentDate.getMonth(),
              appointmentDate.getDate(),
              hours - 7, // Convert VN time (UTC+7) to UTC
              minutes,
              0
            ));
            
            const slotEndTime = new Date(slotStartTime);
            slotEndTime.setMinutes(slotEndTime.getMinutes() + service.durationMinutes);
            
            // 5. Validate time không ở quá khứ (so với thời gian hiện tại VN timezone)
            // Lấy thời gian hiện tại theo VN timezone (UTC+7)
            const now = new Date();
            const nowVN = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
            const nowVNUtc = new Date(Date.UTC(
              nowVN.getFullYear(),
              nowVN.getMonth(),
              nowVN.getDate(),
              nowVN.getHours() - 7, // Convert VN time (UTC+7) to UTC
              nowVN.getMinutes(),
              0
            ));
            
            // So sánh date và time
            const appointmentDateOnly = new Date(Date.UTC(
              appointmentDate.getFullYear(),
              appointmentDate.getMonth(),
              appointmentDate.getDate(),
              0, 0, 0
            ));
            const todayDateOnly = new Date(Date.UTC(
              nowVN.getFullYear(),
              nowVN.getMonth(),
              nowVN.getDate(),
              0, 0, 0
            ));
            
            // Check nếu date là quá khứ
            if (appointmentDateOnly.getTime() < todayDateOnly.getTime()) {
              const dateVN = appointmentDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
              const todayVN = nowVN.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
              return { error: `Không thể đặt lịch trong quá khứ. Ngày bạn chọn là ${dateVN}, nhưng hôm nay là ${todayVN}. Vui lòng chọn ngày trong tương lai.` };
            }
            
            // Nếu date là hôm nay, check time không được trong quá khứ
            if (appointmentDateOnly.getTime() === todayDateOnly.getTime()) {
              if (slotStartTime.getTime() < nowVNUtc.getTime()) {
                const timeVN = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                const nowTimeVN = nowVN.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
                return { error: `Không thể đặt lịch trong quá khứ. Thời gian bạn chọn là ${timeVN}, nhưng hiện tại là ${nowTimeVN}. Vui lòng chọn thời gian trong tương lai.` };
              }
            }
            
            // 6. Validate slot duration phải khớp với service duration
            const slotDurationMinutes = (slotEndTime - slotStartTime) / 60000;
            if (slotDurationMinutes !== service.durationMinutes) {
              return { 
                error: `Khung giờ không hợp lệ. Dịch vụ "${service.serviceName}" cần ${service.durationMinutes} phút, nhưng thời gian bạn chọn là ${slotDurationMinutes} phút. Vui lòng chọn lại.` 
              };
            }
            
            // 7. Find doctor schedule
            const schedules = await DoctorSchedule.find({
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              date: appointmentDate,
              status: 'Available'
            }).lean();
            
            if (schedules.length === 0) {
              return { error: 'Bác sĩ này không có lịch làm việc vào ngày này. Vui lòng chọn ngày khác.' };
            }
            
            // Find schedule that matches the time slot (morning or afternoon)
            // hours và minutes đã được parse từ input (VN time)
            const schedule = schedules.find(s => {
              const workingHours = s.workingHours || {
                morningStart: '08:00',
                morningEnd: '12:00',
                afternoonStart: '13:00',
                afternoonEnd: '17:00'
              };
              
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
              return { error: 'Khung giờ này không nằm trong lịch làm việc của bác sĩ. Vui lòng chọn thời gian khác.' };
            }
            
            // 8. Check conflict với timeslots đã có
            const conflictingTimeslots = await Timeslot.find({
              doctorUserId: doctor._id, // Dùng doctor._id thay vì doctorId
              startTime: { $lt: slotEndTime },
              endTime: { $gt: slotStartTime },
              status: { $in: ['Reserved', 'Booked'] }
            });
            
            if (conflictingTimeslots.length > 0) {
              return { error: 'Khung giờ này đã có người đặt hoặc đang chờ thanh toán. Vui lòng chọn thời gian khác.' };
            }
            
            // 9. Check conflict với appointments của patient (BẤT KỲ bác sĩ nào) - không được đặt 2 bác sĩ khác nhau cùng giờ
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

  async chatWithAI(userPrompt, patientUserId, conversationHistory = []) {
    try {
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // ⭐ Preprocess user input để tăng độ chính xác
      const processedPrompt = this.preprocessUserInput(userPrompt);
      
      // ⭐ Filter conversation history để loại bỏ thông tin không hợp lệ
      const filteredHistory = this.filterConversationHistory(conversationHistory);
      
      // Prepare date context
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
      const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];
      
      // Build system prompt với date context
      const systemPrompt = toolsConfig.systemPrompt
        .replace('{TODAY}', todayStr)
        .replace('{TOMORROW}', tomorrowStr)
        .replace('{DAY_AFTER_TOMORROW}', dayAfterTomorrowStr);
      
      // Build messages array với filtered history
      const messages = [
        { role: "system", content: systemPrompt },
        ...filteredHistory,
        { role: "user", content: processedPrompt } // ⭐ Dùng processed prompt
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
        return {
          success: false,
          response: 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
          conversationHistory: this.filterConversationHistory(conversationHistory),
          needsMoreInfo: false
        };
      }
      
      let assistantMessage = response.choices[0].message;
      let functionResults = [];
      
      // Loop để handle multiple function calls (AI có thể gọi nhiều function liên tiếp)
      let maxIterations = 3; // ⭐ Tối ưu tốc độ: giảm xuống 3 iterations
      let iteration = 0;
      
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iteration < maxIterations) {
        iteration++;
        
        // Execute all function calls
        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = toolCall.function.name;
          let functionArgs;
          
          // Parse và validate JSON arguments
          try {
            functionArgs = JSON.parse(toolCall.function.arguments);
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
          
          // Execute function với error handling tốt hơn
          let functionResult;
          try {
            functionResult = await this.executeFunction(functionName, functionArgs, patientUserId);
          } catch (execError) {
            console.error(`❌ [AI] Error executing function ${functionName}:`, execError);
            functionResult = { 
              error: `Lỗi khi thực thi function: ${execError.message || 'Unknown error'}` 
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
            // Nếu có kết quả thành công nhưng AI không trả về content, tạo response từ kết quả
            finalResponse = 'Đã xử lý yêu cầu của bạn thành công. Bạn có muốn tiếp tục không?';
          } else {
            // Nếu không có error từ function results, tạo generic response
            finalResponse = 'Xin lỗi, mình không thể xử lý yêu cầu của bạn. Vui lòng thử lại với thông tin rõ ràng hơn.';
          }
        }
      }
      
      // ⚡ Tối ưu tốc độ: bỏ logging không cần thiết
      
      // Check if appointment was created
      const appointmentCreated = functionResults.some(fr => 
        fr.functionName === 'create_appointment' && fr.result.success
      );
      
      if (appointmentCreated) {
        const appointmentResult = functionResults.find(fr => fr.functionName === 'create_appointment').result;
        return {
          success: true,
          appointment: appointmentResult,
          response: finalResponse,
          conversationHistory: [...conversationHistory, 
            { role: "user", content: processedPrompt }, // ⭐ Dùng processed prompt
            { role: "assistant", content: finalResponse }
          ]
        };
      }
      
      // Continuing conversation
        return {
          success: false,
        needsMoreInfo: true,
        response: finalResponse,
        conversationHistory: [...conversationHistory,
          { role: "user", content: processedPrompt }, // ⭐ Dùng processed prompt
          { role: "assistant", content: finalResponse }
        ]
      };
      
    } catch (error) {
      console.error('❌ [AI Function Calling] Error:', error);
      // Trả về response lỗi thay vì throw để frontend có thể xử lý
      return {
        success: false,
        response: 'Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.',
        conversationHistory: this.filterConversationHistory(conversationHistory || []),
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

