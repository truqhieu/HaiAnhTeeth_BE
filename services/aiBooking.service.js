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

// Load function tools configuration
const toolsConfigPath = path.join(__dirname, '../config/aiBooking.tools.json');
const toolsConfig = JSON.parse(fs.readFileSync(toolsConfigPath, 'utf8'));

class AIBookingService {
  /**
   * Execute function call từ OpenAI
   */
  async executeFunction(functionName, functionArgs, patientUserId) {
    console.log(`🔧 [AI] Executing function: ${functionName}`, functionArgs);
    
    try {
      switch (functionName) {
        case 'get_services': {
          const { category } = functionArgs;
          const query = { status: 'Active' };
          if (category) {
            query.category = category;
          }
          
          const services = await Service.find(query)
            .select('_id serviceName category durationMinutes')
            .sort({ category: 1, serviceName: 1 })
            .lean();
      
          return {
            services: services.map(s => ({
              id: s._id.toString(),
              name: s.serviceName,
              category: s.category,
              durationMinutes: s.durationMinutes || 30 // Default 30 phút nếu không có
            }))
          };
        }
        
        case 'get_service_info': {
          const { serviceId } = functionArgs;
          
          if (!serviceId) {
            return { error: 'Missing required parameter: serviceId' };
          }
          
          const service = await Service.findById(serviceId)
            .select('_id serviceName category durationMinutes description')
            .lean();
          
          if (!service) {
            return { error: 'Service not found' };
          }
          
          return {
            id: service._id.toString(),
            name: service.serviceName,
            category: service.category,
            durationMinutes: service.durationMinutes || 30,
            description: service.description || ''
          };
        }
        
        case 'validate_service': {
          const { serviceId } = functionArgs;
          
          if (!serviceId) {
            return { valid: false, error: 'Missing serviceId' };
          }
          
          const service = await Service.findOne({ 
            _id: serviceId, 
            status: 'Active' 
          }).lean();
          
          if (!service) {
            return { valid: false, error: 'Service not found or inactive' };
          }
          
          return { 
            valid: true, 
            service: {
              id: service._id.toString(),
              name: service.serviceName,
              category: service.category,
              durationMinutes: service.durationMinutes || 30
            }
          };
        }
        
        case 'validate_doctor': {
          const { doctorId } = functionArgs;
          
          if (!doctorId) {
            return { valid: false, error: 'Missing doctorId' };
          }
          
          const doctor = await User.findOne({ 
            _id: doctorId, 
            role: 'Doctor',
            status: 'Active' 
          }).lean();
          
          if (!doctor) {
            return { valid: false, error: 'Doctor not found or inactive' };
          }
          
          return { 
            valid: true, 
            doctor: {
              id: doctor._id.toString(),
              name: doctor.fullName,
              specialization: doctor.specialization || ''
            }
          };
        }
        
        case 'get_doctors': {
          const doctors = await User.find({ role: 'Doctor', status: 'Active' })
            .select('_id fullName specialization')
            .lean();
          
          return {
            doctors: doctors.map(d => ({
        id: d._id.toString(),
              name: d.fullName,
              specialization: d.specialization || ''
            }))
          };
        }
        
        case 'get_available_slots': {
          const { doctorId, date, serviceId } = functionArgs;
          
          if (!doctorId || !date || !serviceId) {
            return { error: 'Missing required parameters: doctorId, date, serviceId' };
          }
          
          const slotsResult = await availableSlotService.generateAvailableSlotsByDate({
            date,
            serviceId,
            doctorId,
            patientUserId // Exclude patient's existing appointments
          });
          
          if (!slotsResult.success || !slotsResult.data || slotsResult.data.length === 0) {
            return { error: 'Không có khung giờ nào khả dụng' };
          }
          
          // Group by morning/afternoon
          const morningSlots = slotsResult.data.filter(s => {
            const hour = parseInt(s.startTime.split(':')[0]);
            return hour < 12;
          });
          
          const afternoonSlots = slotsResult.data.filter(s => {
            const hour = parseInt(s.startTime.split(':')[0]);
            return hour >= 12;
          });
          
          return {
            morning: morningSlots.map(s => ({
              startTime: s.startTime,
              endTime: s.endTime
            })),
            afternoon: afternoonSlots.map(s => ({
              startTime: s.startTime,
              endTime: s.endTime
            }))
          };
        }
        
        case 'create_appointment': {
          const { serviceId, doctorId, date, time, notes } = functionArgs;
          
          if (!serviceId || !doctorId || !date || !time) {
            return { error: 'Missing required parameters' };
          }
          
          // Find service and doctor
          const service = await Service.findById(serviceId);
          const doctor = await User.findById(doctorId);
          
          if (!service || !doctor) {
            return { error: 'Service or doctor not found' };
          }
          
          // Find available slot
          const slotsResult = await availableSlotService.generateAvailableSlotsByDate({
            date,
            serviceId,
            doctorId,
            patientUserId
          });
          
          if (!slotsResult.success || !slotsResult.data) {
            return { error: 'No available slots' };
          }
          
          const selectedSlot = slotsResult.data.find(s => s.startTime === time);
          if (!selectedSlot) {
            return { error: 'Selected time slot is not available' };
          }
          
          // Create appointment
          const appointmentData = {
            serviceId,
            doctorUserId: doctorId,
            doctorScheduleId: slotsResult.scheduleId || null,
            selectedSlot,
            notes: notes || '',
            appointmentFor: 'self'
          };
          
          const appointment = await appointmentService.createAppointment(
            appointmentData,
            patientUserId
          );
          
          return {
            success: true,
            appointmentId: appointment._id.toString(),
            service: service.serviceName,
            doctor: doctor.fullName,
            date,
            time
          };
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
   * 🆕 Chat với AI sử dụng Function Calling (linh hoạt như ChatGPT)
   */
  async chatWithAI(userPrompt, patientUserId, conversationHistory = []) {
    try {
      console.log('🤖 [AI Function Calling] Starting chat...');
      
      // Prepare date context
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      // Build system prompt với date context
      const systemPrompt = toolsConfig.systemPrompt
        .replace('{TODAY}', todayStr)
        .replace('{TOMORROW}', tomorrowStr);
      
      // Build messages array
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: userPrompt }
      ];
      
      console.log(`📤 [AI] Sending ${messages.length} messages to OpenAI with ${toolsConfig.tools.length} tools`);
      
      // Call OpenAI with function calling
      let response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: messages,
        tools: toolsConfig.tools,
        tool_choice: "auto", // AI tự quyết định có gọi function hay không
        temperature: 0.7 // Tăng để AI linh hoạt hơn
      });
      
      let assistantMessage = response.choices[0].message;
      let functionResults = [];
      
      // Loop để handle multiple function calls (AI có thể gọi nhiều function liên tiếp)
      let maxIterations = 5; // Giới hạn để tránh infinite loop
      let iteration = 0;
      
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iteration < maxIterations) {
        iteration++;
        console.log(`🔄 [AI] Iteration ${iteration}: AI wants to call ${assistantMessage.tool_calls.length} function(s)`);
        
        // Execute all function calls
        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          
          // Execute function
          const functionResult = await this.executeFunction(functionName, functionArgs, patientUserId);
          
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
        
        // Call OpenAI again với function results
        response = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: messages,
          tools: toolsConfig.tools,
          tool_choice: "auto",
          temperature: 0.7
        });
        
        assistantMessage = response.choices[0].message;
      }
      
      // Get final response from AI
      const finalResponse = assistantMessage.content || "Xin lỗi, mình gặp lỗi khi xử lý yêu cầu của bạn.";
      
      console.log('✅ [AI] Final response:', finalResponse.substring(0, 100) + '...');
      
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
            { role: "user", content: userPrompt },
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
          { role: "user", content: userPrompt },
          { role: "assistant", content: finalResponse }
        ]
      };
      
    } catch (error) {
      console.error('❌ [AI Function Calling] Error:', error);
      throw error;
    }
  }

  /**
   * Tạo appointment từ AI với Function Calling (mới)
   */
  async createAppointmentFromAI(userPrompt, patientUserId, appointmentFor = 'self', conversationHistory = []) {
    try {
      console.log('🚀 [AI Booking] Using new Function Calling approach...');
      
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

