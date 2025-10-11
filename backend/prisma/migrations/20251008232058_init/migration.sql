-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LOAN_OFFICER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "borrowers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "borrowerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "gender" TEXT,
    "dateOfBirth" DATETIME,
    "nationalId" TEXT,
    "district" TEXT,
    "subcounty" TEXT,
    "village" TEXT,
    "occupation" TEXT,
    "monthlyIncome" REAL,
    "creditRating" TEXT NOT NULL DEFAULT 'NO_CREDIT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "borrowers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "requestedAmount" REAL NOT NULL,
    "purpose" TEXT NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "approvedAmount" REAL,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "loan_applications_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "borrowers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loan_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "applicationId" TEXT,
    "borrowerId" TEXT NOT NULL,
    "loanOfficerId" TEXT NOT NULL,
    "principal" REAL NOT NULL,
    "interestRate" REAL NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "totalInterest" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "monthlyPayment" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT,
    "disbursedAt" DATETIME,
    "disbursedAmount" REAL,
    "outstandingBalance" REAL NOT NULL DEFAULT 0,
    "nextPaymentDate" DATETIME,
    "nextPaymentAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "loans_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "borrowers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_loanOfficerId_fkey" FOREIGN KEY ("loanOfficerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "repayments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptNumber" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "principalAmount" REAL,
    "interestAmount" REAL,
    "paymentMethod" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "repayments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "repayments_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "borrowers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "savings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "savingsId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "interestRate" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "savings_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "borrowers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_borrowerId_key" ON "borrowers"("borrowerId");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_phone_key" ON "borrowers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "borrowers_nationalId_key" ON "borrowers"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_applicationId_key" ON "loan_applications"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "loans_loanId_key" ON "loans"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "loans_applicationId_key" ON "loans"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "repayments_receiptNumber_key" ON "repayments"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "savings_savingsId_key" ON "savings"("savingsId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expenseId_key" ON "expenses"("expenseId");
