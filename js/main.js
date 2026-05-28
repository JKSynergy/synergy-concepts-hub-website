/**
 * Main JavaScript functionality for Synergy Concepts Hub website
 * Handles mobile menu overlay, hero slider, and interactive elements
 */

document.addEventListener('DOMContentLoaded', function() {
    // Mobile Menu Overlay functionality
    initializeMobileMenu();
    
    // Hero slider functionality
    initializeHeroSlider();
    
    // Scroll effects
    initializeScrollEffects();
    
    // Smooth scrolling
    initializeSmoothScrolling();
});

/**
 * Initialize Mobile Menu Overlay
 */
function initializeMobileMenu() {
    const menuOpen = document.getElementById('menuOpen');
    const menuClose = document.getElementById('menuClose');
    const overlayMenu = document.getElementById('overlayMenu');
    const overlayPanel = document.getElementById('overlayPanel');
    
    if (!menuOpen || !menuClose || !overlayMenu || !overlayPanel) {
        console.warn('Mobile menu elements not found');
        return;
    }
    
    // Open menu
    menuOpen.addEventListener('click', function() {
        overlayMenu.classList.remove('hidden');
        overlayMenu.setAttribute('aria-hidden', 'false');
        menuOpen.setAttribute('aria-expanded', 'true');
        
        // Prevent body scrolling when menu is open
        document.body.classList.add('menu-open');
        document.body.style.overflow = 'hidden';
        
        // Focus the close button for accessibility
        setTimeout(() => {
            menuClose.focus();
        }, 300);
    });
    
    // Close menu
    function closeMenu() {
        overlayMenu.classList.add('hidden');
        overlayMenu.setAttribute('aria-hidden', 'true');
        menuOpen.setAttribute('aria-expanded', 'false');
        
        // Restore body scrolling
        document.body.classList.remove('menu-open');
        document.body.style.overflow = '';
        
        // Return focus to menu button
        menuOpen.focus();
    }
    
    menuClose.addEventListener('click', closeMenu);
    
    // Close menu on overlay click (background)
    overlayMenu.addEventListener('click', function(e) {
        if (e.target === overlayMenu) {
            closeMenu();
        }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !overlayMenu.classList.contains('hidden')) {
            closeMenu();
        }
    });
    
    // Close menu when nav links are clicked
    const navLinks = overlayMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            closeMenu();
            // Small delay to allow smooth scrolling to work
            setTimeout(() => {
                const href = this.getAttribute('href');
                if (href.startsWith('#')) {
                    scrollToSection(href);
                }
            }, 100);
        });
    });
    
    // Handle viewport changes - close menu if screen becomes large
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    mediaQuery.addListener(function(e) {
        if (e.matches && !overlayMenu.classList.contains('hidden')) {
            closeMenu();
        }
    });
}

/**
 * Initialize Hero Slider
 */
function initializeHeroSlider() {
    const heroSlides = [
        {
            image: 'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:eco,w_1920/v1759536582/18697_q1ptuz.jpg',
            title: 'Ideas brought to life.',
            subtitle: 'We transform your vision into powerful digital solutions through innovative design, cutting-edge technology, and strategic automation.'
        },
        {
            image: 'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:eco,w_1920/v1759536582/creative-workspace_abc123.jpg',
            title: 'Creative Excellence.',
            subtitle: 'From stunning graphics to immersive photography, we craft visual experiences that captivate and inspire your audience.'
        },
        {
            image: 'https://res.cloudinary.com/djr43ohnq/image/upload/f_auto,q_auto:eco,w_1920/v1759536582/automation-tech_def456.jpg',
            title: 'Automation & Innovation.',
            subtitle: 'Streamline your business processes with cutting-edge automation solutions that save time and maximize efficiency.'
        }
    ];
    
    let currentSlide = 0;
    let slideInterval;
    
    const heroBgImage = document.getElementById('heroBgImage');
    const heroTitle = document.getElementById('heroTitle');
    const heroSubtitle = document.getElementById('heroSubtitle');
    const heroIndex = document.getElementById('heroIndex');
    const heroProgress = document.getElementById('heroProgress');
    const heroPrev = document.getElementById('heroPrev');
    const heroNext = document.getElementById('heroNext');
    
    if (!heroBgImage || !heroTitle || !heroSubtitle) {
        console.warn('Hero slider elements not found');
        return;
    }
    
    // Update slide content
    function updateSlide(index) {
        const slide = heroSlides[index];
        
        // Update background image with fade effect
        heroBgImage.style.opacity = '0.7';
        setTimeout(() => {
            heroBgImage.style.backgroundImage = `url('${slide.image}')`;
            heroBgImage.style.opacity = '1';
        }, 150);
        
        // Update text content
        heroTitle.textContent = slide.title;
        heroSubtitle.textContent = slide.subtitle;
        
        // Update progress indicator
        if (heroIndex) {
            heroIndex.textContent = String(index + 1).padStart(2, '0');
        }
        
        if (heroProgress) {
            const progressPercent = ((index + 1) / heroSlides.length) * 100;
            heroProgress.style.width = `${progressPercent}%`;
        }
    }
    
    // Auto-advance slides
    function startSlideshow() {
        slideInterval = setInterval(() => {
            currentSlide = (currentSlide + 1) % heroSlides.length;
            updateSlide(currentSlide);
        }, 5000);
    }
    
    // Navigation controls
    if (heroNext) {
        heroNext.addEventListener('click', () => {
            clearInterval(slideInterval);
            currentSlide = (currentSlide + 1) % heroSlides.length;
            updateSlide(currentSlide);
            startSlideshow();
        });
    }
    
    if (heroPrev) {
        heroPrev.addEventListener('click', () => {
            clearInterval(slideInterval);
            currentSlide = (currentSlide - 1 + heroSlides.length) % heroSlides.length;
            updateSlide(currentSlide);
            startSlideshow();
        });
    }
    
    // Initialize first slide
    updateSlide(0);
    startSlideshow();
    
    // Pause slideshow on hover
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
        heroSection.addEventListener('mouseenter', () => clearInterval(slideInterval));
        heroSection.addEventListener('mouseleave', startSlideshow);
    }
}

/**
 * Initialize Scroll Effects
 */
function initializeScrollEffects() {
    const header = document.querySelector('.site-header');
    
    if (!header) return;
    
    let lastScrollY = window.scrollY;
    
    function updateHeader() {
        const currentScrollY = window.scrollY;
        
        // Add scrolled class when scrolled down
        if (currentScrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScrollY = currentScrollY;
    }
    
    // Throttled scroll handler
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                updateHeader();
                ticking = false;
            });
            ticking = true;
        }
    });
}

/**
 * Initialize Smooth Scrolling
 */
function initializeSmoothScrolling() {
    // Handle smooth scrolling for anchor links
    document.addEventListener('click', function(e) {
        const target = e.target.closest('a[href^="#"]');
        if (target) {
            e.preventDefault();
            const href = target.getAttribute('href');
            scrollToSection(href);
        }
    });
}

/**
 * Smooth scroll to section
 */
function scrollToSection(selector) {
    const target = document.querySelector(selector);
    if (target) {
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 64;
        const targetPosition = target.offsetTop - headerHeight;
        
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }
}

/**
 * Utility Functions
 */

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if element is in viewport
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Animate elements on scroll (if needed for future features)
function animateOnScroll() {
    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(element => {
        if (isInViewport(element)) {
            element.classList.add('animated');
        }
    });
}

// Initialize animation observer if needed
if (document.querySelectorAll('.animate-on-scroll').length > 0) {
    const debouncedAnimate = debounce(animateOnScroll, 10);
    window.addEventListener('scroll', debouncedAnimate);
    window.addEventListener('resize', debouncedAnimate);
    animateOnScroll(); // Initial check
}