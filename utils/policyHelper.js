/**
 * Policy Helper Utilities
 * Provides functions to parse and extract information from policy descriptions
 */

/**
 * Extract time limit (in hours) from policy description
 * Supports Vietnamese time expressions like:
 * - "1h", "2h", "24h"
 * - "1 giờ", "2 giờ", "24 giờ"
 * - "1 tiếng", "2 tiếng"
 * - "1.5h", "2.5 giờ" (decimal hours)
 * 
 * @param {string} description - Policy description text
 * @returns {number|null} - Time in hours, or null if not found
 * 
 * @example
 * extractTimeFromPolicyDescription("Hủy lịch hẹn trước 1h sẽ không được hoàn tiền") // Returns 1
 * extractTimeFromPolicyDescription("Hủy trước 24 giờ để được hoàn tiền") // Returns 24
 * extractTimeFromPolicyDescription("Không hoàn tiền") // Returns null
 */
function extractTimeFromPolicyDescription(description) {
  if (!description || typeof description !== 'string') {
    return null;
  }

  // Regex patterns to match time expressions
  // Pattern 1: "1h", "2h", "24h", "1.5h" (with optional space)
  const hourPattern1 = /(\d+(?:\.\d+)?)\s*h(?:our)?s?/i;
  
  // Pattern 2: "1 giờ", "2 giờ", "24 giờ", "1.5 giờ"
  const hourPattern2 = /(\d+(?:\.\d+)?)\s*giờ/i;
  
  // Pattern 3: "1 tiếng", "2 tiếng"
  const hourPattern3 = /(\d+(?:\.\d+)?)\s*tiếng/i;

  // Try each pattern in order
  const patterns = [hourPattern1, hourPattern2, hourPattern3];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const hours = parseFloat(match[1]);
      
      // Validate the extracted number
      if (!isNaN(hours) && hours > 0 && hours <= 168) { // Max 1 week (168 hours)
        console.log(`✅ [policyHelper] Extracted ${hours} hours from: "${description}"`);
        return hours;
      }
    }
  }

  console.log(`⚠️ [policyHelper] Could not extract time from: "${description}"`);
  return null;
}

/**
 * Get cancellation threshold hours from policy
 * Fetches the policy from database and extracts the time limit
 * 
 * @param {Object} Policy - Mongoose Policy model
 * @param {number} defaultHours - Default fallback value if extraction fails
 * @returns {Promise<number>} - Time threshold in hours
 */
async function getCancellationThresholdFromPolicy(Policy, defaultHours = 1) {
  try {
    const policyType = 'Chính sách không hoàn tiền';
    console.log(`🔍 [policyHelper] Fetching policy type: "${policyType}"`);
    
    const dbPolicies = await Policy.getPoliciesByType(policyType);
    console.log(`🔍 [policyHelper] Found ${dbPolicies?.length || 0} policies`);

    if (dbPolicies && dbPolicies.length > 0) {
      const firstPolicy = dbPolicies[0];
      console.log(`🔍 [policyHelper] Policy details:`, {
        id: firstPolicy._id,
        title: firstPolicy.title,
        description: firstPolicy.description,
        active: firstPolicy.active,
        status: firstPolicy.status
      });
      
      const extractedHours = extractTimeFromPolicyDescription(firstPolicy.description);
      
      if (extractedHours !== null) {
        console.log(`✅ [policyHelper] Using dynamic threshold: ${extractedHours} hours from policy`);
        return extractedHours;
      }
    }

    console.log(`⚠️ [policyHelper] No valid time found in policy, using default: ${defaultHours} hours`);
    return defaultHours;
  } catch (error) {
    console.error('❌ [policyHelper] Error fetching policy:', error);
    console.log(`⚠️ [policyHelper] Falling back to default: ${defaultHours} hours`);
    return defaultHours;
  }
}

module.exports = {
  extractTimeFromPolicyDescription,
  getCancellationThresholdFromPolicy
};
