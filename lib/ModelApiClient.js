// lib/ModelApiClient.js
class ModelApiClient {
    constructor(options = {}) {
      this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
      this.baseUrl = options.baseUrl || 'https://api.openai.com/v1/chat/completions';
      this.maxRetries = options.maxRetries || 3;
      this.retryDelay = options.retryDelay || 1000;
      
      // Rate limiting settings
      this.requestsPerMinute = options.requestsPerMinute || 3500;
      this.tokensPerMinute = options.tokensPerMinute || 90000;
      this.requestTimestamps = [];
      this.tokenUsage = [];
      
      // Keep track of when rate limits reset
      this.lastRateLimitReset = Date.now();
    }
    
    async makeRequest(modelId, messages, options = {}) {
      // Log the API request for debugging
      console.log(`Making request to model: ${modelId}`);
      console.log(`First few characters of input: ${messages[messages.length - 1].content.substring(0, 100)}...`);
      
      // Create request payload
      const payload = {
        model: modelId,
        messages,
        ...options
      };
      
      // Control rate limiting
      await this._waitForRateLimit();
      
      // Make request with retries
      let attempt = 0;
      while (attempt < this.maxRetries) {
        try {
          console.log(`Attempt ${attempt + 1}/${this.maxRetries} - Sending request to OpenAI API`);
          
          const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(payload)
          });
          
          // Handle rate limiting errors
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
            console.warn(`Rate limit hit. Retrying in ${retryAfter} seconds...`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            attempt++;
            continue;
          }
          
          // Handle server errors
          if (response.status >= 500) {
            console.warn(`Server error (${response.status}). Retrying...`);
            await new Promise(r => setTimeout(r, this.retryDelay * Math.pow(2, attempt)));
            attempt++;
            continue;
          }
          
          // Check for response issues
          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Unknown error';
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.error?.message || errorData.error || errorText;
            } catch (e) {
              errorMessage = errorText;
            }
            
            console.error(`API error (${response.status}): ${errorMessage}`);
            throw new Error(`API error: ${errorMessage}`);
          }
          
          // Process successful response
          const data = await response.json();
          
          // Log success for debugging
          console.log('Successfully received response from OpenAI API');
          
          // Track token usage for rate limiting
          const promptTokens = data.usage?.prompt_tokens || 0;
          const completionTokens = data.usage?.completion_tokens || 0;
          this._trackUsage(promptTokens + completionTokens);
          
          return data;
        } catch (error) {
          console.error(`Request failed: ${error.message}`);
          
          if (attempt >= this.maxRetries - 1) {
            throw error;
          }
          
          console.warn(`Retrying (attempt ${attempt + 1}/${this.maxRetries})...`);
          await new Promise(r => setTimeout(r, this.retryDelay * Math.pow(2, attempt)));
          attempt++;
        }
      }
    }
    
    _trackUsage(tokens) {
      const now = Date.now();
      this.requestTimestamps.push(now);
      this.tokenUsage.push({ timestamp: now, tokens });
      
      // Clean up old entries (older than 1 minute)
      const oneMinuteAgo = now - 60000;
      this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
      this.tokenUsage = this.tokenUsage.filter(entry => entry.timestamp > oneMinuteAgo);
    }
    
    async _waitForRateLimit() {
      const now = Date.now();
      
      // Reset counters if a minute has passed
      if (now - this.lastRateLimitReset > 60000) {
        this.lastRateLimitReset = now;
        this.requestTimestamps = [];
        this.tokenUsage = [];
        return;
      }
      
      // Check if we're at the request rate limit
      if (this.requestTimestamps.length >= this.requestsPerMinute) {
        const oldestTimestamp = this.requestTimestamps[0];
        const waitTime = 60000 - (now - oldestTimestamp);
        
        if (waitTime > 0) {
          console.log(`Rate limit approaching. Waiting ${waitTime}ms before next request.`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
      
      // Check if we're at the token rate limit
      const tokenCount = this.tokenUsage.reduce((sum, entry) => sum + entry.tokens, 0);
      if (tokenCount >= this.tokensPerMinute) {
        const oldestTimestamp = this.tokenUsage[0].timestamp;
        const waitTime = 60000 - (now - oldestTimestamp);
        
        if (waitTime > 0) {
          console.log(`Token limit approaching. Waiting ${waitTime}ms before next request.`);
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    }
  }
  
module.exports = ModelApiClient;