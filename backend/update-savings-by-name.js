const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function updateSavingsByCustomerName() {
    console.log('📊 Updating savings opening dates by matching customer names...');
    
    try {
        // Get all savings accounts with borrower info
        const savingsAccounts = await prisma.savings.findMany({
            include: {
                borrower: true
            }
        });

        // Read the CSV file
        const csvPath = path.join(__dirname, '../migration/sample-data/Final Quick Credit Loan Management System - Savers.csv');
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        
        // Parse CSV
        const lines = csvContent.split('\n');
        const headers = lines[0].split(',');
        
        console.log('CSV Headers:', headers);
        console.log(`Found ${savingsAccounts.length} savings accounts in database`);
        console.log(`Found ${lines.length - 1} rows in CSV`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Process each line from CSV (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',');
            const csvAccountId = values[0];
            const csvCustomerName = values[1];
            const openingDateStr = values[8]; // Opening Date is the 9th column (index 8)
            
            if (!csvAccountId || !csvCustomerName) continue;
            
            // Clean up customer name and split into parts
            const cleanName = csvCustomerName.trim().replace(/\s+/g, ' ');
            const nameParts = cleanName.split(' ');
            const csvFirstName = nameParts[0].toUpperCase();
            const csvLastName = nameParts.slice(1).join(' ').toUpperCase();
            
            if (openingDateStr && openingDateStr.trim()) {
                try {
                    const openingDate = new Date(openingDateStr.trim());
                    
                    // Find the savings account by customer name
                    const matchingAccount = savingsAccounts.find(account => {
                        const accountFirstName = (account.borrower?.firstName || '').toUpperCase();
                        const accountLastName = (account.borrower?.lastName || '').toUpperCase();
                        
                        // Try exact match first
                        if (accountFirstName === csvFirstName && accountLastName === csvLastName) {
                            return true;
                        }
                        
                        // Try reversed name order (TUGUME FELIX vs FELIX TUGUME)
                        if (accountFirstName === csvLastName && accountLastName === csvFirstName) {
                            return true;
                        }
                        
                        // Try partial matches for cases where names might be slightly different
                        if (accountFirstName === csvFirstName && 
                            (accountLastName.includes(csvLastName) || csvLastName.includes(accountLastName))) {
                            return true;
                        }
                        
                        // Try partial matches with reversed names
                        if (accountFirstName === csvLastName && 
                            (accountLastName.includes(csvFirstName) || csvFirstName.includes(accountLastName))) {
                            return true;
                        }
                        
                        return false;
                    });
                    
                    if (matchingAccount) {
                        // Update the savings account
                        await prisma.savings.update({
                            where: { savingsId: matchingAccount.savingsId },
                            data: {
                                createdAt: openingDate,
                                updatedAt: openingDate
                            }
                        });
                        
                        console.log(`✅ Updated ${matchingAccount.savingsId} (${matchingAccount.borrower?.firstName} ${matchingAccount.borrower?.lastName}) with date from CSV ${csvAccountId} (${csvCustomerName}): ${openingDate.toISOString().split('T')[0]}`);
                        updatedCount++;
                    } else {
                        console.log(`⚠️  No matching account found for CSV ${csvAccountId} - "${csvCustomerName}" (${csvFirstName} | ${csvLastName})`);
                        // Show available names for debugging
                        console.log(`   Available accounts: ${savingsAccounts.slice(0, 3).map(a => `${a.borrower?.firstName} ${a.borrower?.lastName}`).join(', ')}...`);
                        skippedCount++;
                    }
                } catch (dateError) {
                    console.log(`❌ Invalid date format for ${csvAccountId}: ${openingDateStr}`);
                    skippedCount++;
                }
            } else {
                console.log(`📝 No opening date provided for CSV ${csvAccountId} - ${csvCustomerName}`);
                skippedCount++;
            }
        }
        
        console.log(`\n🎉 Completed updating savings opening dates:`);
        console.log(`   ✅ Updated: ${updatedCount} accounts`);
        console.log(`   ⏭️  Skipped: ${skippedCount} accounts`);
        
        // Show summary of updated accounts
        const updatedSavings = await prisma.savings.findMany({
            orderBy: { createdAt: 'asc' },
            take: 10,
            include: {
                borrower: true
            }
        });

        console.log('\n📊 Sample of updated savings accounts (ordered by opening date):');
        updatedSavings.forEach(account => {
            console.log(`${account.savingsId}: ${account.borrower?.firstName} ${account.borrower?.lastName} - Opened: ${account.createdAt.toISOString().split('T')[0]}`);
        });

    } catch (error) {
        console.error('❌ Error updating savings by customer name:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the update
updateSavingsByCustomerName();