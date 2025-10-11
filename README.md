# QuickCredit Uganda - Modern Loan Management System

A modern, microservices-based loan management system built with Node.js, React, and PostgreSQL. Features include mobile money integration, WhatsApp notifications, and a comprehensive client portal.

## 🚀 Features

### Core Functionality
- **Loan Management**: Complete loan lifecycle from application to closure
- **Borrower Management**: KYC, credit scoring, and customer profiles
- **Payment Processing**: Multiple payment methods including mobile money
- **Savings Accounts**: Customer savings and deposits management
- **Reports & Analytics**: Comprehensive reporting and dashboard analytics
- **Audit Trail**: Complete audit logging for compliance

### Modern Integrations
- **Mobile Money**: MTN MoMo and Airtel Money integration
- **WhatsApp API**: Automated notifications and customer communication
- **Email & SMS**: Multi-channel notification system
- **Real-time Updates**: WebSocket-based real-time notifications
- **Client Portal**: Self-service portal for borrowers

### Security & Compliance
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Multi-level user permissions
- **Data Encryption**: Secure data storage and transmission
- **Rate Limiting**: API protection and abuse prevention
- **Audit Logging**: Complete activity tracking

## 🏗️ Architecture

```
quickcredit-modern/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── controllers/     # Route controllers
│   │   ├── models/         # Prisma database models
│   │   ├── services/       # Business logic services
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── config/         # Configuration files
│   │   └── utils/          # Utility functions
│   ├── prisma/             # Database schema and migrations
│   └── Dockerfile          # Docker configuration
├── frontend/               # React admin dashboard
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API services
│   │   └── utils/          # Utility functions
│   └── Dockerfile          # Docker configuration
├── client-portal/          # React client portal
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── services/       # API services
│   └── Dockerfile          # Docker configuration
├── shared/                 # Shared utilities and types
├── docs/                   # Documentation
├── docker-compose.yml      # Docker Compose configuration
└── README.md              # This file
```

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with Helmet, CORS, and Morgan
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for session management and caching
- **Authentication**: JWT with bcrypt password hashing
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest with Supertest
- **Logging**: Winston with structured logging

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and builds
- **Styling**: TailwindCSS with Headless UI components
- **State Management**: React Query for server state
- **Forms**: React Hook Form with validation
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React and Heroicons
- **Notifications**: React Hot Toast

### DevOps & Deployment
- **Containerization**: Docker and Docker Compose
- **Reverse Proxy**: Nginx for load balancing
- **Process Management**: PM2 for production deployment
- **Monitoring**: Built-in health checks and logging
- **CI/CD**: GitHub Actions ready configuration

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18 or higher
- **npm**: Version 8 or higher (comes with Node.js)
- **PostgreSQL**: Version 13 or higher
- **Redis**: Version 6 or higher (optional, for caching)
- **Docker**: Version 20+ (optional, for containerized deployment)
- **Git**: For version control

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/quickcredit-modern.git
cd quickcredit-modern
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Install client portal dependencies
cd ../client-portal && npm install
```

### 3. Environment Setup

#### Backend Environment
```bash
cd backend
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/quickcredit_db"

# JWT Secrets (Generate strong secrets in production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key

# Mobile Money (Get from providers)
MTN_MOMO_USER_ID=your-mtn-user-id
MTN_MOMO_API_KEY=your-mtn-api-key
MTN_MOMO_SUBSCRIPTION_KEY=your-mtn-subscription-key

# WhatsApp (Get from Twilio)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Email (Example with Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 4. Database Setup

```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed the database with initial data
npx prisma db seed
```

### 5. Start Development Servers

```bash
# From root directory - starts all services
npm run dev

# Or start individually:
npm run dev:backend   # Backend API (port 5000)
npm run dev:frontend  # Admin Dashboard (port 3000)
npm run dev:client    # Client Portal (port 3001)
```

### 6. Access the Applications

- **Admin Dashboard**: http://localhost:3000
- **Client Portal**: http://localhost:3001
- **API Documentation**: http://localhost:5000/api/docs
- **API Health Check**: http://localhost:5000/health

## 🐳 Docker Deployment

### Development with Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose ps
```

## 📊 Default Accounts

The system comes with pre-configured demo accounts:

| Role | Username | Password | Permissions |
|------|----------|----------|-------------|
| Super Admin | admin | admin123 | Full system access |
| Manager | manager | manager123 | Loan management, reports |
| Loan Officer | officer | officer123 | Loan processing, borrower management |
| Accountant | accountant | accountant123 | Financial reports, expenses |
| Read-only | readonly | readonly123 | View-only access |

**⚠️ Important**: Change these default passwords before production deployment!

## 🔧 Configuration

### Mobile Money Setup

#### MTN MoMo API
1. Register at [MTN MoMo Developer Portal](https://momodeveloper.mtn.com/)
2. Create a new app and get your credentials
3. Generate User ID and API Key for Collections
4. Update environment variables

#### Airtel Money API
1. Register at [Airtel Developer Portal](https://developers.airtel.africa/)
2. Create application and get Client ID/Secret
3. Configure webhooks for payment notifications
4. Update environment variables

### WhatsApp Setup

1. Create a [Twilio account](https://www.twilio.com/)
2. Get WhatsApp Business API access
3. Configure webhook endpoints
4. Update environment variables with Twilio credentials

### Email Setup

#### Gmail Configuration
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password
3. Use the App Password in the EMAIL_PASS environment variable

#### SMTP Configuration
```env
EMAIL_HOST=smtp.your-provider.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-password
```

## 📱 API Documentation

### Authentication

```bash
# Login
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}

# Get user profile
GET /api/auth/profile
Authorization: Bearer <token>
```

### Loan Management

```bash
# Create loan application
POST /api/applications
{
  "borrowerId": "uuid",
  "requestedAmount": 1000000,
  "purpose": "Business expansion",
  "term": 12
}

# Approve loan
PUT /api/loans/:id/approve
{
  "approvedAmount": 1000000,
  "interestRate": 0.15,
  "term": 12
}
```

### Mobile Money Integration

```bash
# Process mobile money payment
POST /api/mobile-money/payment
{
  "loanId": "uuid",
  "amount": 100000,
  "phoneNumber": "+256771234567",
  "provider": "MTN"
}

# Check payment status
GET /api/mobile-money/status/:referenceId
```

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Frontend Tests

```bash
cd frontend

# Run component tests
npm test

# Run tests with UI
npm run test:ui
```

## 📈 Monitoring & Logging

### Health Checks

- **API Health**: `GET /health`
- **Database Health**: Included in health endpoint
- **Redis Health**: Included in health endpoint

### Logs

```bash
# View backend logs
tail -f backend/logs/combined.log

# View error logs only
tail -f backend/logs/error.log

# Docker logs
docker-compose logs -f backend
```

### Performance Monitoring

The system includes built-in performance monitoring:

- Request/response time tracking
- Database query performance
- Memory and CPU usage
- Error rate monitoring

## 🔒 Security Best Practices

### Production Security Checklist

- [ ] Change all default passwords
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Configure proper CORS origins
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Regular security updates
- [ ] Database connection encryption
- [ ] Secure file upload handling
- [ ] Input validation and sanitization

### Environment Variables Security

```bash
# Generate secure JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Use strong database passwords
# Enable SSL for database connections in production
```

## 🚀 Deployment Guide

### VPS/Server Deployment

1. **Server Setup**
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Install Redis
sudo apt-get install redis-server

# Install PM2 for process management
npm install -g pm2
```

2. **Application Deployment**
```bash
# Clone and build
git clone https://github.com/your-org/quickcredit-modern.git
cd quickcredit-modern
npm install
npm run build

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

3. **Nginx Configuration**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### Cloud Deployment (AWS/DigitalOcean)

1. **Using Docker**
```bash
# Build and push images
docker build -t quickcredit-backend ./backend
docker build -t quickcredit-frontend ./frontend

# Deploy with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

2. **Database Migration**
```bash
# Run migrations on production
npx prisma migrate deploy

# Backup database
pg_dump quickcredit_db > backup.sql
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Update documentation for API changes
- Follow conventional commit messages
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:

- **Email**: support@quickcredit.ug
- **Phone**: +256-XXX-XXXXXX
- **Documentation**: [docs.quickcredit.ug](https://docs.quickcredit.ug)
- **Issues**: [GitHub Issues](https://github.com/your-org/quickcredit-modern/issues)

## 🙏 Acknowledgments

- [Prisma](https://prisma.io/) - Next-generation ORM
- [React](https://reactjs.org/) - Frontend framework
- [TailwindCSS](https://tailwindcss.com/) - Utility-first CSS framework
- [MTN MoMo API](https://momodeveloper.mtn.com/) - Mobile money integration
- [Twilio](https://www.twilio.com/) - WhatsApp API integration

---

**QuickCredit Uganda** - Empowering financial inclusion through technology 🏦✨