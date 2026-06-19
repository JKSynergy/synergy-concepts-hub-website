// =================================================================
// SYNERGY CONCEPTS HUB — CINEMATIC SHOWCASE PLATFORM
// Four pillars: Film · Photography · Brand · Academy
// =================================================================

const PLACEHOLDER_FILM = '/images/showcase/film.png';
const PLACEHOLDER_BRAND = '/images/showcase/brand.jpg';
const PLACEHOLDER_PHOTO = '/images/showcase/photography.png';
const PLACEHOLDER_ACADEMY = '/images/albums/academy/academy.jpg';
const PLACEHOLDER_ACADEMY_PAGE = '/images/showcase/academy-page.jpg';

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
    behindTheScenes: [
      'images/albums/film/behind-the-scenes/Bts 1.jpg',
      'images/albums/film/behind-the-scenes/Bts 2.jpg',
      'images/albums/film/behind-the-scenes/Bts 3.jpg',
      'images/albums/film/behind-the-scenes/Bts 4.jpg'
    ],
    motionStorytelling: []
  },
  photography: {
    portraitStories: [
      'images/albums/photos/portrait-stories/2149152612.jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (10).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (2).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (4).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (5).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (6).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (8).jpg',
      'images/albums/photos/portrait-stories/DR. CHRISTINE (9).jpg',
      'images/albums/photos/portrait-stories/Joseph.jpg',
      'images/albums/photos/portrait-stories/Photo 1.jpg',
      'images/albums/photos/portrait-stories/Photo 2.jpg',
      'images/albums/photos/portrait-stories/Vianney 4.jpg',
      'images/albums/photos/portrait-stories/Vianney.jpg'
    ],
    eventExperiences: {
      'Brenda & Jan': [
        'images/photography/event experiences/Brenda & Jan/DSC_8172.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6526.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6549.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6554.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6586.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6637.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_6950.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_7129.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_7553.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_7669.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_7678.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_7753.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_8153.jpg',
        'images/photography/event experiences/Brenda & Jan/DSC_8185.jpg',
        'images/photography/event experiences/Brenda & Jan/KAY_3558.jpg'
      ],
      'Daniel & Daphne': [
        'images/photography/event experiences/Daniel & Daphne/DSC_0719.jpg',
        'images/photography/event experiences/Daniel & Daphne/DSC_0628.jpg',
        'images/photography/event experiences/Daniel & Daphne/DSC_0726.jpg',
        'images/photography/event experiences/Daniel & Daphne/DSC_0807.jpg',
        'images/photography/event experiences/Daniel & Daphne/DSC_0886.jpg',
        'images/photography/event experiences/Daniel & Daphne/DSC_1263.jpg'
      ],
      'Honest': [
        'images/photography/event experiences/Honest/Honest.png',
        'images/photography/event experiences/Honest/Honest 2.png',
        'images/photography/event experiences/Honest/Honest 3.png',
        'images/photography/event experiences/Honest/Honest 4.png',
        'images/photography/event experiences/Honest/Honest 5.png',
        'images/photography/event experiences/Honest/Honest 6.png',
        'images/photography/event experiences/Honest/Honest 7.png',
        'images/photography/event experiences/Honest/Honest 8.png',
        'images/photography/event experiences/Honest/Honest 9.png',
        'images/photography/event experiences/Honest/Honest 10.png',
        'images/photography/event experiences/Honest/Honest 11.png',
        'images/photography/event experiences/Honest/Honest 12.png',
        'images/photography/event experiences/Honest/Honest 13.png',
        'images/photography/event experiences/Honest/Honest 14.png',
        'images/photography/event experiences/Honest/Honest Last.png'
      ],
      'Horrace & Vannesa': [
        'images/photography/event experiences/Horrace & Vannesa/Vannie 1.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 2.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 3.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 4.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 5.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 6.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 8.jpg',
        'images/photography/event experiences/Horrace & Vannesa/Vannie 9.jpg'
      ],
      'Intro': [
        'images/photography/event experiences/Intro/IMG_7502.jpg',
        'images/photography/event experiences/Intro/IMG_7439.jpg',
        'images/photography/event experiences/Intro/IMG_7446.jpg',
        'images/photography/event experiences/Intro/IMG_7467 2.jpg',
        'images/photography/event experiences/Intro/IMG_7469.jpg',
        'images/photography/event experiences/Intro/IMG_7476.jpg',
        'images/photography/event experiences/Intro/IMG_7492.jpg',
        'images/photography/event experiences/Intro/IMG_7499.jpg',
        'images/photography/event experiences/Intro/IMG_7500.jpg'
      ],
      'Katherine & Ron': [
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-57.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-49.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-81.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-58.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-59.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-65.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-68.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-69.jpg',
        'images/photography/event experiences/Katherine & Ron/Kath & Ron-85.jpg'
      ],
      'Samantha': [
        'images/photography/event experiences/samantha/Sam.jpg',
        'images/photography/event experiences/samantha/Sam 2.jpg',
        'images/photography/event experiences/samantha/Sam 4.jpg',
        'images/photography/event experiences/samantha/Sam 5.jpg',
        'images/photography/event experiences/samantha/Samantha.jpg',
        'images/photography/event experiences/samantha/Samantha 2.jpg',
        'images/photography/event experiences/samantha/Samantha 3.jpg',
        'images/photography/event experiences/samantha/Samantha 4.jpg',
        'images/photography/event experiences/samantha/Samantha 5.jpg'
      ],
      'Vivian': [
        'images/photography/event experiences/vivian/Vivian (7).jpg',
        'images/photography/event experiences/vivian/Vivian (1).jpg',
        'images/photography/event experiences/vivian/Vivian (2).jpg',
        'images/photography/event experiences/vivian/Vivian (3).jpg',
        'images/photography/event experiences/vivian/Vivian (4).jpg',
        'images/photography/event experiences/vivian/Vivian (5).jpg',
        'images/photography/event experiences/vivian/Vivian (6).jpg',
        'images/photography/event experiences/vivian/Vivian (8).jpg'
      ],
      'Jason': [
        'images/photography/event experiences/Jason/DSC_0102.jpg',
        'images/photography/event experiences/Jason/DSC_0105.jpg',
        'images/photography/event experiences/Jason/DSC_0111.jpg',
        'images/photography/event experiences/Jason/DSC_0455.jpg',
        'images/photography/event experiences/Jason/DSC_0461.jpg',
        'images/photography/event experiences/Jason/DSC_0474.jpg',
        'images/photography/event experiences/Jason/DSC_0477.jpg',
        'images/photography/event experiences/Jason/DSC_0509.jpg',
        'images/photography/event experiences/Jason/DSC_0732.jpg',
        'images/photography/event experiences/Jason/DSC_0741.jpg',
        'images/photography/event experiences/Jason/DSC_0758.jpg',
        'images/photography/event experiences/Jason/DSC_07581.jpg',
        'images/photography/event experiences/Jason/DSC_0897.jpg'
      ],
      'Elizabeth and Richard': [
        'images/photography/event experiences/Elizabeth and Richard/NAZ_0268.jpg',
        'images/photography/event experiences/Elizabeth and Richard/NAZ_0339.jpg',
        'images/photography/event experiences/Elizabeth and Richard/NAZ_0415.jpg',
        'images/photography/event experiences/Elizabeth and Richard/NAZ_1275.jpg',
        'images/photography/event experiences/Elizabeth and Richard/NAZ_1285.jpg'
      ]
    },
    editorialPhotography: [
      'images/albums/photos/studio/DSC_9904.jpg.jpg',
      'images/albums/photos/studio/Exodus 13.jpg',
      'images/albums/photos/studio/Exodus 14.jpg',
      'images/albums/photos/studio/Exodus 2,.jpg',
      'images/albums/photos/studio/Exodus 21.jpg',
      'images/albums/photos/studio/Exodus 3.jpg',
      'images/albums/photos/studio/Exodus 4.jpg',
      'images/albums/photos/studio/Exodus.jpg',
      'images/albums/photos/studio/IMG_9567.JPG.jpeg',
      'images/albums/photos/studio/IMG_9568.JPG.jpeg',
      'images/albums/photos/studio/IMG_9569.JPG.jpeg',
      'images/albums/photos/studio/MUS_3529.jpg',
      'images/albums/photos/studio/MUS_3545.jpg',
      'images/albums/photos/studio/MUS_3586.jpg',
      'images/albums/photos/studio/_MIC3537.jpg.jpg',
      'images/albums/photos/studio/_MIC3548.jpg.jpg',
      'images/albums/photos/studio/_MIC3617.jpg.jpg',
      'images/albums/photos/studio/_MIC3721.jpg.jpeg'
    ],
    creativeSessions: [
      'images/albums/photos/creative-sessions/1.jpg',
      'images/albums/photos/creative-sessions/10.jpg',
      'images/albums/photos/creative-sessions/2.jpg',
      'images/albums/photos/creative-sessions/3.jpg',
      'images/albums/photos/creative-sessions/4.jpg',
      'images/albums/photos/creative-sessions/5.jpg',
      'images/albums/photos/creative-sessions/6.jpg',
      'images/albums/photos/creative-sessions/7.jpg',
      'images/albums/photos/creative-sessions/8.jpg',
      'images/albums/photos/creative-sessions/9.jpg'
    ],
    lifestyleMoments: []
  },
  brand: {
    brandSystems: [
      'images/brand identity/logos/CHILDREN OF VIRTUE ALTERNATIVE BLACK BG.jpg',
      'images/brand identity/logos/Diani Art Gallery Logos-03.png',
      'images/brand identity/logos/Diani Art Gallery Logos-05.png',
      'images/brand identity/logos/EEE NEW LOGO MODIFIED GOLD.jpg',
      'images/brand identity/logos/ERA Logo White.jpg',
      'images/brand identity/logos/FRAMED REALITY STUDIO-05.png',
      'images/brand identity/logos/GLOW ORGANICS LOGO-01.png',
      'images/brand identity/logos/PM-MEDIAArtboard-2.png',
      'images/brand identity/logos/Quick Credit lOGO.jpg',
      'images/brand identity/logos/RBS Logo copy.jpg',
      'images/brand identity/logos/SCF Celestial Wedding copy.png',
      'images/brand identity/logos/SMA LOGO  VERSION 2-01.png',
      'images/brand identity/logos/SYNERGY CREATIVE HUB NEW LOGOS-01.jpg',
      'images/brand identity/logos/Trav Logo.png',
      'images/brand identity/logos/World Vision Uganda SPF Logo Variants-01.png'
    ],
    digitalCampaigns: {
      'E-Flyers': [
        'images/brand identity/eflyers/GRADUATION -01.jpg',
        'images/brand identity/eflyers/Kelly Card.jpg',
        'images/brand identity/eflyers/SMA COUNTDOWN.jpg',
        'images/brand identity/eflyers/SMA COURSES-01.png',
        'images/brand identity/eflyers/SMA COURSES-02.png',
        'images/brand identity/eflyers/SMA STUDY TIMES-02.jpg',
        'images/brand identity/eflyers/Watches 1.png',
        'images/brand identity/eflyers/WATCHES 2.png',
        'images/brand identity/eflyers/WEDDINGS.png',
        'images/brand identity/eflyers/WEDDINGS 2.png'
      ],
      'Banners': [
        'images/brand identity/banners/SYNERGY STUDIOS 450CM X 100CM NEW-01.png'
      ]
    },
    creativeDesign: [
      'images/brand identity/certificates/Certificate Of Attendance.png'
    ],
    visualIdentity: {
      'Matsen': [
        'images/brand identity/Matsen/Matsen profile-01.png',
        'images/brand identity/Matsen/Matsen profile-02.png',
        'images/brand identity/Matsen/Matsen profile-03.png',
        'images/brand identity/Matsen/Matsen profile-04.png',
        'images/brand identity/Matsen/Matsen profile-05.png',
        'images/brand identity/Matsen/Matsen profile-06.png',
        'images/brand identity/Matsen/Matsen profile-07.png',
        'images/brand identity/Matsen/Matsen profile-08.png'
      ],
      'Letter Heads': [
        'images/brand identity/letter heads/WVU SPF.png'
      ],
      'Rotary': [
        'images/brand identity/Rotary/1.jpg',
        'images/brand identity/Rotary/2.jpg',
        'images/brand identity/Rotary/3.jpg',
        'images/brand identity/Rotary/4.jpg',
        'images/brand identity/Rotary/5.jpg',
        'images/brand identity/Rotary/6.jpg',
        'images/brand identity/Rotary/7.jpg',
        'images/brand identity/Rotary/8.jpg',
        'images/brand identity/Rotary/9.jpg'
      ]
    },
    marketingExperiences: []
  },
  academy: {
    creativeTrainingSessions: [
      'images/albums/academy/creative-training-sessions/268A5754.JPG',
      'images/albums/academy/creative-training-sessions/268A5756.JPG',
      'images/albums/academy/creative-training-sessions/DSC02423.jpg'
    ],
    studentShowcase: [
      'images/albums/academy/academy.jpg'
    ],
    learningInAction: [
      'images/albums/academy/class-rooms/20250822_163612.jpg',
      'images/albums/academy/class-rooms/20250822_164638.jpg',
      'images/albums/academy/class-rooms/20250822_164713.jpg',
      'images/albums/academy/class-rooms/20250822_165220.jpg',
      'images/albums/academy/learning-in-action/DSC02406 copy.jpg',
      'images/albums/academy/learning-in-action/DSC02428 copy.jpg',
      'images/albums/academy/learning-in-action/DSC02432 copy.jpg',
      'images/albums/academy/learning-in-action/John.jpg'
    ],
    creativeTransformations: {
      'Future Storytellers': [
        'images/albums/academy/future-storytellers/Kelly  (1).jpeg',
        'images/albums/academy/future-storytellers/Kelly  (2).jpeg'
      ]
    },
    multimediaWorkshops: [
      'images/albums/academy/multimedia-workshops/DSC02424 copy.jpg',
      'images/albums/academy/multimedia-workshops/DSC02588.jpg',
      'images/albums/academy/multimedia-workshops/learn.jpg'
    ],
    futureCreators: [
      'images/albums/academy/124414.jpg'
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
      title: 'Studio Photography',
      subtitle: 'Magazine-quality compositions and visual essays',
      accent: 'gold',
      category: 'Studio'
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
  },
  'Brenda & Jan': {
    tag: 'Celebration',
    subtitle: 'A beautiful celebration captured in cinematic detail',
    accent: 'orange'
  },
  'Daniel & Daphne': {
    tag: 'Celebration',
    subtitle: 'Moments of love and joy, frame by frame',
    accent: 'orange'
  },
  'Honest': {
    tag: 'Event',
    subtitle: 'Authentic moments from a memorable occasion',
    accent: 'blue'
  },
  'Horrace & Vannesa': {
    tag: 'Celebration',
    subtitle: 'Elegance, emotion, and timeless memories',
    accent: 'orange'
  },
  'Intro': {
    tag: 'Event',
    subtitle: 'An introduction session captured with editorial precision',
    accent: 'blue'
  },
  'Samantha': {
    tag: 'Portrait',
    subtitle: 'A personal session full of personality and grace',
    accent: 'gold'
  },
  'Vivian': {
    tag: 'Portrait',
    subtitle: 'Vibrant energy and refined presence in every frame',
    accent: 'gold'
  },
  'Jason': {
    tag: 'Portrait',
    subtitle: 'Professional portrait session with character and depth',
    accent: 'blue'
  },
  'Elizabeth and Richard': {
    tag: 'Celebration',
    subtitle: 'A beautiful union captured in timeless frames',
    accent: 'orange'
  },
  'Children of Virtue': { tag: 'Logo', subtitle: 'Brand identity for Children of Virtue', accent: 'blue' },
  'Diani Art Gallery': { tag: 'Logo', subtitle: 'Visual identity for Diani Art Gallery', accent: 'gold' },
  'EEE': { tag: 'Logo', subtitle: 'Brand mark for EEE', accent: 'blue' },
  'ERA': { tag: 'Logo', subtitle: 'Clean brand identity for ERA', accent: 'blue' },
  'Framed Reality Studio': { tag: 'Logo', subtitle: 'Identity for Framed Reality Studio', accent: 'blue' },
  'Glow Organics': { tag: 'Logo', subtitle: 'Natural brand identity for Glow Organics', accent: 'green' },
  'PM Media': { tag: 'Logo', subtitle: 'Brand mark for PM Media', accent: 'blue' },
  'Quick Credit': { tag: 'Logo', subtitle: 'Bold identity for Quick Credit', accent: 'gold' },
  'RBS': { tag: 'Logo', subtitle: 'Brand system for RBS', accent: 'blue' },
  'SCF Celestial Wedding': { tag: 'Logo', subtitle: 'Elegant identity for SCF Celestial Wedding', accent: 'orange' },
  'SMA': { tag: 'Logo', subtitle: 'Modern brand identity for SMA', accent: 'blue' },
  'Synergy Creative Hub': { tag: 'Logo', subtitle: 'In-house brand system for Synergy Creative Hub', accent: 'gold' },
  'Trav': { tag: 'Logo', subtitle: 'Travel brand identity for Trav', accent: 'blue' },
  'World Vision Uganda SPF': { tag: 'Logo', subtitle: 'Identity for World Vision Uganda SPF', accent: 'blue' },
  'E-Flyers': { tag: 'Digital Campaign', subtitle: 'E-flyers, announcements, and social creatives', accent: 'orange' },
  'Banners': { tag: 'Print', subtitle: 'Large-format banners and print collateral', accent: 'blue' },
  'Matsen': { tag: 'Company Profile', subtitle: 'Full company profile design for Matsen', accent: 'blue' },
  'Letter Heads': { tag: 'Stationery', subtitle: 'Official branded letterheads and stationery', accent: 'blue' },
  'Rotary': { tag: 'Brand Identity', subtitle: 'Visual identity work for Rotary', accent: 'gold' }
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
      photography: PLACEHOLDER_PHOTO,
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

    const heroImage = this.getPillarPlaceholder(albumKey);
    let firstCollectionImage = heroImage;
    for (const collection of collections) {
      if (collection.info.firstImage) {
        firstCollectionImage = collection.info.firstImage;
        break;
      }
    }

    const mainImageContainer = document.getElementById('mainImageContainer');
    const pillarClass = `gallery-hub--${albumKey}`;

    const totalItems = collections.reduce((sum, c) => sum + (c.info.count || 0), 0);
    mainImageContainer.innerHTML = `
      <div class="gallery-hub ${pillarClass}">
        <div class="album-layout-hero">
          <div class="album-layout-hero__overlay"></div>
          <div class="album-layout-hero__content">
            <span class="album-layout-hero__label">${meta.label}</span>
            <h1 class="album-layout-hero__title">${meta.title}</h1>
            <p class="album-layout-hero__description">${meta.subtitle}</p>
            <span class="album-layout-hero__meta">${collections.length} collections · ${totalItems} visuals</span>
          </div>
        </div>

        <section class="album-layout-grid" aria-label="Collections">
          ${collections
            .filter((c) => !c.info.isEmpty || albumKey !== 'film')
            .map((c) => this.renderCollectionCard(albumKey, c))
            .join('')}
        </section>
      </div>
    `;

    this.bindHubCards(mainImageContainer, albumKey, albumData);
    this.initCollectionVideoPreviews(mainImageContainer);
    this.showAlbumShell('hub');
    this.updateAlbumBreadcrumb(meta.label, 'Collections');
  }

  renderFeaturedCard(albumKey, { key, content, info, colMeta }) {
    return this.renderCollectionCard(albumKey, { key, content, info, colMeta });
  }

  renderCollectionCard(albumKey, { key, content, info, colMeta }) {
    const isEmpty = info.isEmpty || this.isFilmCollectionEmpty(albumKey, key, content);
    const cover = info.firstImage || this.getPillarPlaceholder(albumKey);
    const isFilm = albumKey === 'film';
    const countLabel = isEmpty
      ? 'In production'
      : isFilm
        ? `${info.count} ${info.count === 1 ? 'production' : 'productions'}`
        : `${info.count} ${info.count === 1 ? 'visual' : 'visuals'}`;

    const filmPreview =
      isFilm && !isEmpty && Array.isArray(content) && content[0]?.type === 'video'
        ? `<video class="album-card__video" muted loop playsinline preload="metadata" poster="${cover}" ${
            content[0].src ? `data-src="${content[0].src}"` : ''
          }></video>`
        : '';

    return `
      <article class="album-card album-card--${albumKey} ${isEmpty ? 'album-card--empty' : ''}"
               data-action="${isEmpty ? 'none' : 'collection'}" data-album="${albumKey}" data-collection="${key}"
               data-empty="${isEmpty}" tabindex="${isEmpty ? '-1' : '0'}" role="button"
               aria-label="${colMeta.title || key}${isEmpty ? ', in production' : ''}">
        <div class="album-card__media">
          <div class="album-card__media-bg" style="background-image:url('${cover}'); background-size: cover; background-position: center;"></div>
          ${filmPreview}
          ${isEmpty ? '<span class="album-card__soon-badge">In Production</span>' : ''}
          ${isFilm && !isEmpty ? '<span class="album-card__play" aria-hidden="true"><svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>' : ''}
          <div class="album-card__overlay"></div>
          <div class="album-card__grain"></div>
        </div>
        <div class="album-card__body">
          <span class="album-card__category">${colMeta.category || colMeta.title || key}</span>
          <h4 class="album-card__title">${colMeta.title || key}</h4>
          <p class="album-card__desc">${isEmpty ? 'New cinematic work arriving soon' : colMeta.subtitle || ''}</p>
          <span class="album-card__count">${countLabel}</span>
        </div>
      </article>
    `;
  }

  initCollectionVideoPreviews(container) {
    this.cleanupHoverVideos();
    container.querySelectorAll('.album-card__video').forEach((video) => {
      const src = video.dataset.src;
      const parent = video.closest('.album-card');
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
    const heroImage = this.getPillarPlaceholder(albumKey);

    const totalPhotos = stories.reduce((sum, [, photos]) => sum + photos.length, 0);
    mainImageContainer.innerHTML = `
      <div class="gallery-hub gallery-hub--stories gallery-hub--${albumKey}">
        <div class="album-layout-hero">
          <div class="album-layout-hero__overlay"></div>
          <div class="album-layout-hero__content">
            <span class="album-layout-hero__label">${GALLERY_META[albumKey]?.label || albumKey}</span>
            <h1 class="album-layout-hero__title">${parentTitle}</h1>
            <p class="album-layout-hero__description">${colMeta.subtitle || 'Select a story to explore'}</p>
            <span class="album-layout-hero__meta">${stories.length} stories · ${totalPhotos} frames</span>
          </div>
        </div>

        <div class="album-layout-grid">
          ${stories
            .map(([name, photos]) => {
              const storyMeta = STORY_META[name] || {};
              const thumb = this.normalizeMediaItem(photos[0]).poster;
              return `
                <article class="album-card album-card--${albumKey}" data-story="${name}" tabindex="0" role="button">
                  <div class="album-card__media">
                    <div class="album-card__media-bg" style="background-image:url('${thumb}')"></div>
                    <div class="album-card__overlay"></div>
                    <div class="album-card__grain"></div>
                  </div>
                  <div class="album-card__body">
                    <span class="album-card__category">${storyMeta.tag || 'Story'}</span>
                    <h4 class="album-card__title">${name}</h4>
                    <p class="album-card__desc">${storyMeta.subtitle || ''}</p>
                    <span class="album-card__count">${photos.length} frames</span>
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
    const normalized = this.currentAlbumItems;

    // Get first image for hero
    const heroImage = normalized[0]?.url || this.getPillarPlaceholder(albumKey);

    // Generate editorial gallery grid
    const galleryGrid = normalized.map((item, index) => {
      if (!item.url) return '';
      return `
        <button type="button" class="editorial-gallery__item"
                data-index="${index}" aria-label="Open image ${index + 1} of ${normalized.length}">
          <img src="${item.url}" alt="" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async" class="editorial-gallery__image"/>
          <div class="editorial-gallery__overlay"></div>
          <div class="editorial-gallery__zoom" aria-hidden="true">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"/>
            </svg>
          </div>
        </button>`;
    }).join('');

    mainImageContainer.innerHTML = `
      <div class="editorial-album">
        <div class="album-layout-hero">
          <div class="album-layout-hero__overlay"></div>
          <div class="album-layout-hero__content">
            <span class="album-layout-hero__label">${GALLERY_META[albumKey]?.label || 'Gallery'}</span>
            <h1 class="album-layout-hero__title">${title}</h1>
            <p class="album-layout-hero__description">${this.currentAlbumDescription}</p>
            <span class="album-layout-hero__meta">${normalized.length} ${normalized.length === 1 ? 'frame' : 'frames'}</span>
          </div>
        </div>

        <div class="editorial-gallery">
          ${galleryGrid}
        </div>
      </div>
    `;

    // Bind gallery item clicks
    mainImageContainer.querySelectorAll('[data-index]').forEach((btn) => {
      const idx = parseInt(btn.dataset.index, 10);
      btn.addEventListener('click', () => this.openLightbox(idx));
    });

    this.showAlbumShell('gallery');
    this.updateAlbumBreadcrumb(GALLERY_META[albumKey]?.label || 'Gallery', title);
    this.pauseAutoPlay();
  }

  renderRelatedCollections(albumKey, currentCollectionKey) {
    const albumData = MAIN_PORTFOLIO_ALBUMS[albumKey];
    if (!albumData) return '';

    const collections = Object.entries(albumData)
      .filter(([key]) => key !== currentCollectionKey)
      .slice(0, 3);

    return collections.map(([key, content]) => {
      const info = this.getSubAlbumInfo(content, albumKey, key);
      const colMeta = COLLECTION_META[albumKey]?.[key] || {};
      const cover = info.firstImage || this.getPillarPlaceholder(albumKey);

      return `
        <article class="album-card album-card--${albumKey} ${info.isEmpty ? 'album-card--empty' : ''}"
                 data-action="${info.isEmpty ? 'none' : 'collection'}" data-album="${albumKey}" data-collection="${key}"
                 tabindex="${info.isEmpty ? '-1' : '0'}" role="button">
          <div class="album-card__media">
            <div class="album-card__media-bg" style="background-image:url('${cover}'); background-size: cover; background-position: center;"></div>
            <div class="album-card__overlay"></div>
            <div class="album-card__grain"></div>
          </div>
          <div class="album-card__body">
            <span class="album-card__category">${colMeta.category || colMeta.title || key}</span>
            <h4 class="album-card__title">${colMeta.title || key}</h4>
            <p class="album-card__desc">${colMeta.subtitle || ''}</p>
            <span class="album-card__count">${info.count} visuals</span>
          </div>
        </article>
      `;
    }).join('');
  }

  openLightbox(index) {
    const item = this.currentAlbumItems[index];
    if (item) {
      this.openLightboxForItem(item, index);
    }
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
