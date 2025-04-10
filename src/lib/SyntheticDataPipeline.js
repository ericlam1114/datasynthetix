// src/lib/SyntheticDataPipeline.js
import { SyntheticDataPipeline } from "../../lib/SyntheticDataPipeline.js";

export { SyntheticDataPipeline };

// CommonJS export
module.exports = SyntheticDataPipeline;

// ES module export for Next.js API routes
if (typeof exports === 'object') {
  exports.SyntheticDataPipeline = SyntheticDataPipeline;
  exports.default = SyntheticDataPipeline;
} 