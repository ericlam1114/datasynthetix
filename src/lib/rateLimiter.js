// Create this file at: src/lib/rateLimiter.js

import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = {
  'process-document': 5,  // 5 requests per minute for document processing
  'preview-jsonl': 15,    // 15 requests per minute for previews
  'default': 30           // 30 requests per minute for other endpoints
};

/**
 * Rate limiting middleware for API routes
 * @param {string} userId - The user ID
 * @param {string} endpoint - The API endpoint being accessed (e.g., 'process-document')
 * @returns {Object|null} - NextResponse with error or null if allowed
 */
export async function checkRateLimit(userId, endpoint) {
  if (!userId) {
    return NextResponse.json(
      { error: 'User ID is required' },
      { status: 400 }
    );
  }

  try {
    // Get the appropriate rate limit for this endpoint
    const maxRequests = RATE_LIMIT_MAX_REQUESTS[endpoint] || RATE_LIMIT_MAX_REQUESTS.default;
    
    // Reference to user's rate limit document
    const rateLimitRef = doc(firestore, 'rateLimits', userId);
    const rateLimitDoc = await getDoc(rateLimitRef);
    
    const now = Date.now();
    let rateLimitData = {
      [endpoint]: {
        count: 0,
        windowStart: now
      },
      lastUpdated: serverTimestamp()
    };
    
    // If document exists, check and update rate limit data
    if (rateLimitDoc.exists()) {
      const data = rateLimitDoc.data();
      const endpointData = data[endpoint];
      
      if (endpointData) {
        // Check if we're in the same time window
        const windowStart = endpointData.windowStart;
        
        if (now - windowStart < RATE_LIMIT_WINDOW) {
          // Still in the same window, increment count
          if (endpointData.count >= maxRequests) {
            // Rate limit exceeded
            return NextResponse.json(
              { 
                error: 'Rate limit exceeded. Please try again later.',
                retryAfter: Math.ceil((windowStart + RATE_LIMIT_WINDOW - now) / 1000)
              },
              { 
                status: 429,
                headers: {
                  'Retry-After': Math.ceil((windowStart + RATE_LIMIT_WINDOW - now) / 1000)
                }
              }
            );
          }
          
          // Update the existing data
          rateLimitData = {
            ...data,
            [endpoint]: {
              count: endpointData.count + 1,
              windowStart
            },
            lastUpdated: serverTimestamp()
          };
        } else {
          // New window, reset count
          rateLimitData = {
            ...data,
            [endpoint]: {
              count: 1,
              windowStart: now
            },
            lastUpdated: serverTimestamp()
          };
        }
      } else {
        // First request for this endpoint
        rateLimitData = {
          ...data,
          [endpoint]: {
            count: 1,
            windowStart: now
          },
          lastUpdated: serverTimestamp()
        };
      }
    }
    
    // Update the rate limit document
    await setDoc(rateLimitRef, rateLimitData, { merge: true });
    
    // Request is allowed
    return null;
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // On error, allow the request to proceed
    return null;
  }
}