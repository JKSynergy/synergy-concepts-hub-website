import React, { useState, useEffect } from 'react';
import { AlertTriangle, Search, Filter, Download, Eye, Phone, Mail, FileText, MessageCircle } from 'lucide-react';
import { useOverdue } from '../contexts/OverdueContext';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import logoImage from '../assets/Quick Credit Logo Round.png';

// Type declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

// Helper function to calculate actual loan status - matches loans table logic
const calculateActualStatus = (loan: any, currentDate: Date = new Date()): string => {
  // Parse outstanding balance - handle various formats
  const outstandingBalance = loan.outstandingBalance || 0;
  
  // If no outstanding balance, loan is completed/closed
  if (outstandingBalance <= 0) {
    return 'CLOSED';
  }
  
  // Calculate days overdue if there's a due date
  // Check both dueDate and nextPaymentDate fields
  const dueDateField = loan.dueDate || loan.nextPaymentDate;
  if (dueDateField) {
    const dueDate = new Date(dueDateField);
    
    // Only calculate overdue if date is valid
    if (!isNaN(dueDate.getTime())) {
      const diffTime = currentDate.getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Determine status based on conditions
      if (daysOverdue > 0 && outstandingBalance > 0) {
        return 'OVERDUE';
      } else if (outstandingBalance > 0 && daysOverdue <= 0) {
        return 'ACTIVE';
      }
    }
  }
  
  // Default to active if has outstanding balance
  return outstandingBalance > 0 ? 'ACTIVE' : 'CLOSED';
};

// Helper function to generate overdue cycle details
const generateOverdueDetails = (loan: any, daysOverdue: number, totalCycles: number) => {
  const details = [];
  const monthlyPayment = parseFloat(loan.monthlyPayment) || 0;
  const startDate = loan.nextPaymentDate ? new Date(loan.nextPaymentDate) : (loan.dueDate ? new Date(loan.dueDate) : new Date());
  
  for (let cycle = 1; cycle <= totalCycles; cycle++) {
    const cycleDate = new Date(startDate);
    cycleDate.setMonth(cycleDate.getMonth() - (totalCycles - cycle));
    
    const cycleDaysOverdue = Math.max(0, Math.floor((new Date().getTime() - cycleDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    details.push({
      cycle: cycle,
      dueDate: cycleDate.toISOString().split('T')[0],
      amount: monthlyPayment,
      daysOverdue: cycleDaysOverdue
    });
  }
  
  return details;
};

interface OverdueItem {
  loanId: string;
  borrowerId: string;
  customerName: string;
  phone?: string;
  email?: string;
  amount: number;
  totalAmount: number;
  outstandingBalance: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  daysOverdue: number;
  status: string;
  totalRepayments: number;
  interestRate: number;
  termMonths: number;
  monthlyPayment: number;
  createdAt: string;
  disbursedAt?: string;
  totalOverdueCycles: number;
  overdueDetails: Array<{
    cycle: number;
    dueDate: string;
    amount: number;
    daysOverdue: number;
  }>;
}

const Overdue: React.FC = () => {
  const [overdueItems, setOverdueItems] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDays, setFilterDays] = useState<string>('all');
  const [selectedLoan, setSelectedLoan] = useState<OverdueItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const rowsPerPage = 12;
  
  const { refreshOverdueCount } = useOverdue();

  // Reset pagination when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterDays]);

  // Reset modal pagination when selected loan changes
  useEffect(() => {
    setModalCurrentPage(1);
  }, [selectedLoan]);

  useEffect(() => {
    const loadOverdueData = async () => {
      try {
        setLoading(true);
        
        // Fetch overdue loans from new dedicated endpoint
        const response = await fetch('http://localhost:3002/api/overdue');
        if (!response.ok) {
          throw new Error('Failed to fetch overdue loans');
        }
        const overdueLoans = await response.json();
        
        // Transform to match our interface
        const formattedLoans = overdueLoans.map((loan: any) => {
          const totalOverdueCycles = Math.floor(loan.daysOverdue / 30) + 1;
          
          return {
            loanId: loan.loanId,
            borrowerId: loan.borrowerId,
            customerName: loan.customerName,
            phone: loan.contact,
            email: '',
            amount: loan.principal || loan.outstandingBalance || 0,
            totalAmount: loan.principal || loan.outstandingBalance || 0,
            outstandingBalance: loan.outstandingBalance || 0,
            nextPaymentDate: loan.nextPaymentDate,
            nextPaymentAmount: 0,
            daysOverdue: loan.daysOverdue || 0,
            status: 'OVERDUE',
            totalRepayments: 0,
            interestRate: 0,
            termMonths: 0,
            monthlyPayment: 0,
            createdAt: '',
            disbursedAt: '',
            totalOverdueCycles,
            overdueDetails: generateOverdueDetails(loan, loan.daysOverdue, totalOverdueCycles)
          };
        });
        
        console.log(`Found ${formattedLoans.length} overdue loans`);
        setOverdueItems(formattedLoans);
        
        // Refresh the context count to keep sidebar in sync
        await refreshOverdueCount();
      } catch (error) {
        console.error('Failed to load overdue data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOverdueData();
  }, []);

  const filteredItems = overdueItems.filter(item => {
    const matchesSearch = item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.loanId.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = true;
    if (filterDays !== 'all') {
      const days = parseInt(filterDays);
      if (filterDays === '30+') {
        matchesFilter = item.daysOverdue >= 30;
      } else {
        const ranges = {
          '1-7': [1, 7],
          '8-14': [8, 14],
          '15-30': [15, 30]
        };
        const range = ranges[filterDays as keyof typeof ranges];
        if (range) {
          matchesFilter = item.daysOverdue >= range[0] && item.daysOverdue <= range[1];
        }
      }
    }
    
    return matchesSearch && matchesFilter;
  });

  const totalOverdueAmount = filteredItems.reduce((sum, item) => sum + item.outstandingBalance, 0);

  const getDaysOverdueBadge = (days: number) => {
    if (days <= 7) return 'bg-yellow-50 text-yellow-900 border-yellow-500 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-500';
    if (days <= 14) return 'bg-orange-50 text-orange-900 border-orange-500 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-500';
    if (days <= 30) return 'bg-red-50 text-red-900 border-red-500 dark:bg-red-900/20 dark:text-red-300 dark:border-red-500';
    return 'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-600';
  };

  // PDF Generation Functions
  const generatePDF = async (loan: OverdueItem) => {
    console.log('Starting PDF generation for loan:', loan.loanId);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Helper function to parse dates
    const parseDate = (dateStr: string): string => {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        return new Date(year, month, day).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      return dateStr;
    };

    // Function to load image as base64
    const getImageDataURL = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    try {
      // Load and add logo
      const logoDataURL = await getImageDataURL(logoImage);
      doc.addImage(logoDataURL, 'PNG', 20, 15, 25, 25);
    } catch (error) {
      console.warn('Could not load logo:', error);
    }

    // Company Header
    doc.setTextColor(76, 139, 76); // Green color
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('QUICK CREDIT', 50, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('FAST LOANS, FASTER SOLUTIONS!', 50, 32);

    // Contact Information (right side)
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    const contactInfo = [
      '0704 783 734  |  0752 796 523  |  0783 675 964'
    ];
    
    contactInfo.forEach((info, index) => {
      const textWidth = doc.getTextWidth(info);
      doc.text(info, pageWidth - textWidth - 20, 25 + (index * 5));
    });

    // Draw header line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 45, pageWidth - 20, 45);

    // Document Title
    let yPosition = 60;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    
    // Alert icon and title
    doc.setFillColor(255, 69, 58); // Red background
    doc.circle(25, yPosition, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('!', 24, yPosition + 1);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('OVERDUE SCHEDULE', 35, yPosition + 2);

    yPosition += 20;

    // Customer Information
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dear ${loan.customerName.toUpperCase()},`, 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.text('This is a formal notice that your loan account has an outstanding overdue balance. Please review the schedule below.', 20, yPosition);
    yPosition += 20;

    // Loan Information Box
    doc.setFillColor(248, 249, 250);
    doc.rect(20, yPosition, pageWidth - 40, 30, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(20, yPosition, pageWidth - 40, 30);

    yPosition += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Loan ID:', 25, yPosition);
    doc.setFont('helvetica', 'normal');
    doc.text(loan.loanId, 55, yPosition);

    doc.setFont('helvetica', 'bold');
    doc.text('Customer:', 25, yPosition + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(loan.customerName.toUpperCase(), 55, yPosition + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('Origination Date:', 25, yPosition + 16);
    doc.setFont('helvetica', 'normal');
    doc.text('2024-12-24', 70, yPosition + 16); // You might want to get this from actual data

    yPosition += 35;

    // Table Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Detailed overdue schedule for loan ${loan.loanId}`, 20, yPosition);
    yPosition += 15;

    // Table with autoTable
    const tableData = loan.overdueDetails?.map(cycle => [
      cycle.cycle.toString(),
      '15.00%',
      parseDate(cycle.dueDate),
      parseDate(cycle.dueDate),
      `UGX ${((cycle.amount || 0) + 100000).toLocaleString()}`,
      `UGX ${Math.round((cycle.amount || 0) * 0.15).toLocaleString()}`,
      `UGX ${(cycle.amount || 0).toLocaleString()}`,
      'UGX 0',
      `UGX ${Math.round((cycle.amount || 0) * 0.1).toLocaleString()}`,
      `UGX ${(cycle.amount || 0).toLocaleString()}`
    ]) || [];

    // Use autoTable for better formatting
    doc.autoTable({
      startY: yPosition,
      head: [[
        'Cycle', 'Interest Rate', 'Period Start', 'Due Date', 'Opening Principal',
        'Interest', 'Gross Due', 'Payments', 'Overdue Interest', 'Closing Principal'
      ]],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [76, 139, 76],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 7,
        halign: 'center'
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 20 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 25 },
        5: { cellWidth: 18 },
        6: { cellWidth: 22 },
        7: { cellWidth: 20 },
        8: { cellWidth: 25 },
        9: { cellWidth: 25 }
      },
      margin: { left: 20, right: 20 }
    });

    yPosition = doc.lastAutoTable.finalY + 15;

    // Total Section
    doc.setFillColor(255, 245, 245);
    doc.rect(pageWidth - 120, yPosition, 100, 12, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(pageWidth - 120, yPosition, 100, 12);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 69, 58);
    doc.text('Total Overdue Interest:', pageWidth - 115, yPosition + 8);
    doc.text(`UGX ${(loan.amount || 0).toLocaleString()}`, pageWidth - 55, yPosition + 8);

    yPosition += 25;

    // Note
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Note: Your most recent closing principal is your current balance.', 20, yPosition);

    yPosition += 15;

    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Authorized By: Credit Administration', 20, yPosition);

    // Footer line and company info
    doc.setDrawColor(200, 200, 200);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    
    doc.setTextColor(76, 139, 76);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Quick Credit Loan Management System', 20, pageHeight - 15);
    
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}`, 20, pageHeight - 8);
    
    return doc;
  };

  const downloadPDF = async (loan: OverdueItem) => {
    try {
      console.log('downloadPDF called for:', loan.loanId);
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      
      // Helper function to parse dates
      const parseDate = (dateStr: string): string => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          const year = parseInt(parts[2]);
          return new Date(year, month, day).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        }
        return dateStr;
      };

      // Try to load and add logo
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve) => {
          img.onload = () => {
            try {
              doc.addImage(img, 'PNG', 20, 15, 25, 25);
            } catch (e) {
              console.warn('Could not add logo to PDF:', e);
            }
            resolve();
          };
          img.onerror = () => {
            console.warn('Could not load logo, continuing without it');
            resolve();
          };
          img.src = logoImage;
        });
      } catch (error) {
        console.warn('Logo loading failed:', error);
      }

      // Company Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(76, 139, 76); // Green color
      doc.text('QUICKCREDIT', 55, 25);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text('Loan Management System', 55, 32);
      
      // Contact Information
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Tel: +256 700 123 456 | +256 800 987 654', 55, 40);
      doc.text('Email: info@quickcredit.ug | Website: www.quickcredit.ug', 55, 45);
      
      let yPosition = 65;

      // Title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('OVERDUE LOAN STATEMENT', 20, yPosition);
      yPosition += 15;

      // Customer Information
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Borrower: ${loan.customerName}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Loan ID: ${loan.loanId}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Phone: ${loan.phone || 'N/A'}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Total Amount Due: UGX ${loan.amount?.toLocaleString() || 'N/A'}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Days Overdue: ${loan.daysOverdue}`, 20, yPosition);
      yPosition += 15;

      // Table with autoTable (only if we have overdue details)
      if (loan.overdueDetails && loan.overdueDetails.length > 0) {
        const tableData = loan.overdueDetails.map(cycle => [
          cycle.cycle.toString(),
          '15.00%',
          parseDate(cycle.dueDate),
          parseDate(cycle.dueDate),
          `UGX ${((cycle.amount || 0) + 100000).toLocaleString()}`,
          `UGX ${Math.round((cycle.amount || 0) * 0.15).toLocaleString()}`,
          `UGX ${(cycle.amount || 0).toLocaleString()}`,
          'UGX 0',
          `UGX ${Math.round((cycle.amount || 0) * 0.1).toLocaleString()}`,
          `UGX ${(cycle.amount || 0).toLocaleString()}`
        ]);

        // Use autoTable for better formatting
        doc.autoTable({
          startY: yPosition,
          head: [[
            'Cycle', 'Interest Rate', 'Period Start', 'Due Date', 'Opening Principal',
            'Interest', 'Gross Due', 'Payments', 'Overdue Interest', 'Closing Principal'
          ]],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [76, 139, 76],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
          },
          bodyStyles: {
            fontSize: 7,
            halign: 'center'
          },
          alternateRowStyles: {
            fillColor: [248, 249, 250]
          },
          columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 20 },
            2: { cellWidth: 22 },
            3: { cellWidth: 22 },
            4: { cellWidth: 25 },
            5: { cellWidth: 18 },
            6: { cellWidth: 22 },
            7: { cellWidth: 20 },
            8: { cellWidth: 25 },
            9: { cellWidth: 25 }
          },
          margin: { left: 20, right: 20 }
        });

        yPosition = doc.lastAutoTable.finalY + 15;
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('This is a computer-generated document. No signature required.', 20, pageHeight - 20);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, pageHeight - 15);

      console.log('Professional PDF created, generating blob...');
      
      // Generate PDF as blob and create proper download
      const pdfBlob = doc.output('blob');
      console.log('PDF blob created:', pdfBlob);
      
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Overdue_Notice_${loan.loanId}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.type = 'application/pdf';
      
      console.log('Triggering download...');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('PDF download completed successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      // Fallback to simple text version
      const content = `OVERDUE NOTICE - ${loan.loanId}\n\nCustomer: ${loan.customerName}\nAmount: UGX ${(loan.amount || 0).toLocaleString()}\nDays Overdue: ${loan.daysOverdue}`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Overdue_Notice_${loan.loanId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const shareViaWhatsApp = (loan: OverdueItem) => {
    const message = `*OVERDUE LOAN NOTICE*\n\nDear ${loan.customerName},\n\nThis is a reminder that your loan (${loan.loanId}) has ${loan.totalOverdueCycles} overdue cycle(s) totaling UGX ${(loan.amount || 0).toLocaleString()}.\n\nMaximum days overdue: ${loan.daysOverdue} days\n\nPlease contact us immediately to arrange payment.\n\nQuick Credit Loan Management System`;
    
    const phoneNumber = loan.phone?.replace(/\D/g, '') || '';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const sendEmail = (loan: OverdueItem) => {
    const subject = `Overdue Loan Notice - ${loan.loanId}`;
    const body = `Dear ${loan.customerName},

This is a formal notice regarding your overdue loan payment.

Loan Details:
- Loan ID: ${loan.loanId}
- Total Overdue Amount: UGX ${(loan.amount || 0).toLocaleString()}
- Total Overdue Cycles: ${loan.totalOverdueCycles}
- Maximum Days Overdue: ${loan.daysOverdue} days

${loan.overdueDetails?.map((cycle, index) => `
Cycle ${cycle.cycle}:
  Due Date: ${cycle.dueDate}
  Amount: UGX ${(cycle.amount || 0).toLocaleString()}
  Days Overdue: ${cycle.daysOverdue} days
`).join('') || ''}

Please contact us immediately to arrange payment and avoid further penalties.

Best regards,
Quick Credit Loan Management System`;

    const mailtoUrl = `mailto:${loan.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
  };

  const exportAllOverdue = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Function to load image as base64
    const getImageDataURL = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    try {
      // Load and add logo
      const logoDataURL = await getImageDataURL(logoImage);
      doc.addImage(logoDataURL, 'PNG', 20, 15, 25, 25);
    } catch (error) {
      console.warn('Could not load logo:', error);
    }

    // Company Header
    doc.setTextColor(76, 139, 76); // Green color
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('QUICK CREDIT', 50, 25);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('FAST LOANS, FASTER SOLUTIONS!', 50, 32);

    // Contact Information (right side)
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    const contactInfo = '0704 783 734  |  0752 796 523  |  0783 675 964';
    const textWidth = doc.getTextWidth(contactInfo);
    doc.text(contactInfo, pageWidth - textWidth - 20, 25);

    // Draw header line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 45, pageWidth - 20, 45);

    let yPosition = 60;
    
    // Document Title
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('OVERDUE LOANS REPORT', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 20;

    // Summary Section
    doc.setFillColor(248, 249, 250);
    doc.rect(20, yPosition, pageWidth - 40, 45, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(20, yPosition, pageWidth - 40, 45);

    yPosition += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString()}`, 25, yPosition);
    yPosition += 10;

    doc.setFont('helvetica', 'bold');
    doc.text(`Total Overdue Loans: ${filteredItems.length}`, 25, yPosition);
    yPosition += 8;
    doc.text(`Total Overdue Amount: UGX ${totalOverdueAmount.toLocaleString()}`, 25, yPosition);
    yPosition += 8;
    doc.text(`Total Overdue Cycles: ${filteredItems.reduce((sum, item) => sum + (item.totalOverdueCycles || 1), 0)}`, 25, yPosition);
    yPosition += 20;

    // Loan Details Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('LOAN DETAILS:', 20, yPosition);
    yPosition += 15;

    // Process each loan
    filteredItems.forEach((loan, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      // Loan header
      doc.setFillColor(76, 139, 76);
      doc.rect(20, yPosition, pageWidth - 40, 12, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}. ${loan.loanId} - ${loan.customerName}`, 25, yPosition + 8);
      
      yPosition += 12;

      // Loan details
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const details = [
        `Phone: ${loan.phone || 'N/A'}`,
        `Email: ${loan.email || 'N/A'}`,
        `Total Amount: UGX ${(loan.amount || 0).toLocaleString()}`,
        `Overdue Cycles: ${loan.totalOverdueCycles}`,
        `Max Days Overdue: ${loan.daysOverdue} days`
      ];

      details.forEach(detail => {
        doc.text(`   ${detail}`, 25, yPosition + 6);
        yPosition += 6;
      });

      yPosition += 10;
    });

    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    doc.setTextColor(76, 139, 76);
    doc.setFont('helvetica', 'bold');
    doc.text('Quick Credit Loan Management System', 20, pageHeight - 15);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('End of Report', 20, pageHeight - 8);

    // Generate PDF as blob and create proper download
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Overdue_Loans_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    link.type = 'application/pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-black">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 dark:bg-black min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Overdue Loans</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage and track overdue loan payments</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="relative">
              {/* Perfect circle background with gradient */}
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-xl font-bold text-white">
                  {filteredItems.length}
                </span>
              </div>
              {/* Small indicator for severity */}
              {filteredItems.length > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">!</span>
                </div>
              )}
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Overdue Loans</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {filteredItems.reduce((sum, item) => sum + (item.totalOverdueCycles || 1), 0)} cycles affected
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Requires immediate attention
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                UGX {totalOverdueAmount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">1-7 Days</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredItems.filter(item => item.daysOverdue >= 1 && item.daysOverdue <= 7).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">30+ Days</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredItems.filter(item => item.daysOverdue >= 30).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow mb-6 border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by customer name or loan ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              value={filterDays}
              onChange={(e) => setFilterDays(e.target.value)}
            >
              <option value="all">All Days Overdue</option>
              <option value="1-7">1-7 Days</option>
              <option value="8-14">8-14 Days</option>
              <option value="15-30">15-30 Days</option>
              <option value="30+">30+ Days</option>
            </select>
            <button 
              onClick={exportAllOverdue}
              className="px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg hover:from-primary-700 hover:to-primary-800 flex items-center gap-2 shadow-md transition-all duration-200"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Overdue Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Loan ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Days Overdue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span>Actions</span>
                    <div className="flex gap-1 opacity-60">
                      <Eye className="h-3 w-3" />
                      <FileText className="h-3 w-3" />
                      <MessageCircle className="h-3 w-3" />
                      <Mail className="h-3 w-3" />
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {(() => {
                // Pagination logic for main table
                const startIndex = (currentPage - 1) * rowsPerPage;
                const endIndex = startIndex + rowsPerPage;
                const paginatedItems = filteredItems.slice(startIndex, endIndex);
                
                return paginatedItems.map((item) => (
                <tr key={item.loanId} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 border-l-4 border-transparent hover:border-l-red-500">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">ID: {item.loanId}</span>
                      {item.daysOverdue > 90 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 rounded">
                          CRITICAL
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {item.customerName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    UGX {(item.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {(() => {
                      const parseDate = (dateStr: string): Date => {
                        if (!dateStr || dateStr.trim() === '') return new Date();
                        
                        // Handle DD/MM/YYYY format
                        const parts = dateStr.split('/');
                        if (parts.length === 3) {
                          const day = parseInt(parts[0]);
                          const month = parseInt(parts[1]) - 1;
                          const year = parseInt(parts[2]);
                          return new Date(year, month, day);
                        }
                        
                        return new Date(dateStr);
                      };
                      
                      const date = new Date(item.nextPaymentDate);
                      return date.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      });
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-2">
                      <div className={`relative overflow-hidden ${getDaysOverdueBadge(item.daysOverdue).replace('rounded-full', 'rounded-lg border-l-4')}`}>
                        <div className="px-4 py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-lg font-bold">
                                {isNaN(item.daysOverdue) ? '0' : item.daysOverdue}
                              </span>
                              <span className="text-xs opacity-90">
                                days overdue
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="w-2 h-2 rounded-full bg-current opacity-60"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {item.totalOverdueCycles && item.totalOverdueCycles > 1 && (
                        <div className="inline-flex items-center px-3 py-1 text-xs font-medium bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-md border border-gray-200 dark:border-gray-700">
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                          {item.totalOverdueCycles} cycles
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md bg-red-50 text-red-900 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                      {item.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      {item.phone && (
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title={item.phone}>
                          <Phone className="h-3 w-3" />
                          <span className="text-xs">Phone</span>
                        </div>
                      )}
                      {item.email && (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400" title={item.email}>
                          <Mail className="h-3 w-3" />
                          <span className="text-xs">Email</span>
                        </div>
                      )}
                      {!item.phone && !item.email && (
                        <span className="text-gray-400 text-xs">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setSelectedLoan(item);
                          setShowDetailsModal(true);
                        }}
                        className="inline-flex items-center justify-center w-8 h-8 text-primary-600 dark:text-primary-400 hover:text-white hover:bg-primary-600 dark:hover:bg-primary-500 rounded-full transition-colors duration-200"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      
                      <button 
                        onClick={() => downloadPDF(item)}
                        className="inline-flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-500 rounded-full transition-colors duration-200"
                        title="Download PDF"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      
                      {item.phone && (
                        <button 
                          onClick={() => shareViaWhatsApp(item)}
                          className="inline-flex items-center justify-center w-8 h-8 text-green-600 dark:text-green-400 hover:text-white hover:bg-green-600 dark:hover:bg-green-500 rounded-full transition-colors duration-200"
                          title="Send WhatsApp Message"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                      
                      {item.email && (
                        <button 
                          onClick={() => sendEmail(item)}
                          className="inline-flex items-center justify-center w-8 h-8 text-purple-600 dark:text-purple-400 hover:text-white hover:bg-purple-600 dark:hover:bg-purple-500 rounded-full transition-colors duration-200"
                          title="Send Email"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        
        {/* Pagination for main table */}
        {filteredItems.length > rowsPerPage && (
          <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-800 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(currentPage + 1, Math.ceil(filteredItems.length / rowsPerPage)))}
                disabled={currentPage === Math.ceil(filteredItems.length / rowsPerPage)}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{((currentPage - 1) * rowsPerPage) + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * rowsPerPage, filteredItems.length)}
                  </span> of{' '}
                  <span className="font-medium">{filteredItems.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {Array.from({ length: Math.ceil(filteredItems.length / rowsPerPage) }, (_, i) => i + 1)
                    .filter(page => {
                      const totalPages = Math.ceil(filteredItems.length / rowsPerPage);
                      if (totalPages <= 7) return true;
                      if (page === 1 || page === totalPages) return true;
                      if (page >= currentPage - 1 && page <= currentPage + 1) return true;
                      return false;
                    })
                    .map((page, index, array) => {
                      const showEllipsis = index > 0 && array[index - 1] !== page - 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && (
                            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                              ...
                            </span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              currentPage === page
                                ? 'z-10 bg-primary-50 dark:bg-primary-900 border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  <button
                    onClick={() => setCurrentPage(Math.min(currentPage + 1, Math.ceil(filteredItems.length / rowsPerPage)))}
                    disabled={currentPage === Math.ceil(filteredItems.length / rowsPerPage)}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No overdue loans found</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {searchTerm || filterDays !== 'all' 
              ? 'No overdue loans match your current search criteria.'
              : 'Great! All loans are up to date.'}
          </p>
        </div>
      )}

      {/* Cycle Details Modal */}
      {showDetailsModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Overdue Cycles - {selectedLoan.loanId}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadPDF(selectedLoan)}
                    className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 flex items-center gap-2 text-sm shadow-md transition-all duration-200"
                    title="Download PDF"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </button>
                  
                  {selectedLoan.phone && (
                    <button
                      onClick={() => shareViaWhatsApp(selectedLoan)}
                      className="px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 flex items-center gap-2 text-sm shadow-md transition-all duration-200"
                      title="Send WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </button>
                  )}
                  
                  {selectedLoan.email && (
                    <button
                      onClick={() => sendEmail(selectedLoan)}
                      className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 flex items-center gap-2 text-sm shadow-md transition-all duration-200"
                      title="Send Email"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </button>
                  )}
                  
                  <button
                    onClick={() => setShowDetailsModal(false)}
                    className="ml-2 px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-600 dark:text-gray-400">
                  Customer: <span className="font-semibold text-gray-900 dark:text-white">{selectedLoan.customerName}</span>
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  Total Overdue Cycles: <span className="font-semibold text-gray-900 dark:text-white">{selectedLoan.totalOverdueCycles}</span>
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cycle</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Days Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {(() => {
                      // Pagination logic for modal table
                      if (!selectedLoan.overdueDetails) return null;
                      const startIndex = (modalCurrentPage - 1) * rowsPerPage;
                      const endIndex = startIndex + rowsPerPage;
                      const paginatedCycles = selectedLoan.overdueDetails.slice(startIndex, endIndex);
                      
                      return paginatedCycles.map((cycle, index) => (
                      <tr key={index} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{cycle.cycle}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {(() => {
                            const parseDate = (dateStr: string): Date => {
                              const parts = dateStr.split('/');
                              if (parts.length === 3) {
                                const day = parseInt(parts[0]);
                                const month = parseInt(parts[1]) - 1;
                                const year = parseInt(parts[2]);
                                return new Date(year, month, day);
                              }
                              return new Date(dateStr);
                            };
                            
                            const date = parseDate(cycle.dueDate);
                            return date.toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            });
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          UGX {(cycle.amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className={`relative overflow-hidden ${getDaysOverdueBadge(cycle.daysOverdue).replace('rounded-full', 'rounded-lg border-l-4')}`}>
                            <div className="px-3 py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold">
                                    {cycle.daysOverdue}
                                  </span>
                                  <span className="text-xs opacity-90">
                                    days overdue
                                  </span>
                                </div>
                                <div className="text-right">
                                  <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      )
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination for modal table */}
              {selectedLoan && selectedLoan.overdueDetails && selectedLoan.overdueDetails.length > rowsPerPage && (
                <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-800 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setModalCurrentPage(Math.max(modalCurrentPage - 1, 1))}
                      disabled={modalCurrentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setModalCurrentPage(Math.min(modalCurrentPage + 1, Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage)))}
                      disabled={modalCurrentPage === Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage)}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Showing <span className="font-medium">{((modalCurrentPage - 1) * rowsPerPage) + 1}</span> to{' '}
                        <span className="font-medium">
                          {Math.min(modalCurrentPage * rowsPerPage, selectedLoan.overdueDetails!.length)}
                        </span> of{' '}
                        <span className="font-medium">{selectedLoan.overdueDetails!.length}</span> cycles
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setModalCurrentPage(Math.max(modalCurrentPage - 1, 1))}
                          disabled={modalCurrentPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {Array.from({ length: Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage) }, (_, i) => i + 1)
                          .filter(page => {
                            const totalPages = Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage);
                            if (totalPages <= 7) return true;
                            if (page === 1 || page === totalPages) return true;
                            if (page >= modalCurrentPage - 1 && page <= modalCurrentPage + 1) return true;
                            return false;
                          })
                          .map((page, index, array) => {
                            const showEllipsis = index > 0 && array[index - 1] !== page - 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && (
                                  <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    ...
                                  </span>
                                )}
                                <button
                                  onClick={() => setModalCurrentPage(page)}
                                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                    modalCurrentPage === page
                                      ? 'z-10 bg-primary-50 dark:bg-primary-900 border-primary-500 text-primary-600 dark:text-primary-400'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  {page}
                                </button>
                              </React.Fragment>
                            );
                          })}
                        <button
                          onClick={() => setModalCurrentPage(Math.min(modalCurrentPage + 1, Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage)))}
                          disabled={modalCurrentPage === Math.ceil(selectedLoan.overdueDetails!.length / rowsPerPage)}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Overdue;