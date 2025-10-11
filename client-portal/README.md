# QuickCredit Client Portal

A modern, responsive self-service portal for QuickCredit Uganda borrowers built with React, TypeScript, and Tailwind CSS.

## Features

### 🔐 Authentication
- Secure login and registration
- Multi-step registration with personal and financial information
- Password reset functionality
- JWT-based authentication

### 📊 Dashboard
- Comprehensive overview of financial portfolio
- Real-time loan and savings statistics
- Quick action buttons for common tasks
- Recent activity feed
- Payment due notifications
- Credit score display

### 💰 Loan Management
- View all active and completed loans
- Detailed loan information (principal, balance, interest rate)
- Payment schedule tracking
- Next payment due alerts
- Direct payment links

### 📝 Loan Applications
- Step-by-step loan application process
- Application status tracking
- Document upload capability
- Application history

### 💳 Payments
- Multiple payment methods (Mobile Money, Bank Transfer)
- Payment history with transaction details
- Real-time payment status tracking
- Receipt download

### 🏦 Savings Accounts
- Savings account overview
- Transaction history
- Deposit and withdrawal functionality
- Interest tracking

### 👤 Profile Management
- Personal information updates
- Contact details management
- Security settings
- Notification preferences

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Routing**: React Router DOM
- **State Management**: React Context + Hooks
- **HTTP Client**: Axios
- **Icons**: Heroicons
- **Notifications**: React Hot Toast
- **Build Tool**: Vite
- **Testing**: Vitest

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Backend API server running on port 3002

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test
```

### Environment Setup

The client portal expects the backend API to be available at `http://localhost:3002`. The Vite dev server is configured to proxy API requests automatically.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Layout.tsx      # Main layout with sidebar and navigation
│   └── LoadingSpinner.tsx
├── hooks/              # Custom React hooks
│   └── useAuth.tsx     # Authentication context and hooks
├── pages/              # Route components
│   ├── Login.tsx       # Login page
│   ├── Register.tsx    # Registration page
│   ├── Dashboard.tsx   # Main dashboard
│   ├── Loans.tsx       # Loan management
│   ├── Applications.tsx # Loan applications
│   ├── Payments.tsx    # Payment management
│   ├── Savings.tsx     # Savings management
│   └── Profile.tsx     # User profile
├── services/           # API service layer
│   └── api.ts          # API client and endpoints
├── types/              # TypeScript type definitions
│   └── index.ts        # Shared interfaces and types
├── App.tsx             # Main app component with routing
├── main.tsx            # Application entry point
└── index.css           # Global styles and Tailwind
```

## Key Features Implementation

### Responsive Design
- Mobile-first approach
- Collapsible sidebar navigation
- Touch-friendly interfaces
- Optimized for various screen sizes

### Security
- JWT token-based authentication
- Automatic token refresh handling
- Secure API communication
- Protected routes

### User Experience
- Intuitive navigation
- Real-time data updates
- Loading states and error handling
- Toast notifications for user feedback
- Accessible UI components

### Performance
- Code splitting with React.lazy()
- Optimized bundle sizes
- Efficient state management
- Fast development with Vite HMR

## API Integration

The client portal integrates with the QuickCredit backend API for:

- **Authentication**: Login, registration, token verification
- **Dashboard**: Statistics and recent activity
- **Loans**: CRUD operations and payment tracking
- **Applications**: Loan application management
- **Payments**: Payment processing and history
- **Savings**: Account management and transactions
- **Notifications**: Real-time updates and alerts

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run test suite
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Generate coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

### Code Style

This project uses:
- ESLint for code linting
- TypeScript for type safety
- Prettier for code formatting (via ESLint)
- Conventional file naming

### Contributing

1. Follow the existing code style
2. Add TypeScript types for new components
3. Include tests for new functionality
4. Update documentation as needed

## Deployment

The client portal can be deployed to any static hosting service:

1. Run `npm run build` to create production build
2. Deploy the `dist` folder to your hosting service
3. Configure your server to serve `index.html` for all routes (SPA routing)
4. Set up environment variables for API endpoints if needed

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name portal.quickcredit.ug;
    root /var/www/quickcredit/client-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## License

This project is part of the QuickCredit Uganda loan management system.