// =================================================================
// PERFORMANCE MONITORING AND WEB VITALS TRACKING
// =================================================================

class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.vitals = {};
    this.observers = [];
    this.init();
  }

  init() {
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupMonitoring());
    } else {
      this.setupMonitoring();
    }
  }

  setupMonitoring() {
    this.measureLoadTimes();
    this.measureWebVitals();
    this.setupResourceMonitoring();
    this.setupErrorTracking();
    this.setupUserInteractionTracking();
  }

  // Measure basic load times
  measureLoadTimes() {
    if (!('performance' in window)) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = performance.timing;
        const navigation = performance.getEntriesByType('navigation')[0];
        
        this.metrics = {
          // Page load metrics
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
          loadComplete: perfData.loadEventEnd - perfData.navigationStart,
          firstByte: perfData.responseStart - perfData.navigationStart,
          domInteractive: perfData.domInteractive - perfData.navigationStart,
          
          // Navigation timing
          dnsLookup: perfData.domainLookupEnd - perfData.domainLookupStart,
          tcpConnect: perfData.connectEnd - perfData.connectStart,
          requestTime: perfData.responseEnd - perfData.requestStart,
          
          // Navigation API metrics (if available)
          serverResponseTime: navigation ? navigation.responseStart - navigation.requestStart : 0,
          transferSize: navigation ? navigation.transferSize : 0,
          encodedBodySize: navigation ? navigation.encodedBodySize : 0,
          decodedBodySize: navigation ? navigation.decodedBodySize : 0
        };

        this.reportMetrics();
      }, 100);
    });
  }

  // Measure Web Vitals (LCP, FID, CLS)
  measureWebVitals() {
    // Largest Contentful Paint (LCP)
    this.observeLCP();
    
    // First Input Delay (FID)
    this.observeFID();
    
    // Cumulative Layout Shift (CLS)
    this.observeCLS();
    
    // Time to First Byte (TTFB)
    this.observeTTFB();
  }

  observeLCP() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        
        this.vitals.lcp = {
          value: lastEntry.startTime,
          rating: this.rateLCP(lastEntry.startTime),
          element: lastEntry.element ? lastEntry.element.tagName : 'unknown'
        };
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(observer);
    } catch (e) {
      console.warn('LCP observation not supported');
    }
  }

  observeFID() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.processingStart - entry.startTime >= 0) {
            this.vitals.fid = {
              value: entry.processingStart - entry.startTime,
              rating: this.rateFID(entry.processingStart - entry.startTime),
              target: entry.target ? entry.target.tagName : 'unknown'
            };
          }
        });
      });

      observer.observe({ entryTypes: ['first-input'] });
      this.observers.push(observer);
    } catch (e) {
      console.warn('FID observation not supported');
    }
  }

  observeCLS() {
    if (!('PerformanceObserver' in window)) return;

    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries = [];

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        entries.forEach((entry) => {
          if (!entry.hadRecentInput) {
            const firstSessionEntry = sessionEntries[0];
            const lastSessionEntry = sessionEntries[sessionEntries.length - 1];

            if (sessionValue && 
                entry.startTime - lastSessionEntry.startTime < 1000 &&
                entry.startTime - firstSessionEntry.startTime < 5000) {
              sessionValue += entry.value;
              sessionEntries.push(entry);
            } else {
              sessionValue = entry.value;
              sessionEntries = [entry];
            }

            if (sessionValue > clsValue) {
              clsValue = sessionValue;
              this.vitals.cls = {
                value: clsValue,
                rating: this.rateCLS(clsValue),
                entries: sessionEntries.length
              };
            }
          }
        });
      });

      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(observer);
    } catch (e) {
      console.warn('CLS observation not supported');
    }
  }

  observeTTFB() {
    if (!('performance' in window)) return;

    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
      this.vitals.ttfb = {
        value: navigation.responseStart - navigation.requestStart,
        rating: this.rateTTFB(navigation.responseStart - navigation.requestStart)
      };
    }
  }

  // Rating functions for Web Vitals
  rateLCP(value) {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
  }

  rateFID(value) {
    if (value <= 100) return 'good';
    if (value <= 300) return 'needs-improvement';
    return 'poor';
  }

  rateCLS(value) {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
  }

  rateTTFB(value) {
    if (value <= 800) return 'good';
    if (value <= 1800) return 'needs-improvement';
    return 'poor';
  }

  // Resource monitoring
  setupResourceMonitoring() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.transferSize > 100000) { // Large resources > 100KB
            console.warn(`Large resource detected: ${entry.name} (${Math.round(entry.transferSize / 1024)}KB)`);
          }
          
          if (entry.duration > 1000) { // Slow resources > 1s
            console.warn(`Slow resource detected: ${entry.name} (${Math.round(entry.duration)}ms)`);
          }
        });
      });

      observer.observe({ entryTypes: ['resource'] });
      this.observers.push(observer);
    } catch (e) {
      console.warn('Resource monitoring not supported');
    }
  }

  // Error tracking
  setupErrorTracking() {
    window.addEventListener('error', (event) => {
      this.trackError({
        type: 'javascript',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error ? event.error.stack : null
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        type: 'promise',
        message: event.reason ? event.reason.message : 'Unhandled promise rejection',
        stack: event.reason ? event.reason.stack : null
      });
    });

    // Track resource loading errors
    document.addEventListener('error', (event) => {
      if (event.target !== document) {
        this.trackError({
          type: 'resource',
          message: `Failed to load: ${event.target.src || event.target.href}`,
          element: event.target.tagName
        });
      }
    }, true);
  }

  // User interaction tracking
  setupUserInteractionTracking() {
    // Track long tasks
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.duration > 50) {
              console.warn(`Long task detected: ${Math.round(entry.duration)}ms`);
            }
          });
        });

        observer.observe({ entryTypes: ['longtask'] });
        this.observers.push(observer);
      } catch (e) {
        console.warn('Long task monitoring not supported');
      }
    }

    // Track user engagement
    let interactionCount = 0;
    let engagementStartTime = Date.now();

    ['click', 'scroll', 'keydown', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, () => {
        interactionCount++;
      }, { passive: true });
    });

    // Report engagement on page unload
    window.addEventListener('beforeunload', () => {
      const engagementTime = Date.now() - engagementStartTime;
      this.trackEngagement({
        timeOnPage: engagementTime,
        interactions: interactionCount,
        scrollDepth: this.getScrollDepth()
      });
    });
  }

  getScrollDepth() {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDepth = ((scrollTop + windowHeight) / documentHeight) * 100;
    return Math.min(100, Math.round(scrollDepth));
  }

  trackError(error) {
    console.error('Performance Monitor - Error tracked:', error);
    // In production, send to analytics service
    // this.sendToAnalytics('error', error);
  }

  trackEngagement(engagement) {
    console.log('Performance Monitor - Engagement:', engagement);
    // In production, send to analytics service
    // this.sendToAnalytics('engagement', engagement);
  }

  reportMetrics() {
    const report = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metrics: this.metrics,
      vitals: this.vitals,
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt
      } : null
    };

    console.log('Performance Monitor - Report:', report);
    
    // In production, send to analytics service
    // this.sendToAnalytics('performance', report);
    
    // Show warnings for poor performance
    this.checkPerformanceWarnings();
  }

  checkPerformanceWarnings() {
    if (this.metrics.loadComplete > 3000) {
      console.warn('Page load time exceeded 3 seconds');
    }

    if (this.vitals.lcp && this.vitals.lcp.rating === 'poor') {
      console.warn('Largest Contentful Paint is poor:', this.vitals.lcp.value);
    }

    if (this.vitals.fid && this.vitals.fid.rating === 'poor') {
      console.warn('First Input Delay is poor:', this.vitals.fid.value);
    }

    if (this.vitals.cls && this.vitals.cls.rating === 'poor') {
      console.warn('Cumulative Layout Shift is poor:', this.vitals.cls.value);
    }
  }

  // Send data to analytics service (implement as needed)
  sendToAnalytics(type, data) {
    // Example implementation for Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', 'performance_metric', {
        metric_type: type,
        metric_data: JSON.stringify(data)
      });
    }

    // Example for custom analytics endpoint
    if (window.fetch) {
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data })
      }).catch(() => {
        // Silent fail for analytics
      });
    }
  }

  // Cleanup observers
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceMonitor;
}