// =================================================================
// PORTFOLIO UPDATE HELPER
// =================================================================
// This file helps you easily update your portfolio with new content

/**
 * Instructions for updating your portfolio albums:
 * 
 * 1. Add new images to the appropriate folders in /images/albums/
 * 2. Update the MAIN_PORTFOLIO_ALBUMS object in main-portfolio.js
 * 3. Use the helper functions below to validate your updates
 */

// Helper function to validate image paths
function validateImagePath(imagePath) {
  return fetch(imagePath)
    .then(response => response.ok)
    .catch(() => false);
}

// Helper function to add new images to a category
function addImagesToCategory(category, subcategory, newImages) {
  console.log(`Adding ${newImages.length} images to ${category}/${subcategory}`);
  
  // Validate each image exists
  newImages.forEach(async (imagePath) => {
    const exists = await validateImagePath(imagePath);
    if (!exists) {
      console.warn(`Image not found: ${imagePath}`);
    }
  });
}

// Quick update templates for common additions:

// 1. ADD NEW WEDDING ALBUM
const addWeddingAlbum = (coupleName, imageList) => {
  return `
  "${coupleName}": [
    ${imageList.map(img => `"${img}"`).join(',\n    ')}
  ]`;
};

// 2. ADD NEW INTRODUCTION SESSION
const addIntroductionSession = (clientName, imageList) => {
  return `
  "${clientName}": [
    ${imageList.map(img => `"${img}"`).join(',\n    ')}
  ]`;
};

// 3. ADD NEW LOGO DESIGNS
const addLogoDesigns = (logoList) => {
  return logoList.map(img => `"${img}"`).join(',\n    ');
};

// Example usage:
/*
// To add a new wedding album:
console.log(addWeddingAlbum("Sarah & Mike", [
  "images/albums/photos/weddings/Sarah & Mike/wedding-1.jpg",
  "images/albums/photos/weddings/Sarah & Mike/wedding-2.jpg"
]));

// To add a new introduction session:
console.log(addIntroductionSession("Jane Doe", [
  "images/albums/photos/introductions/Jane Doe/headshot-1.jpg",
  "images/albums/photos/introductions/Jane Doe/headshot-2.jpg"
]));

// To add new logos:
console.log(addLogoDesigns([
  "images/albums/graphics/logos/new-logo-1.jpg",
  "images/albums/graphics/logos/new-logo-2.png"
]));
*/

// Portfolio structure reference
const PORTFOLIO_STRUCTURE = {
  photos: {
    events: "Event photography",
    introductions: "Corporate headshots/introductions (organized by client name)",
    portraits: "Portrait photography", 
    weddings: "Wedding photography (organized by couple name)"
  },
  videos: {
    commercials: "Commercial videos",
    corporate: "Corporate videos",
    documentaries: "Documentary content",
    events: "Event videos",
    introductions: "Introduction videos",
    liveEvents: "Live event coverage",
    loveStories: "Love story videos",
    memoryLanes: "Memory lane videos",
    musicVideos: "Music videos",
    promotional: "Promotional videos",
    reels: "Social media reels",
    testimonials: "Testimonial videos",
    training: "Training videos",
    weddings: "Wedding videos"
  },
  graphics: {
    banners: "Banner designs",
    branding: "Branding packages",
    businessCards: "Business card designs",
    certificates: "Certificate designs", 
    companyProfiles: "Company profile designs",
    eflyers: "Electronic flyer designs",
    letterheads: "Letterhead designs",
    logos: "Logo designs",
    posters: "Poster designs",
    socialMedia: "Social media graphics"
  },
  websites: {
    blogs: "Blog websites",
    bookingSystems: "Booking systems",
    cmsSystems: "CMS systems",
    corporate: "Corporate websites",
    crmSystems: "CRM systems",
    dashboards: "Dashboard interfaces",
    ecommerce: "E-commerce websites",
    inventorySystems: "Inventory systems",
    landingPages: "Landing pages",
    learningSystems: "Learning management systems",
    mobileApps: "Mobile applications",
    paymentSystems: "Payment systems",
    portfolios: "Portfolio websites",
    screenshots: "Website screenshots",
    systems: "Custom systems"
  }
};

console.log("Portfolio Update Helper Loaded!");
console.log("Available categories:", PORTFOLIO_STRUCTURE);