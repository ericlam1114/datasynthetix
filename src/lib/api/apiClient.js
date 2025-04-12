import { getAuth } from 'firebase/auth';

/**
 * Base API client for making authenticated requests
 */
export class ApiClient {
  /**
   * Create an authenticated request to the API
   * 
   * @param {string} endpoint - API endpoint path (e.g., '/api/document-management')
   * @param {Object} options - Request options
   * @param {string} [options.method='GET'] - HTTP method
   * @param {Object} [options.body] - Request body
   * @param {Object} [options.params] - URL parameters
   * @param {boolean} [options.requireAuth=true] - Whether to include authentication token
   * @returns {Promise<Response>} - Fetch Response
   */
  static async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body,
      params = {},
      requireAuth = true,
    } = options;

    // Build URL with parameters
    const url = new URL(endpoint, window.location.origin);
    if (params && Object.keys(params).length > 0) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });
    }

    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authentication token if required
    if (requireAuth) {
      try {
        const auth = getAuth();
        if (!auth.currentUser) {
          throw new Error('User not authenticated');
        }
        
        const token = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Failed to get authentication token:', error);
        throw new Error('Authentication required for this request');
      }
    }

    // Prepare request options
    const requestOptions = {
      method,
      headers,
      credentials: 'same-origin',
    };

    // Add request body if provided
    if (body && method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(body);
    }

    // Execute request
    const response = await fetch(url, requestOptions);
    
    // Handle response
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'API request failed');
      error.status = response.status;
      error.statusText = response.statusText;
      error.data = errorData;
      throw error;
    }
    
    // Return JSON response or empty object if no content
    return response.status === 204 ? {} : await response.json();
  }

  /**
   * GET request wrapper
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} [params] - URL parameters
   * @param {boolean} [requireAuth=true] - Whether to include authentication token
   * @returns {Promise<any>} - Response data
   */
  static async get(endpoint, params = {}, requireAuth = true) {
    return this.request(endpoint, { params, requireAuth });
  }

  /**
   * POST request wrapper
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} [body] - Request body
   * @param {Object} [params] - URL parameters
   * @param {boolean} [requireAuth=true] - Whether to include authentication token
   * @returns {Promise<any>} - Response data
   */
  static async post(endpoint, body = {}, params = {}, requireAuth = true) {
    return this.request(endpoint, { method: 'POST', body, params, requireAuth });
  }

  /**
   * PUT request wrapper
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} [body] - Request body
   * @param {Object} [params] - URL parameters
   * @param {boolean} [requireAuth=true] - Whether to include authentication token
   * @returns {Promise<any>} - Response data
   */
  static async put(endpoint, body = {}, params = {}, requireAuth = true) {
    return this.request(endpoint, { method: 'PUT', body, params, requireAuth });
  }

  /**
   * PATCH request wrapper
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} [body] - Request body
   * @param {Object} [params] - URL parameters
   * @param {boolean} [requireAuth=true] - Whether to include authentication token
   * @returns {Promise<any>} - Response data
   */
  static async patch(endpoint, body = {}, params = {}, requireAuth = true) {
    return this.request(endpoint, { method: 'PATCH', body, params, requireAuth });
  }

  /**
   * DELETE request wrapper
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} [body] - Request body
   * @param {Object} [params] - URL parameters
   * @param {boolean} [requireAuth=true] - Whether to include authentication token
   * @returns {Promise<any>} - Response data
   */
  static async delete(endpoint, body = {}, params = {}, requireAuth = true) {
    return this.request(endpoint, { method: 'DELETE', body, params, requireAuth });
  }
}

/**
 * Document management API client
 */
export class DocumentApi extends ApiClient {
  static baseEndpoint = '/api/document-management';

  /**
   * Get user documents
   * 
   * @param {Object} params - Query parameters
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.pageSize=10] - Items per page
   * @param {string} [params.viewMode='active'] - View mode (active, trash, all)
   * @returns {Promise<Object>} Document list with pagination
   */
  static async getDocuments(params = {}) {
    return this.get(this.baseEndpoint, {
      page: params.page || 1,
      pageSize: params.pageSize || 10,
      viewMode: params.viewMode || 'active'
    });
  }

  /**
   * Delete a document
   * 
   * @param {Object} options - Delete options
   * @param {string} options.documentId - Document ID to delete
   * @param {boolean} [options.permanent=false] - Whether to permanently delete
   * @param {boolean} [options.deleteDatasets=false] - Whether to delete associated datasets
   * @returns {Promise<Object>} Operation result
   */
  static async deleteDocument(options) {
    return this.delete(this.baseEndpoint, {
      documentId: options.documentId,
      permanent: options.permanent || false,
      deleteDatasets: options.deleteDatasets || false
    });
  }

  /**
   * Restore a document from trash
   * 
   * @param {string} documentId - Document ID to restore
   * @returns {Promise<Object>} Operation result
   */
  static async restoreDocument(documentId) {
    return this.patch(this.baseEndpoint, {
      documentId,
      action: 'restore'
    });
  }

  /**
   * Cancel a document's active job
   * 
   * @param {string} documentId - Document ID with job to cancel
   * @returns {Promise<Object>} Operation result
   */
  static async cancelJob(documentId) {
    return this.patch(this.baseEndpoint, {
      documentId,
      action: 'cancelJob'
    });
  }
} 