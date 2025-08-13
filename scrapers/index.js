const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const config = require('../config/config.json');

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'data/scraper.log' }),
    new winston.transports.Console()
  ]
});

class JobScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.cookiesPath = path.join(__dirname, '../data/cookies.json');
  }

  async initialize() {
    try {
      this.browser = await chromium.launch({
        headless: config.scraping.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.context = await this.browser.newContext({
        userAgent: config.scraping.user_agent,
        viewport: { width: 1920, height: 1080 }
      });

      // Load cookies if they exist
      await this.loadCookies();
      
      logger.info('Browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async loadCookies() {
    try {
      if (await fs.pathExists(this.cookiesPath)) {
        const cookies = await fs.readJson(this.cookiesPath);
        await this.context.addCookies(cookies);
        logger.info('Cookies loaded successfully');
      }
    } catch (error) {
      logger.warn('Failed to load cookies:', error.message);
    }
  }

  async saveCookies() {
    try {
      const cookies = await this.context.cookies();
      await fs.ensureDir(path.dirname(this.cookiesPath));
      await fs.writeJson(this.cookiesPath, cookies);
      logger.info('Cookies saved successfully');
    } catch (error) {
      logger.warn('Failed to save cookies:', error.message);
    }
  }

  async scrapeLinkedIn() {
    if (!config.sites.linkedin.enabled) return [];
    
    const page = await this.context.newPage();
    const jobs = [];

    try {
      logger.info('Starting LinkedIn scraping...');
      
      // Navigate to LinkedIn jobs
      await page.goto(config.sites.linkedin.search_url);
      await page.waitForTimeout(3000);

      // Check if login is required
      const loginRequired = await page.locator('input[name="session_key"]').isVisible().catch(() => false);
      
      if (loginRequired) {
        logger.warn('LinkedIn login required - please login manually and save cookies');
        return [];
      }

      // Apply location filter
      const locationInput = page.locator('input[aria-label*="location"], input[placeholder*="location"]').first();
      if (await locationInput.isVisible()) {
        await locationInput.fill('Delhi NCR');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }

      // Apply job title filter
      const titleInput = page.locator('input[aria-label*="job title"], input[placeholder*="job title"]').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill(config.user.preferred_roles[0]);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
      }

      // Scrape job listings
      const jobCards = await page.locator('[data-job-id], .job-card-container, .jobs-search-results__list-item').all();
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          const title = await card.locator('h3, .job-title, [data-test="job-title"]').first().textContent().catch(() => 'N/A');
          const company = await card.locator('.job-card-container__company-name, [data-test="employer-name"]').first().textContent().catch(() => 'N/A');
          const location = await card.locator('.job-card-container__metadata-item, [data-test="job-location"]').first().textContent().catch(() => 'N/A');
          const link = await card.locator('a').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && this.isRelevantLocation(location)) {
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: link.startsWith('http') ? link : `https://linkedin.com${link}`,
              source: 'LinkedIn',
              scraped_at: new Date().toISOString(),
              description: 'Click link for full description'
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping LinkedIn job ${i}:`, error.message);
        }
      }

      logger.info(`LinkedIn scraping completed: ${jobs.length} jobs found`);
    } catch (error) {
      logger.error('LinkedIn scraping failed:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  async scrapeIndeed() {
    if (!config.sites.indeed.enabled) return [];
    
    const page = await this.context.newPage();
    const jobs = [];

    try {
      logger.info('Starting Indeed scraping...');
      
      const searchUrl = `${config.sites.indeed.search_url}?q=${encodeURIComponent(config.user.preferred_roles[0])}&l=Delhi%2C+Delhi`;
      await page.goto(searchUrl);
      await page.waitForTimeout(2000);

      // Handle popup if present
      const popup = page.locator('[data-testid="popup-close"], .popover-x-button-close').first();
      if (await popup.isVisible()) {
        await popup.click();
      }

      // Scrape job listings
      const jobCards = await page.locator('[data-testid="job-tile"], .job_seen_beacon, .slider_container .slider_item').all();
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          const title = await card.locator('h2 a, .jobTitle a, [data-testid="job-title"]').first().textContent().catch(() => 'N/A');
          const company = await card.locator('[data-testid="company-name"], .companyName').first().textContent().catch(() => 'N/A');
          const location = await card.locator('[data-testid="job-location"], .companyLocation').first().textContent().catch(() => 'N/A');
          const link = await card.locator('h2 a, .jobTitle a').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && this.isRelevantLocation(location)) {
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: link.startsWith('http') ? link : `https://in.indeed.com${link}`,
              source: 'Indeed',
              scraped_at: new Date().toISOString(),
              description: 'Click link for full description'
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping Indeed job ${i}:`, error.message);
        }
      }

      logger.info(`Indeed scraping completed: ${jobs.length} jobs found`);
    } catch (error) {
      logger.error('Indeed scraping failed:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  async scrapeNaukri() {
    if (!config.sites.naukri.enabled) return [];
    
    const page = await this.context.newPage();
    const jobs = [];

    try {
      logger.info('Starting Naukri scraping...');
      
      const searchUrl = `${config.sites.naukri.search_url}?k=${encodeURIComponent(config.user.preferred_roles[0])}`;
      await page.goto(searchUrl);
      await page.waitForTimeout(3000);

      // Handle login popup if present
      const loginPopup = page.locator('.crossIcon, .close, [data-test="modal-close"]').first();
      if (await loginPopup.isVisible()) {
        await loginPopup.click();
      }

      // Scrape job listings
      const jobCards = await page.locator('.jobTuple, .srp-jobtuple-wrapper, [data-job-id]').all();
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          const title = await card.locator('.title, .jobTupleHeader .ellipsis, [data-test="job-title"]').first().textContent().catch(() => 'N/A');
          const company = await card.locator('.subTitle, .companyInfo .ellipsis, [data-test="company-name"]').first().textContent().catch(() => 'N/A');
          const location = await card.locator('.location, .locationsContainer, [data-test="job-location"]').first().textContent().catch(() => 'N/A');
          const link = await card.locator('.title a, .jobTupleHeader a').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && this.isRelevantLocation(location)) {
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: link.startsWith('http') ? link : `https://www.naukri.com${link}`,
              source: 'Naukri',
              scraped_at: new Date().toISOString(),
              description: 'Click link for full description'
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping Naukri job ${i}:`, error.message);
        }
      }

      logger.info(`Naukri scraping completed: ${jobs.length} jobs found`);
    } catch (error) {
      logger.error('Naukri scraping failed:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  isRelevantLocation(location) {
    if (!location) return false;
    const locationLower = location.toLowerCase();
    return config.locations.primary.some(loc => 
      locationLower.includes(loc.toLowerCase())
    );
  }

  async scrapeAllSites() {
    await this.initialize();
    
    try {
      const [linkedinJobs, indeedJobs, naukriJobs] = await Promise.allSettled([
        this.scrapeLinkedIn(),
        this.scrapeIndeed(),
        this.scrapeNaukri()
      ]);

      const allJobs = [
        ...(linkedinJobs.status === 'fulfilled' ? linkedinJobs.value : []),
        ...(indeedJobs.status === 'fulfilled' ? indeedJobs.value : []),
        ...(naukriJobs.status === 'fulfilled' ? naukriJobs.value : [])
      ];

      // Remove duplicates based on title and company
      const uniqueJobs = allJobs.filter((job, index, self) => 
        index === self.findIndex(j => 
          j.title.toLowerCase() === job.title.toLowerCase() && 
          j.company.toLowerCase() === job.company.toLowerCase()
        )
      );

      await this.saveCookies();
      
      logger.info(`Total unique jobs scraped: ${uniqueJobs.length}`);
      return uniqueJobs;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
      }
      logger.info('Browser cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }
}

// Export for use in other modules
module.exports = JobScraper;

// Run directly if called from command line
if (require.main === module) {
  (async () => {
    const scraper = new JobScraper();
    try {
      const jobs = await scraper.scrapeAllSites();
      console.log(JSON.stringify(jobs, null, 2));
    } catch (error) {
      console.error('Scraping failed:', error);
      process.exit(1);
    }
  })();
}