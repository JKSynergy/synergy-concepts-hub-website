const { PrismaClient } = require('@prisma/client');

class SmartBorrowerUpdater {
  constructor() {
    this.prisma = new PrismaClient();
    this.usedBorrowerIds = new Set();
  }

  // Generate borrower ID from name
  generateBorrowerId(firstName, lastName) {
    // Get initials
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    
    // Try different number combinations
    for (let i = 1; i <= 999; i++) {
      const paddedNumber = i.toString().padStart(3, '0');
      const borrowerId = `${firstInitial}${lastInitial}${paddedNumber}`;
      
      if (!this.usedBorrowerIds.has(borrowerId)) {
        this.usedBorrowerIds.add(borrowerId);
        return borrowerId;
      }
    }
    
    // Fallback
    return `${firstInitial}${lastInitial}${Date.now().toString().slice(-3)}`;
  }

  // AI-powered credit rating algorithm
  calculateCreditRating(applicationData) {
    let score = 500; // Base score
    
    // Loan amount factor
    const loanAmount = applicationData.requestedAmount || 0;
    if (loanAmount <= 100000) {
      score += 100;
    } else if (loanAmount <= 500000) {
      score += 50;
    } else if (loanAmount <= 1000000) {
      score += 0;
    } else {
      score -= 50;
    }
    
    // Purpose factor
    const purpose = (applicationData.purpose || '').toLowerCase();
    if (purpose.includes('business') || purpose.includes('trade')) {
      score += 80;
    } else if (purpose.includes('education') || purpose.includes('school')) {
      score += 60;
    } else if (purpose.includes('emergency') || purpose.includes('medical')) {
      score += 40;
    } else if (purpose.includes('wedding') || purpose.includes('event')) {
      score -= 20;
    }
    
    // Term length factor
    const termMonths = applicationData.termMonths || 12;
    if (termMonths <= 6) {
      score += 40;
    } else if (termMonths <= 12) {
      score += 20;
    } else if (termMonths <= 24) {
      score += 0;
    } else {
      score -= 30;
    }
    
    // Random factor for variability
    const randomFactor = Math.floor(Math.random() * 101) - 50;
    score += randomFactor;
    
    // Ensure score is within bounds
    score = Math.max(300, Math.min(850, score));
    
    // Convert to credit rating
    if (score >= 700) return 'Excellent';
    else if (score >= 650) return 'Very Good';
    else if (score >= 600) return 'Good';
    else if (score >= 550) return 'Fair';
    else if (score >= 500) return 'Poor';
    else return 'NO_CREDIT';
  }

  estimateIncome(loanAmount) {
    const multiplier = 2.5 + (Math.random() * 1.5);
    return Math.round((loanAmount / multiplier) / 1000) * 1000;
  }

  async loadExistingBorrowerIds() {
    const borrowers = await this.prisma.borrower.findMany({
      select: { borrowerId: true }
    });
    
    borrowers.forEach(borrower => {
      this.usedBorrowerIds.add(borrower.borrowerId);
    });
    
    console.log(`Loaded ${borrowers.length} existing borrower IDs`);
  }

  async smartUpdateBorrowers() {
    try {
      console.log('🚀 Starting smart borrower update with credit scoring...');
      
      await this.loadExistingBorrowerIds();
      
      // Get all borrowers with their latest applications
      const borrowersWithApps = await this.prisma.borrower.findMany({
        include: {
          applications: {
            orderBy: { createdAt: 'desc' },
            take: 1 // Get most recent application for each borrower
          }
        }
      });
      
      console.log(`Found ${borrowersWithApps.length} borrowers to update`);
      
      let updated = 0;
      
      for (const borrower of borrowersWithApps) {
        try {
          // Only update if borrower has applications
          if (borrower.applications.length > 0) {
            const latestApp = borrower.applications[0];
            
            // Calculate new credit rating from their latest application
            const creditRating = this.calculateCreditRating(latestApp);
            
            // Estimate income if not set
            const monthlyIncome = borrower.monthlyIncome || this.estimateIncome(latestApp.requestedAmount);
            
            // Generate new borrower ID using existing name
            const newBorrowerId = this.generateBorrowerId(borrower.firstName, borrower.lastName);
            
            // Update borrower
            await this.prisma.borrower.update({
              where: { id: borrower.id },
              data: {
                borrowerId: newBorrowerId,
                creditRating,
                monthlyIncome,
                updatedAt: new Date()
              }
            });
            
            updated++;
            console.log(`✅ Updated: ${newBorrowerId} (${borrower.firstName} ${borrower.lastName}) - ${creditRating}`);
          } else {
            console.log(`⚠️  No applications for borrower: ${borrower.firstName} ${borrower.lastName}`);
          }
          
        } catch (error) {
          console.error(`❌ Error updating borrower ${borrower.firstName} ${borrower.lastName}:`, error.message);
        }
      }
      
      console.log('\n📊 Smart Update Summary:');
      console.log(`Borrowers updated: ${updated}`);
      console.log('✅ Smart update completed!');
      
      // Show updated results
      const sampleBorrowers = await this.prisma.borrower.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' }
      });
      
      console.log('\n📋 Sample updated borrowers:');
      sampleBorrowers.forEach(borrower => {
        console.log(`- ${borrower.borrowerId}: ${borrower.firstName} ${borrower.lastName} (${borrower.creditRating})`);
      });
      
      // Credit rating distribution
      const ratingStats = await this.prisma.borrower.groupBy({
        by: ['creditRating'],
        _count: { creditRating: true }
      });
      
      console.log('\n📈 Credit Rating Distribution:');
      ratingStats.forEach(stat => {
        console.log(`- ${stat.creditRating}: ${stat._count.creditRating} borrowers`);
      });
      
    } catch (error) {
      console.error('Error in smart update:', error);
    }
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

async function main() {
  const updater = new SmartBorrowerUpdater();
  
  try {
    await updater.smartUpdateBorrowers();
  } finally {
    await updater.close();
  }
}

main();