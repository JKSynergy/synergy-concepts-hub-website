const { PrismaClient } = require('@prisma/client');

class BorrowerSimpleGenerator {
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
    
    // Fallback to UUID-based if all combinations taken
    return `${firstInitial}${lastInitial}${Date.now().toString().slice(-3)}`;
  }

  // AI-powered credit rating algorithm
  calculateCreditRating(applicationData) {
    let score = 500; // Base score
    
    // Loan amount factor (lower amounts = higher score)
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
    
    // Purpose factor (some purposes are lower risk)
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
    
    // Term length factor (shorter terms = higher score)
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
    
    // Random factor for variability (±50)
    const randomFactor = Math.floor(Math.random() * 101) - 50;
    score += randomFactor;
    
    // Ensure score is within reasonable bounds
    score = Math.max(300, Math.min(850, score));
    
    // Convert to credit rating based on existing system
    if (score >= 700) return 'Excellent';
    else if (score >= 650) return 'Very Good';
    else if (score >= 600) return 'Good';
    else if (score >= 550) return 'Fair';
    else if (score >= 500) return 'Poor';
    else return 'NO_CREDIT';
  }

  // Extract borrower data from application
  extractBorrowerFromApplication(application) {
    // Parse name (applications might have fullName or separate fields)
    let firstName = 'Unknown';
    let lastName = 'User';
    
    if (application.fullName) {
      const nameParts = application.fullName.trim().split(' ');
      firstName = nameParts[0] || 'Unknown';
      lastName = nameParts.slice(1).join(' ') || 'User';
    }
    
    // Generate phone number if not provided
    const phone = application.phone || `+256${Math.floor(Math.random() * 900000000) + 100000000}`;
    
    // Generate email if not provided
    const email = application.email || 
      `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(' ', '')}@quickcredit.com`;
    
    // Extract location data
    const district = application.address ? 
      application.address.split(',')[0] || 'Kampala' : 'Kampala';
    
    // Calculate credit rating
    const creditRating = this.calculateCreditRating(application);
    
    return {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      phone,
      email,
      district,
      subcounty: 'Central',
      village: 'Main',
      occupation: application.employmentStatus || 'Self Employed',
      monthlyIncome: this.estimateIncome(application.requestedAmount),
      creditRating
    };
  }

  // Estimate monthly income based on loan amount
  estimateIncome(loanAmount) {
    // Assume loan amount is typically 2-4x monthly income
    const multiplier = 2.5 + (Math.random() * 1.5); // 2.5 to 4x
    return Math.round((loanAmount / multiplier) / 1000) * 1000; // Round to nearest 1000
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

  async regenerateBorrowersFromApplications() {
    try {
      console.log('🚀 Starting simple borrower regeneration from applications...');
      
      // Load existing borrower IDs to avoid conflicts
      await this.loadExistingBorrowerIds();
      
      // Get all applications
      const applications = await this.prisma.loanApplication.findMany({
        orderBy: { createdAt: 'asc' }
      });
      
      console.log(`Found ${applications.length} applications to process`);
      
      let processed = 0;
      let updated = 0;
      
      for (const application of applications) {
        try {
          // Check if borrower already exists for this application
          let borrower = await this.prisma.borrower.findUnique({
            where: { id: application.borrowerId }
          });
          
          if (borrower) {
            // Extract borrower data from application
            const borrowerData = this.extractBorrowerFromApplication(application);
            
            // Generate new borrower ID
            const borrowerId = this.generateBorrowerId(borrowerData.firstName, borrowerData.lastName);
            
            // Update existing borrower with new data (only fields that exist in schema)
            borrower = await this.prisma.borrower.update({
              where: { id: borrower.id },
              data: {
                borrowerId,
                firstName: borrowerData.firstName,
                lastName: borrowerData.lastName,
                phone: borrowerData.phone,
                email: borrowerData.email,
                district: borrowerData.district,
                subcounty: borrowerData.subcounty,
                village: borrowerData.village,
                occupation: borrowerData.occupation,
                monthlyIncome: borrowerData.monthlyIncome,
                creditRating: borrowerData.creditRating,
                updatedAt: new Date()
              }
            });
            
            updated++;
            console.log(`✅ Updated borrower: ${borrower.borrowerId} (${borrowerData.firstName} ${borrowerData.lastName}) - Rating: ${borrowerData.creditRating}`);
          } else {
            console.log(`⚠️  No borrower found for application ${application.applicationId}`);
          }
          
          processed++;
          
        } catch (error) {
          console.error(`❌ Error processing application ${application.applicationId}:`, error.message);
        }
      }
      
      console.log('\n📊 Borrower Regeneration Summary:');
      console.log(`Total applications processed: ${processed}`);
      console.log(`Borrowers updated: ${updated}`);
      console.log('✅ Borrower regeneration completed!');
      
      // Show sample of new borrowers
      const sampleBorrowers = await this.prisma.borrower.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' }
      });
      
      console.log('\n📋 Sample updated borrowers:');
      sampleBorrowers.forEach(borrower => {
        console.log(`- ${borrower.borrowerId}: ${borrower.firstName} ${borrower.lastName} (${borrower.creditRating})`);
      });
      
      // Show credit rating distribution
      const ratingStats = await this.prisma.borrower.groupBy({
        by: ['creditRating'],
        _count: {
          creditRating: true
        }
      });
      
      console.log('\n📈 Credit Rating Distribution:');
      ratingStats.forEach(stat => {
        console.log(`- ${stat.creditRating}: ${stat._count.creditRating} borrowers`);
      });
      
    } catch (error) {
      console.error('Error regenerating borrowers:', error);
    }
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

// Run the regeneration
async function main() {
  const generator = new BorrowerSimpleGenerator();
  
  try {
    await generator.regenerateBorrowersFromApplications();
  } finally {
    await generator.close();
  }
}

main();