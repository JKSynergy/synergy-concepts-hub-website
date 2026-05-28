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
    // Film production — add video thumbnails when ready (empty = Coming Soon in UI)
    commercials: [],
    corporate: [],
    documentaries: [],
    events: [],
    introductions: [],
    liveEvents: [],
    loveStories: [],
    memoryLanes: [],
    musicVideos: [],
    promotional: [],
    reels: [],
    testimonials: [],
    training: [],
    weddings: []
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
      "images/albums/graphics/eflyers/SMA COURSES-01.png",
      "images/albums/graphics/eflyers/SMA COURSES-02.png",
      "images/albums/graphics/eflyers/SMA STUDY TIMES-02.jpg"
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

const FILM_ALBUM_GROUPS = [
  {
    id: 'brand',
    label: 'Brand & Commercial',
    description: 'Corporate films, ads, and brand storytelling',
    albums: ['commercials', 'corporate', 'promotional', 'documentaries', 'training']
  },
  {
    id: 'events',
    label: 'Events & Stories',
    description: 'Weddings, live coverage, and personal narratives',
    albums: ['events', 'liveEvents', 'weddings', 'loveStories', 'memoryLanes', 'introductions']
  },
  {
    id: 'creative',
    label: 'Social & Creative',
    description: 'Reels, music videos, and client testimonials',
    albums: ['reels', 'musicVideos', 'testimonials']
  }
];

const FILM_ALBUMS_COMING_SOON = true;

const FILM_ALBUM_META = {
  commercials: { tagline: 'High-impact brand stories', accent: 'blue', category: 'Commercial' },
  corporate: { tagline: 'Professional corporate films', accent: 'blue', category: 'Corporate' },
  promotional: { tagline: 'Campaign & launch films', accent: 'orange', category: 'Promo' },
  documentaries: { tagline: 'Long-form documentary work', accent: 'blue', category: 'Documentary' },
  training: { tagline: 'Educational & training content', accent: 'green', category: 'Training' },
  events: { tagline: 'Event highlights & recaps', accent: 'orange', category: 'Events' },
  liveEvents: { tagline: 'Live event coverage', accent: 'red', category: 'Live' },
  weddings: { tagline: 'Cinematic wedding films', accent: 'orange', category: 'Wedding' },
  loveStories: { tagline: 'Romantic story films', accent: 'orange', category: 'Love Story' },
  memoryLanes: { tagline: 'Nostalgic memory films', accent: 'blue', category: 'Memory' },
  introductions: { tagline: 'Profile & intro videos', accent: 'green', category: 'Intro' },
  reels: { tagline: 'Short-form social reels', accent: 'orange', category: 'Reels' },
  musicVideos: { tagline: 'Music & artist visuals', accent: 'red', category: 'Music' },
  testimonials: { tagline: 'Client testimonial films', accent: 'green', category: 'Testimonial' }
};

// Main Portfolio Manager Class
class MainPortfolioManager {
  constructor() {
    this.currentAlbumImages = [];
    this.currentImageIndex = 0;
    this.currentAlbumTitle = '';
    this.currentAlbumDescription = '';
    this.currentAlbumKey = '';
    this.inGalleryView = false;
    this.lastFilmAlbumData = null;
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

    if (!this.albumView) {
      console.log('Portfolio viewer not found on this page');
      return;
    }

    console.log('Portfolio album system initializing...');
    this.bindEvents();
  }

  bindEvents() {
    this.albumsSlider?.addEventListener('click', (e) => this.handleAlbumClick(e));

    const mediaSection = document.getElementById('media');
    mediaSection?.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-album]');
      if (!trigger) return;
      e.preventDefault();
      this.handleMediaAlbumClick(trigger);
    });

    mediaSection?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const trigger = e.target.closest('[data-album]');
      if (!trigger) return;
      e.preventDefault();
      this.handleMediaAlbumClick(trigger);
    });

    this.albumBack?.addEventListener('click', () => this.handleAlbumBack());

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

    this.initAlbumTouchSwipe();
  }

  initAlbumTouchSwipe() {
    const stage = this.albumView?.querySelector('.album-main-stage');
    if (!stage) return;

    let touchStartX = 0;
    let touchStartY = 0;

    stage.addEventListener(
      'touchstart',
      (e) => {
        if (this.albumView.classList.contains('hidden')) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      },
      { passive: true }
    );

    stage.addEventListener(
      'touchend',
      (e) => {
        if (this.albumView.classList.contains('hidden') || !this.inGalleryView || !this.currentAlbumImages.length) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;

        this.pauseAutoPlay();
        this.navigateImage(dx > 0 ? -1 : 1);
      },
      { passive: true }
    );
  }

  handleMediaAlbumClick(trigger) {
    const albumKey = trigger.getAttribute('data-album');
    const subAlbum = trigger.getAttribute('data-subalbum');
    const nested = trigger.getAttribute('data-nested');

    if (!albumKey || !MAIN_PORTFOLIO_ALBUMS[albumKey]) return;

    document.body.classList.add('album-open');

    if (nested && subAlbum) {
      const nestedContent = MAIN_PORTFOLIO_ALBUMS[albumKey][subAlbum]?.[nested];
      if (Array.isArray(nestedContent) && nestedContent.length > 0) {
        if (albumKey === 'videos') this.lastFilmAlbumData = MAIN_PORTFOLIO_ALBUMS.videos;
        this.openImageGallery(nestedContent, nested, albumKey);
      }
      return;
    }

    if (subAlbum) {
      const content = MAIN_PORTFOLIO_ALBUMS[albumKey][subAlbum];
      const displayName = this.getDisplayName(albumKey, subAlbum);

      if (Array.isArray(content)) {
        if (content.length > 0) {
          if (albumKey === 'videos') this.lastFilmAlbumData = MAIN_PORTFOLIO_ALBUMS.videos;
          this.openImageGallery(content, displayName, albumKey);
        } else {
          this.showSubAlbumSelection(albumKey, MAIN_PORTFOLIO_ALBUMS[albumKey]);
        }
      } else if (typeof content === 'object' && content !== null) {
        this.showNestedSubAlbumSelection(albumKey, subAlbum, content, displayName);
      }
      return;
    }

    this.showSubAlbumSelection(albumKey, MAIN_PORTFOLIO_ALBUMS[albumKey]);
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

    if (albumKey === 'videos') {
      this.showFilmAlbumSelection(albumData);
      return;
    }
    
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
          this.openImageGallery(content, displayName, albumKey);
        }
      });
    });
    
    // Show the album view
    this.albumsSlider?.classList.add('hidden');
    this.albumView.classList.remove('hidden');
    this.setAlbumViewMode('default');
  }

  showFilmAlbumSelection(albumData) {
    this.currentAlbumKey = 'videos';
    this.inGalleryView = false;
    this.lastFilmAlbumData = albumData;
    this.pauseAutoPlay();

    const mainImageContainer = document.getElementById('mainImageContainer');

    const renderGroup = (group) => {
      const cards = group.albums
        .filter((key) => albumData[key] !== undefined)
        .map((subAlbumName) => this.renderFilmAlbumCard(subAlbumName, albumData[subAlbumName]))
        .join('');

      if (!cards) return '';

      return `
        <section class="film-album-group" aria-labelledby="film-group-${group.id}">
          <div class="film-album-group__head">
            <h3 id="film-group-${group.id}" class="film-album-group__title">${group.label}</h3>
            <p class="film-album-group__desc">${group.description}</p>
          </div>
          <div class="film-album-grid">${cards}</div>
        </section>
      `;
    };

    mainImageContainer.innerHTML = `
      <div class="film-album-picker">
        <header class="film-album-picker__hero">
          <span class="film-album-picker__label">Film Production</span>
          <h2 class="film-album-picker__title">Choose a Collection</h2>
          <p class="film-album-picker__subtitle">Collections are being updated. All categories show as coming soon until new films are uploaded.</p>
        </header>
        ${FILM_ALBUM_GROUPS.map(renderGroup).join('')}
      </div>
    `;

    this.bindFilmAlbumCards(mainImageContainer, albumData);
    this.setAlbumViewMode('film-picker');
    this.updateAlbumBreadcrumb('Film Production', 'Collections');

    this.albumsSlider?.classList.add('hidden');
    this.albumView.classList.remove('hidden');
    document.body.classList.add('album-open');
    this.thumbnailContainer.innerHTML = '';
    this.imageCounter.textContent = '';

    requestAnimationFrame(() => {
      const stage = this.albumView?.querySelector('.album-main-stage');
      if (stage) stage.scrollTop = 0;
    });
  }

  renderFilmAlbumCard(subAlbumName, content) {
    const isEmpty = FILM_ALBUMS_COMING_SOON || this.getSubAlbumInfo(content).isEmpty;
    const displayName = this.getDisplayName('videos', subAlbumName);
    const meta = FILM_ALBUM_META[subAlbumName] || { tagline: 'Cinematic video collection', accent: 'blue', category: 'Film' };

    const emptyClass = isEmpty ? 'film-album-card--empty' : '';
    const emptyData = isEmpty ? 'true' : 'false';
    const thumbStyle = isEmpty ? '' : `style="background-image: url('${this.getSubAlbumInfo(content).firstImage}')"`;
    const frameClass = isEmpty ? 'film-album-card__frame--soon' : '';
    const thumbClass = isEmpty ? 'film-album-card__thumb--placeholder' : 'film-album-card__thumb';

    return `
      <article class="film-album-card film-album-card--${meta.accent} ${emptyClass}"
               data-album="videos" data-subalbum="${subAlbumName}" data-empty="${emptyData}"
               tabindex="0" role="button" aria-label="${displayName}${isEmpty ? ', coming soon' : ''}">
        <div class="film-album-card__frame ${frameClass}">
          <div class="${thumbClass}" ${thumbStyle} aria-hidden="true"></div>
          <div class="film-album-card__grain" aria-hidden="true"></div>
          <div class="film-album-card__vignette" aria-hidden="true"></div>
          <div class="film-album-card__play" aria-hidden="true">
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span class="film-album-card__badge">${meta.category}</span>
          <span class="film-album-card__count">${isEmpty ? 'Coming soon' : `${this.getSubAlbumInfo(content).count} clips`}</span>
          ${isEmpty ? '<span class="film-album-card__soon">Coming Soon</span>' : ''}
        </div>
        <div class="film-album-card__body">
          <h3 class="film-album-card__name">${displayName}</h3>
          <p class="film-album-card__tagline">${isEmpty ? 'New work uploading soon' : meta.tagline}</p>
        </div>
      </article>
    `;
  }

  bindFilmAlbumCards(container, albumData) {
    const openCard = (card) => {
      if (card.dataset.empty === 'true') return;

      const subAlbumName = card.dataset.subalbum;
      const content = albumData[subAlbumName];
      const displayName = this.getDisplayName('videos', subAlbumName);

      if (typeof content === 'object' && !Array.isArray(content)) {
        this.showNestedSubAlbumSelection('videos', subAlbumName, content, displayName);
      } else {
        this.openImageGallery(content, displayName, 'videos');
      }
    };

    container.querySelectorAll('.film-album-card').forEach((card) => {
      card.addEventListener('click', () => openCard(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCard(card);
        }
      });
    });
  }

  setAlbumViewMode(mode) {
    const mainStage = document.getElementById('mainImageContainer');
    this.albumView?.classList.remove('album-view--film-picker', 'album-view--film-gallery');
    mainStage?.classList.remove('main-image-container--film-picker');
    if (mode === 'film-picker') {
      this.albumView?.classList.add('album-view--film-picker');
      mainStage?.classList.add('main-image-container--film-picker');
      this.albumPrev?.classList.add('hidden');
      this.albumNext?.classList.add('hidden');
      document.getElementById('albumThumbBar')?.classList.add('hidden');
    } else if (mode === 'film-gallery') {
      this.albumView?.classList.add('album-view--film-gallery');
      mainStage?.classList.remove('main-image-container--film-picker');
      this.albumPrev?.classList.remove('hidden');
      this.albumNext?.classList.remove('hidden');
      document.getElementById('albumThumbBar')?.classList.remove('hidden');
    } else {
      mainStage?.classList.remove('main-image-container--film-picker');
      this.albumPrev?.classList.remove('hidden');
      this.albumNext?.classList.remove('hidden');
      document.getElementById('albumThumbBar')?.classList.remove('hidden');
    }
  }

  updateAlbumBreadcrumb(section, current) {
    const el = document.getElementById('albumViewBreadcrumb');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `<span class="album-view-breadcrumb__section">${section}</span><span class="album-view-breadcrumb__sep" aria-hidden="true">/</span><span class="album-view-breadcrumb__current">${current}</span>`;
    this.albumBack.textContent = '← Back';
  }

  handleAlbumBack() {
    if (this.currentAlbumKey === 'videos' && this.inGalleryView && this.lastFilmAlbumData) {
      this.showFilmAlbumSelection(this.lastFilmAlbumData);
      return;
    }
    this.closeAlbumView();
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
  openImageGallery(items, title, albumKey = '') {
    console.log('Opening image gallery with', items.length, 'items');

    const isFilm = albumKey === 'videos';
    this.currentAlbumKey = albumKey;
    this.inGalleryView = true;
    this.currentAlbumImages = items;
    this.currentImageIndex = 0;
    this.currentAlbumTitle = title;
    this.currentAlbumDescription = this.getAlbumDescription(title);

    const countLabel = isFilm
      ? `${items.length} ${items.length === 1 ? 'frame' : 'frames'}`
      : `${items.length} photos`;

    const mainImageContainer = document.getElementById('mainImageContainer');

    if (isFilm) {
      mainImageContainer.innerHTML = `
        <div class="film-gallery-stage">
          <div class="film-gallery-letterbox film-gallery-letterbox--top" aria-hidden="true"></div>
          <div class="film-gallery-frame">
            <img id="mainImageEl" class="film-gallery-image" alt="" decoding="async" />
            <div class="film-gallery-play-hint" aria-hidden="true">
              <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div class="film-gallery-letterbox film-gallery-letterbox--bottom" aria-hidden="true"></div>
        </div>
        <div id="albumDescription" class="film-gallery-hud">
          <span class="film-gallery-hud__label">Now Viewing</span>
          <h3 class="film-gallery-hud__title">${this.currentAlbumTitle}</h3>
          <p class="film-gallery-hud__desc">${this.currentAlbumDescription}</p>
          <div class="film-gallery-hud__footer">
            <span class="film-gallery-hud__count">${countLabel}</span>
            <button id="autoPlayToggle" type="button" class="film-gallery-hud__autoplay">
              <svg id="playIcon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span id="autoPlayText">Slideshow</span>
            </button>
          </div>
        </div>
      `;
      this.setAlbumViewMode('film-gallery');
      this.updateAlbumBreadcrumb('Film Production', title);
    } else {
      mainImageContainer.innerHTML = `
        <img id="mainImageEl" class="max-w-full max-h-full object-contain cursor-pointer transition-transform hover:scale-105" alt="" decoding="async" />
        <div id="albumDescription" class="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm rounded-lg p-4 text-white max-w-md">
          <h3 class="text-xl font-bold mb-2">${this.currentAlbumTitle}</h3>
          <p class="text-white/90 text-sm leading-relaxed">${this.currentAlbumDescription}</p>
          <div class="flex items-center justify-between mt-3">
            <span class="text-white/70 text-xs">${countLabel}</span>
            <button id="autoPlayToggle" type="button" class="text-white/80 hover:text-white transition-colors flex items-center gap-1">
              <svg id="playIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span id="autoPlayText" class="text-xs">Auto-play</span>
            </button>
          </div>
        </div>
      `;
      this.setAlbumViewMode('default');
      document.getElementById('albumViewBreadcrumb')?.classList.add('hidden');
      this.albumBack.textContent = '← Close Album';
    }
    
    const mainImageEl = document.getElementById('mainImageEl');
    mainImageEl.src = items[0];
    mainImageEl.alt = `${title} — frame 1 of ${items.length}`;
    mainImageEl.decoding = 'async';
    if (!isFilm) {
      mainImageEl.classList.add('cursor-pointer');
    }

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
    
    const thumbClass = isFilm ? 'album-thumb film-album-thumb' : 'thumbnail shrink-0 w-16 h-16 bg-center bg-cover cursor-pointer border-2 transition-all duration-300 rounded-lg';
    const thumbActive = isFilm ? 'active' : 'border-sch-orange opacity-100 scale-110';
    const thumbInactive = isFilm ? '' : 'border-transparent opacity-70 hover:opacity-90 hover:scale-105';

    this.thumbnailContainer.innerHTML = items.map((url, index) => `
      <div class="${thumbClass} ${index === 0 ? thumbActive : thumbInactive}"
           style="background-image:url('${url}')"
           data-index="${index}"
           role="button"
           tabindex="0"
           aria-label="Frame ${index + 1}">
      </div>
    `).join('');

    this.thumbnailContainer.querySelectorAll('[data-index]').forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.setCurrentImage(index);
        this.pauseAutoPlay(); // Pause auto-play when user manually selects
      });
    });
    
    this.updateImageCounter();
    
    this.albumsSlider?.classList.add('hidden');
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
      const label = this.currentAlbumKey === 'videos' ? 'frame' : 'image';
      currentMainImageEl.alt = `${this.currentAlbumTitle} — ${label} ${index + 1} of ${this.currentAlbumImages.length}`;
    }
    
    const isFilm = this.currentAlbumKey === 'videos';
    this.thumbnailContainer?.querySelectorAll('[data-index]').forEach((thumb, i) => {
      if (isFilm) {
        thumb.classList.toggle('active', i === index);
      } else if (i === index) {
        thumb.classList.add('border-sch-orange', 'opacity-100', 'scale-110');
        thumb.classList.remove('border-transparent', 'opacity-70');
      } else {
        thumb.classList.remove('border-sch-orange', 'opacity-100', 'scale-110');
        thumb.classList.add('border-transparent', 'opacity-70');
      }
      if (i === index) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
    this.pauseAutoPlay();
    this.currentAlbumKey = '';
    this.inGalleryView = false;
    this.lastFilmAlbumData = null;
    this.setAlbumViewMode('default');
    document.getElementById('albumViewBreadcrumb')?.classList.add('hidden');
    this.albumBack.textContent = '← Close Album';
    this.albumView.classList.add('hidden');
    this.albumsSlider?.classList.remove('hidden');
    document.body.classList.remove('album-open');
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
        autoPlayText.textContent = this.currentAlbumKey === 'videos' ? 'Slideshow' : 'Auto-play';
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
      "Documentaries": "Long-form documentary filmmaking that captures authentic stories with cinematic depth and narrative clarity.",
      "Event Videography": "Dynamic event coverage that preserves energy, emotion, and key moments from corporate and social gatherings.",
      "Live Event Coverage": "Multi-camera live event production with real-time storytelling and broadcast-ready delivery.",
      "Wedding Videography": "Cinematic wedding films that blend artistry with emotion — from preparation to celebration.",
      "Love Stories": "Intimate pre-wedding and love story films crafted for couples who want a cinematic keepsake.",
      "Memory Lane Videos": "Nostalgic tribute films that celebrate milestones, legacies, and personal journeys.",
      "Introduction Videos": "Polished introduction and profile videos for brands, teams, and public figures.",
      "Music Videos": "Creative music video production with bold visuals, rhythm-driven editing, and artist-forward storytelling.",
      "Promotional Videos": "High-conversion promotional films designed for campaigns, launches, and product storytelling.",
      "Client Testimonials": "Trust-building testimonial films that put real voices and results at the center of your brand.",
      "Training Videos": "Clear, engaging training content for teams, academies, and digital learning platforms.",
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