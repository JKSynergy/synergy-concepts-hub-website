# QuickCredit Loan Management System - Business Logic Documentation

## Auto-Population and Calculation Rules

This document outlines the complete business logic for auto-populating loan financial values in the QuickCredit system, based on analysis of the CSV data and business requirements.

## Core Business Rules

### 1. Projected Profits Calculation
**Formula:** `Principal × Monthly Interest Rate × Term (in months)`

**Examples:**
- Loan of UGX 250,000 at 15% for 1 month = 250,000 × 0.15 × 1 = UGX 37,500
- Loan of UGX 260,000 at 34% for 5 months = 260,000 × 0.34 × 5 = UGX 442,000

**Implementation:**
```typescript
const projectedProfits = Math.round(principal * monthlyInterestRate * termInMonths);
```

### 2. Realized Profits Calculation
**Key Rule:** Realized profits are ONLY calculated when a loan is marked as "Closed"

**Business Logic:**
- **"Closed" loans:** `Total Payments Received - Principal Amount`
- **"Pending Overdue" loans:** Always UGX 0 (regardless of payments made)
- **"Active" loans:** Always UGX 0 (until loan is closed)
- **All other statuses:** UGX 0

**Critical Condition:** A loan can only show realized profits when it is truly "Closed"

### 3. Loan Closure Conditions
A loan can ONLY be marked as "Closed" when BOTH conditions are met:

1. **Outstanding Balance = UGX 0**
2. **No pending overdue records exist** (checked via Overdue Records sheet)

**Implementation:**
```typescript
const canBeClosed = (outstandingBalance === 0) && (!hasOverdueRecords);
```

### 4. Outstanding Balance Calculation
**Formula:** `(Principal + Projected Profits) - Total Payments Received`

**Status-based behavior:**
- **"Closed" loans:** Always UGX 0
- **"Active/Pending" loans:** Calculated based on payments received
- **"Pending Overdue" loans:** Reflects remaining amount including interest

### 5. Loan Status Determination

#### "Closed"
- Outstanding balance = UGX 0
- No entries in Overdue Records sheet
- Realized profits can be calculated

#### "Pending Overdue"
- Has entries in Overdue Records sheet
- Outstanding balance > UGX 0
- Realized profits = UGX 0

#### "Active"
- Making regular payments
- Within due date terms
- No overdue records
- Realized profits = UGX 0

#### "Defaulted"
- Recovery phase
- May have partial payments
- Realized profits = Recovery Amount - Principal (if any)

## Data Relationships

### Loans Sheet → Overdue Records Sheet
The Overdue Records sheet determines if a loan has pending overdue status:

```csv
Loan ID: LN013 (from Loans sheet)
Status: "Pending Overdue"
Outstanding Balance: "UGX 640,000"

Overdue Records entries for LN013:
- Multiple cycles with payment history
- Closing principal amounts
- Overdue interest calculations
```

### Business Rule Validation
Before marking a loan as "Closed":
1. Verify outstanding balance = UGX 0
2. Check Overdue Records sheet for any entries with that Loan ID
3. Only if both conditions pass, mark as "Closed" and calculate realized profits

## Auto-Population Functions

### For New Loan Creation
```typescript
const newLoanValues = autoPopulateNewLoan({
  principal: 250000,
  monthlyInterestRate: 0.15,
  termInMonths: 1
});

// Returns:
// {
//   projectedProfits: 37500,
//   realizedProfits: 0,          // Always 0 for new loans
//   outstandingBalance: 287500,   // Principal + projected profits
//   totalProfit: 0,
//   shouldBeClosed: false,
//   shouldBePendingOverdue: false
// }
```

### For Loan Status Updates
```typescript
const updatedValues = autoPopulateFromPayments(
  { principal: 250000, monthlyInterestRate: 0.15, termInMonths: 1, status: 'Active' },
  { 
    totalPaymentsReceived: 287500, 
    principalPaid: 250000, 
    additionalFees: 0,
    hasOverdueRecords: false  // Key field for business logic
  }
);

// If hasOverdueRecords = false and totalPaymentsReceived = full amount:
// Status should be "Closed", realizedProfits = 37500
```

### For Status Change Validation
```typescript
const closureValidation = await validateLoanClosureConditions(loanId, outstandingBalance);

// Returns:
// {
//   canBeClosed: boolean,
//   reasons: ["Outstanding balance is 5000", "Has 2 overdue records"],
//   recommendations: ["Collect remaining payments", "Resolve overdue records"]
// }
```

## Implementation Guidelines

### 1. Always Check Overdue Records
Before any status change or realized profit calculation:
```typescript
const hasOverdue = await hasOverdueRecords(loanId);
const shouldBeClosed = (outstandingBalance === 0) && !hasOverdue;
```

### 2. Realized Profits Logic
```typescript
if (status === 'Closed' && !hasOverdueRecords && outstandingBalance === 0) {
  realizedProfits = totalPaymentsReceived - principal;
} else {
  realizedProfits = 0;
}
```

### 3. Form Auto-Fill
When creating loan forms, auto-populate:
- Projected profits (immediately calculable)
- Set realized profits to 0
- Set status to "Pending"
- Calculate total amount due

### 4. Status Update Workflow
1. Check current outstanding balance
2. Query overdue records
3. Determine correct status based on business rules
4. Update realized profits only if status = "Closed"
5. Validate closure conditions before finalizing

## Data Integrity Checks

### Validation Points
- Projected profits should always match: Principal × Rate × Term
- Realized profits should be 0 unless status = "Closed"
- "Closed" loans must have zero outstanding balance
- "Pending Overdue" loans must exist in Overdue Records sheet
- No loan should have realized profits > projected profits (unless additional fees)

### Automated Validation
```typescript
const validation = validateAutoCalculations(loanInput, paymentInfo, existingValues);
// Returns match percentages and recommendations for data cleanup
```

## Future Enhancements

1. **Real-time Overdue Detection:** Automatically create overdue records when due dates pass
2. **Payment Integration:** Auto-update loan status when payments are processed
3. **Bulk Status Updates:** Process multiple loans for closure validation
4. **Audit Trail:** Track status changes and profit calculations
5. **Interest Recalculation:** Handle interest adjustments for overdue loans

## API Endpoints Needed

- `GET /api/overdue-records?loanId={id}` - Check for overdue records
- `POST /api/loans/{id}/validate-closure` - Validate closure conditions
- `PUT /api/loans/{id}/status` - Update loan status with business rule validation
- `GET /api/loans/{id}/auto-calculations` - Get auto-calculated values for comparison

This documentation ensures consistent implementation of QuickCredit's business logic across all loan management operations.