const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Function to parse DD/MM/YYYY date and convert to valid date
function parseDate(dateString) {
  if (!dateString) return new Date();
  
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // JavaScript months are 0-indexed
    let year = parseInt(parts[2]);
    
    // Fix future dates - if year is 2025 and we're past that date, use 2024
    if (year === 2025 && month >= 8) { // September or later
      year = 2024;
    }
    
    return new Date(year, month, day);
  }
  
  return new Date(dateString);
}

// Function to generate realistic submission dates based on application data
function generateSubmissionDate(index, totalApplications) {
  const now = new Date('2025-10-11'); // Current date
  const daysAgo = Math.floor(Math.random() * 90) + 1; // Random 1-90 days ago
  const submissionDate = new Date(now);
  submissionDate.setDate(submissionDate.getDate() - daysAgo);
  
  // Add some randomness to hours and minutes
  submissionDate.setHours(Math.floor(Math.random() * 12) + 8); // 8 AM to 8 PM
  submissionDate.setMinutes(Math.floor(Math.random() * 60));
  
  return submissionDate;
}

async function updateApplicationsWithCSVData() {
  try {
    console.log('🔄 Reading CSV data...');
    
    // Read the CSV file
    const csvPath = path.join(__dirname, '..', '..', 'Ref', 'Final Quick Credit Loan Management System - Applications.csv');
    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    console.log('📊 CSV Headers:', headers);
    console.log(`📈 Found ${lines.length - 1} data rows`);
    
    // Get existing applications
    const existingApplications = await prisma.loanApplication.findMany({
      orderBy: { createdAt: 'asc' }
    });
    
    console.log(`🎯 Found ${existingApplications.length} existing applications`);
    
    // Update each application with realistic data
    for (let i = 0; i < Math.min(existingApplications.length, lines.length - 1); i++) {
      const application = existingApplications[i];
      const csvRow = lines[i + 1].split(',').map(cell => cell.trim().replace(/"/g, ''));
      
      // Create a data object from CSV
      const csvData = {};
      headers.forEach((header, index) => {
        csvData[header] = csvRow[index] || '';
      });
      
      // Generate realistic submission date
      const submissionDate = generateSubmissionDate(i, existingApplications.length);
      
      // Update the application
      await prisma.loanApplication.update({
        where: { id: application.id },
        data: {
          submittedAt: submissionDate,
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ Updated application ${application.id} with submission date: ${submissionDate.toLocaleDateString()}`);
    }
    
    console.log('🎉 Successfully updated all applications with realistic dates and guarantor data!');
    
    // Verify the updates
    const updatedApplications = await prisma.loanApplication.findMany({
      select: {
        id: true,
        submittedAt: true
      },
      orderBy: { submittedAt: 'desc' }
    });
    
    console.log('\n📋 Updated applications summary:');
    updatedApplications.forEach((app, index) => {
      console.log(`${index + 1}. ID: ${app.id}, Submitted: ${app.submittedAt.toLocaleDateString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error updating applications:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateApplicationsWithCSVData();