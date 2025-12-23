const axios = require('axios');
const { sepayConfig } = require('../config/sepayConfig');

class SepayService {
  
  /**
   * Tạo nội dung chuyển khoản (content) để tracking
   * Format: APPOINTMENT_{appointmentId}
   */
  generateTransferContent(appointmentId) {
    // Chuyển ObjectId thành string ngắn (8 ký tự cuối)
    const shortId = appointmentId.toString().slice(-8).toUpperCase();
    return `APPOINTMENT ${shortId}`;
  }

  /**
   * Tạo QR Code thanh toán
   * 
   * Mode 1: Dùng VietQR (miễn phí, không cần API token)
   * Mode 2: Dùng Sepay Create Transaction API (dynamic QR, cần API token)
   */
  async generateQRCode(paymentData) {
    try {
      const { appointmentId, amount, customerName } = paymentData;

      // Tạo nội dung chuyển khoản
      const content = this.generateTransferContent(appointmentId);
      
      // DEBUG: Log toàn bộ paymentData để xem
      console.log('🔍 DEBUG - paymentData:', JSON.stringify(paymentData, null, 2));
      console.log('🔍 DEBUG - customerName từ paymentData:', customerName);
      console.log('🔍 DEBUG - sepayConfig.accountName từ env:', sepayConfig.accountName);
      console.log('🔍 DEBUG - process.env.SEPAY_ACCOUNT_NAME:', process.env.SEPAY_ACCOUNT_NAME);
      
      // Tên hiển thị trên QR: LUÔN DÙNG accountName từ config (.env)
      // KHÔNG dùng customerName vì nó có thể bị sai
      const displayName = sepayConfig.accountName;
      
      console.log('💳 Tạo QR Code:');
      console.log('   - Số tài khoản:', sepayConfig.accountNumber);
      console.log('   - Tên hiển thị (FINAL):', displayName);
      console.log('   - Ngân hàng:', sepayConfig.bankCode);
      console.log('   - Số tiền:', amount, 'VND');
      console.log('   - Nội dung:', content);

      // Nếu có API Token → dùng Sepay Payment Gateway
      if (sepayConfig.apiToken && sepayConfig.apiToken !== '') {
        console.log('🔑 Có API Token → Dùng Sepay Payment Gateway');
        return await this.generateSepayQRCode({
          appointmentId,
          amount,
          content,
          customerName: displayName
        });
      }

      // Nếu không có API Token → dùng VietQR (miễn phí)
      console.log('🆓 Không có API Token → Dùng VietQR (miễn phí)');
      const qrUrl = this.generateVietQRUrl({
        accountNumber: sepayConfig.accountNumber,
        accountName: displayName,
        bankCode: sepayConfig.bankCode,
        amount: amount,
        content: content
      });

      console.log('✅ QR URL:', qrUrl);

      return {
        qrUrl,
        content,
        accountNumber: sepayConfig.accountNumber,
        accountName: displayName,
        bankCode: sepayConfig.bankCode,
        amount
      };

    } catch (error) {
      console.error('❌ Lỗi tạo QR Code:', error.message);
      throw new Error('Không thể tạo mã QR thanh toán');
    }
  }

  /**
   * Tạo QR Code động qua Sepay Payment Gateway API
   * (Dành cho người chọn "Sử dụng Cổng thanh toán")
   */
  async generateSepayQRCode(data) {
    try {
      const { appointmentId, amount, content, customerName } = data;

      console.log('🔄 Đang gọi Sepay Payment Gateway API...');

      // Gọi Sepay Create Payment Link API
      // Docs: https://docs.sepay.vn/
      const response = await axios.post(
        `${sepayConfig.apiBaseUrl}/create-payment`,
        {
          account_number: sepayConfig.accountNumber,
          amount: amount,
          content: content,
          payer_name: customerName || 'Khach hang',
          bank_code: sepayConfig.bankCode,
          callback_url: sepayConfig.webhookUrl || null
        },
        {
          headers: {
            'Authorization': `Bearer ${sepayConfig.apiToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 seconds timeout
        }
      );

      console.log('📡 Sepay API Response:', response.data);

      // Check response format
      if (response.data && response.data.status === 200) {
        const data = response.data.data;
        
        console.log('✅ Sepay Payment Link created');
        console.log('   - Transaction ID:', data.transaction_id || data.id);
        console.log('   - QR URL:', data.qr_url || data.qrcode);

        return {
          qrUrl: data.qr_url || data.qrcode || data.qr_code,
          content: content,
          accountNumber: sepayConfig.accountNumber,
          accountName: customerName || sepayConfig.accountName,
          bankCode: sepayConfig.bankCode,
          amount: amount,
          transactionId: data.transaction_id || data.id,
          expiresAt: data.expires_at || data.expired_at || null,
          paymentUrl: data.payment_url || data.pay_url || null
        };
      }

      // Nếu response không đúng format mong đợi
      throw new Error(`Sepay API error: ${response.data?.message || 'Unknown error'}`);

    } catch (error) {
      console.error('❌ Lỗi gọi Sepay Payment Gateway API:');
      
      if (error.response) {
        // API trả về error
        console.error('   - Status:', error.response.status);
        console.error('   - Data:', error.response.data);
      } else if (error.request) {
        // Không nhận được response
        console.error('   - No response from Sepay API');
      } else {
        console.error('   - Error:', error.message);
      }
      
      // Fallback về VietQR nếu Sepay API lỗi
      console.log('⚠️  Fallback về VietQR (miễn phí)...');
      return {
        qrUrl: this.generateVietQRUrl({
          accountNumber: sepayConfig.accountNumber,
          accountName: data.customerName || sepayConfig.accountName,
          bankCode: sepayConfig.bankCode,
          amount: data.amount,
          content: data.content
        }),
        content: data.content,
        accountNumber: sepayConfig.accountNumber,
        accountName: data.customerName || sepayConfig.accountName,
        bankCode: sepayConfig.bankCode,
        amount: data.amount,
        fallback: true
      };
    }
  }

  /**
   * Tạo URL QR Code sử dụng VietQR API
   * API miễn phí, không cần đăng ký
   */
  generateVietQRUrl(data) {
    const { accountNumber, accountName, bankCode, amount, content } = data;
    
    // Encode nội dung để URL-safe
    const encodedContent = encodeURIComponent(content);
    const encodedAccountName = encodeURIComponent(accountName);
    
    // VietQR API format
    // https://img.vietqr.io/image/{BANK_CODE}-{ACCOUNT_NUMBER}-{TEMPLATE}.png?amount={AMOUNT}&addInfo={CONTENT}&accountName={NAME}
    const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${sepayConfig.qrTemplate}.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodedAccountName}`;
    
    return qrUrl;
  }

  /**
   * Kiểm tra trạng thái giao dịch từ Sepay
   * (Nếu có API Token từ Sepay)
   */
  async checkTransactionStatus(content) {
    try {
      if (!sepayConfig.apiToken) {
        console.warn('⚠️  Chưa cấu hình SEPAY_API_TOKEN, không thể tự động check giao dịch');
        return null;
      }

      console.log('🔍 Đang check giao dịch với content:', content);
      console.log('🔍 Account number:', sepayConfig.accountNumber);

      // CHỈ DÙNG 1 ENDPOINT CHÍNH
      const response = await axios.get(`${sepayConfig.apiBaseUrl}/transactions`, {
        headers: {
          'Authorization': `Bearer ${sepayConfig.apiToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          account_number: sepayConfig.accountNumber,
          limit: 50
        },
        timeout: 10000
      });

      console.log('📡 Sepay API Response:', response.data);

      // Parse response
      let transactions = response.data?.transactions || 
                       response.data?.data?.transactions ||
                       response.data?.data || 
                       response.data?.records ||
                       response.data;
      
      if (!Array.isArray(transactions)) {
        console.log('⚠️  Response không phải array');
        return { found: false };
      }

      console.log(`📊 Tìm thấy ${transactions.length} giao dịch từ Sepay`);

      // Tìm giao dịch khớp
      const transaction = transactions.find(tx => {
        const txContent = tx.transaction_content || tx.content || tx.description || tx.note || '';
        return txContent && txContent.includes(content);
      });

      if (transaction) {
        console.log('✅ TÌM THẤY GIAO DỊCH KHỚP!');
        console.log('   - Số tiền:', transaction.amount_in || transaction.amount);
        console.log('   - Nội dung:', transaction.transaction_content || transaction.content);
        return {
          found: true,
          amount: transaction.amount_in || transaction.amount || transaction.credit || 0,
          transactionDate: transaction.transaction_date || transaction.date || transaction.created_at || transaction.time,
          bankAccount: transaction.bank_account || transaction.account_name || transaction.sender,
          content: transaction.transaction_content || transaction.content || transaction.description
        };
      }

      console.log('⏳ Chưa thấy giao dịch khớp');
      return { found: false };

    } catch (error) {
      console.error('❌ Lỗi check Sepay API:');
      if (error.response) {
        console.error('   - Status:', error.response.status);
        console.error('   - Message:', error.response.data?.message || error.response.statusText);
      } else {
        console.error('   - Error:', error.message);
      }
      return null;
    }
  }

  /**
   * Xác thực webhook từ Sepay (nếu có)
   */
  validateWebhook(signature, payload) {
    // TODO: Implement webhook signature validation
    // Sepay sẽ gửi signature để verify request
    return true;
  }

  /**
   * Parse webhook data từ Sepay
   * Format: Sepay gửi với camelCase (content, transferAmount, transactionDate, referenceCode)
   */
  parseWebhookData(data) {
    try {
      // Sepay webhook format:
      // {
      //   "id": 27181556,
      //   "gateway": "MBBank",
      //   "accountNumber": "5510125082003",
      //   "content": "APPOINTMENT DD2EAFE1",
      //   "transferAmount": 40000,
      //   "transactionDate": "2025-10-21 19:51:00",
      //   "referenceCode": "FT25294220080931"
      // }
      
      return {
        transactionId: data.id || data.transaction_id,
        gatewayTransactionId: data.gateway_transaction_id || data.gateway,
        accountNumber: data.account_number || data.accountNumber,
        amount: data.amount_in || data.transferAmount,
        content: data.transaction_content || data.content,
        transactionDate: data.transaction_date || data.transactionDate,
        referenceNumber: data.reference_number || data.referenceCode,
        bankAccount: data.bank_account || data.gateway
      };
    } catch (error) {
      console.error('❌ Lỗi parse webhook data:', error);
      throw new Error('Invalid webhook data');
    }
  }

  /**
   * Lấy thông tin ngân hàng
   */
  getBankInfo() {
    return {
      accountNumber: sepayConfig.accountNumber,
      accountName: sepayConfig.accountName,
      bankCode: sepayConfig.bankCode,
      bankName: this.getBankName(sepayConfig.bankCode)
    };
  }

  /**
   * Get bank name from bank code
   */
  getBankName(bankCode) {
    const bankNames = {
      MB: 'MBBank - Ngân hàng Quân Đội',
      VCB: 'Vietcombank - Ngân hàng Ngoại Thương',
      TCB: 'Techcombank - Ngân hàng Kỹ Thương',
      ACB: 'ACB - Ngân hàng Á Châu',
      VPB: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng',
      TPB: 'TPBank - Ngân hàng Tiên Phong',
      STB: 'Sacombank - Ngân hàng TMCP Sài Gòn Thương Tín',
      VIB: 'VIB - Ngân hàng Quốc Tế',
      SHB: 'SHB - Ngân hàng Sài Gòn - Hà Nội',
      BIDV: 'BIDV - Ngân hàng Đầu Tư và Phát Triển Việt Nam'
    };
    
    return bankNames[bankCode] || bankCode;
  }
}

module.exports = new SepayService();

