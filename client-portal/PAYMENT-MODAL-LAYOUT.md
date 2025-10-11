# Payment Modal - Visual Layout Guide

## Payment Modal Structure

```
┌─────────────────────────────────────────────────────────────┐
│  MAKE A PAYMENT                                          [X] │  ← Gradient Header (Primary Color)
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Select Payment Method                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  📱 Mobile  │  │  💳 Bank    │  │  💵 Cash    │         │
│  │   Money     │  │  Transfer   │  │  Payment    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                               │
│  Mobile Money Provider                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     MTN     │  │    Airtel   │  │  Africell   │         │
│  │Mobile Money │  │    Money    │  │    Money    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│    (Yellow)          (Red)           (Blue)                  │
│                                                               │
│  Phone Number                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 📱 256 700 000 000                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  Enter your MTN Mobile Money number                          │
│                                                               │
│  Payment Amount (UGX)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 50000                                                │    │
│  └─────────────────────────────────────────────────────┘    │
│  [Next Payment: UGX 50,000] [Full Amount: UGX 200,000]      │
│                                                               │
│  Payment Summary                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Amount:                               UGX 50,000    │    │
│  │ Processing Fee:                             Free    │    │
│  │ ──────────────────────────────────────────────────  │    │
│  │ Total:                                UGX 50,000    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────┐  ┌──────────────────────────────────────┐    │
│  │  Cancel  │  │      Confirm Payment                  │    │
│  └──────────┘  └──────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Alternative Views

### Bank Transfer Selected:
```
┌─────────────────────────────────────────────────────────────┐
│  Select Payment Method                                        │
│  ┌─────────────┐  ┌═════════════┐  ┌─────────────┐         │
│  │  📱 Mobile  │  ║  💳 Bank    ║  │  💵 Cash    │         │
│  │   Money     │  ║  Transfer   ║  │  Payment    │         │
│  └─────────────┘  └═════════════┘  └─────────────┘         │
│                      (Selected)                               │
│                                                               │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║ Bank Transfer Details                                  ║  │
│  ║                                                         ║  │
│  ║ Bank: Stanbic Bank Uganda                              ║  │
│  ║ Account Name: QuickCredit Ltd                          ║  │
│  ║ Account Number: 9030007654321                          ║  │
│  ║ Reference: Your Loan ID                                ║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│  (Blue Info Box)                                              │
│                                                               │
│  Payment Amount (UGX)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 50000                                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Cash Payment Selected:
```
┌─────────────────────────────────────────────────────────────┐
│  Select Payment Method                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌═════════════┐         │
│  │  📱 Mobile  │  │  💳 Bank    │  ║  💵 Cash    ║         │
│  │   Money     │  │  Transfer   │  ║  Payment    ║         │
│  └─────────────┘  └─────────────┘  └═════════════┘         │
│                                        (Selected)             │
│                                                               │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║ Cash Payment Locations                                 ║  │
│  ║                                                         ║  │
│  ║ 📍 Main Office: Plot 123, Kampala Road                ║  │
│  ║ 📍 Branch Office: Ntinda Shopping Center              ║  │
│  ║                                                         ║  │
│  ║ Visit any of our locations during business hours      ║  │
│  ║ (Mon-Fri, 8AM-5PM)                                     ║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│  (Green Success Box)                                          │
│                                                               │
│  Payment Amount (UGX)                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 50000                                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Dashboard Integration

### Logo in Header:
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────┐                                                        │
│ │ QC │  Welcome back, Josephine! 👋                         │
│ │Logo│  Here's an overview of your financial portfolio      │
│ └────┘                                                        │
└─────────────────────────────────────────────────────────────┘
```

### Quick Actions with Payment Button:
```
┌─────────────────────────────────────────────────────────────┐
│ Quick Actions                                                 │
│                                                               │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│ │ 📝 Apply    │  │ 💳 Make     │  │ 💰 View     │          │
│ │   for Loan  │  │   Payment   │  │   Loans     │          │
│ │             │  │             │  │             │          │
│ │Submit a new │  │Pay via      │  │Check your   │          │
│ │loan app     │  │Mobile Money │  │loan details │          │
│ └─────────────┘  └─────────────┘  └─────────────┘          │
│                    (Triggers Modal)                           │
└─────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Payment Methods:
- **Mobile Money**: Primary Blue (#3B82F6)
- **Bank Transfer**: Primary Blue (#3B82F6)
- **Cash Payment**: Primary Blue (#3B82F6)

### Mobile Providers:
- **MTN**: Yellow/Gold (#F59E0B)
- **Airtel**: Red (#EF4444)
- **Africell**: Blue (#3B82F6)

### Info Boxes:
- **Bank Details**: Blue (#3B82F6 bg, #1E40AF text)
- **Cash Locations**: Green (#10B981 bg, #065F46 text)
- **Payment Summary**: Gray (#F3F4F6 bg, #111827 text)

### Buttons:
- **Confirm Payment**: Primary (#16A34A) with hover effect
- **Cancel**: Gray border (#D1D5DB) with hover effect

## Responsive Behavior

### Desktop (≥640px):
- Modal: 32rem (512px) width
- Payment methods: 3 columns
- Full layout as shown

### Mobile (<640px):
- Modal: Full width with padding
- Payment methods: Stack vertically
- Larger touch targets
- Simplified spacing

## Accessibility Features

✅ **Keyboard Navigation**: Tab through all interactive elements
✅ **ARIA Labels**: Screen reader support
✅ **Focus Indicators**: Clear visual focus states
✅ **Color Contrast**: WCAG AA compliant
✅ **Touch Targets**: Minimum 44x44px for mobile
✅ **Error Messages**: Clear validation feedback
✅ **Loading States**: Visual feedback during processing

## Animation Timeline

1. **Modal Open**: Fade in + scale (200ms)
2. **Background Overlay**: Fade in (150ms)
3. **Method Selection**: Border color change (100ms)
4. **Provider Selection**: Background + border (100ms)
5. **Button Hover**: Color shift (150ms)
6. **Processing State**: Button disabled + text change
7. **Success**: Toast notification slide in from top
8. **Modal Close**: Fade out + scale (200ms)

---

**Note**: All measurements are in pixels unless otherwise specified.
Tailwind CSS classes are used throughout for consistent styling.
