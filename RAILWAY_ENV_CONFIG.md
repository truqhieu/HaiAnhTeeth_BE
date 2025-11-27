# Backend Environment Configuration for Railway Production

## Required Environment Variables

### Application URLs
```bash
# Backend URL (Railway deployment)
APP_URL=https://haianhteethbe-production.up.railway.app

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend-domain.com
```

### Database
```bash
MONGODB_URI=your_mongodb_connection_string
```

### JWT & Security
```bash
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_jwt_refresh_secret
```

### Email Configuration (if using)
```bash
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
```

### Payment Gateway (if using)
```bash
VIETQR_CLIENT_ID=your_vietqr_client_id
VIETQR_API_KEY=your_vietqr_api_key
```

---

## Where APP_URL is Used

The `APP_URL` environment variable is used in the following files:

1. **tempRegister.service.js** (line 82)
   - Generates email verification links
   - Fallback: `http://localhost:9999`

2. **user.controller.js** (lines 42, 263)
   - Password reset links
   - Email verification links
   - Fallback: Uses request protocol and host

3. **tempRegister.controller.js** (line 12)
   - Temporary registration verification
   - Fallback: Uses request protocol and host

---

## Railway Deployment Steps

1. **Set Environment Variables in Railway Dashboard**
   ```bash
   APP_URL=https://haianhteethbe-production.up.railway.app
   FRONTEND_URL=https://your-frontend-url.com
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_secret
   # ... other variables
   ```

2. **Update CORS Configuration**
   Make sure `server.js` or CORS middleware allows your frontend URL

3. **Deploy**
   ```bash
   git push origin dev
   ```
   Railway will auto-deploy from the connected branch

---

## Local Development

For local development, create a `.env` file (gitignored):
```bash
APP_URL=http://localhost:9999
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/haianhteeth
JWT_SECRET=local_dev_secret
```

---

## Verification Checklist

After deployment, verify:
- [ ] Email verification links use correct production URL
- [ ] Password reset links work
- [ ] CORS allows frontend domain
- [ ] Database connection works
- [ ] JWT tokens are generated correctly
- [ ] Payment gateway (if used) connects properly
