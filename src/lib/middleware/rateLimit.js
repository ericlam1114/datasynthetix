/**
 * Rate limiting middleware to protect API endpoints
 * Handles tracking request counts per IP/user and rejecting over-limit requests
 */

// In-memory cache to track requests
// In production, consider using Redis or a persistent store
const rateLimitCache = new Map();

/**
 * Lightweight rate limiter implementation for API routes
 * @param {Object} options - Configuration options
 * @param {number} options.interval - Time window in milliseconds
 * @param {number} options.limit - Maximum requests allowed in interval
 * @param {number} options.uniqueTokenPerInterval - Max number of tokens in storage
 * @returns {Object} Limiter with check method
 */
export function rateLimit(options) {
  const { interval, limit, uniqueTokenPerInterval = 500 } = options;
  
  // Cleanup function to prevent memory leaks
  const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of rateLimitCache.entries()) {
      if (now - value.timestamp > interval) {
        rateLimitCache.delete(key);
      }
    }
  };
  
  // Schedule periodic cleanup
  const cleanupInterval = setInterval(cleanup, interval);
  
  // Make sure we clean up in case of server restart
  if (typeof window === 'undefined') {
    // Only in Node.js environment
    process.on('SIGTERM', () => {
      clearInterval(cleanupInterval);
      rateLimitCache.clear();
    });
  }
  
  return {
    /**
     * Checks if the request should be rate limited
     * @param {Object} request - Next.js request object
     * @param {number} customLimit - Optional custom limit for this check
     * @returns {Promise<void>} Resolves if allowed, rejects if limited
     */
    check: async (request, customLimit = limit) => {
      cleanup();
      
      // Get identifier for rate limiting (IP address or token)
      const clientIp = 
        request.headers.get('x-forwarded-for')?.split(',')[0] || 
        request.ip || 
        'unknown';
      
      // Get Authorization token if present (for user-based rate limiting)
      const token = request.headers.get('authorization');
      
      // Create a unique key using IP and token (if available)
      const key = `${clientIp}:${token || ''}`;
      
      // Get current timestamp
      const now = Date.now();
      
      // Initialize or increment counter
      if (!rateLimitCache.has(key)) {
        // If cache is full, deny the request
        if (rateLimitCache.size >= uniqueTokenPerInterval) {
          throw new Error('Rate limit exceeded');
        }
        
        rateLimitCache.set(key, {
          timestamp: now,
          count: 1
        });
      } else {
        const current = rateLimitCache.get(key);
        
        // If within interval, increment count
        if (now - current.timestamp < interval) {
          // Check if limit exceeded
          if (current.count >= customLimit) {
            throw new Error('Rate limit exceeded');
          }
          
          // Increment count
          rateLimitCache.set(key, {
            timestamp: current.timestamp,
            count: current.count + 1
          });
        } else {
          // Reset if interval expired
          rateLimitCache.set(key, {
            timestamp: now,
            count: 1
          });
        }
      }
    }
  };
} 