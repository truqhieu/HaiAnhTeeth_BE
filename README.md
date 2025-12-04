<div align="center">

# 🦷 HaiAnhTeeth

### Dental Clinic Management System


[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=flat&logo=socket.io&logoColor=white)](https://socket.io/)

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [API](#-api-endpoints)

</div>

---

## ✨ Features

🤖 **AI-Powered Booking** - Natural language appointment scheduling with GPT-4  
📅 **Smart Scheduling** - Intelligent conflict detection and availability management  
💬 **Real-time Chat** - WebSocket-based doctor-patient communication  
� **Email Automation** - Automated notifications for appointments and updates  
� **Payment Gateway** - Integrated online payment processing  
🎥 **Video Consultation** - Built-in video call support for remote appointments  
👥 **Role Management** - Multi-level access control (Admin, Doctor, Nurse, Patient)  
📊 **Analytics Dashboard** - Comprehensive reporting and insights  

## 🛠 Tech Stack

**Backend**
- Node.js & Express.js
- MongoDB with Mongoose ODM
- Socket.io for real-time features
- JWT authentication

**AI & Automation**
- OpenAI GPT-4 for chatbot
- LangChain for AI orchestration
- Node-cron for scheduled tasks

**Integrations**
- SendGrid (Email)
- Cloudinary (Storage)
- SePay (Payments)
- Jitsi Meet (Video)

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- MongoDB database
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/HaiAnhTeeth_BE.git
cd HaiAnhTeeth_BE

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

The server will start on `http://localhost:9999`

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server
PORT=9999
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
MONGO_URI=your_mongodb_connection_string

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=7d

# Email Service
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=your_email@domain.com

# AI Service
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo-preview

# Cloud Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_SECRET_KEY=your_cloudinary_secret

# Payment Gateway
SEPAY_API_TOKEN=your_sepay_token
SEPAY_WEBHOOK_URL=your_webhook_url
```

> ⚠️ **Never commit your `.env` file to version control**

## 📁 Project Structure

```
├── config/          # App configuration & email templates
├── controllers/     # Request handlers
├── models/          # Database schemas
├── routes/          # API routes
├── services/        # Business logic
├── middleware/      # Custom middleware
├── utils/           # Helper functions
└── server.js        # Entry point
```

## 🔌 API Endpoints

### Authentication
```
POST   /api/users/register       # Register new user
POST   /api/users/login          # User login
POST   /api/users/forgot-password # Password reset
```

### Appointments
```
GET    /api/appointments         # List appointments
POST   /api/appointments         # Create appointment
PUT    /api/appointments/:id     # Update appointment
DELETE /api/appointments/:id     # Cancel appointment
```

### AI Chatbot
```
POST   /api/ai-booking/chat      # Chat with AI assistant
POST   /api/ai-booking/reset     # Reset conversation
```

### Doctors
```
GET    /api/doctors              # List all doctors
GET    /api/doctors/:id          # Get doctor details
GET    /api/doctors/:id/schedule # Get doctor schedule
```

## 🤖 AI Chatbot Usage

The AI chatbot understands natural language for booking appointments:

```javascript
// Example request
POST /api/ai-booking/chat
{
  "message": "I want to book a dental checkup tomorrow at 2pm"
}

// AI will:
// ✓ Parse the intent and entities
// ✓ Check doctor availability
// ✓ Suggest available time slots
// ✓ Create the appointment
```

## 🔄 Automated Tasks

The system runs background jobs for:

- **Promotion Management** - Auto-update promotion status (every minute)
- **Doctor Assignment** - Auto-confirm after deadline (hourly)
- **Schedule Restoration** - Restore after leave period (daily)

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📦 Deployment

### Using Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Using Docker

```bash
# Build image
docker build -t haianteeth-backend .

# Run container
docker run -p 9999:9999 --env-file .env haianteeth-backend
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Express.js](https://expressjs.com/) - Fast, unopinionated web framework
- [MongoDB](https://www.mongodb.com/) - NoSQL database
- [OpenAI](https://openai.com/) - AI capabilities
- [Socket.io](https://socket.io/) - Real-time engine

---

<div align="center">

**Built with ❤️ by HaiAnhTeeth Team**

</div>
