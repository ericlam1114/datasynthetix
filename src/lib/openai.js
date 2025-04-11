const OpenAI = require('openai');

let openaiInstance = null;

/**
 * Initialize the OpenAI client
 * @param {Object} options - Options for the OpenAI client
 * @returns {OpenAI} The OpenAI client instance
 */
function initializeOpenAI(options = {}) {
  if (!openaiInstance) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    openaiInstance = new OpenAI({
      apiKey,
      ...options,
    });
  }
  
  return openaiInstance;
}

/**
 * Get the OpenAI client instance
 * @returns {OpenAI} The OpenAI client instance
 */
function getOpenAI() {
  if (!openaiInstance) {
    return initializeOpenAI();
  }
  
  return openaiInstance;
}

module.exports = {
  initializeOpenAI,
  getOpenAI
}; 