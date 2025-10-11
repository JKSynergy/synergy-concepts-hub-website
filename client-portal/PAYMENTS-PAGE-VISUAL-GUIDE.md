# Payments Page - Visual Layout Guide

## Page Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PAYMENTS PAGE                                                               │
│ Payments                                                                    │
│ Make payments and view transaction history                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ ACCOUNT SUMMARY (3 Cards - Grid)                                           │
├─────────────────────┬─────────────────────┬──────────────────────────────┤
│ 💰 Outstanding     │ ⏰ Next Payment    │ ✅ Total Paid                │
│    Balance         │    Due             │                              │
│ UGX 200,000        │ UGX 50,000         │ UGX 150,000                  │
│ (Blue gradient)    │ (Green gradient)   │ (Purple gradient)            │
└─────────────────────┴─────────────────────┴──────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ MAKE A PAYMENT                                                              │
│ Choose your preferred payment method below                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Select Payment Method                                                       │
│ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│ │   📱 Mobile       │ │   💳 Bank         │ │   💵 Cash         │        │
│ │     Money         │ │    Transfer       │ │    Payment        │        │
│ │                   │ │                   │ │                   │        │
│ │ Instant payment   │ │ 1-2 business days │ │ Visit our office  │        │
│ └───────────────────┘ └───────────────────┘ └───────────────────┘        │
│                                                                             │
│ Choose Mobile Money Provider                                                │
│ ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│ │      MTN          │ │     Airtel        │ │    Africell       │        │
│ │  Mobile Money     │ │     Money         │ │     Money         │        │
│ │   Dial *165#      │ │   Dial *185#      │ │   Dial *144#      │        │
│ └───────────────────┘ └───────────────────┘ └───────────────────┘        │
│   (Yellow)              (Red)                 (Blue)                       │
│                                                                             │
│ Phone Number                                                                │
│ ┌─────────────────────────────────────────────────────────────────┐       │
│ │ 📱  256 700 000 000                                              │       │
│ └─────────────────────────────────────────────────────────────────┘       │
│ Enter your MTN Mobile Money registered number                              │
│                                                                             │
│ Payment Amount (UGX)                                                        │
│ ┌─────────────────────────────────────────────────────────────────┐       │
│ │ UGX  50,000                                                      │       │
│ └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│ Quick Select:                                                               │
│ [Next Payment: UGX 50,000] [Full Balance: UGX 200,000] [Half: UGX 100,000]│
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐       │
│ │ Payment Summary                                                  │       │
│ │                                                                  │       │
│ │ Payment Method:                     MTN Mobile Money            │       │
│ │ Amount:                                      UGX 50,000         │       │
│ │ Processing Fee:                                    FREE         │       │
│ │ ─────────────────────────────────────────────────────────────  │       │
│ │ Total Amount:                                UGX 50,000         │       │
│ └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐       │
│ │              ✅ Confirm Payment                                  │       │
│ └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ PAYMENT HISTORY                                                             │
│ Your recent payment transactions                                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌──────────┬─────────────────────┬─────────────────┬────────────┬────────┐│
│ │   Date   │     Reference       │     Method      │   Amount   │ Status ││
│ ├──────────┼─────────────────────┼─────────────────┼────────────┼────────┤│
│ │ Oct 1    │ MTN-20251001-001    │ MTN Mobile Money│ UGX 50,000 │ ✅ Done││
│ │ Sep 15   │ AIRTEL-20250915-002 │ Airtel Money    │ UGX 50,000 │ ✅ Done││
│ │ Sep 1    │ BANK-20250901-003   │ Bank Transfer   │ UGX 50,000 │ ✅ Done││
│ └──────────┴─────────────────────┴─────────────────┴────────────┴────────┘│
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

## Alternative Views

### When Bank Transfer is Selected:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Select Payment Method                                                       │
│ ┌───────────────────┐ ┌═══════════════════┐ ┌───────────────────┐        │
│ │   📱 Mobile       │ ║   💳 Bank         ║ │   💵 Cash         │        │
│ │     Money         │ ║    Transfer       ║ │    Payment        │        │
│ └───────────────────┘ └═══════════════════┘ └───────────────────┘        │
│                          (Selected - Blue)                                  │
│                                                                             │
│ ╔══════════════════════════════════════════════════════════════════════╗  │
│ ║ 💳 Bank Transfer Details                                             ║  │
│ ║                                                                       ║  │
│ ║ Bank Name:           Stanbic Bank Uganda                            ║  │
│ ║ Account Name:        QuickCredit Ltd                                ║  │
│ ║ Account Number:      9030007654321                                  ║  │
│ ║ Reference:           Your Loan ID / Josephine                       ║  │
│ ║                                                                       ║  │
│ ║ ⚠️ Important: Please include your name or loan ID in the transfer   ║  │
│ ║    reference for easy identification.                                ║  │
│ ╚══════════════════════════════════════════════════════════════════════╝  │
│ (Blue Information Box)                                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

### When Cash Payment is Selected:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Select Payment Method                                                       │
│ ┌───────────────────┐ ┌───────────────────┐ ┌═══════════════════┐        │
│ │   📱 Mobile       │ │   💳 Bank         │ ║   💵 Cash         ║        │
│ │     Money         │ │    Transfer       │ ║    Payment        ║        │
│ └───────────────────┘ └───────────────────┘ └═══════════════════┘        │
│                                                (Selected - Green)            │
│                                                                             │
│ ╔══════════════════════════════════════════════════════════════════════╗  │
│ ║ 💵 Cash Payment Locations                                            ║  │
│ ║                                                                       ║  │
│ ║ ┌──────────────────────────────────────────────────────────────┐   ║  │
│ ║ │ 📍 Main Office                                                │   ║  │
│ ║ │    Plot 123, Kampala Road                                     │   ║  │
│ ║ │    Kampala, Uganda                                            │   ║  │
│ ║ └──────────────────────────────────────────────────────────────┘   ║  │
│ ║                                                                       ║  │
│ ║ ┌──────────────────────────────────────────────────────────────┐   ║  │
│ ║ │ 📍 Branch Office                                              │   ║  │
│ ║ │    Ntinda Shopping Center, Ground Floor                       │   ║  │
│ ║ │    Kampala, Uganda                                            │   ║  │
│ ║ └──────────────────────────────────────────────────────────────┘   ║  │
│ ║                                                                       ║  │
│ ║ 🕒 Business Hours: Monday - Friday, 8:00 AM - 5:00 PM               ║  │
│ ║                    Saturday, 9:00 AM - 1:00 PM                      ║  │
│ ╚══════════════════════════════════════════════════════════════════════╝  │
│ (Green Success Box)                                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### Account Summary Cards (Top)
```
Card 1: Outstanding Balance (Blue)
├── Icon: 💰 (Top right, white bg circle)
├── Label: "Outstanding Balance" (Small, blue-600)
├── Amount: "UGX 200,000" (2xl, bold, blue-900)
└── Gradient: from-blue-50 to-blue-100

Card 2: Next Payment Due (Green)
├── Icon: ⏰ (Top right, white bg circle)
├── Label: "Next Payment Due" (Small, green-600)
├── Amount: "UGX 50,000" (2xl, bold, green-900)
└── Gradient: from-green-50 to-green-100

Card 3: Total Paid (Purple)
├── Icon: ✅ (Top right, white bg circle)
├── Label: "Total Paid" (Small, purple-600)
├── Amount: "UGX 150,000" (2xl, bold, purple-900)
└── Gradient: from-purple-50 to-purple-100
```

### Payment Method Cards (Large)
```
Each Card:
├── Icon: 12x12 (h-12 w-12), primary-600
├── Title: Base font, semibold
├── Description: XS font, gray-500
├── Padding: 6 (p-6)
├── Border: 2px
├── Border Radius: XL (rounded-xl)
└── States:
    ├── Default: border-gray-200
    ├── Hover: border-gray-300 + shadow-sm
    └── Selected: border-primary-500 + bg-primary-50 + shadow-md
```

### Mobile Provider Cards (Medium)
```
Each Card:
├── Provider Name: 4xl font, bold, brand color
├── Service Name: SM font, gray-600
├── USSD Code: XS font, gray-500
├── Padding: 6 (p-6)
├── Border: 2px
├── Border Radius: XL (rounded-xl)
└── States:
    ├── Default: border-gray-200
    ├── Hover: border-gray-300 + shadow-sm
    └── Selected: border-[brand] + bg-[brand]-50 + shadow-md

MTN:    Yellow (#F59E0B)
Airtel: Red (#EF4444)
Africell: Blue (#3B82F6)
```

### Form Inputs
```
Phone Number Input:
├── Icon: Left side (📱)
├── Placeholder: "256 700 000 000"
├── Height: 3 (py-3)
├── Border: 1px gray-300
├── Border Radius: LG (rounded-lg)
└── Focus: ring-2 ring-primary-500

Amount Input:
├── Prefix: "UGX" (Left side, text-lg)
├── Placeholder: "50,000"
├── Height: 3 (py-3)
├── Font Size: LG (text-lg)
├── Border: 1px gray-300
├── Border Radius: LG (rounded-lg)
└── Focus: ring-2 ring-primary-500
```

### Quick Select Buttons
```
Button Style:
├── Padding: px-4 py-2
├── Font: SM, medium
├── Border Radius: Full (rounded-full)
├── Background: primary-100 (first) / gray-100 (others)
├── Text: primary-700 (first) / gray-700 (others)
└── Hover: Darker background

Buttons:
1. "Next Payment: UGX 50,000" (Primary blue)
2. "Full Balance: UGX 200,000" (Gray)
3. "Half Payment: UGX 100,000" (Gray)
```

### Payment Summary Box
```
Container:
├── Background: Gray-50
├── Border: 1px gray-200
├── Border Radius: XL (rounded-xl)
├── Padding: 6 (p-6)
└── Content:
    ├── Title: "Payment Summary" (SM, semibold)
    ├── Rows (space-y-3):
    │   ├── Payment Method: [value]
    │   ├── Amount: [formatted currency]
    │   └── Processing Fee: FREE (green-600)
    ├── Divider: border-t border-gray-300
    └── Total: 
        ├── Label: "Total Amount" (semibold)
        └── Value: XL, bold, primary-600
```

### Submit Button
```
Full Width Button:
├── Width: w-full
├── Padding: py-4 px-6
├── Background: primary-600
├── Text: White, semibold, LG
├── Border Radius: XL (rounded-xl)
├── Icon: CheckCircle (left side)
├── Hover: primary-700
├── Disabled: gray-400
└── Processing State:
    ├── Icon: ArrowPath (spinning)
    └── Text: "Processing Payment..."
```

### Payment History Table
```
Table Structure:
├── Header Row (bg-gray-50):
│   ├── Date
│   ├── Reference (monospace)
│   ├── Method
│   ├── Amount
│   └── Status
└── Data Rows:
    ├── Hover: bg-gray-50
    ├── Date: Formatted (Oct 1, 2025)
    ├── Reference: Monospace font
    ├── Method: Regular text
    ├── Amount: Semibold, currency formatted
    └── Status:
        ├── Icon: CheckCircle/Clock/XCircle
        └── Badge: Pill-shaped, colored
            ├── Completed: green-100/green-800
            ├── Pending: yellow-100/yellow-800
            └── Failed: red-100/red-800
```

## Color Reference

### Status Colors:
```
Completed:
├── Icon: text-green-500
└── Badge: bg-green-100 text-green-800

Pending:
├── Icon: text-yellow-500
└── Badge: bg-yellow-100 text-yellow-800

Failed:
├── Icon: text-red-500
└── Badge: bg-red-100 text-red-800
```

### Provider Brand Colors:
```
MTN:
├── Primary: #F59E0B (yellow-500)
├── Light: #FEF3C7 (yellow-50)
└── Border: #F59E0B (yellow-500)

Airtel:
├── Primary: #EF4444 (red-500)
├── Light: #FEE2E2 (red-50)
└── Border: #EF4444 (red-500)

Africell:
├── Primary: #3B82F6 (blue-500)
├── Light: #DBEAFE (blue-50)
└── Border: #3B82F6 (blue-500)
```

### Information Box Colors:
```
Bank Transfer Box:
├── Background: #DBEAFE (blue-50)
├── Border: #BFDBFE (blue-200)
├── Text: #1E40AF (blue-800)
└── Label: #2563EB (blue-600)

Cash Payment Box:
├── Background: #D1FAE5 (green-50)
├── Border: #A7F3D0 (green-200)
├── Text: #065F46 (green-800)
└── Label: #059669 (green-600)

Payment Summary Box:
├── Background: #F9FAFB (gray-50)
├── Border: #E5E7EB (gray-200)
└── Text: #111827 (gray-900)
```

## Responsive Breakpoints

### Desktop (≥768px):
```
├── 3-column grid (payment methods)
├── 3-column grid (providers)
├── 3-column grid (summary cards)
├── Full-width table
└── Side-by-side layouts
```

### Tablet (640px-768px):
```
├── 2-column grids
├── Adjusted spacing
├── Scrollable table
└── Optimized padding
```

### Mobile (<640px):
```
├── 1-column layout
├── Stacked cards
├── Full-width buttons
├── Touch targets: 44px min
├── Horizontal scroll table
└── Larger tap areas
```

---

**Visual Design Principles Applied:**
1. ✅ Clear visual hierarchy
2. ✅ Consistent spacing (4/6 unit system)
3. ✅ Color psychology (green=success, blue=info, etc.)
4. ✅ Progressive disclosure
5. ✅ Adequate white space
6. ✅ Touch-friendly targets
7. ✅ Brand color integration
8. ✅ Accessibility compliant

---

*All measurements in Tailwind CSS units*
*Colors follow Tailwind CSS palette*
