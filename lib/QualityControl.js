// lib/QualityControl.js
class QualityControl {
    constructor() {
      this.minClauseLength = 10;
      this.maxClauseLength = 1500;
      this.similarityThreshold = 0.85;
    }
    
    validateExtractedClauses(clauses) {
      const validClauses = [];
      const invalidClauses = [];
      
      // Validate each clause
      for (const clause of clauses) {
        if (typeof clause !== 'string') {
          invalidClauses.push({ clause, reason: 'Not a string' });
          continue;
        }
        
        const trimmedClause = clause.trim();
        
        // Check length
        if (trimmedClause.length < this.minClauseLength) {
          invalidClauses.push({ clause, reason: 'Too short' });
          continue;
        }
        
        if (trimmedClause.length > this.maxClauseLength) {
          invalidClauses.push({ clause, reason: 'Too long' });
          continue;
        }
        
        // Check for duplicates
        const isDuplicate = validClauses.some(
          validClause => this._calculateSimilarity(validClause, trimmedClause) > this.similarityThreshold
        );
        
        if (isDuplicate) {
          invalidClauses.push({ clause, reason: 'Duplicate' });
          continue;
        }
        
        // Add to valid clauses
        validClauses.push(trimmedClause);
      }
      
      return { validClauses, invalidClauses };
    }
    
    // Simple similarity calculation
    _calculateSimilarity(text1, text2) {
      if (!text1 || !text2) return 0;
      
      // Convert to lowercase and split into words
      const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 0);
      const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 0);
      
      // Count common words
      const commonWords = words1.filter(word => words2.includes(word));
      
      // Calculate Jaccard similarity
      const union = new Set([...words1, ...words2]).size;
      return commonWords.length / union;
    }
  }
  
  module.exports = QualityControl;