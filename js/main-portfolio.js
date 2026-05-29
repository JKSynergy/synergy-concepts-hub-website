// =================================================================
// SYNERGY CONCEPTS HUB — CINEMATIC SHOWCASE PLATFORM
// Four pillars: Film · Photography · Brand · Academy
// =================================================================

const PLACEHOLDER_FILM =
  'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:good,w_1200/v1759536578/2149729052_dznia5.jpg';
const PLACEHOLDER_BRAND =
  'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:good,w_1200/v1759536582/18697_q1ptuz.jpg';
const PLACEHOLDER_ACADEMY =
  'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:good,w_1200/v1759536578/2149729052_dznia5.jpg';

/** @typedef {{ type?: string, poster?: string, src?: string, title?: string, comingSoon?: boolean }} MediaItem */

const MAIN_PORTFOLIO_ALBUMS = {
  film: {
    featuredProductions: [
      { type: 'video', poster: PLACEHOLDER_FILM, title: 'Synergy Capture Films', comingSoon: true },
      { type: 'video', poster: PLACEHOLDER_FILM, title: 'Brand Story Reel', comingSoon: true }
    ],
    commercialFilms: [],
    eventCinematics: [
      { type: 'video', src: 'https://www.youtube.com/watch?v=boA5Tu-9ycU&t=66s', title: 'Event Film I' },
      { type: 'video', src: 'https://www.youtube.com/watch?v=ktkhTQpfDAk', title: 'Event Film II' },
      { type: 'video', src: 'https://www.youtube.com/watch?v=-MOPHNwNPO0', title: 'Event Film III' },
      { type: 'video', src: 'https://www.youtube.com/watch?v=lGCvNB_iIVY', title: 'Event Film IV' }
    ],
    behindTheScenes: [],
    motionStorytelling: []
  },
  photography: {
    portraitStories: {
      'Katherine & Ron': [
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-49.jpg',
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-57.jpg',
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-58.jpg',
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-65.jpg',
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-68.jpg',
        'images/albums/photos/weddings/Katherine & Ron/Kath & Ron-81.jpg'
      ],
      'Dan Kwanjula': [
        'images/albums/photos/introductions/Dan Kwanjula/DSC_0580.jpg',
        'images/albums/photos/introductions/Dan Kwanjula/DSC_0626.jpg',
        'images/albums/photos/introductions/Dan Kwanjula/DSC_0719.jpg',
        'images/albums/photos/introductions/Dan Kwanjula/DSC_0807.jpg',
        'images/albums/photos/introductions/Dan Kwanjula/DSC_1263.jpg'
      ]
    },
    eventExperiences: [],
    editorialPhotography: [],
    creativeSessions: [],
    lifestyleMoments: []
  },
  brand: {
    brandSystems: [
      'images/albums/graphics/logos/RBS Logo copy.jpg',
      'images/albums/graphics/logos/SMA LOGO  VERSION 2-01.png',
      'images/albums/graphics/logos/SYNERGY CREATIVE HUB NEW LOGOS-01.jpg'
    ],
    digitalCampaigns: [
      'images/albums/graphics/eflyers/SMA COURSES-01.png',
      'images/albums/graphics/eflyers/SMA COURSES-02.png',
      'images/albums/graphics/eflyers/SMA STUDY TIMES-02.jpg'
    ],
    creativeDesign: [],
    visualIdentity: [],
    marketingExperiences: []
  },
  academy: {
    creativeTrainingSessions: [
      'academy images/photography-classes/IMG_0105.jpg',
      'academy images/photography-classes/IMG_0106.jpg',
      'academy images/photography-classes/IMG_0107.jpg',
      'academy images/photography-classes/IMG_0110.jpg',
      'academy images/classrooms/20250822_163612.jpg',
      'academy images/classrooms/20250822_164554.jpg'
    ],
    studentShowcase: [
      'academy images/students-working/student 01 (1).jpg',
      'academy images/students-working/student 01 (2).jpg',
      'academy images/students-working/student 01 (3).jpg',
      'academy images/students-working/student 01 (4).jpg',
      'academy images/students-working/student 01 (5).jpg'
    ],
    learningInAction: [
      'academy images/classrooms/20250822_164609.jpg',
      'academy images/classrooms/20250822_164614.jpg',
      'academy images/classrooms/20250822_164638.jpg',
      'academy images/classrooms/20250822_164713.jpg',
      'academy images/classrooms/20250822_164726.jpg'
    ],
    creativeTransformations: {
      'From Beginner to Professional Creative': [
        'academy images/students-working/student 01 (6).jpg',
        'academy images/students-working/student 01 (7).jpg',
        'academy images/classrooms/20250822_165039.jpg'
      ],
      'Future Storytellers': [
        'academy images/classrooms/20250822_165047.jpg',
        'academy images/classrooms/20250822_165101.jpg',
        'academy images/classrooms/20250822_165134.jpg'
      ]
    },
    multimediaWorkshops: [
      'academy images/classrooms/20250822_164742.jpg',
      'academy images/classrooms/20250822_165156.jpg',
      'academy images/classrooms/20250822_165220.jpg',
      'academy images/classrooms/20250822_165240.jpg',
      'academy images/classrooms/20250822_165252.jpg',
      'academy images/classrooms/20250822_165310.jpg'
    ],
    futureCreators: [
      'academy images/classrooms/20250822_165321.jpg',
      'academy images/classrooms/20250822_165352.jpg',
      'academy images/classrooms/20250822_165442.jpg',
      'academy images/classrooms/20250822_165604.jpg'
    ]
  }
};

const GALLERY_META = {
  film: {
    label: 'Film Production',
    title: 'Motion That Moves People',
    subtitle: 'Cinematic productions, event films, and visual narratives from Synergy Capture Films.',
    story:
      'Every frame is engineered for emotion — brand films, celebrations, documentaries, and motion storytelling at world-class production quality.'
  },
  photography: {
    label: 'Photography',
    title: 'Visual Stories in Still Light',
    subtitle: 'Editorial portraits, events, and lifestyle imagery crafted with cinematic intention.',
    story:
      'We capture more than moments — we preserve emotion, elevate presence, and build visual narratives that endure.'
  },
  brand: {
    label: 'Brand Identity',
    title: 'Design That Defines Presence',
    subtitle: 'Identity systems, campaigns, and creative design for ambitious modern brands.',
    story:
      'Strategic visual design — from logo systems to digital campaigns — built to communicate with clarity and premium confidence.'
  },
  academy: {
    label: 'Multimedia Academy',
    title: 'Future Digital Creators',
    subtitle: 'Transformation, skill, and hands-on creative education.',
    story:
      'From beginner to pro — immersive training for Africa\'s next visual storytellers.'
  }
};

const COLLECTION_META = {
  film: {
    featuredProductions: {
      title: 'Featured Productions',
      subtitle: 'Flagship films and signature motion work',
      accent: 'gold',
      featured: true,
      category: 'Featured',
      storyTitle: 'Cinematic Highlights',
      storyText: 'Signature productions showcasing emotion, craft, and high-end visual storytelling.'
    },
    commercialFilms: {
      title: 'Commercial Films',
      subtitle: 'Brand films, ads, and corporate narratives',
      accent: 'blue',
      category: 'Commercial'
    },
    eventCinematics: {
      title: 'Event Cinematics',
      subtitle: 'Weddings, celebrations, and live milestone coverage',
      accent: 'orange',
      category: 'Events'
    },
    behindTheScenes: {
      title: 'Behind The Scenes',
      subtitle: 'Production process, crew, and creative direction',
      accent: 'green',
      category: 'BTS'
    },
    motionStorytelling: {
      title: 'Motion Storytelling',
      subtitle: 'Documentaries, reels, and narrative motion',
      accent: 'red',
      category: 'Motion'
    }
  },
  photography: {
    portraitStories: {
      title: 'Portrait Stories',
      subtitle: 'Intimate portraits and human-centered narratives',
      accent: 'blue',
      featured: true,
      storyTitle: 'Human Stories',
      storyText: 'Celebrations, introductions, and portraits — crafted with editorial precision.'
    },
    eventExperiences: {
      title: 'Event Experiences',
      subtitle: 'Live moments, gatherings, and milestone coverage',
      accent: 'orange',
      category: 'Events'
    },
    editorialPhotography: {
      title: 'Editorial Photography',
      subtitle: 'Magazine-quality compositions and visual essays',
      accent: 'gold',
      category: 'Editorial'
    },
    creativeSessions: {
      title: 'Creative Sessions',
      subtitle: 'Concept-driven photography and art direction',
      accent: 'green',
      category: 'Creative'
    },
    lifestyleMoments: {
      title: 'Lifestyle Moments',
      subtitle: 'Authentic lifestyle and ambient storytelling',
      accent: 'red',
      category: 'Lifestyle'
    }
  },
  brand: {
    brandSystems: {
      title: 'Brand Systems',
      subtitle: 'Logos, identity kits, and scalable visual systems',
      accent: 'blue',
      featured: true,
      storyTitle: 'Identity Architecture',
      storyText: 'Complete brand systems designed for digital and print excellence.'
    },
    digitalCampaigns: {
      title: 'Digital Campaigns',
      subtitle: 'Flyers, social creatives, and launch assets',
      accent: 'orange',
      category: 'Campaigns'
    },
    creativeDesign: {
      title: 'Creative Design',
      subtitle: 'Posters, packaging, and experimental visuals',
      accent: 'gold',
      category: 'Design'
    },
    visualIdentity: {
      title: 'Visual Identity',
      subtitle: 'Brand guidelines, stationery, and touchpoints',
      accent: 'green',
      category: 'Identity'
    },
    marketingExperiences: {
      title: 'Marketing Experiences',
      subtitle: 'Integrated campaigns and brand activations',
      accent: 'red',
      category: 'Marketing'
    }
  },
  academy: {
    creativeTrainingSessions: {
      title: 'Creative Training Sessions',
      subtitle: 'Photography, videography, and hands-on class experiences',
      accent: 'blue',
      featured: true,
      storyTitle: 'Learning In Motion',
      storyText: 'Practical sessions where theory meets craft — cameras in hand, creativity unleashed.'
    },
    studentShowcase: {
      title: 'Student Showcase',
      subtitle: 'Emerging talent and project outcomes',
      accent: 'orange',
      category: 'Showcase'
    },
    learningInAction: {
      title: 'Learning In Action',
      subtitle: 'Classrooms alive with collaboration and discovery',
      accent: 'gold',
      category: 'Sessions'
    },
    creativeTransformations: {
      title: 'Creative Transformations',
      subtitle: 'Growth journeys from beginner to professional',
      accent: 'green',
      featured: true,
      storyTitle: 'Stories of Growth',
      storyText: 'Witness the evolution — skill-building, confidence, and creative breakthrough.'
    },
    multimediaWorkshops: {
      title: 'Multimedia Workshops',
      subtitle: 'Design, web, and cross-discipline creative labs',
      accent: 'red',
      category: 'Workshops'
    },
    futureCreators: {
      title: 'Future Creators',
      subtitle: 'Graduation moments and the next wave of talent',
      accent: 'blue',
      category: 'Future'
    }
  }
};

const STORY_META = {
  'Katherine & Ron': {
    tag: 'Celebration',
    subtitle: 'A cinematic wedding — love, light, and legacy',
    accent: 'orange'
  },
  'Dan Kwanjula': {
    tag: 'Portrait',
    subtitle: 'Professional introduction and brand portrait session',
    accent: 'blue'
  },
  'From Beginner to Professional Creative': {
    tag: 'Transformation',
    subtitle: 'Skill-building journeys that redefine creative potential',
    accent: 'gold'
  },
  'Future Storytellers': {
    tag: 'Innovation',
    subtitle: 'Africa\'s next generation of creators',
    accent: 'green'
  }
};

const LEGACY_ALBUM_MAP = {
  photos: 'photography',
  videos: 'film',
  graphics: 'brand'
};

const LEGACY_COLLECTION_MAP = {
  logos: 'brandSystems',
  branding: 'brandSystems',
  eflyers: 'digitalCampaigns',
  banners: 'digitalCampaigns',
  socialMedia: 'digitalCampaigns',
  reels: 'motionStorytelling',
  commercials: 'commercialFilms',
  corporate: 'commercialFilms',
  weddings: 'portraitStories',
  introductions: 'portraitStories',
  events: 'eventExperiences',
  portraits: 'portraitStories',
  clientStories: 'portraitStories',
  productionHighlights: 'editorialPhotography',
  brandFilm: 'commercialFilms',
  liveExperiences: 'eventCinematics',
  motionSocial: 'motionStorytelling',
  brandIdentity: 'brandSystems'
};

const FILM_COLLECTIONS_COMING_SOON = new Set([
  'commercialFilms',
  'behindTheScenes',
  'motionStorytelling'
]);

class MainPortfolioManager {
  constructor() {
    this.currentAlbumImages = [];
    this.currentAlbumItems = [];
    this.currentImageIndex = 0;
    this.currentAlbumTitle = '';
    this.currentAlbumDescription = '';
    this.currentAlbumKey = '';
    this.currentCollectionKey = '';
    this.inGalleryView = false;
    this.navigationStack = [];
    this.autoPlayInterval = null;
    this.autoPlayDelay = 4500;
    this.isAutoPlaying = false;
    this.viewMode = 'grid';
    this.hoverVideoEls = [];
    this.init();
  }

  init() {
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
    this.lightboxPrev = document.getElementById('lightboxPrev');
    this.lightboxNext = document.getElementById('lightboxNext');
    this.lightboxCaption = document.getElementById('lightboxCaption');
    this.imageCounter = document.getElementById('imageCounter');
    this.lightboxCounter = document.getElementById('lightboxCounter');
    this.albumPrev = document.getElementById('albumPrev');
    this.albumNext = document.getElementById('albumNext');
    this.thumbPrev = document.getElementById('thumbPrev');
    this.thumbNext = document.getElementById('thumbNext');
    this.albumBack = document.getElementById('albumBack');

    if (!this.albumView) return;
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

    const academySection = document.getElementById('academy');
    academySection?.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-album]');
      if (!trigger) return;
      e.preventDefault();
      this.handleMediaAlbumClick(trigger);
    });

    academySection?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const trigger = e.target.closest('[data-album]');
      if (!trigger) return;
      e.preventDefault();
      this.handleMediaAlbumClick(trigger);
    });

    this.albumBack?.addEventListener('click', () => this.handleAlbumBack());
    this.albumPrev?.addEventListener('click', () => {
      this.pauseAutoPlay();
      this.navigateImage(-1);
    });
    this.albumNext?.addEventListener('click', () => {
      this.pauseAutoPlay();
      this.navigateImage(1);
    });
    this.thumbPrev?.addEventListener('click', () => this.scrollThumbnails(-150));
    this.thumbNext?.addEventListener('click', () => this.scrollThumbnails(150));

    this.lightboxClose?.addEventListener('click', () => this.closeLightbox());
    this.lightboxPrev?.addEventListener('click', () => this.navigateLightbox(-1));
    this.lightboxNext?.addEventListener('click', () => this.navigateLightbox(1));
    this.lightbox?.addEventListener('click', (e) => {
      if (e.target.classList.contains('lightbox-backdrop')) this.closeLightbox();
    });

    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    this.thumbnailContainer?.addEventListener('wheel', (e) => this.handleThumbnailScroll(e), {
      passive: false
    });
    this.initAlbumTouchSwipe();
    this.initLightboxSwipe();
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
        if (
          this.albumView.classList.contains('hidden') ||
          !this.inGalleryView ||
          this.viewMode !== 'slideshow' ||
          !this.currentAlbumImages.length
        ) {
          return;
        }

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;

        this.pauseAutoPlay();
        this.navigateImage(dx > 0 ? -1 : 1);
      },
      { passive: true }
    );
  }

  initLightboxSwipe() {
    const stage = this.lightbox?.querySelector('.lightbox-stage');
    if (!stage) return;

    let touchStartX = 0;

    stage.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );

    stage.addEventListener(
      'touchend',
      (e) => {
        if (this.lightbox.classList.contains('hidden')) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) < 48) return;
        this.navigateLightbox(dx > 0 ? -1 : 1);
      },
      { passive: true }
    );
  }

  resolveAlbumKey(albumKey) {
    return LEGACY_ALBUM_MAP[albumKey] || albumKey;
  }

  resolveCollectionKey(albumKey, subAlbum) {
    if (!subAlbum) return null;
    const mapped = LEGACY_COLLECTION_MAP[subAlbum] || subAlbum;
    if (MAIN_PORTFOLIO_ALBUMS[albumKey]?.[mapped] !== undefined) return mapped;
    return subAlbum;
  }

  getYoutubeId(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.replace(/^\//, '').split('/')[0] || null;
      }
      return parsed.searchParams.get('v');
    } catch {
      const match = String(url).match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
      return match ? match[1] : null;
    }
  }

  parseYoutubeStart(value) {
    if (value == null || value === '') return null;
    const match = String(value).match(/^(\d+)/);
    return match ? match[1] : null;
  }

  getYoutubeEmbedUrl(url) {
    const id = this.getYoutubeId(url);
    if (!id) return null;
    try {
      const parsed = new URL(url);
      const start = this.parseYoutubeStart(parsed.searchParams.get('t') || parsed.searchParams.get('start'));
      const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1' });
      if (start) params.set('start', start);
      return `https://www.youtube.com/embed/${id}?${params.toString()}`;
    } catch {
      return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    }
  }

  youtubeThumbnail(id) {
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }

  normalizeMediaItem(item) {
    if (typeof item === 'string') {
      const youtubeId = this.getYoutubeId(item);
      if (youtubeId) {
        const thumb = this.youtubeThumbnail(youtubeId);
        return {
          type: 'video',
          url: thumb,
          poster: thumb,
          src: item,
          youtubeId,
          embedUrl: this.getYoutubeEmbedUrl(item),
          title: '',
          comingSoon: false
        };
      }
      return { type: 'image', url: item, poster: item, src: null, youtubeId: null, embedUrl: null, title: '', comingSoon: false };
    }
    if (item && typeof item === 'object') {
      const src = item.src || null;
      const youtubeId = item.youtubeId || this.getYoutubeId(src);
      const poster = youtubeId
        ? item.poster || this.youtubeThumbnail(youtubeId)
        : item.poster || PLACEHOLDER_FILM;
      return {
        type: item.type || (youtubeId ? 'video' : 'image'),
        url: poster,
        poster,
        src,
        youtubeId: youtubeId || null,
        embedUrl: youtubeId ? item.embedUrl || this.getYoutubeEmbedUrl(src) : null,
        title: item.title || '',
        comingSoon: Boolean(item.comingSoon)
      };
    }
    return { type: 'image', url: '', poster: '', src: null, youtubeId: null, embedUrl: null, title: '', comingSoon: false };
  }

  itemsToUrls(items) {
    return items.map((item) => this.normalizeMediaItem(item).url).filter(Boolean);
  }

  isFilmCollectionEmpty(albumKey, collectionKey, content) {
    if (albumKey !== 'film') return false;
    if (collectionKey === 'featuredProductions') return false;
    if (FILM_COLLECTIONS_COMING_SOON.has(collectionKey)) {
      return !Array.isArray(content) || content.length === 0;
    }
    return Array.isArray(content) && content.length === 0;
  }

  handleMediaAlbumClick(trigger) {
    const rawKey = trigger.getAttribute('data-album');
    let albumKey = this.resolveAlbumKey(rawKey);
    const subAlbum = trigger.getAttribute('data-subalbum');
    const nested = trigger.getAttribute('data-nested');

    if (subAlbum === 'reels' || subAlbum === 'motionSocial') {
      albumKey = 'academy';
    }

    if (!albumKey || !MAIN_PORTFOLIO_ALBUMS[albumKey]) return;

    document.body.classList.add('album-open');
    this.navigationStack = [];

    if (nested && subAlbum) {
      const collectionKey = this.resolveCollectionKey(albumKey, subAlbum);
      const nestedContent = MAIN_PORTFOLIO_ALBUMS[albumKey][collectionKey]?.[nested];
      if (Array.isArray(nestedContent) && nestedContent.length > 0) {
        this.openCinematicGallery(nestedContent, nested, albumKey, collectionKey);
      }
      return;
    }

    if (subAlbum) {
      const collectionKey = this.resolveCollectionKey(albumKey, subAlbum);
      const content = MAIN_PORTFOLIO_ALBUMS[albumKey][collectionKey];
      const meta = COLLECTION_META[albumKey]?.[collectionKey];
      const displayName = meta?.title || collectionKey;

      if (Array.isArray(content)) {
        if (content.length > 0 && !this.isFilmCollectionEmpty(albumKey, collectionKey, content)) {
          this.openCinematicGallery(content, displayName, albumKey, collectionKey);
        } else {
          this.renderCategoryHub(albumKey);
        }
      } else if (typeof content === 'object' && content !== null) {
        this.renderStoryPicker(albumKey, collectionKey, content, displayName);
      } else {
        this.renderCategoryHub(albumKey);
      }
      return;
    }

    this.renderCategoryHub(albumKey);
  }

  handleAlbumClick(e) {
    if (e.target.classList.contains('view-gallery-btn') && !e.target.closest('.academy-album')) {
      e.preventDefault();
      e.stopPropagation();
      const key = this.resolveAlbumKey(e.target.getAttribute('data-album'));
      if (MAIN_PORTFOLIO_ALBUMS[key]) this.renderCategoryHub(key);
      return;
    }

    const panel = e.target.closest('[data-album]');
    if (!panel) return;
    const key = this.resolveAlbumKey(panel.getAttribute('data-album'));
    if (MAIN_PORTFOLIO_ALBUMS[key]) this.renderCategoryHub(key);
  }

  pushNav(state) {
    this.navigationStack.push(state);
  }

  handleAlbumBack() {
    if (this.navigationStack.length > 0) {
      const prev = this.navigationStack.pop();
      if (prev.type === 'hub') {
        this.renderCategoryHub(prev.albumKey, false);
      } else if (prev.type === 'stories') {
        this.renderStoryPicker(prev.albumKey, prev.collectionKey, prev.data, prev.title, false);
      }
      return;
    }
    this.closeAlbumView();
  }

  getPillarPlaceholder(albumKey) {
    const map = {
      film: PLACEHOLDER_FILM,
      photography: PLACEHOLDER_FILM,
      brand: PLACEHOLDER_BRAND,
      academy: PLACEHOLDER_ACADEMY
    };
    return map[albumKey] || PLACEHOLDER_FILM;
  }

  renderCategoryHub(albumKey, pushState = true) {
    const meta = GALLERY_META[albumKey];
    const albumData = MAIN_PORTFOLIO_ALBUMS[albumKey];
    if (!meta || !albumData) return;

    if (pushState) this.navigationStack = [];

    this.currentAlbumKey = albumKey;
    this.inGalleryView = false;
    this.pauseAutoPlay();
    this.cleanupHoverVideos();

    const collections = Object.entries(albumData).map(([key, content]) => {
      const info = this.getSubAlbumInfo(content, albumKey, key);
      const colMeta = COLLECTION_META[albumKey]?.[key] || {};
      return { key, content, info, colMeta };
    });

    const featured = collections.filter((c) => c.colMeta.featured && !c.info.isEmpty);
    const standard = collections.filter((c) => !c.colMeta.featured);

    const mainImageContainer = document.getElementById('mainImageContainer');
    const pillarClass = `gallery-hub--${albumKey}`;

    mainImageContainer.innerHTML = `
      <div class="gallery-hub ${pillarClass}">
        <header class="gallery-hub__hero">
          <span class="gallery-hub__label">${meta.label}</span>
          <h2 class="gallery-hub__title">${meta.title}</h2>
          <p class="gallery-hub__subtitle">${meta.subtitle}</p>
          <p class="gallery-hub__story">${meta.story}</p>
          ${
            albumKey === 'academy'
              ? `<p class="gallery-hub__manifesto">Future storytellers · Beginner to pro</p>`
              : ''
          }
        </header>

        ${
          featured.length
            ? `<section class="gallery-featured" aria-label="Featured">
                <div class="gallery-featured__head">
                  <span class="section-label">Featured</span>
                  <h3 class="gallery-featured__title">${featured[0].colMeta.storyTitle || 'Curated Highlights'}</h3>
                  <p class="gallery-featured__text">${featured[0].colMeta.storyText || ''}</p>
                </div>
                <div class="gallery-featured__grid gallery-featured__grid--${albumKey}">
                  ${featured.map((c) => this.renderFeaturedCard(albumKey, c)).join('')}
                </div>
              </section>`
            : ''
        }

        <section class="gallery-collections" aria-label="Collections">
          <div class="gallery-collections__head">
            <span class="section-label">Curated Collections</span>
            <h3 class="gallery-collections__title">Explore the Experience</h3>
          </div>
          <div class="gallery-collections__grid gallery-collections__grid--${albumKey}">
            ${[...featured, ...standard]
              .filter((c, i, arr) => arr.findIndex((x) => x.key === c.key) === i)
              .map((c) => this.renderCollectionCard(albumKey, c))
              .join('')}
          </div>
        </section>
      </div>
    `;

    this.bindHubCards(mainImageContainer, albumKey, albumData);
    this.initCollectionVideoPreviews(mainImageContainer);
    this.showAlbumShell('hub');
    this.updateAlbumBreadcrumb(meta.label, 'Collections');
  }

  renderFeaturedCard(albumKey, { key, content, info, colMeta }) {
    const isNested = typeof content === 'object' && !Array.isArray(content);
    const cover = info.firstImage || this.getPillarPlaceholder(albumKey);
    const isEmpty = info.isEmpty || this.isFilmCollectionEmpty(albumKey, key, content);

    if (isNested && !isEmpty) {
      const stories = Object.entries(content).slice(0, 2);
      return stories
        .map(([storyName, images]) => {
          const storyMeta = STORY_META[storyName] || {};
          const thumb = this.normalizeMediaItem(images[0]).poster || cover;
          return `
            <article class="gallery-story-card gallery-story-card--${storyMeta.accent || colMeta.accent || 'blue'}"
                     data-action="story" data-album="${albumKey}" data-collection="${key}" data-story="${storyName}"
                     tabindex="0" role="button">
              <div class="gallery-story-card__media" style="background-image:url('${thumb}')"></div>
              <div class="gallery-story-card__overlay"></div>
              <div class="gallery-story-card__body">
                <span class="gallery-story-card__tag">${storyMeta.tag || 'Story'}</span>
                <h4 class="gallery-story-card__name">${storyName}</h4>
                <p class="gallery-story-card__desc">${storyMeta.subtitle || colMeta.subtitle || ''}</p>
                <span class="gallery-story-card__cta">Experience story →</span>
              </div>
            </article>
          `;
        })
        .join('');
    }

    return this.renderCollectionCard(albumKey, { key, content, info, colMeta }, true);
  }

  renderCollectionCard(albumKey, { key, content, info, colMeta }, featured = false) {
    const isEmpty = info.isEmpty || this.isFilmCollectionEmpty(albumKey, key, content);
    const cover = info.firstImage || this.getPillarPlaceholder(albumKey);
    const cardClass = featured ? 'gallery-collection-card gallery-collection-card--featured' : 'gallery-collection-card';
    const isFilm = albumKey === 'film';
    const isBrand = albumKey === 'brand';
    const countLabel = isEmpty
      ? 'In production'
      : isFilm
        ? `${info.count} ${info.count === 1 ? 'production' : 'productions'}`
        : `${info.count} ${info.count === 1 ? 'visual' : 'visuals'}`;

    const filmPreview =
      isFilm && !isEmpty && Array.isArray(content) && content[0]?.type === 'video'
        ? `<video class="gallery-collection-card__video" muted loop playsinline preload="metadata" poster="${cover}" ${
            content[0].src ? `data-src="${content[0].src}"` : ''
          }></video>`
        : '';

    return `
      <article class="${cardClass} gallery-collection-card--${colMeta.accent || 'blue'} gallery-collection-card--pillar-${albumKey} ${isBrand ? 'gallery-collection-card--glass' : ''} ${isEmpty ? 'gallery-collection-card--empty' : ''}"
               data-action="${isEmpty ? 'none' : 'collection'}" data-album="${albumKey}" data-collection="${key}"
               data-empty="${isEmpty}" tabindex="${isEmpty ? '-1' : '0'}" role="button"
               aria-label="${colMeta.title || key}${isEmpty ? ', in production' : ''}">
        <div class="gallery-collection-card__media" style="background-image:url('${cover}')">
          ${filmPreview}
          ${isEmpty ? '<span class="gallery-collection-card__soon">In Production</span>' : ''}
          ${isFilm && !isEmpty ? '<span class="gallery-collection-card__play" aria-hidden="true"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' : ''}
          <div class="gallery-collection-card__grain"></div>
        </div>
        <div class="gallery-collection-card__body">
          <span class="gallery-collection-card__category">${colMeta.category || colMeta.title || key}</span>
          <h4 class="gallery-collection-card__title">${colMeta.title || key}</h4>
          <p class="gallery-collection-card__subtitle">${isEmpty ? 'New cinematic work arriving soon' : colMeta.subtitle || ''}</p>
          <span class="gallery-collection-card__count">${countLabel}</span>
        </div>
      </article>
    `;
  }

  initCollectionVideoPreviews(container) {
    this.cleanupHoverVideos();
    container.querySelectorAll('.gallery-collection-card__video').forEach((video) => {
      const src = video.dataset.src;
      const parent = video.closest('.gallery-collection-card');
      if (!parent) return;

      parent.addEventListener('mouseenter', () => {
        if (src && !video.src) video.src = src;
        video.play().catch(() => {});
      });
      parent.addEventListener('mouseleave', () => {
        video.pause();
        if (src) {
          video.removeAttribute('src');
          video.load();
        }
      });
      this.hoverVideoEls.push(video);
    });
  }

  cleanupHoverVideos() {
    this.hoverVideoEls.forEach((v) => {
      v.pause();
      v.removeAttribute('src');
    });
    this.hoverVideoEls = [];
  }

  bindHubCards(container, albumKey, albumData) {
    container.querySelectorAll('[data-action="collection"]').forEach((card) => {
      const open = () => {
        if (card.dataset.empty === 'true') return;
        const collectionKey = card.dataset.collection;
        const content = albumData[collectionKey];
        const meta = COLLECTION_META[albumKey]?.[collectionKey];
        const title = meta?.title || collectionKey;

        this.pushNav({ type: 'hub', albumKey });

        if (Array.isArray(content)) {
          this.openCinematicGallery(content, title, albumKey, collectionKey);
        } else if (typeof content === 'object') {
          this.renderStoryPicker(albumKey, collectionKey, content, title);
        }
      };

      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    container.querySelectorAll('[data-action="story"]').forEach((card) => {
      const open = () => {
        const collectionKey = card.dataset.collection;
        const storyName = card.dataset.story;
        const images = albumData[collectionKey]?.[storyName];
        if (!Array.isArray(images) || !images.length) return;

        this.pushNav({ type: 'hub', albumKey });
        this.openCinematicGallery(images, storyName, albumKey, collectionKey);
      };

      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  renderStoryPicker(albumKey, collectionKey, nestedData, parentTitle, pushState = true) {
    const colMeta = COLLECTION_META[albumKey]?.[collectionKey] || {};
    const stories = Object.entries(nestedData).filter(([, photos]) => Array.isArray(photos) && photos.length > 0);

    if (pushState) this.pushNav({ type: 'hub', albumKey });

    const mainImageContainer = document.getElementById('mainImageContainer');
    mainImageContainer.innerHTML = `
      <div class="gallery-hub gallery-hub--stories gallery-hub--${albumKey}">
        <header class="gallery-hub__hero gallery-hub__hero--compact">
          <span class="gallery-hub__label">${GALLERY_META[albumKey]?.label || albumKey}</span>
          <h2 class="gallery-hub__title">${parentTitle}</h2>
          <p class="gallery-hub__subtitle">${colMeta.subtitle || 'Select a story to explore'}</p>
        </header>
        <div class="gallery-stories-grid">
          ${stories
            .map(([name, photos]) => {
              const storyMeta = STORY_META[name] || {};
              const thumb = this.normalizeMediaItem(photos[0]).poster;
              return `
                <article class="gallery-story-card gallery-story-card--large gallery-story-card--${storyMeta.accent || 'blue'}"
                         data-story="${name}" tabindex="0" role="button">
                  <div class="gallery-story-card__media" style="background-image:url('${thumb}')"></div>
                  <div class="gallery-story-card__overlay"></div>
                  <div class="gallery-story-card__body">
                    <span class="gallery-story-card__tag">${storyMeta.tag || 'Story'}</span>
                    <h4 class="gallery-story-card__name">${name}</h4>
                    <p class="gallery-story-card__desc">${storyMeta.subtitle || ''}</p>
                    <span class="gallery-story-card__count">${photos.length} frames</span>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    mainImageContainer.querySelectorAll('[data-story]').forEach((card) => {
      const open = () => {
        const storyName = card.dataset.story;
        const photos = nestedData[storyName];
        this.pushNav({
          type: 'stories',
          albumKey,
          collectionKey,
          data: nestedData,
          title: parentTitle
        });
        this.openCinematicGallery(photos, storyName, albumKey, collectionKey);
      };

      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    this.showAlbumShell('hub');
    this.updateAlbumBreadcrumb(GALLERY_META[albumKey]?.label || albumKey, parentTitle);
  }

  openCinematicGallery(items, title, albumKey = '', collectionKey = '') {
    this.currentAlbumKey = albumKey;
    this.currentCollectionKey = collectionKey;
    this.inGalleryView = true;
    const normalizedItems = items.map((item) => this.normalizeMediaItem(item));
    this.currentAlbumItems = normalizedItems;
    this.currentAlbumImages = normalizedItems.map((item) => item.url).filter(Boolean);
    this.currentImageIndex = 0;
    this.currentAlbumTitle = title;
    this.currentAlbumDescription = this.getAlbumDescription(title, collectionKey, albumKey);
    this.viewMode = 'grid';
    this.cleanupHoverVideos();

    const mainImageContainer = document.getElementById('mainImageContainer');
    const isFilm = albumKey === 'film';
    const isBrand = albumKey === 'brand';
    const normalized = this.currentAlbumItems;

    let galleryBody = '';

    if (isFilm && normalized.some((n) => n.type === 'video')) {
      galleryBody = this.renderFilmGalleryGrid(normalized);
    } else if (isBrand) {
      galleryBody = this.renderBrandGalleryGrid(normalized, items.length);
    } else {
      galleryBody = this.renderMasonryGrid(normalized, items.length);
    }

    mainImageContainer.innerHTML = `
      <div class="gallery-view gallery-view--${albumKey}">
        <header class="gallery-view__header">
          <div>
            <span class="gallery-view__label">${GALLERY_META[albumKey]?.label || 'Gallery'}</span>
            <h2 class="gallery-view__title">${title}</h2>
            <p class="gallery-view__desc">${this.currentAlbumDescription}</p>
          </div>
          <div class="gallery-view__actions">
            <button type="button" id="gallerySlideshowBtn" class="gallery-view__mode-btn">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M5 5l14 7-14 7V5z"/></svg>
              Slideshow
            </button>
          </div>
        </header>
        <div id="galleryGrid" class="gallery-grid-wrap">${galleryBody}</div>
        <div id="gallerySlideshow" class="gallery-slideshow hidden">
          <div class="gallery-slideshow__frame">
            <img id="mainImageEl" class="gallery-slideshow__image" alt="" decoding="async"/>
          </div>
          <div id="albumDescription" class="gallery-slideshow__hud">
            <span class="gallery-slideshow__hud-label">Now Viewing</span>
            <h3 class="gallery-slideshow__hud-title">${title}</h3>
            <p class="gallery-slideshow__hud-desc">${this.currentAlbumDescription}</p>
            <div class="gallery-slideshow__hud-footer">
              <span id="slideshowCounter" class="gallery-slideshow__count">${items.length} visuals</span>
              <button id="autoPlayToggle" type="button" class="gallery-slideshow__autoplay">
                <span id="autoPlayText">Auto-play</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    mainImageContainer.querySelectorAll('[data-index]').forEach((btn) => {
      const idx = parseInt(btn.dataset.index, 10);
      if (btn.dataset.comingSoon === 'true') return;
      const open = () => {
        const item = this.currentAlbumItems[idx];
        if (item) this.openLightboxForItem(item, idx);
      };
      btn.addEventListener('click', open);
      if (btn.classList.contains('gallery-film-tile')) {
        btn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
      }
    });

    this.initFilmTileVideos(mainImageContainer);

    document.getElementById('autoPlayToggle')?.addEventListener('click', () => this.toggleAutoPlay());

    const slideshowBtn = document.getElementById('gallerySlideshowBtn');
    if (slideshowBtn) {
      slideshowBtn.onclick = () => this.setGalleryViewMode('slideshow');
    }

    this.buildThumbnailStrip(this.currentAlbumImages);
    this.showAlbumShell('gallery');
    this.updateAlbumBreadcrumb(GALLERY_META[albumKey]?.label || 'Gallery', title);
    this.pauseAutoPlay();
  }

  renderMasonryGrid(normalized, total) {
    return `<div class="gallery-masonry">${normalized
      .map((item, index) => {
        if (!item.url) return '';
        return `
        <button type="button" class="gallery-masonry__item gallery-masonry__item--${this.getMasonrySize(index, total)}"
                data-index="${index}" aria-label="Open image ${index + 1} of ${total}">
          <img src="${item.url}" alt="" loading="lazy" decoding="async"/>
          <span class="gallery-masonry__overlay"></span>
          <span class="gallery-masonry__zoom" aria-hidden="true">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"/></svg>
          </span>
        </button>`;
      })
      .join('')}</div>`;
  }

  renderBrandGalleryGrid(normalized, total) {
    return `<div class="gallery-brand-grid">${normalized
      .map((item, index) => {
        if (!item.url) return '';
        return `
        <button type="button" class="gallery-brand-card" data-index="${index}"
                aria-label="Open design ${index + 1} of ${total}">
          <div class="gallery-brand-card__glass">
            <img src="${item.url}" alt="" loading="lazy" decoding="async"/>
          </div>
          <span class="gallery-brand-card__shine" aria-hidden="true"></span>
        </button>`;
      })
      .join('')}</div>`;
  }

  renderFilmGalleryGrid(normalized) {
    return `<div class="gallery-film-grid">${normalized
      .map((item, index) => {
        const comingSoon = item.comingSoon || (!item.src && !item.youtubeId);
        return `
        <article class="gallery-film-tile ${comingSoon ? 'gallery-film-tile--soon' : ''}"
                 ${comingSoon ? '' : `data-index="${index}"`} data-coming-soon="${comingSoon}"
                 ${comingSoon ? '' : 'role="button" tabindex="0"'}>
          <div class="gallery-film-tile__frame">
            <img class="gallery-film-tile__poster" src="${item.poster}" alt="${item.title || ''}" loading="lazy"/>
            ${
              item.src
                ? `<video class="gallery-film-tile__video" muted loop playsinline preload="metadata" poster="${item.poster}" data-src="${item.src}"></video>`
                : ''
            }
            <div class="gallery-film-tile__vignette"></div>
            <span class="gallery-film-tile__play" aria-hidden="true">
              <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </span>
            ${comingSoon ? '<span class="gallery-film-tile__badge">In Production</span>' : ''}
          </div>
          ${item.title ? `<p class="gallery-film-tile__title">${item.title}</p>` : ''}
        </article>`;
      })
      .join('')}</div>`;
  }

  initFilmTileVideos(container) {
    container.querySelectorAll('.gallery-film-tile').forEach((tile) => {
      const video = tile.querySelector('.gallery-film-tile__video');
      if (!video) return;
      const src = video.dataset.src;
      tile.addEventListener('mouseenter', () => {
        if (src && !video.src) video.src = src;
        video.play().catch(() => {});
      });
      tile.addEventListener('mouseleave', () => {
        video.pause();
        if (src) {
          video.removeAttribute('src');
          video.load();
        }
      });
    });
  }

  setGalleryViewMode(mode) {
    this.viewMode = mode;
    const grid = document.getElementById('galleryGrid');
    const slideshow = document.getElementById('gallerySlideshow');
    const btn = document.getElementById('gallerySlideshowBtn');
    const thumbBar = document.getElementById('albumThumbBar');

    if (mode === 'slideshow') {
      grid?.classList.add('hidden');
      slideshow?.classList.remove('hidden');
      thumbBar?.classList.remove('hidden');
      this.albumPrev?.classList.remove('hidden');
      this.albumNext?.classList.remove('hidden');
      if (btn) {
        btn.innerHTML =
          '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M4 6h7v7H4zM13 6h7v7h-7zM4 15h7v7H4zM13 15h7v7h-7z"/></svg> Grid view';
        btn.onclick = () => this.setGalleryViewMode('grid');
      }

      const mainImageEl = document.getElementById('mainImageEl');
      if (mainImageEl && this.currentAlbumImages.length) {
        mainImageEl.src = this.currentAlbumImages[this.currentImageIndex];
        mainImageEl.alt = `${this.currentAlbumTitle} — ${this.currentImageIndex + 1} of ${this.currentAlbumImages.length}`;
        mainImageEl.onclick = () =>
          this.openLightboxForItem(
            this.currentAlbumItems[this.currentImageIndex],
            this.currentImageIndex
          );
      }
      this.updateImageCounter();
      this.startAutoPlay();
    } else {
      grid?.classList.remove('hidden');
      slideshow?.classList.add('hidden');
      thumbBar?.classList.add('hidden');
      this.albumPrev?.classList.add('hidden');
      this.albumNext?.classList.add('hidden');
      if (btn) {
        btn.innerHTML =
          '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M5 5l14 7-14 7V5z"/></svg> Slideshow';
        btn.onclick = () => this.setGalleryViewMode('slideshow');
      }
      this.pauseAutoPlay();
      this.imageCounter.textContent = `${this.currentAlbumImages.length} visuals`;
    }
  }

  getMasonrySize(index, total) {
    if (total <= 3) return 'hero';
    if (index === 0 || index === 3) return 'hero';
    if (index % 5 === 2) return 'tall';
    return 'standard';
  }

  buildThumbnailStrip(items) {
    this.thumbnailContainer.innerHTML = items
      .map(
        (url, index) => `
      <div class="album-thumb gallery-editorial-thumb ${index === 0 ? 'active' : ''}"
           style="background-image:url('${url}')" data-index="${index}"
           role="button" tabindex="0" aria-label="Frame ${index + 1}"></div>
    `
      )
      .join('');

    this.thumbnailContainer.querySelectorAll('[data-index]').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        this.setCurrentImage(parseInt(thumb.dataset.index, 10));
        this.pauseAutoPlay();
      });
    });
  }

  showAlbumShell(mode) {
    this.setAlbumViewModeClass(mode);
    this.albumsSlider?.classList.add('hidden');
    this.albumView.classList.remove('hidden');
    document.body.classList.add('album-open');

    if (mode === 'hub') {
      this.albumPrev?.classList.add('hidden');
      this.albumNext?.classList.add('hidden');
      document.getElementById('albumThumbBar')?.classList.add('hidden');
      this.thumbnailContainer.innerHTML = '';
      this.imageCounter.textContent = '';
    } else if (mode === 'gallery') {
      this.albumPrev?.classList.add('hidden');
      this.albumNext?.classList.add('hidden');
      document.getElementById('albumThumbBar')?.classList.add('hidden');
      this.imageCounter.textContent = `${this.currentAlbumImages.length} visuals`;
    }

    this.albumBack.textContent = '← Back';
    requestAnimationFrame(() => {
      this.albumView?.querySelector('.album-main-stage')?.scrollTo(0, 0);
    });
  }

  setAlbumViewModeClass(mode) {
    this.albumView?.classList.remove(
      'album-view--hub',
      'album-view--gallery',
      'album-view--film-picker',
      'album-view--film-gallery'
    );
    const mainStage = document.getElementById('mainImageContainer');
    mainStage?.classList.remove('main-image-container--film-picker');

    if (mode === 'hub') {
      this.albumView?.classList.add('album-view--hub');
    } else if (mode === 'gallery') {
      this.albumView?.classList.add('album-view--gallery');
      if (this.currentAlbumKey === 'film') {
        this.albumView?.classList.add('album-view--film-gallery');
      }
    }
  }

  updateAlbumBreadcrumb(section, current) {
    const el = document.getElementById('albumViewBreadcrumb');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `<span class="album-view-breadcrumb__section">${section}</span><span class="album-view-breadcrumb__sep" aria-hidden="true">/</span><span class="album-view-breadcrumb__current">${current}</span>`;
  }

  getSubAlbumInfo(content, albumKey = '', collectionKey = '') {
    if (Array.isArray(content)) {
      if (content.length === 0) return { count: 0, firstImage: null, isEmpty: true };
      if (this.isFilmCollectionEmpty(albumKey, collectionKey, content)) {
        return { count: 0, firstImage: null, isEmpty: true };
      }
      const first = this.normalizeMediaItem(content[0]);
      return { count: content.length, firstImage: first.poster || first.url, isEmpty: false };
    }
    if (typeof content === 'object' && content !== null) {
      let totalCount = 0;
      let firstImage = null;
      Object.values(content).forEach((nested) => {
        if (Array.isArray(nested) && nested.length > 0) {
          totalCount += nested.length;
          if (!firstImage) firstImage = this.normalizeMediaItem(nested[0]).poster;
        }
      });
      return { count: totalCount, firstImage, isEmpty: totalCount === 0 };
    }
    return { count: 0, firstImage: null, isEmpty: true };
  }

  getAlbumDescription(title, collectionKey, albumKey) {
    const fromCollection = COLLECTION_META[albumKey]?.[collectionKey]?.subtitle;
    const fromStory = STORY_META[title]?.subtitle;
    return fromStory || fromCollection || GALLERY_META[albumKey]?.story || 'A curated visual collection from Synergy Concepts Hub.';
  }

  setCurrentImage(index) {
    if (index < 0 || index >= this.currentAlbumImages.length) return;
    this.currentImageIndex = index;

    const mainImageEl = document.getElementById('mainImageEl');
    if (mainImageEl) {
      mainImageEl.src = this.currentAlbumImages[index];
      mainImageEl.alt = `${this.currentAlbumTitle} — ${index + 1} of ${this.currentAlbumImages.length}`;
    }

    this.thumbnailContainer?.querySelectorAll('[data-index]').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === index);
      if (i === index) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    const slideshowCounter = document.getElementById('slideshowCounter');
    if (slideshowCounter) {
      slideshowCounter.textContent = `${index + 1} / ${this.currentAlbumImages.length}`;
    }
    this.updateImageCounter();
  }

  updateImageCounter() {
    const counterText = `${this.currentImageIndex + 1} / ${this.currentAlbumImages.length}`;
    if (this.imageCounter && this.viewMode === 'slideshow') this.imageCounter.textContent = counterText;
    if (this.lightboxCounter && !this.lightbox.classList.contains('hidden')) {
      this.lightboxCounter.textContent = counterText;
    }
  }

  getLightboxVideoEl() {
    if (!this._lightboxVideoEl) {
      const stage = this.lightbox?.querySelector('.lightbox-stage');
      if (!stage) return null;
      this._lightboxVideoEl = document.createElement('iframe');
      this._lightboxVideoEl.id = 'lightboxVideo';
      this._lightboxVideoEl.className = 'lightbox-video hidden';
      this._lightboxVideoEl.setAttribute('title', 'Video player');
      this._lightboxVideoEl.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      this._lightboxVideoEl.setAttribute('allowfullscreen', '');
      stage.appendChild(this._lightboxVideoEl);
    }
    return this._lightboxVideoEl;
  }

  openLightboxForItem(item, index) {
    if (!item) return;
    this.currentImageIndex = index;
    this.lightbox.classList.remove('hidden');
    requestAnimationFrame(() => this.lightbox.classList.add('lightbox-view--open'));

    const videoEl = this.getLightboxVideoEl();
    const caption = item.title || this.currentAlbumTitle;

    if (item.embedUrl && videoEl) {
      this.lightboxImage.classList.add('hidden');
      this.lightboxImage.classList.remove('lightbox-image--visible');
      videoEl.src = item.embedUrl;
      videoEl.classList.remove('hidden');
      videoEl.classList.add('lightbox-video--visible');
    } else if (item.url) {
      if (videoEl) {
        videoEl.classList.add('hidden');
        videoEl.classList.remove('lightbox-video--visible');
        videoEl.removeAttribute('src');
      }
      this.lightboxImage.classList.remove('hidden');
      this.lightboxImage.classList.remove('lightbox-image--visible');
      this.lightboxImage.src = item.url;
      this.lightboxImage.alt = `${caption} — ${index + 1} of ${this.currentAlbumImages.length}`;
      this.lightboxImage.onload = () => this.lightboxImage.classList.add('lightbox-image--visible');
      if (this.lightboxImage.complete) this.lightboxImage.classList.add('lightbox-image--visible');
    }

    if (this.lightboxCaption) {
      this.lightboxCaption.textContent = caption;
    }
    this.updateImageCounter();
  }

  openLightbox(imageUrl, index) {
    const item = this.currentAlbumItems[index] || {
      url: imageUrl,
      poster: imageUrl,
      embedUrl: null,
      title: this.currentAlbumTitle
    };
    this.openLightboxForItem(item, index);
  }

  closeLightbox() {
    const videoEl = this.getLightboxVideoEl();
    if (videoEl) {
      videoEl.classList.add('hidden');
      videoEl.classList.remove('lightbox-video--visible');
      videoEl.removeAttribute('src');
    }
    this.lightboxImage?.classList.remove('hidden');
    this.lightbox.classList.remove('lightbox-view--open');
    setTimeout(() => this.lightbox.classList.add('hidden'), 350);
  }

  navigateLightbox(direction) {
    if (this.lightbox.classList.contains('hidden') || !this.currentAlbumItems.length) return;
    const newIndex =
      direction > 0
        ? this.currentImageIndex < this.currentAlbumItems.length - 1
          ? this.currentImageIndex + 1
          : 0
        : this.currentImageIndex > 0
          ? this.currentImageIndex - 1
          : this.currentAlbumItems.length - 1;

    this.lightboxImage.classList.remove('lightbox-image--visible');
    const videoEl = this.getLightboxVideoEl();
    if (videoEl) videoEl.classList.remove('lightbox-video--visible');
    setTimeout(() => {
      this.openLightboxForItem(this.currentAlbumItems[newIndex], newIndex);
    }, 120);
  }

  closeAlbumView() {
    this.pauseAutoPlay();
    this.cleanupHoverVideos();
    this.currentAlbumKey = '';
    this.currentCollectionKey = '';
    this.inGalleryView = false;
    this.navigationStack = [];
    this.setAlbumViewModeClass('default');
    document.getElementById('albumViewBreadcrumb')?.classList.add('hidden');
    this.albumBack.textContent = '← Close';
    this.albumView.classList.add('hidden');
    this.albumsSlider?.classList.remove('hidden');
    document.body.classList.remove('album-open');
  }

  navigateImage(direction) {
    const newIndex =
      direction > 0
        ? this.currentImageIndex < this.currentAlbumImages.length - 1
          ? this.currentImageIndex + 1
          : 0
        : this.currentImageIndex > 0
          ? this.currentImageIndex - 1
          : this.currentAlbumImages.length - 1;
    this.setCurrentImage(newIndex);
  }

  startAutoPlay() {
    if (this.autoPlayInterval || this.viewMode !== 'slideshow') return;
    this.isAutoPlaying = true;
    this.updateAutoPlayButton();
    this.autoPlayInterval = setInterval(() => this.navigateImage(1), this.autoPlayDelay);
  }

  pauseAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
      this.autoPlayInterval = null;
    }
    this.isAutoPlaying = false;
    this.updateAutoPlayButton();
  }

  toggleAutoPlay() {
    if (this.isAutoPlaying) this.pauseAutoPlay();
    else this.startAutoPlay();
  }

  updateAutoPlayButton() {
    const autoPlayText = document.getElementById('autoPlayText');
    if (autoPlayText) autoPlayText.textContent = this.isAutoPlaying ? 'Pause' : 'Auto-play';
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
    const lightboxOpen = !this.lightbox.classList.contains('hidden');
    const albumOpen = !this.albumView.classList.contains('hidden');

    if (e.key === 'Escape') {
      if (lightboxOpen) this.closeLightbox();
      else if (albumOpen) this.handleAlbumBack();
      return;
    }

    if (lightboxOpen) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateLightbox(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateLightbox(1);
      }
      return;
    }

    if (albumOpen && this.inGalleryView && this.viewMode === 'slideshow') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.pauseAutoPlay();
        this.navigateImage(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.pauseAutoPlay();
        this.navigateImage(1);
      } else if (e.key === ' ') {
        e.preventDefault();
        this.toggleAutoPlay();
      }
    }
  }
}

new MainPortfolioManager();
