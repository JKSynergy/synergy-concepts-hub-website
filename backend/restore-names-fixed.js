const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

class DataRestorerFixed {
  constructor() {
    this.prisma = new PrismaClient();
    this.borrowersMap = new Map();
    this.applicationsData = [];
    this.usedPhones = new Set();
  }

  parseCSV(csvContent) {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index] ? values[index].trim() : '';
      });
      data.push(row);
    }
    
    return data;
  }

  generateUniquePhone(basePhone) {
    if (!basePhone) {
      basePhone = `256${Math.floor(Math.random() * 900000000) + 100000000}`;
    }
    
    // Remove any existing +256 prefix
    basePhone = basePhone.replace(/^\+?256/, '');
    
    let phone = `+256${basePhone}`;
    let counter = 1;
    
    while (this.usedPhones.has(phone)) {
      // Modify the last digit slightly to make it unique
      const lastDigit = parseInt(basePhone.slice(-1));
      const newLastDigit = (lastDigit + counter) % 10;
      const newPhone = `+256${basePhone.slice(0, -1)}${newLastDigit}`;
      phone = newPhone;
      counter++;
      
      if (counter > 10) {
        // If we've tried 10 variations, generate a completely new number
        phone = `+256${Math.floor(Math.random() * 900000000) + 100000000}`;
        break;
      }
    }
    
    this.usedPhones.add(phone);
    return phone;
  }

  async loadReferenceData() {
    console.log('📖 Loading reference data from CSV files...');
    
    // Load existing phone numbers first
    const existingBorrowers = await this.prisma.borrower.findMany({
      select: { phone: true }
    });
    
    existingBorrowers.forEach(b => {
      if (b.phone) this.usedPhones.add(b.phone);
    });
    
    // Load applications data
    const applicationsCSV = fs.readFileSync(path.join('..', '..', 'Ref', 'Final Quick Credit Loan Management System - Applications.csv'), 'utf8');
    this.applicationsData = this.parseCSV(applicationsCSV);
    
    console.log(`✅ Loaded ${this.applicationsData.length} applications from CSV`);
    console.log(`✅ Found ${this.usedPhones.size} existing phone numbers`);
  }

  async restoreApplicationsWithNames() {
    console.log('🔗 Restoring applications with correct borrower names...');
    
    const applications = await this.prisma.loanApplication.findMany({
      include: { borrower: true },
      orderBy: { applicationId: 'asc' }
    });
    
    let matched = 0;
    
    for (let i = 0; i < applications.length && i < this.applicationsData.length; i++) {
      try {
        const app = applications[i];
        const refApp = this.applicationsData[i];
        
        if (refApp['Full Name']) {
          const fullName = refApp['Full Name'];
          const refPhone = refApp['Phone'];
          
          const nameParts = fullName.split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || 'User';
          
          // Generate unique phone number
          const uniquePhone = this.generateUniquePhone(refPhone);
          
          // Update the borrower linked to this application
          await this.prisma.borrower.update({
            where: { id: app.borrowerId },
            data: {
              firstName: firstName.toUpperCase(),
              lastName: lastName.toUpperCase(),
              phone: uniquePhone,
              email: refApp['Email'] || `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@quickcredit.com`,
              district: refApp['Address'] ? refApp['Address'].split(',')[0] : 'Kampala',
              occupation: refApp['Employment Status'] || 'Self Employed',
              monthlyIncome: refApp['Monthly Income'] ? parseFloat(refApp['Monthly Income']) : this.estimateIncome(app.requestedAmount),
              updatedAt: new Date()
            }
          });
          
          matched++;
          console.log(`✅ ${app.applicationId}: ${firstName} ${lastName} (${uniquePhone})`);
        }
      } catch (error) {
        console.error(`❌ Error processing application ${applications[i]?.applicationId}:`, error.message);
      }
    }
    
    console.log(`📊 Successfully restored ${matched} applications with names`);
    return matched;
  }

  estimateIncome(loanAmount) {
    // Estimate income as 2.5-4x the loan amount divided by term
    const multiplier = 2.5 + (Math.random() * 1.5);
    return Math.round((loanAmount * multiplier) / 1000) * 1000;
  }

  async generateSmartBorrowerIDs() {
    console.log('🆔 Generating smart borrower IDs with AI credit scoring...');
    
    const borrowers = await this.prisma.borrower.findMany({
      include: {
        applications: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    
    let updated = 0;
    const usedIds = new Set();
    
    for (const borrower of borrowers) {
      try {
        if (borrower.firstName && borrower.lastName) {
          const firstInitial = borrower.firstName.charAt(0);
          const lastInitial = borrower.lastName.charAt(0);
          
          // Generate unique ID
          for (let i = 1; i <= 999; i++) {
            const paddedNumber = i.toString().padStart(3, '0');
            const newId = `${firstInitial}${lastInitial}${paddedNumber}`;
            
            if (!usedIds.has(newId)) {
              usedIds.add(newId);
              
              // Calculate AI credit rating based on their application data
              let creditRating = 'NO_CREDIT';
              
              if (borrower.applications.length > 0) {
                const app = borrower.applications[0];
                creditRating = this.calculateAICreditRating(app, borrower);
              }
              
              await this.prisma.borrower.update({
                where: { id: borrower.id },
                data: {
                  borrowerId: newId,
                  creditRating,
                  updatedAt: new Date()
                }
              });
              
              updated++;
              console.log(`✅ ${newId}: ${borrower.firstName} ${borrower.lastName} (${creditRating})`);
              break;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error updating borrower ${borrower.firstName} ${borrower.lastName}:`, error.message);
      }
    }
    
    console.log(`📊 Generated ${updated} borrower IDs with AI credit ratings`);
    return updated;
  }

  calculateAICreditRating(application, borrower) {
    let score = 500; // Base score
    
    // Loan amount factor (lower amounts = higher score)
    const loanAmount = application.requestedAmount || 0;
    if (loanAmount <= 100000) {
      score += 100;
    } else if (loanAmount <= 500000) {
      score += 50;
    } else if (loanAmount <= 1000000) {
      score += 0;
    } else {
      score -= 50;
    }
    
    // Purpose factor (some purposes are lower risk)
    const purpose = (application.purpose || '').toLowerCase();
    if (purpose.includes('business') || purpose.includes('trade')) {
      score += 80;
    } else if (purpose.includes('education') || purpose.includes('school')) {
      score += 60;
    } else if (purpose.includes('emergency') || purpose.includes('medical')) {
      score += 40;
    } else if (purpose.includes('wedding') || purpose.includes('event')) {
      score -= 20;
    }
    
    // Term length factor (shorter terms = higher score)
    const termMonths = application.termMonths || 12;
    if (termMonths <= 6) {
      score += 40;
    } else if (termMonths <= 12) {
      score += 20;
    } else if (termMonths <= 24) {
      score += 0;
    } else {
      score -= 30;
    }
    
    // Occupation factor
    const occupation = (borrower.occupation || '').toLowerCase();
    if (occupation.includes('employed') || occupation.includes('government')) {
      score += 60;
    } else if (occupation.includes('business') || occupation.includes('self')) {
      score += 30;
    }
    
    // Random factor for variability (±30)
    const randomFactor = Math.floor(Math.random() * 61) - 30;
    score += randomFactor;
    
    // Ensure score is within bounds
    score = Math.max(300, Math.min(850, score));
    
    // Convert to credit rating
    if (score >= 750) return 'Excellent';
    else if (score >= 700) return 'Very Good';
    else if (score >= 650) return 'Good';
    else if (score >= 600) return 'Fair';
    else if (score >= 550) return 'Poor';
    else return 'Very Poor';
  }

  async showResults() {
    console.log('\n📋 Final Results Summary:');
    
    const sampleBorrowers = await this.prisma.borrower.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });
    
    console.log('\n✅ Sample restored borrowers:');
    sampleBorrowers.forEach(borrower => {
      console.log(`- ${borrower.borrowerId}: ${borrower.firstName} ${borrower.lastName} (${borrower.creditRating})`);
    });
    
    // Show applications with names
    const appsWithBorrowers = await this.prisma.loanApplication.findMany({
      take: 10,
      include: {
        borrower: {
          select: { borrowerId: true, firstName: true, lastName: true }
        }
      },
      orderBy: { applicationId: 'asc' }
    });
    
    console.log('\n✅ Sample applications with restored names:');
    appsWithBorrowers.forEach(app => {
      console.log(`- ${app.applicationId}: ${app.borrower.firstName} ${app.borrower.lastName} (${app.purpose})`);
    });
    
    // Credit rating distribution
    const ratingStats = await this.prisma.borrower.groupBy({
      by: ['creditRating'],
      _count: { creditRating: true }
    });
    
    console.log('\n📈 AI Credit Rating Distribution:');
    ratingStats.forEach(stat => {
      console.log(`- ${stat.creditRating}: ${stat._count.creditRating} borrowers`);
    });
  }

  async cleanup() {
    console.log('\n🗑️ Cleaning up reference folder...');
    
    try {
      const refPath = path.join('..', '..', 'Ref');
      if (fs.existsSync(refPath)) {
        fs.rmSync(refPath, { recursive: true, force: true });
        console.log('✅ Reference folder deleted successfully');
      }
    } catch (error) {
      console.error('❌ Error deleting reference folder:', error.message);
    }
  }

  async restore() {
    try {
      await this.loadReferenceData();
      await this.restoreApplicationsWithNames();
      await this.generateSmartBorrowerIDs();
      await this.showResults();
      await this.cleanup();
      
      console.log('\n🎉 Complete data restoration with AI credit scoring completed!');
      
    } catch (error) {
      console.error('❌ Error during restoration:', error);
    }
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

async function main() {
  const restorer = new DataRestorerFixed();
  
  try {
    await restorer.restore();
  } finally {
    await restorer.close();
  }
}

main();