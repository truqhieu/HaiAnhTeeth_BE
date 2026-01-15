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
  
  // Sort slots by start time
  const sortedSlots = slots.sort((a, b) => {
    const aTime = new Date(a.startTime);
    const bTime = new Date(b.startTime);
    return aTime - bTime;
  });
  
  for (const slot of sortedSlots) {
    const slotStart = new Date(slot.startTime);
    const slotEnd = new Date(slot.endTime);
    
    const slotStartStr = `${String(slotStart.getHours()).padStart(2, '0')}:${String(slotStart.getMinutes()).padStart(2, '0')}`;
    const slotEndStr = `${String(slotEnd.getHours()).padStart(2, '0')}:${String(slotEnd.getMinutes()).padStart(2, '0')}`;
    
    if (!rangeStart) {
      // First slot
      rangeStart = slotStartStr;
      rangeEnd = slotEndStr;
    } else {
      // Check if this slot is consecutive (starts where previous ended)
      if (slotStartStr === rangeEnd) {
        // Extend range
        rangeEnd = slotEndStr;
      } else {
        // Gap found, save current range and start new one
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = slotStartStr;
        rangeEnd = slotEndStr;
      }
    }
  }
  
  // Add the last range
  if (rangeStart && rangeEnd) {
    ranges.push({ start: rangeStart, end: rangeEnd });
  }
  
  return ranges;
}