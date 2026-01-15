const cron = require('node-cron');
const Appointment = require('../models/appointment.model');

/**
 * Scheduled job to automatically mark appointments as No-Show
 * Runs daily at 00:00 Vietnam time (UTC+7)
 * 
 * Logic:
 * - Find all Online appointments from previous days
 * - With status Approved or CheckedIn
 * - Update them to No-Show status
 */
const autoNoShowJob = () => {
  // Schedule: Run at 00:00 (midnight) every day in Vietnam timezone
  // Cron format: second minute hour day month weekday
  // '0 0 0 * * *' = At 00:00:00 every day
  cron.schedule('0 0 0 * * *', async () => {
    try {
      console.log('🕐 [Auto No-Show Job] Running at:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
      
      // Get today's date at 00:00:00 in Vietnam timezone
      const now = new Date();
      const vietnamDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
      const todayStart = new Date(vietnamDateStr + 'T00:00:00+07:00');
      
      console.log('📅 [Auto No-Show Job] Processing appointments before:', todayStart.toISOString());
      
      // Find all Online appointments from previous days with status Approved or CheckedIn
      const result = await Appointment.updateMany(
        {
          mode: 'Online',
          status: { $in: ['Approved', 'CheckedIn'] },
          appointmentDate: { $lt: todayStart }
        },
        {
          $set: { 
            status: 'No-Show',
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`✅ [Auto No-Show Job] Updated ${result.modifiedCount} appointments to No-Show`);
      
      if (result.modifiedCount > 0) {
        console.log('📊 [Auto No-Show Job] Details:', {
          matched: result.matchedCount,
          modified: result.modifiedCount,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('❌ [Auto No-Show Job] Error:', error);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });
  
  console.log('✅ [Auto No-Show Job] Scheduled to run daily at 00:00 Vietnam time');
};

module.exports = autoNoShowJob;
