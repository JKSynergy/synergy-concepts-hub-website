const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Function to parse CSV data
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index] ? values[index].trim() : '';
      });
      data.push(row);
    }
  }
  
  return data;
}

// Function to generate realistic submission dates
function generateSubmissionDate(index, total) {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 90) + 1; // 1-90 days ago
  const submissionDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
  
  // Add some random hours and minutes for variety
  submissionDate.setHours(Math.floor(Math.random() * 12) + 8); // 8 AM to 8 PM
  submissionDate.setMinutes(Math.floor(Math.random() * 60));
  
  return submissionDate;
}

// Function to fix DOB dates
function fixDOB(dobString) {
  if (!dobString || dobString === '') return null;
  
  // Handle the invalid date 2025-09-07 (should be 1995-09-07)
  if (dobString === '2025-09-07') {
    return '1995-09-07';
  }
  
  return dobString;
}

async function updateApplicationsFromCSV() {
  try {
    console.log('🔄 Reading CSV file...');
    const csvPath = path.join(__dirname, '..', '..', 'Ref', 'Final Quick Credit Loan Management System - Applications.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const csvData = parseCSV(csvContent);
    
    console.log(`📊 Found ${csvData.length} records in CSV`);
    
    // First, let's clear existing applications
    console.log('🗑️ Clearing existing applications...');
    await prisma.loanApplication.deleteMany({});
    
    console.log('👥 Fetching existing borrowers...');
    const existingBorrowers = await prisma.borrower.findMany();
    const borrowerMap = new Map();
    existingBorrowers.forEach(b => {
      borrowerMap.set(b.phone, b);
    });
    
    console.log('📝 Creating applications from CSV data...');
    
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      
      try {
        // Generate application ID
        const applicationId = `APP${String(i + 1).padStart(3, '0')}`;
        
        // Generate submission date
        const submittedAt = generateSubmissionDate(i, csvData.length);
        
        // Fix DOB
        const fixedDOB = fixDOB(row['DOB']);
        
        // Find or create borrower
        let borrower = borrowerMap.get(row['Phone']);
        
        if (!borrower && row['Phone']) {
          // Create new borrower
          const borrowerId = `BOR${String(Date.now() + i).slice(-6)}`;
          
          borrower = await prisma.borrower.create({
            data: {
              borrowerId: borrowerId,
              firstName: row['Full Name'].split(' ')[0] || 'Unknown',
              lastName: row['Full Name'].split(' ').slice(1).join(' ') || 'User',
              phone: row['Phone'],
              email: row['Email'] || null,
              gender: null,
              dateOfBirth: fixedDOB ? new Date(fixedDOB) : null,
              nationalId: row['National ID'] || null,
              district: null,
              subcounty: null,
              village: row['Address'] || null,
              occupation: row['Employer'] || null,
              monthlyIncome: row['Monthly Income'] ? parseFloat(row['Monthly Income']) : null,
              creditRating: 'GOOD',
              status: 'ACTIVE',
              createdById: 'system'
            }
          });
          
          borrowerMap.set(row['Phone'], borrower);
          console.log(`✅ Created borrower: ${borrower.firstName} ${borrower.lastName}`);
        }
        
        if (borrower) {
          // Create loan application
          const application = await prisma.loanApplication.create({
            data: {
              applicationId: applicationId,
              borrowerId: borrower.id,
              requestedAmount: parseFloat(row['Requested Amount']) || 0,
              termMonths: parseInt(row['Loan Term']) || 1,
              purpose: row['Purpose'] || 'General',
              status: 'APPROVED', // Most applications are approved based on the screenshot
              submittedAt: submittedAt,
              reviewedAt: new Date(submittedAt.getTime() + (Math.random() * 24 * 60 * 60 * 1000)), // Reviewed within 24 hours
              reviewedById: 'system',
              // Guarantor information
              guarantorName: row['Guarantor Name'] || null,
              guarantorId: row['Guarantor ID'] || null,
              guarantorPhone: row['Guarantor Phone'] || null,
              guarantorRelation: row['Guarantor Relation'] || null,
              collateral: row['Collateral'] || null,
              // Additional fields
              employmentStatus: row['Employment Status'] || null,
              employer: row['Employer'] || null,
              monthlyIncome: row['Monthly Income'] ? parseFloat(row['Monthly Income']) : null,
              consentVerify: row['Consent Verify'] === 'Yes' || row['Consent Verify'] === 'YES',
              consentNotifications: row['Consent Notifications'] === 'Yes' || row['Consent Notifications'] === 'YES'
            }
          });
          
          console.log(`✅ Created application ${applicationId} for ${borrower.firstName} ${borrower.lastName} - Amount: UGX ${row['Requested Amount']} - Submitted: ${submittedAt.toDateString()}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing row ${i + 1}:`, error.message);
        console.log('Row data:', row);
      }
    }
    
    console.log('✅ Successfully updated applications from CSV!');
    
    // Show summary
    const totalApplications = await prisma.loanApplication.count();
    console.log(`📊 Total applications in database: ${totalApplications}`);
    
    // Show date range
    const oldestApp = await prisma.loanApplication.findFirst({
      orderBy: { submittedAt: 'asc' }
    });
    
    const newestApp = await prisma.loanApplication.findFirst({
      orderBy: { submittedAt: 'desc' }
    });
    
    console.log(`📅 Date range: ${oldestApp.submittedAt.toDateString()} to ${newestApp.submittedAt.toDateString()}`);
    
  } catch (error) {
    console.error('❌ Error updating applications:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateApplicationsFromCSV();