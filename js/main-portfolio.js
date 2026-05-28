// =================================================================
// MAIN PORTFOLIO MANAGEMENT SYSTEM
// =================================================================

// Portfolio album data - using actual portfolio structure with sub-albums
const MAIN_PORTFOLIO_ALBUMS = {
  photos: {
    // Photography Portfolio organized by categories
    events: [
      // Event photography - using academy images as placeholders for now
      "academy images/photography-classes/IMG_0105.jpg",
      "academy images/classrooms/20250822_163612.jpg",
      "academy images/students-working/student 01 (1).jpg",
      "academy images/photography-classes/IMG_0106.jpg",
      "academy images/classrooms/20250822_164614.jpg",
      "academy images/classrooms/20250822_164638.jpg",
      "academy images/photography-classes/IMG_0107.jpg",
      "academy images/students-working/student 01 (2).jpg"
    ],
    introductions: {
      // Introduction/Corporate headshot sessions - organized by client
      "Dan Kwanjula": [
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0580.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0626.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0628.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0719.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0726.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0807.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_0886.jpg",
        "images/albums/photos/introductions/Dan Kwanjula/DSC_1263.jpg"
      ]
      // Add more client sessions here as you add new introduction shoots
    },
    portraits: [
      // Portrait photography - using academy images for variety
      "academy images/photography-classes/IMG_0110.jpg",
      "academy images/classrooms/20250822_164638.jpg",
      "academy images/students-working/student 01 (4).jpg",
      "academy images/classrooms/20250822_164713.jpg",
      "academy images/classrooms/20250822_164718.jpg",
      "academy images/students-working/student 01 (5).jpg",
      "academy images/classrooms/20250822_164726.jpg",
      "academy images/students-working/student 01 (6).jpg"
    ],
    weddings: {
      // Wedding photography portfolio - organized by couple
      "Katherine & Ron": [
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-49.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-57.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-58.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-59.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-65.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-68.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-69.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-81.jpg",
        "images/albums/photos/weddings/Katherine & Ron/Kath & Ron-85.jpg"
      ]
      // Add more wedding couples here as you add new wedding albums
    }
  },
  videos: {
    // Video production portfolio organized by categories
    commercials: [
      // Commercial video thumbnails - add your commercial videos here
      "academy images/classrooms/20250822_163612.jpg",
      "academy images/classrooms/20250822_164726.jpg", 
      "academy images/photography-classes/IMG_0105.jpg",
      "academy images/students-working/student 01 (1).jpg",
      "academy images/classrooms/20250822_165039.jpg"
    ],
    corporate: [
      // Corporate video thumbnails
      "academy images/classrooms/20250822_164554.jpg",
      "academy images/students-working/student 01 (4).jpg",
      "academy images/classrooms/20250822_165220.jpg",
      "academy images/photography-classes/IMG_0106.jpg"
    ],
    documentaries: [
      // Documentary thumbnails - add your documentary content here
      "academy images/classrooms/20250822_164609.jpg",
      "academy images/classrooms/20250822_164614.jpg"
    ],
    events: [
      // Event video thumbnails
      "academy images/classrooms/20250822_165442.jpg",
      "academy images/classrooms/20250822_165604.jpg"
    ],
    introductions: [
      // Introduction video thumbnails  
      "academy images/classrooms/20250822_165608.jpg",
      "academy images/classrooms/20250822_165622.jpg"
    ],
    liveEvents: [
      // Live event coverage thumbnails
      "academy images/classrooms/20250822_165729.jpg",
      "academy images/classrooms/20250822_171009.jpg"
    ],
    loveStories: [
      // Love story video thumbnails
      "academy images/classrooms/20250822_171022.jpg",
      "academy images/classrooms/20250822_171029.jpg"
    ],
    memoryLanes: [
      // Memory lane video thumbnails
      "academy images/classrooms/20250822_171103.jpg"
    ],
    musicVideos: [
      // Music video thumbnails - add your music videos here
      "academy images/students-working/student 01 (2).jpg",
      "academy images/students-working/student 01 (3).jpg"
    ],
    promotional: [
      // Promotional video thumbnails
      "academy images/students-working/student 01 (5).jpg"
    ],
    reels: [
      // Social media reels thumbnails
      "academy images/students-working/student 01 (6).jpg",
      "academy images/students-working/student 01 (7).jpg",
      "academy images/photography-classes/IMG_0107.jpg",
      "academy images/photography-classes/IMG_0110.jpg"
    ],
    testimonials: [
      // Testimonial video thumbnails
      "academy images/classrooms/20250822_164638.jpg"
    ],
    training: [
      // Training video thumbnails
      "academy images/classrooms/20250822_164713.jpg",
      "academy images/classrooms/20250822_164718.jpg"
    ],
    weddings: [
      // Wedding video thumbnails
      "academy images/classrooms/20250822_164742.jpg"
    ]
  },
  graphics: {
    // Graphics and branding portfolio organized by categories
    banners: [
      // Banner designs - add your banner images here
      "academy images/classrooms/20250822_164742.jpg",
      "academy images/students-working/student 01 (7).jpg"
    ],
    branding: [
      // Branding packages and identity designs
      "academy images/classrooms/20250822_164742.jpg",
      "academy images/students-working/student 01 (2).jpg",
      "academy images/classrooms/20250822_165047.jpg",
      "academy images/photography-classes/IMG_0110.jpg",
      "academy images/classrooms/20250822_171022.jpg"
    ],
    businessCards: [
      // Business card designs - add your business card images here
      "academy images/classrooms/20250822_165101.jpg"
    ],
    certificates: [
      // Certificate designs - add your certificate images here
      "academy images/classrooms/20250822_165156.jpg"
    ],
    companyProfiles: [
      // Company profile designs - add your company profile images here
      "academy images/classrooms/20250822_165220.jpg"
    ],
    eflyers: [
      // Electronic flyer designs - add your e-flyer images here
      "academy images/classrooms/20250822_165240.jpg"
    ],
    letterheads: [
      // Letterhead designs - add your letterhead images here
      "academy images/classrooms/20250822_165252.jpg"
    ],
    logos: [
      // Actual logo designs from your portfolio
      "images/albums/graphics/logos/RBS Logo copy.jpg",
      "images/albums/graphics/logos/SMA LOGO  VERSION 2-01.png", 
      "images/albums/graphics/logos/SYNERGY CREATIVE HUB NEW LOGOS-01.jpg",
      // Additional logo portfolio images
      "academy images/classrooms/20250822_165134.jpg",
      "academy images/students-working/student 01 (3).jpg",
      "academy images/classrooms/20250822_165310.jpg"
    ],
    posters: [
      // Poster designs - add your poster images here
      "academy images/classrooms/20250822_165321.jpg"
    ],
    socialMedia: [
      // Social media graphics - add your social media designs here
      "academy images/classrooms/20250822_165352.jpg"
    ]
  },
  websites: {
    // Website development portfolio organized by categories
    blogs: [
      // Blog website thumbnails - add your blog designs here
      "academy images/classrooms/20250822_165101.jpg",
      "academy images/classrooms/20250822_165134.jpg"
    ],
    bookingSystems: [
      // Booking system thumbnails - add your booking system screenshots here
      "academy images/classrooms/20250822_165156.jpg",
      "academy images/classrooms/20250822_165220.jpg"
    ],
    cmsSystems: [
      // CMS system thumbnails - add your CMS screenshots here
      "academy images/classrooms/20250822_165240.jpg",
      "academy images/classrooms/20250822_165252.jpg"
    ],
    corporate: [
      // Corporate website thumbnails
      "academy images/classrooms/20250822_165240.jpg",
      "academy images/classrooms/20250822_165604.jpg",
      "academy images/students-working/student 01 (2).jpg",
      "academy images/classrooms/20250822_165729.jpg",
      "academy images/classrooms/20250822_171103.jpg"
    ],
    crmSystems: [
      // CRM system thumbnails - add your CRM screenshots here
      "academy images/classrooms/20250822_165310.jpg",
      "academy images/classrooms/20250822_165321.jpg"
    ],
    dashboards: [
      // Dashboard interface thumbnails
      "academy images/classrooms/20250822_165352.jpg",
      "academy images/classrooms/20250822_165608.jpg",
      "academy images/students-working/student 01 (3).jpg",
      "academy images/classrooms/20250822_165442.jpg",
      "academy images/classrooms/20250822_165622.jpg"
    ],
    ecommerce: [
      // E-commerce website thumbnails - add your e-commerce sites here
      "academy images/classrooms/20250822_171009.jpg",
      "academy images/classrooms/20250822_171022.jpg"
    ],
    inventorySystems: [
      // Inventory management system thumbnails
      "academy images/classrooms/20250822_171029.jpg",
      "academy images/classrooms/20250822_171103.jpg"
    ],
    landingPages: [
      // Landing page thumbnails - add your landing pages here
      "academy images/students-working/student 01 (4).jpg",
      "academy images/students-working/student 01 (5).jpg"
    ],
    learningSystems: [
      // Learning management system thumbnails
      "academy images/students-working/student 01 (6).jpg",
      "academy images/students-working/student 01 (7).jpg"
    ],
    mobileApps: [
      // Mobile app thumbnails - add your mobile app screenshots here
      "academy images/photography-classes/IMG_0105.jpg",
      "academy images/photography-classes/IMG_0106.jpg"
    ],
    paymentSystems: [
      // Payment system thumbnails
      "academy images/photography-classes/IMG_0107.jpg",
      "academy images/photography-classes/IMG_0110.jpg"
    ],
    portfolios: [
      // Portfolio website thumbnails - add your portfolio sites here
      "academy images/classrooms/20250822_164554.jpg",
      "academy images/classrooms/20250822_164609.jpg"
    ],
    screenshots: [
      // General website screenshots - add your website screenshots here
      "academy images/classrooms/20250822_164614.jpg",
      "academy images/classrooms/20250822_164638.jpg"
    ],
    systems: [
      // General system thumbnails - add your custom systems here
      "academy images/classrooms/20250822_164713.jpg",
      "academy images/classrooms/20250822_164718.jpg"
    ]
  }
};

// Main Portfolio Manager Class
class MainPortfolioManager {
  constructor() {
    this.currentAlbumImages = [];
    this.currentImageIndex = 0;
    this.currentAlbumTitle = '';
    this.currentAlbumDescription = '';
    this.autoPlayInterval = null;
    this.autoPlayDelay = 4000; // 4 seconds
    this.isAutoPlaying = false;
    this.wasAutoPlayingBeforeHover = false;
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializePortfolio());
    } else {
      this.initializePortfolio();
    }
  }

  initializePortfolio() {
    // Get portfolio elements
    this.albumsSlider = document.getElementById('albumsSlider');
    this.albumView = document.getElementById('albumView');
    this.thumbnailContainer = document.getElementById('thumbnailContainer');
    this.lightbox = document.getElementById('lightbox');
    this.lightboxImage = document.getElementById('lightboxImage');
    this.lightboxClose = document.getElementById('lightboxClose');
    this.imageCounter = document.getElementById('imageCounter');
    this.lightboxCounter = document.getElementById('lightboxCounter');
    this.albumsPrev = document.getElementById('albumsPrev');
    this.albumsNext = document.getElementById('albumsNext');
    this.albumPrev = document.getElementById('albumPrev');
    this.albumNext = document.getElementById('albumNext');
    this.thumbPrev = document.getElementById('thumbPrev');
    this.thumbNext = document.getElementById('thumbNext');
    this.albumBack = document.getElementById('albumBack');

    if (!this.albumsSlider) {
      console.log('Main portfolio elements not found - this is normal for pages without main portfolio');
      return;
    }

    console.log('Main portfolio system initializing...');
    this.bindEvents();
  }

  bindEvents() {
    // Portfolio album clicks
    this.albumsSlider.addEventListener('click', (e) => this.handleAlbumClick(e));
    
    // Back to albums list
    this.albumBack?.addEventListener('click', () => this.closeAlbumView());

    // Navigation arrows
    this.albumPrev?.addEventListener('click', () => {
      this.pauseAutoPlay();
      this.navigateImage(-1);
    });
    this.albumNext?.addEventListener('click', () => {
      this.pauseAutoPlay();
      this.navigateImage(1);
    });

    // Thumbnail navigation
    this.thumbPrev?.addEventListener('click', () => this.scrollThumbnails(-150));
    this.thumbNext?.addEventListener('click', () => this.scrollThumbnails(150));

    // Lightbox
    this.lightboxClose?.addEventListener('click', () => this.closeLightbox());
    this.lightbox?.addEventListener('click', (e) => {
      if (e.target === this.lightbox) this.closeLightbox();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // Thumbnail wheel scroll
    this.thumbnailContainer?.addEventListener('wheel', (e) => this.handleThumbnailScroll(e), { passive: false });
  }

  handleAlbumClick(e) {
    // Handle View Gallery button clicks for MAIN PORTFOLIO only
    if (e.target.classList.contains('view-gallery-btn') && !e.target.closest('.academy-album')) {
      e.preventDefault();
      e.stopPropagation();
      
      const key = e.target.getAttribute('data-album');
      console.log('Main Portfolio View Gallery clicked for:', key);
      
      if (MAIN_PORTFOLIO_ALBUMS[key]) {
        this.showSubAlbumSelection(key, MAIN_PORTFOLIO_ALBUMS[key]);
      }
      return;
    }
    
    // Legacy fallback for panel clicks
    const panel = e.target.closest('[data-album]');
    if (!panel) return;
    
    const key = panel.getAttribute('data-album');
    console.log('Clicked album:', key);
    
    if (MAIN_PORTFOLIO_ALBUMS[key]) {
      this.showSubAlbumSelection(key, MAIN_PORTFOLIO_ALBUMS[key]);
    }
  }

  // Function to show sub-album selection
  showSubAlbumSelection(albumKey, albumData) {
    console.log('Showing sub-albums for:', albumKey);
    
    // Get sub-albums (show all, including empty ones)
    const subAlbumsWithContent = Object.entries(albumData).filter(([name, content]) => {
      if (Array.isArray(content)) {
        return true; // Show both empty and filled arrays
      } else if (typeof content === 'object' && content !== null) {
        return true; // Show nested objects regardless of content
      }
      return false;
    });
    
    if (subAlbumsWithContent.length === 0) {
      console.log('No sub-albums found');
      return;
    }
    
    const mainImageContainer = document.getElementById('mainImageContainer');
    
    // Clear and setup sub-album selection
    mainImageContainer.innerHTML = `
      <div class="w-full max-w-6xl mx-auto p-8">
        <h2 class="text-4xl font-bold text-white mb-8 text-center">Select Album</h2>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${subAlbumsWithContent.map(([subAlbumName, content]) => {
            const { count, firstImage, isEmpty } = this.getSubAlbumInfo(content);
            const placeholderImage = "https://res.cloudinary.com/djr43ohnq/image/upload/v1757622401/Hero_2_ksquax.png";
            const displayImage = firstImage || placeholderImage;
            
            return `
              <div class="sub-album-card bg-white/10 backdrop-blur-sm rounded-xl p-6 cursor-pointer hover:bg-white/20 transition-all transform hover:scale-105 ${isEmpty ? 'opacity-75' : ''}" 
                   data-album="${albumKey}" data-subalbum="${subAlbumName}" data-empty="${isEmpty}">
                <div class="aspect-video bg-center bg-cover rounded-lg mb-4 relative" 
                     style="background-image: url('${displayImage}')">
                  ${isEmpty ? '<div class="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"><span class="text-white font-semibold">Coming Soon</span></div>' : ''}
                </div>
                <h3 class="text-xl font-semibold text-white mb-2">${this.getDisplayName(albumKey, subAlbumName)}</h3>
                <p class="text-white/80">${isEmpty ? 'Coming Soon' : count + ' photos'}</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    // Add click handlers for sub-album cards
    mainImageContainer.querySelectorAll('.sub-album-card').forEach(card => {
      card.addEventListener('click', () => {
        const isEmpty = card.dataset.empty === 'true';
        
        if (isEmpty) {
          console.log('This album is coming soon!');
          return;
        }
        
        const subAlbumName = card.dataset.subalbum;
        const content = albumData[subAlbumName];
        const displayName = this.getDisplayName(albumKey, subAlbumName);
        
        // Check if this sub-album has nested content
        if (typeof content === 'object' && !Array.isArray(content)) {
          this.showNestedSubAlbumSelection(albumKey, subAlbumName, content, displayName);
        } else {
          this.openImageGallery(content, displayName);
        }
      });
    });
    
    // Show the album view
    this.albumsSlider.classList.add('hidden');
    this.albumView.classList.remove('hidden');
  }

  // Show nested sub-album selection (e.g., individual wedding couples)
  showNestedSubAlbumSelection(albumKey, subAlbumName, nestedData, parentDisplayName) {
    console.log('Showing nested sub-albums for:', albumKey, subAlbumName);
    
    const nestedSubAlbumsWithContent = Object.entries(nestedData).filter(([name, photos]) => 
      Array.isArray(photos)
    );
    
    if (nestedSubAlbumsWithContent.length === 0) {
      console.log('No nested sub-albums found');
      return;
    }
    
    const mainImageContainer = document.getElementById('mainImageContainer');
    
    mainImageContainer.innerHTML = `
      <div class="w-full max-w-6xl mx-auto p-8">
        <h2 class="text-4xl font-bold text-white mb-4 text-center">${parentDisplayName}</h2>
        <p class="text-white/80 mb-8 text-center">Select a specific album to view</p>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${nestedSubAlbumsWithContent.map(([nestedName, photos]) => {
            const isEmpty = photos.length === 0;
            const placeholderImage = "https://res.cloudinary.com/djr43ohnq/image/upload/v1757622401/Hero_2_ksquax.png";
            const displayImage = photos.length > 0 ? photos[0] : placeholderImage;
            
            return `
              <div class="nested-sub-album-card bg-white/10 backdrop-blur-sm rounded-xl p-6 cursor-pointer hover:bg-white/20 transition-all transform hover:scale-105 ${isEmpty ? 'opacity-75' : ''}" 
                   data-album="${albumKey}" data-subalbum="${subAlbumName}" data-nested="${nestedName}" data-empty="${isEmpty}">
                <div class="aspect-video bg-center bg-cover rounded-lg mb-4 relative" 
                     style="background-image: url('${displayImage}')">
                  ${isEmpty ? '<div class="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"><span class="text-white font-semibold">Coming Soon</span></div>' : ''}
                </div>
                <h3 class="text-xl font-semibold text-white mb-2">${nestedName}</h3>
                <p class="text-white/80">${isEmpty ? 'Coming Soon' : photos.length + ' photos'}</p>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    // Add click handlers for nested sub-album cards
    mainImageContainer.querySelectorAll('.nested-sub-album-card').forEach(card => {
      card.addEventListener('click', () => {
        const isEmpty = card.dataset.empty === 'true';
        
        if (isEmpty) {
          console.log('This album is coming soon!');
          return;
        }
        
        const nestedName = card.dataset.nested;
        const photos = nestedData[nestedName];
        this.openImageGallery(photos, `${parentDisplayName} - ${nestedName}`);
      });
    });
  }

  // Open image gallery
  openImageGallery(items, title) {
    console.log('Opening image gallery with', items.length, 'items');
    
    this.currentAlbumImages = items;
    this.currentImageIndex = 0;
    this.currentAlbumTitle = title;
    this.currentAlbumDescription = this.getAlbumDescription(title);
    
    const mainImageContainer = document.getElementById('mainImageContainer');
    mainImageContainer.innerHTML = `
      <img id="mainImageEl" class="max-w-full max-h-full object-contain cursor-pointer transition-transform hover:scale-105" />
      
      <!-- Album Description - Bottom Left Overlay -->
      <div id="albumDescription" class="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm rounded-lg p-4 text-white max-w-md">
        <h3 class="text-xl font-bold mb-2">${this.currentAlbumTitle}</h3>
        <p class="text-white/90 text-sm leading-relaxed">${this.currentAlbumDescription}</p>
        <div class="flex items-center justify-between mt-3">
          <span class="text-white/70 text-xs">${items.length} photos</span>
          <button id="autoPlayToggle" class="text-white/80 hover:text-white transition-colors">
            <svg id="playIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m2-5a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span id="autoPlayText" class="text-xs ml-1">Auto-play</span>
          </button>
        </div>
      </div>
    `;
    
    const mainImageEl = document.getElementById('mainImageEl');
    mainImageEl.src = items[0];
    mainImageEl.alt = 'Portfolio image';
    mainImageEl.decoding = 'async';
    
    // Add click handler for lightbox
    mainImageEl.addEventListener('click', () => {
      this.openLightbox(this.currentAlbumImages[this.currentImageIndex], this.currentImageIndex);
    });
    
    // Pause auto-play on hover, resume on mouse leave
    mainImageEl.addEventListener('mouseenter', () => {
      if (this.isAutoPlaying) {
        this.pauseAutoPlay();
        this.wasAutoPlayingBeforeHover = true;
      }
    });
    
    mainImageEl.addEventListener('mouseleave', () => {
      if (this.wasAutoPlayingBeforeHover) {
        this.startAutoPlay();
        this.wasAutoPlayingBeforeHover = false;
      }
    });
    
    // Auto-play toggle functionality
    const autoPlayToggle = document.getElementById('autoPlayToggle');
    autoPlayToggle.addEventListener('click', () => {
      this.toggleAutoPlay();
    });
    
    // Create thumbnails with click handlers
    this.thumbnailContainer.innerHTML = items.map((url, index) => `
      <div class="thumbnail shrink-0 w-16 h-16 bg-center bg-cover cursor-pointer border-2 transition-all duration-300 rounded-lg ${
        index === 0 ? 'border-yellow-400 opacity-100 scale-110' : 'border-transparent opacity-70 hover:opacity-90 hover:scale-105'
      }" 
           style="background-image:url('${url}')" 
           data-index="${index}">
      </div>
    `).join('');
    
    // Add click handlers to thumbnails
    this.thumbnailContainer.querySelectorAll('.thumbnail').forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.setCurrentImage(index);
        this.pauseAutoPlay(); // Pause auto-play when user manually selects
      });
    });
    
    this.updateImageCounter();
    
    this.albumsSlider.classList.add('hidden');
    this.albumView.classList.remove('hidden');
    
    // Start auto-play by default
    this.startAutoPlay();
    
    console.log('Image gallery opened with navigation ready');
  }

  // Helper functions
  getSubAlbumInfo(content) {
    if (Array.isArray(content)) {
      if (content.length === 0) {
        return { count: 0, firstImage: null, isEmpty: true };
      }
      return { count: content.length, firstImage: content[0], isEmpty: false };
    } else if (typeof content === 'object' && content !== null) {
      let totalCount = 0;
      let firstImage = null;
      
      Object.values(content).forEach(nestedArray => {
        if (Array.isArray(nestedArray) && nestedArray.length > 0) {
          totalCount += nestedArray.length;
          if (!firstImage) firstImage = nestedArray[0];
        }
      });
      
      const isEmpty = totalCount === 0;
      return { count: totalCount, firstImage, isEmpty };
    }
    return { count: 0, firstImage: null, isEmpty: true };
  }

  getDisplayName(albumKey, subAlbumName) {
    const displayNames = {
      photos: {
        events: "Event Photography",
        introductions: "Introductions",
        portraits: "Portrait Sessions", 
        weddings: "Wedding Photography"
      },
      videos: {
        commercials: "Commercial Videos",
        corporate: "Corporate Videos",
        documentaries: "Documentaries",
        events: "Event Videography",
        introductions: "Introduction Videos",
        liveEvents: "Live Event Coverage",
        loveStories: "Love Stories",
        memoryLanes: "Memory Lane Videos",
        musicVideos: "Music Videos",
        promotional: "Promotional Videos",
        reels: "Social Media Reels",
        testimonials: "Client Testimonials",
        training: "Training Videos",
        weddings: "Wedding Videography"
      },
      graphics: {
        banners: "Banner Designs",
        branding: "Brand Identity",
        businessCards: "Business Cards",
        certificates: "Certificates",
        companyProfiles: "Company Profiles",
        eflyers: "Digital Flyers",
        letterheads: "Letterhead Designs",
        logos: "Logo Designs",
        posters: "Poster Designs",
        socialMedia: "Social Media Graphics"
      },
      websites: {
        blogs: "Blog Websites",
        bookingSystems: "Booking Systems",
        cmsSystems: "Content Management Systems",
        corporate: "Corporate Websites",
        crmSystems: "Customer Relationship Management",
        dashboards: "Admin Dashboards",
        ecommerce: "E-commerce Stores",
        inventorySystems: "Inventory Management Systems",
        landingPages: "Landing Pages",
        learningSystems: "Learning Management Systems",
        mobileApps: "Mobile Applications",
        paymentSystems: "Payment Gateway Systems",
        portfolios: "Portfolio Websites",
        screenshots: "Project Screenshots",
        systems: "Custom System Solutions"
      }
    };
    
    return displayNames[albumKey]?.[subAlbumName] || 
           subAlbumName.charAt(0).toUpperCase() + subAlbumName.slice(1);
  }

  setCurrentImage(index) {
    if (index < 0 || index >= this.currentAlbumImages.length) return;
    
    this.currentImageIndex = index;
    
    const currentMainImageEl = document.getElementById('mainImageEl');
    if (currentMainImageEl) {
      currentMainImageEl.src = this.currentAlbumImages[index];
      currentMainImageEl.alt = `Portfolio image ${index + 1} of ${this.currentAlbumImages.length}`;
    }
    
    // Update thumbnail selection
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      if (i === index) {
        thumb.classList.add('border-yellow-400', 'opacity-100', 'scale-110');
        thumb.classList.remove('border-transparent', 'opacity-70');
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        thumb.classList.remove('border-yellow-400', 'opacity-100', 'scale-110');
        thumb.classList.add('border-transparent', 'opacity-70');
      }
    });
    
    this.updateImageCounter();
  }

  updateImageCounter() {
    const counterText = `${this.currentImageIndex + 1} / ${this.currentAlbumImages.length}`;
    if (this.imageCounter) {
      this.imageCounter.textContent = counterText;
    }
    if (this.lightboxCounter) {
      this.lightboxCounter.textContent = counterText;
    }
  }

  openLightbox(imageUrl, index) {
    this.lightboxImage.src = imageUrl;
    this.lightboxImage.alt = `Portfolio image ${index + 1} of ${this.currentAlbumImages.length}`;
    this.lightbox.classList.remove('hidden');
    this.currentImageIndex = index;
    this.updateImageCounter();
  }

  closeLightbox() {
    this.lightbox.classList.add('hidden');
  }

  closeAlbumView() {
    this.pauseAutoPlay(); // Stop auto-play when closing
    this.albumView.classList.add('hidden');
    this.albumsSlider.classList.remove('hidden');
  }

  navigateImage(direction) {
    const newIndex = direction > 0 
      ? (this.currentImageIndex < this.currentAlbumImages.length - 1 ? this.currentImageIndex + 1 : 0)
      : (this.currentImageIndex > 0 ? this.currentImageIndex - 1 : this.currentAlbumImages.length - 1);
    this.setCurrentImage(newIndex);
  }

  // Auto-play functionality
  startAutoPlay() {
    if (this.autoPlayInterval) return; // Already playing
    
    this.isAutoPlaying = true;
    this.updateAutoPlayButton();
    
    this.autoPlayInterval = setInterval(() => {
      this.navigateImage(1); // Move to next image
    }, this.autoPlayDelay);
    
    console.log('Auto-play started');
  }

  pauseAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
      this.autoPlayInterval = null;
    }
    this.isAutoPlaying = false;
    this.updateAutoPlayButton();
    console.log('Auto-play paused');
  }

  toggleAutoPlay() {
    if (this.isAutoPlaying) {
      this.pauseAutoPlay();
    } else {
      this.startAutoPlay();
    }
  }

  updateAutoPlayButton() {
    const playIcon = document.getElementById('playIcon');
    const autoPlayText = document.getElementById('autoPlayText');
    
    if (playIcon && autoPlayText) {
      if (this.isAutoPlaying) {
        playIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
        autoPlayText.textContent = 'Pause';
      } else {
        playIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m2-5a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
        autoPlayText.textContent = 'Auto-play';
      }
    }
  }

  // Get album description based on title
  getAlbumDescription(title) {
    const descriptions = {
      "Event Photography": "Capturing the energy and excitement of special moments, from corporate events to celebrations. Each image tells a story of joy, connection, and memorable experiences.",
      "Introductions": "Professional introduction and portrait sessions designed to showcase personality and professionalism. Perfect for corporate profiles, social media, and personal branding.",
      "Portrait Sessions": "Intimate and artistic portrait photography that captures the essence of each individual. From family portraits to personal artistic expressions.",
      "Wedding Photography": "Documenting love stories through artistic and emotional photography. Capturing every precious moment from intimate ceremonies to grand celebrations.",
      "Commercial Videos": "High-quality video production for businesses looking to engage their audience and promote their brand through compelling visual storytelling.",
      "Corporate Videos": "Professional video content tailored for corporate communications, training materials, and company presentations.",
      "Social Media Reels": "Dynamic and engaging short-form video content optimized for social media platforms to boost engagement and reach.",
      "Brand Identity": "Comprehensive branding solutions including logo design, color schemes, and visual identity systems that make your brand memorable.",
      "Logo Designs": "Creative and meaningful logo designs that represent your brand's values and create lasting impressions with your target audience.",
      "Corporate Websites": "Professional website development focused on user experience, functionality, and business growth through digital presence.",
      "Admin Dashboards": "Intuitive and powerful dashboard interfaces that make data management and business operations efficient and user-friendly."
    };

    // Handle nested album titles (e.g., "Wedding Photography - Katherine & Ron")
    const baseTitle = title.split(' - ')[0];
    
    return descriptions[title] || descriptions[baseTitle] || 
           "A curated collection showcasing our creative expertise and attention to detail. Each piece represents our commitment to quality and artistic excellence.";
  }

  scrollThumbnails(amount) {
    this.thumbnailContainer.scrollBy({ left: amount, behavior: 'smooth' });
  }

  handleThumbnailScroll(e) {
    if (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      this.thumbnailContainer.scrollBy({ left: scrollAmount * 2, behavior: 'auto' });
    }
  }

  handleKeyboard(e) {
    if (e.key === 'Escape') {
      if (!this.lightbox.classList.contains('hidden')) {
        this.closeLightbox();
      } else if (!this.albumView.classList.contains('hidden')) {
        this.closeAlbumView();
      }
    }
    
    if (!this.albumView.classList.contains('hidden') || !this.lightbox.classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.pauseAutoPlay();
        this.navigateImage(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.pauseAutoPlay();
        this.navigateImage(1);
      } else if (e.key === ' ') { // Spacebar to toggle auto-play
        e.preventDefault();
        this.toggleAutoPlay();
      }
    }
  }
}

// Initialize Main Portfolio Manager
new MainPortfolioManager();