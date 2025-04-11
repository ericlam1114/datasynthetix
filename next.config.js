/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    USE_OCR: process.env.USE_OCR || 'true',
    ENABLE_OCR: process.env.ENABLE_OCR || 'true',
  },
  // Use the correct property for Next.js 14+
  experimental: {
    // Handle server-only modules properly
    serverActions: true,
  },
  // Specify packages that should be transpiled
  transpilePackages: ['pdf-parse', 'tesseract.js', 'canvas'],
  webpack: (config, { isServer }) => {
    // Only exclude node-specific modules on the client side
    if (!isServer) {
      // Handle server-only modules on client side by providing empty modules
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        'tesseract.js': false,
        'pdfjs-dist/build/pdf.worker.js': false,
      }
      
      // Add null loaders for binary files on client side
      config.module.rules.push(
        {
          test: /\.node$/,
          use: 'null-loader',
        },
        {
          // Handle other binary files that might be included
          test: /\.(wasm|tiff|ttf|eot|otf|ttc)$/,
          use: 'null-loader',
        }
      );
    }
    
    // For server-side, properly handle binary modules
    if (isServer) {
      // Add external modules that should not be bundled
      config.externals = [
        ...config.externals,
        'canvas',
        'tesseract.js',
      ];
    }
    
    // Prevent warnings about large assets
    config.performance = {
      ...config.performance,
      hints: false,
    };
    
    return config;
  },
};

module.exports = nextConfig; 