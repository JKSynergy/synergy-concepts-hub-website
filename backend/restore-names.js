const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

class DataRestorer {
  constructor() {
    this.prisma = new PrismaClient();
    this.borrowersMap = new Map(); // Phone -> Borrower data
    this.applicationsData = [];
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

  async loadReferenceData() {
    console.log('📖 Loading reference data from CSV files...');
    
    // Load borrowers data
    const borrowersCSV = fs.readFileSync(path.join('..', '..', 'Ref', 'Final Quick Credit Loan Management System - Borrowers.csv'), 'utf8');
    const borrowersData = this.parseCSV(borrowersCSV);
    
    // Map borrowers by phone number for easy lookup
    borrowersData.forEach(borrower => {
      if (borrower['Phone Number']) {
        this.borrowersMap.set(borrower['Phone Number'], {
          borrowerId: borrower['Borrower ID'],
          name: borrower['Name'],
          phone: borrower['Phone Number'],
          email: borrower['Email Address'] || '',
          address: borrower['Residential Address'] || '',
          occupation: borrower['Occupation'] || '',
          creditRating: borrower['Credit Rating'] || 'NO_CREDIT'
        });
      }
    });
    
    // Load applications data
    const applicationsCSV = fs.readFileSync(path.join('..', '..', 'Ref', 'Final Quick Credit Loan Management System - Applications.csv'), 'utf8');
    this.applicationsData = this.parseCSV(applicationsCSV);
    
    console.log(`✅ Loaded ${this.borrowersMap.size} borrowers and ${this.applicationsData.length} applications from CSV`);
  }

  async restoreBorrowerNames() {
    console.log('🔄 Restoring borrower names from reference data...');
    
    let updated = 0;
    let created = 0;
    
    // First, update existing borrowers that match by phone
    const existingBorrowers = await this.prisma.borrower.findMany();
    
    for (const borrower of existingBorrowers) {
      // Try to find matching borrower in CSV by phone
      const refBorrower = this.borrowersMap.get(borrower.phone);
      
      if (refBorrower) {
        const nameParts = refBorrower.name.split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'User';
        
        await this.prisma.borrower.update({
          where: { id: borrower.id },
          data: {
            borrowerId: refBorrower.borrowerId,
            firstName: firstName.toUpperCase(),
            lastName: lastName.toUpperCase(),
            email: refBorrower.email,
            district: refBorrower.address.split(',')[0] || 'Kampala',
            occupation: refBorrower.occupation,
            creditRating: refBorrower.creditRating,
            updatedAt: new Date()
          }
        });
        
        updated++;
        console.log(`✅ Updated: ${refBorrower.borrowerId} - ${firstName} ${lastName}`);
      }
    }
    
    console.log(`📊 Updated ${updated} existing borrowers`);
    return { updated, created };
  }

  async matchApplicationsWithNames() {
    console.log('🔗 Matching applications with correct borrower names...');
    
    const applications = await this.prisma.loanApplication.findMany({
      include: { borrower: true },
      orderBy: { applicationId: 'asc' }
    });
    
    let matched = 0;
    
    for (let i = 0; i < applications.length && i < this.applicationsData.length; i++) {
      const app = applications[i];
      const refApp = this.applicationsData[i];
      
      if (refApp['Full Name']) {
        // Find or create borrower based on reference data
        const fullName = refApp['Full Name'];
        const phone = refApp['Phone'] || `+256${Math.floor(Math.random() * 900000000) + 100000000}`;
        
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'User';
        
        // Update the borrower linked to this application
        await this.prisma.borrower.update({
          where: { id: app.borrowerId },
          data: {
            firstName: firstName.toUpperCase(),
            lastName: lastName.toUpperCase(),
            phone: phone,
            email: refApp['Email'] || `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(' ', '')}@quickcredit.com`,
            district: refApp['Address'] ? refApp['Address'].split(',')[0] : 'Kampala',
            occupation: refApp['Employment Status'] || 'Self Employed',
            monthlyIncome: refApp['Monthly Income'] ? parseFloat(refApp['Monthly Income']) : null,
            updatedAt: new Date()
          }
        });
        
        matched++;
        console.log(`✅ Matched ${app.applicationId} with ${firstName} ${lastName}`);
      }
    }
    
    console.log(`📊 Matched ${matched} applications with names`);
    return matched;
  }

  async generateBorrowerIDs() {
    console.log('🆔 Generating proper borrower IDs...');
    
    const borrowers = await this.prisma.borrower.findMany();
    let updated = 0;
    const usedIds = new Set();
    
    for (const borrower of borrowers) {
      if (borrower.firstName && borrower.lastName) {
        const firstInitial = borrower.firstName.charAt(0);
        const lastInitial = borrower.lastName.charAt(0);
        
        // Try to generate unique ID
        for (let i = 1; i <= 999; i++) {
          const paddedNumber = i.toString().padStart(3, '0');
          const newId = `${firstInitial}${lastInitial}QC${paddedNumber}`;
          
          if (!usedIds.has(newId)) {
            usedIds.add(newId);
            
            await this.prisma.borrower.update({
              where: { id: borrower.id },
              data: {
                borrowerId: newId,
                updatedAt: new Date()
              }
            });
            
            updated++;
            console.log(`✅ Updated ID: ${newId} for ${borrower.firstName} ${borrower.lastName}`);
            break;
          }
        }
      }
    }
    
    console.log(`📊 Generated ${updated} borrower IDs`);
    return updated;
  }

  async showResults() {
    console.log('\n📋 Final Results:');
    
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
      take: 5,
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
      await this.restoreBorrowerNames();
      await this.matchApplicationsWithNames();
      await this.generateBorrowerIDs();
      await this.showResults();
      await this.cleanup();
      
      console.log('\n🎉 Data restoration completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during restoration:', error);
    }
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

async function main() {
  const restorer = new DataRestorer();
  
  try {
    await restorer.restore();
  } finally {
    await restorer.close();
  }
}

main();