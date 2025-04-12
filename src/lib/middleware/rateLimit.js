/**
 * Rate limiting middleware to protect API endpoints
 * Handles tracking request counts per IP/user and rejecting over-limit requests
 */

import { LRUCache } from 'lru-cache';

/**
 * Creates a rate limiter
 * @param {Object} options - Rate limiting options
 * @param {number} options.interval - Time window in milliseconds
 * @param {number} options.limit - Max number of requests per interval
 * @param {number} options.uniqueTokenPerInterval - Max number of tokens to track
 * @returns {Object} Rate limiter functions
 */
export function rateLimit(options) {
  const tokenCache = new LRUCache({
    max: options.uniqueTokenPerInterval || 500, // Max unique tokens to track
    ttl: options.interval || 60000, // Default: 1 minute
  });

  return {
    /**
     * Check if the request exceeds rate limits
     * @param {Request} request - The HTTP request
     * @param {number} [limit] - Optional custom limit for this request
     * @returns {Promise<void>} Resolves if under limit, rejects if rate limited
     */
    check: async (request, limit) => {
      const requestLimit = limit || options.limit;
      const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
      const token = getIdentifier(request, ip);
      
      // Current count for this token
      const tokenCount = (tokenCache.get(token) || 0) + 1;
      
      // Check if over the limit
      if (tokenCount > requestLimit) {
        throw new Error('Rate limit exceeded');
      }
      
      // Set the new count in the cache
      tokenCache.set(token, tokenCount);
      return;
    },
    
    /**
     * Get current usage for a request
     * @param {Request} request - The HTTP request 
     * @returns {Object} Usage information
     */
    getUsage: (request) => {
      const ip = request.headers.get('x-forwarded-for') || 'unknown-ip';
      const token = getIdentifier(request, ip);
      return {
        current: tokenCache.get(token) || 0,
        limit: options.limit,
        remaining: Math.max(0, options.limit - (tokenCache.get(token) || 0))
      };
    }
  };
}

/**
 * Get a unique identifier for the request
 * @param {Request} request - The HTTP request
 * @param {string} ip - The client IP address
 * @returns {string} A unique token for this request
 */
function getIdentifier(request, ip) {
  // Get the Authorization header
  const authHeader = request.headers.get('authorization');
  
  // If we have a Bearer token, extract the user ID
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    return `auth_${token.slice(0, 12)}`;
  }
  
  // Use a combination of IP and user agent as fallback
  const userAgent = request.headers.get('user-agent') || 'unknown-ua';
  return `${ip}_${userAgent.slice(0, 20)}`;
}

/**
 * Higher-order function to apply rate limiting to a route handler
 * @param {Function} handler - The route handler function
 * @param {Object} options - Rate limiting options
 * @returns {Function} The rate-limited handler
 */
export function withRateLimit(handler, options = {}) {
  const limiter = rateLimit({
    interval: options.interval || 60000, // Default: 1 minute
    limit: options.limit || 60, // Default: 60 requests per minute
    uniqueTokenPerInterval: options.uniqueTokenPerInterval || 500,
  });

  return async (request, ...args) => {
    try {
      await limiter.check(request);
      
      // Add rate limit headers to track usage
      const response = await handler(request, ...args);
      const usage = limiter.getUsage(request);
      
      // Clone response to modify headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('X-RateLimit-Limit', usage.limit.toString());
      newResponse.headers.set('X-RateLimit-Remaining', usage.remaining.toString());
      
      return newResponse;
    } catch (error) {
      if (error.message === 'Rate limit exceeded') {
        return new Response(
          JSON.stringify({ error: 'Too many requests', details: 'Rate limit exceeded' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60'
            }
          }
        );
      }
      
      throw error;
    }
  };
} 