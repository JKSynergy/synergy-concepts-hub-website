// =================================================================
// ACADEMY PORTFOLIO MANAGEMENT SYSTEM - OPTIMIZED
// =================================================================

// Performance optimized academy portfolio management
class AcademyPortfolio {
  constructor() {
    this.albumCache = new Map();
    this.imageCache = new Map();
    this.loadingQueue = [];
    this.maxConcurrentLoads = 3;
    this.currentLoads = 0;
    
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupPortfolio());
    } else {
      this.setupPortfolio();
    }
  }

  setupPortfolio() {
    this.loadAcademyAlbums();
    this.setupLazyLoading();
    this.setupImageOptimization();
  }

  // Optimized image URL generation
  optimizeImageUrl(url, width = 400, quality = 'auto:eco') {
    if (this.imageCache.has(`${url}-${width}`)) {
      return this.imageCache.get(`${url}-${width}`);
    }

    let optimizedUrl = url;
    
    // Add Cloudinary optimizations if it's a Cloudinary URL
    if (url.includes('cloudinary.com')) {
      const parts = url.split('/upload/');
      if (parts.length === 2) {
        optimizedUrl = `${parts[0]}/upload/f_auto,q_${quality},w_${width},c_limit/${parts[1]}`;
      }
    }
    
    this.imageCache.set(`${url}-${width}`, optimizedUrl);
    return optimizedUrl;
  }

  loadAcademyAlbums() {
    // Academy album structure with optimized loading
    this.academyAlbums = {
      classrooms: this.createOptimizedAlbum([
        "academy images/classrooms/20250822_163612.jpg",
        "academy images/classrooms/20250822_164554.jpg",
        "academy images/classrooms/20250822_164609.jpg",
        "academy images/classrooms/20250822_164614.jpg",
        "academy images/classrooms/20250822_164638.jpg"
      ]),
      
      'photography-classes': this.createOptimizedAlbum([
        "academy images/photography-classes/IMG_0105.jpg",
        "academy images/photography-classes/IMG_0106.jpg",
        "academy images/photography-classes/IMG_0107.jpg",
        "academy images/photography-classes/IMG_0110.jpg"
      ]),
      
      'students-working': this.createOptimizedAlbum([
        "academy images/students-working/student 01 (1).jpg",
        "academy images/students-working/student 01 (2).jpg",
        "academy images/students-working/student 01 (3).jpg",
        "academy images/students-working/student 01 (4).jpg",
        "academy images/students-working/student 01 (5).jpg"
      ])
    };
  }

  createOptimizedAlbum(images) {
    return images.map(img => ({
      original: img,
      thumbnail: this.optimizeImageUrl(img, 300),
      medium: this.optimizeImageUrl(img, 800),
      alt: this.generateAltText(img)
    }));
  }

  generateAltText(imagePath) {
    const filename = imagePath.split('/').pop().split('.')[0];
    const folder = imagePath.split('/').slice(-2, -1)[0];
    
    return `${folder.replace('-', ' ')} - ${filename}`.replace(/[\d_]/g, ' ').trim();
  }
}

// Initialize academy portfolio
const academyPortfolio = new AcademyPortfolio();
const ACADEMY_ALBUMS = {
  'photos': {
    title: 'Photography Gallery',
    photos: [
      'academy images/photography-classes/IMG_0105.jpg',
      'academy images/photography-classes/IMG_0106.jpg',
      'academy images/photography-classes/IMG_0107.jpg',
      'academy images/photography-classes/IMG_0110.jpg',
      'academy images/classrooms/20250822_163612.jpg',
      'academy images/classrooms/20250822_164554.jpg',
      'academy images/classrooms/20250822_164609.jpg',
      'academy images/classrooms/20250822_164614.jpg',
      'academy images/classrooms/20250822_164638.jpg',
      'academy images/classrooms/20250822_164713.jpg'
    ]
  },
  'videos': {
    title: 'Video Production Gallery',
    photos: [
      'academy images/students-working/student 01 (1).jpg',
      'academy images/students-working/student 01 (2).jpg',
      'academy images/students-working/student 01 (3).jpg',
      'academy images/students-working/student 01 (4).jpg',
      'academy images/students-working/student 01 (5).jpg',
      'academy images/students-working/student 01 (6).jpg',
      'academy images/students-working/student 01 (7).jpg'
    ]
  },
  'graphics': {
    title: 'Graphics Design Gallery',
    photos: [
      'academy images/classrooms/20250822_164726.jpg',
      'academy images/classrooms/20250822_164742.jpg',
      'academy images/classrooms/20250822_165039.jpg',
      'academy images/classrooms/20250822_165047.jpg',
      'academy images/classrooms/20250822_165101.jpg',
      'academy images/classrooms/20250822_165134.jpg',
      'academy images/classrooms/20250822_165156.jpg'
    ]
  },
  'websites': {
    title: 'Web Development Gallery',
    photos: [
      'academy images/classrooms/20250822_165220.jpg',
      'academy images/classrooms/20250822_165240.jpg',
      'academy images/classrooms/20250822_165252.jpg',
      'academy images/classrooms/20250822_165310.jpg',
      'academy images/classrooms/20250822_165321.jpg',
      'academy images/classrooms/20250822_165352.jpg',
      'academy images/classrooms/20250822_165442.jpg',
      'academy images/classrooms/20250822_165604.jpg'
    ]
  }
};

let currentAcademyAlbum = null;
let currentAcademyImageIndex = 0;

// Academy Portfolio Manager Class
class AcademyPortfolioManager {
  constructor() {
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeAcademy());
    } else {
      this.initializeAcademy();
    }
  }

  initializeAcademy() {
    console.log('Academy album system initializing...');
    
    // Add small delay to ensure all elements are loaded
    setTimeout(() => {
      this.bindAcademyEvents();
    }, 500);
  }

  bindAcademyEvents() {
    const academyAlbumCards = document.querySelectorAll('.academy-album');
    console.log('Found academy cards:', academyAlbumCards.length);
    
    if (academyAlbumCards.length === 0) {
      console.error('No academy album cards found!');
      return;
    }
    
    // Get all academy elements
    this.academyViewer = document.getElementById('academyAlbumViewer');
    this.academyTitle = document.getElementById('academyAlbumTitle');
    this.academyCount = document.getElementById('academyAlbumCount');
    this.academyMainImage = document.getElementById('academyMainImage');
    this.academyThumbnails = document.getElementById('academyThumbnails');
    this.academyClose = document.getElementById('academyAlbumClose');
    this.academyPrev = document.getElementById('academyPrevImage');
    this.academyNext = document.getElementById('academyNextImage');

    console.log('Academy viewer element:', this.academyViewer);
    console.log('ACADEMY_ALBUMS object:', ACADEMY_ALBUMS);

    if (!this.academyViewer) {
      console.error('Academy album viewer not found!');
      return;
    }

    // Bind events
    this.bindCardEvents(academyAlbumCards);
    this.bindNavigationEvents();
    this.bindKeyboardEvents();
  }

  bindCardEvents(academyAlbumCards) {
    // Open album when card is clicked
    academyAlbumCards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Academy card clicked:', card.dataset.album);
        const albumKey = card.dataset.album;
        if (ACADEMY_ALBUMS[albumKey]) {
          console.log('Opening album:', albumKey);
          this.openAcademyAlbum(albumKey);
        } else {
          console.log('Album not found:', albumKey);
          console.log('Available albums:', Object.keys(ACADEMY_ALBUMS));
        }
      });
    });

    // Also bind to any VIEW GALLERY buttons within academy cards
    academyAlbumCards.forEach(card => {
      const viewButton = card.querySelector('button, .view-gallery-btn');
      if (viewButton) {
        viewButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const albumKey = card.dataset.album;
          if (ACADEMY_ALBUMS[albumKey]) {
            this.openAcademyAlbum(albumKey);
          }
        });
      }
    });
  }

  bindNavigationEvents() {
    // Close album
    this.academyClose?.addEventListener('click', () => this.closeAcademyAlbum());
    this.academyViewer?.addEventListener('click', (e) => {
      if (e.target === this.academyViewer) this.closeAcademyAlbum();
    });

    // Navigation arrows
    this.academyPrev?.addEventListener('click', () => this.changeAcademyImage(-1));
    this.academyNext?.addEventListener('click', () => this.changeAcademyImage(1));
  }

  bindKeyboardEvents() {
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.academyViewer?.classList.contains('hidden')) {
        switch(e.key) {
          case 'Escape':
            this.closeAcademyAlbum();
            break;
          case 'ArrowLeft':
            this.changeAcademyImage(-1);
            break;
          case 'ArrowRight':
            this.changeAcademyImage(1);
            break;
        }
      }
    });
  }

  openAcademyAlbum(albumKey) {
    console.log('Opening academy album:', albumKey);
    currentAcademyAlbum = ACADEMY_ALBUMS[albumKey];
    currentAcademyImageIndex = 0;
    
    if (!currentAcademyAlbum) {
      console.error('Academy album not found:', albumKey);
      return;
    }
    
    this.academyTitle.textContent = currentAcademyAlbum.title;
    this.academyCount.textContent = `${currentAcademyAlbum.photos.length} photos`;
    
    this.updateAcademyImage();
    this.createAcademyThumbnails();
    
    this.academyViewer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    console.log('Academy album opened successfully');
  }

  closeAcademyAlbum() {
    this.academyViewer.classList.add('hidden');
    document.body.style.overflow = '';
    currentAcademyAlbum = null;
    console.log('Academy album closed');
  }

  changeAcademyImage(direction) {
    if (!currentAcademyAlbum) return;
    
    currentAcademyImageIndex += direction;
    
    if (currentAcademyImageIndex < 0) {
      currentAcademyImageIndex = currentAcademyAlbum.photos.length - 1;
    } else if (currentAcademyImageIndex >= currentAcademyAlbum.photos.length) {
      currentAcademyImageIndex = 0;
    }
    
    this.updateAcademyImage();
    this.updateAcademyThumbnails();
  }

  updateAcademyImage() {
    if (!currentAcademyAlbum || !this.academyMainImage) return;
    
    this.academyMainImage.src = currentAcademyAlbum.photos[currentAcademyImageIndex];
    
    // Update image counter
    const counter = document.getElementById('academyImageCounter');
    if (counter) {
      counter.textContent = `${currentAcademyImageIndex + 1} / ${currentAcademyAlbum.photos.length}`;
    }
  }

  createAcademyThumbnails() {
    if (!currentAcademyAlbum || !this.academyThumbnails) return;
    
    this.academyThumbnails.innerHTML = '';
    
    currentAcademyAlbum.photos.forEach((photo, index) => {
      const thumb = document.createElement('img');
      thumb.src = photo;
      thumb.className = `w-16 h-16 object-cover rounded cursor-pointer transition-all ${
        index === currentAcademyImageIndex ? 'ring-2 ring-white opacity-100' : 'opacity-60 hover:opacity-80'
      }`;
      
      thumb.addEventListener('click', () => {
        currentAcademyImageIndex = index;
        this.updateAcademyImage();
        this.updateAcademyThumbnails();
      });
      
      this.academyThumbnails.appendChild(thumb);
    });
  }

  updateAcademyThumbnails() {
    if (!this.academyThumbnails) return;
    
    const thumbs = this.academyThumbnails.querySelectorAll('img');
    thumbs.forEach((thumb, index) => {
      if (index === currentAcademyImageIndex) {
        thumb.className = 'w-16 h-16 object-cover rounded cursor-pointer transition-all ring-2 ring-white opacity-100';
      } else {
        thumb.className = 'w-16 h-16 object-cover rounded cursor-pointer transition-all opacity-60 hover:opacity-80';
      }
    });
  }
}

// Initialize Academy Portfolio Manager
new AcademyPortfolioManager();