// Load environment variables
require('dotenv').config();

// Debug (chỉ trong development)
if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 DEBUG SEPAY CONFIG:');
  console.log('   - SEPAY_API_TOKEN:', process.env.SEPAY_API_TOKEN ? 'CÓ' : 'KHÔNG CÓ');
  console.log('   - SEPAY_ACCOUNT_NUMBER:', process.env.SEPAY_ACCOUNT_NUMBER || 'KHÔNG CÓ');
  console.log('   - SEPAY_BANK_CODE:', process.env.SEPAY_BANK_CODE || 'KHÔNG CÓ');
  console.log('   - SEPAY_ACCOUNT_NAME:', process.env.SEPAY_ACCOUNT_NAME ? 'CÓ' : 'KHÔNG CÓ');
}

const sepayConfig = {
  // Thông tin tài khoản ngân hàng nhận tiền
  // ⭐ Updated to MBBank (5510125082003 - TRAN VAN THAO)
  accountNumber: process.env.SEPAY_ACCOUNT_NUMBER || '5510125082003',
  accountName: process.env.SEPAY_ACCOUNT_NAME || 'TRAN VAN THAO',
  bankCode: process.env.SEPAY_BANK_CODE || 'MB', // Default MBBank
  
  // API Token từ environment variables
  apiToken: process.env.SEPAY_API_TOKEN || '',
  
  // API Endpoints
  apiBaseUrl: 'https://my.sepay.vn/userapi',
  
  // QR Code settings
  qrTemplate: 'compact2', // compact, compact2, print, qr_only
  
  // Payment timeout (15 phút)
  paymentTimeoutMinutes: 15,
  
  // Webhook URL (để nhận thông báo từ Sepay khi có giao dịch)
  // QUAN TRỌNG: Phải match chính xác với URL cấu hình trong Sepay Dashboard
  webhookUrl: process.env.SEPAY_WEBHOOK_URL || 'https://haianhteethbe-production.up.railway.app/api/payments/webhook/sepay'
};

// Log webhook URL để verify
if (process.env.NODE_ENV === 'production') {
  console.log('\n🔌 SEPAY WEBHOOK CONFIG:');
  console.log('   - Webhook URL:', sepayConfig.webhookUrl);
  console.log('   - Endpoint:', '/api/payments/webhook/sepay');
  console.log('   - Method: POST');
  console.log('   - Bank Account: ' + sepayConfig.accountNumber + ' (' + sepayConfig.bankCode + ')');
  console.log('   - Account Holder: ' + sepayConfig.accountName);
  console.log('');
}

// Danh sách mã ngân hàng Việt Nam
const BANK_CODES = {
  MB: 'MBBank',
  VCB: 'Vietcombank',
  TCB: 'Techcombank',
  ACB: 'ACB',
  VPB: 'VPBank',
  TPB: 'TPBank',
  STB: 'Sacombank',
  VIB: 'VIB',
  SHB: 'SHB',
  EIB: 'Eximbank',
  MSB: 'MSB',
  BIDV: 'BIDV',
  OCB: 'OCB',
  SCB: 'SCB',
  NAB: 'NamABank',
  VBA: 'VietABank',
  ABB: 'ABBANK',
  PGB: 'PGBank',
  GPB: 'GPBank',
  BAB: 'BacABank',
  CAKE: 'CAKE by VPBank',
  TIMO: 'Timo by VPBank',
  VIET: 'ViettelMoney'
};

// Validate config
const validateSepayConfig = () => {
  const errors = [];
  
  if (!sepayConfig.accountNumber || sepayConfig.accountNumber === '0123456789') {
    errors.push('SEPAY_ACCOUNT_NUMBER chưa được cấu hình');
  }
  
  if (!sepayConfig.accountName || sepayConfig.accountName === 'PHONG KHAM RANG HAI ANH') {
    errors.push('SEPAY_ACCOUNT_NAME chưa được cấu hình');
  }
  
  if (!sepayConfig.apiToken) {
    errors.push('SEPAY_API_TOKEN chưa được cấu hình');
  }
  
  if (!BANK_CODES[sepayConfig.bankCode]) {
    errors.push(`Bank code "${sepayConfig.bankCode}" không hợp lệ`);
  }
  
  if (errors.length > 0) {
    console.warn('⚠️  Cảnh báo Sepay Config:');
    errors.forEach(err => console.warn(`   - ${err}`));
  }
  
  return errors.length === 0;
};

module.exports = {
  sepayConfig,
  BANK_CODES,
  validateSepayConfig
};

