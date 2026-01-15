const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:4200',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
      process.env.FRONTEND_URL,
      process.env.FRONTEND_PRODUCTION_URL,
    ].filter(Boolean);


    console.log('🌐 [CORS] Origin check:', origin || 'No Origin');


    // Allow Postman / mobile app / curl (no origin)
    if (!origin) {
      console.log('✅ [CORS] No origin - allowing request (Postman/mobile)');
      return callback(null, true);
    }


    // Strict whitelist
    if (allowedOrigins.includes(origin)) {
      console.log('✅ [CORS] Origin allowed:', origin);
      return callback(null, true);
    }


    console.log('❌ [CORS] Origin blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },


  credentials: true,  // ⚠ Cookie bắt buộc
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],


  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-Access-Token',
    'X-API-Key',
    'X-User-Agent',
    'If-Modified-Since'
  ],


  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset'
  ],


  maxAge: 86400,
  optionsSuccessStatus: 200
};


module.exports = corsOptions;



