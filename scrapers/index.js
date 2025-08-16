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
        viewport: { width: 1920, height: 1080 },
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
        javaScriptEnabled: true,
        extraHTTPHeaders: {
          'accept-language': 'en-IN,en;q=0.9',
          'upgrade-insecure-requests': '1'
        }
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
      
      // Try multiple LinkedIn job search approaches
      const searchUrls = [
        `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(config.user.preferred_roles[0])}&location=Delhi%2C%20India&geoId=102713980&f_TPR=r604800&position=1&pageNum=0`,
        `https://www.linkedin.com/jobs/search?keywords=software%20engineer&location=Delhi%2C%20India&f_TPR=r604800`,
        `https://www.linkedin.com/jobs/search?keywords=developer&location=India&f_TPR=r604800`
      ];
      
      let jobsFound = false;
      
      for (const searchUrl of searchUrls) {
        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.scraping.timeout });
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await this.autoScroll(page);

          // Check multiple selectors for job listings
          const jobsVisible = await page.locator('.jobs-search__results-list, .job-card-container, .base-search-card, .job-search-card').first().isVisible({ timeout: 5000 }).catch(() => false);
          
          if (jobsVisible) {
            jobsFound = true;
            break;
          }
        } catch (e) {
          logger.warn(`LinkedIn URL failed: ${searchUrl}`);
          continue;
        }
      }
      
      if (!jobsFound) {
        logger.warn('LinkedIn requires login or is blocking access - skipping LinkedIn scraping');
        return jobs;
      }

      // Scrape job listings with multiple selector strategies
      const jobCards = await page.locator('.job-card-container, .jobs-search-results__list-item, .job-card-list__entity, .base-search-card, .job-search-card').all();
      
      logger.info(`Found ${jobCards.length} job cards on LinkedIn`);
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          const title = await card.locator('h3 a, .job-card-list__title, .job-card-container__link').first().textContent().catch(() => 'N/A');
          const company = await card.locator('.job-card-container__company-name, .job-card-list__company-name').first().textContent().catch(() => 'N/A');
          const location = await card.locator('.job-card-container__metadata-item, .job-card-list__metadata').first().textContent().catch(() => 'N/A');
          const link = await card.locator('a').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && title.trim() !== '') {
            const finalLink = link && link.startsWith('http') ? link : `https://linkedin.com${link}`;
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: finalLink,
              source: 'LinkedIn',
              scraped_at: new Date().toISOString(),
              description: ''
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping LinkedIn job ${i}:`, error.message);
        }
      }

      // Enrich with descriptions (limited concurrency)
      await this.enrichJobsWithDescriptions(jobs, 'linkedin');
      logger.info(`LinkedIn scraping completed: ${jobs.length} jobs found (descriptions enriched)`);
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
      
      // Try multiple Indeed search approaches
      const searchUrls = [
        `https://in.indeed.com/jobs?q=${encodeURIComponent(config.user.preferred_roles[0])}&l=Delhi%2C+Delhi&fromage=7&sort=date`,
        `https://in.indeed.com/jobs?q=software+engineer&l=Delhi%2C+Delhi&fromage=7&sort=date`,
        `https://in.indeed.com/jobs?q=developer&l=Delhi%2C+Delhi&fromage=7&sort=date`,
        `https://in.indeed.com/jobs?q=full+stack+developer&l=Delhi%2C+Delhi&fromage=7&sort=date`,
        `https://in.indeed.com/jobs?q=software+engineer&l=India&fromage=7&sort=date`
      ];
      
      let jobsFound = false;
      
      for (const searchUrl of searchUrls) {
        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.scraping.timeout });
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

          // Handle various popups
          try {
            const popups = ['[data-testid="popup-close-button"]', '.popover-x-button-close', '.icl-CloseButton', '.pn', '.np:last-child'];
            for (const popup of popups) {
              const element = page.locator(popup).first();
              if (await element.isVisible({ timeout: 2000 })) {
                await element.click();
                await page.waitForTimeout(1000);
              }
            }
          } catch (e) {
            // Ignore popup errors
          }

          // Wait for job listings to load with multiple selectors
          try {
            await page.waitForSelector('.job_seen_beacon, .slider_container, [data-jk], .jobsearch-SerpJobCard, .result', { timeout: 8000 });
            jobsFound = true;
            break;
          } catch (e) {
            logger.warn(`Indeed URL failed: ${searchUrl}`);
            continue;
          }
        } catch (e) {
          logger.warn(`Indeed URL error: ${searchUrl}`);
          continue;
        }
      }
      
      if (!jobsFound) {
        logger.warn('No job listings found on Indeed');
        return jobs;
      }
      
      // Scrape job listings with multiple selector strategies
      let jobCards = await page.locator('.jobsearch-SerpJobCard, [data-testid="job-tile"], .job_seen_beacon, .slider_container .slider_item').all();
      
      logger.info(`Found ${jobCards.length} job cards on Indeed`);
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          // Multiple selector strategies for title
          let title = await card.locator('h2 a span, .jobTitle a span, [data-testid="job-title"], h2 a, .jobTitle a').first().textContent().catch(() => null);
          if (!title) {
            title = await card.locator('a[data-jk]').first().getAttribute('aria-label').catch(() => 'N/A');
          }
          
          const company = await card.locator('[data-testid="company-name"], .companyName, span[title]').first().textContent().catch(() => 'N/A');
          const location = await card.locator('[data-testid="job-location"], .companyLocation, .locationsContainer').first().textContent().catch(() => 'N/A');
          const link = await card.locator('h2 a, .jobTitle a, a[data-jk]').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && title.trim() !== '') {
            const finalLink = link && link.startsWith('http') ? link : `https://in.indeed.com${link}`;
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: finalLink,
              source: 'Indeed',
              scraped_at: new Date().toISOString(),
              description: ''
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping Indeed job ${i}:`, error.message);
        }
      }

      await this.enrichJobsWithDescriptions(jobs, 'indeed');
      logger.info(`Indeed scraping completed: ${jobs.length} jobs found (descriptions enriched)`);
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
      
      // Try multiple Naukri search approaches
      const searchUrls = [
        `https://www.naukri.com/jobs-in-delhi-ncr?k=${encodeURIComponent(config.user.preferred_roles[0])}`,
        `https://www.naukri.com/software-engineer-jobs-in-delhi-ncr`,
        `https://www.naukri.com/developer-jobs-in-delhi-ncr`,
        `https://www.naukri.com/full-stack-developer-jobs-in-delhi-ncr`,
        `https://www.naukri.com/jobs-in-delhi-ncr?k=software%20engineer&experience=2&salary=3,00,000,15,00,000`
      ];
      
      let jobsFound = false;
      
      for (const searchUrl of searchUrls) {
        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: config.scraping.timeout });
          await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
          await this.autoScroll(page);

          // Handle various popups
          try {
            const popups = ['.crossIcon', '.close', '[data-test="modal-close"]', '.popupCloseIcon', '.closeIcon'];
            for (const popup of popups) {
              const element = page.locator(popup).first();
              if (await element.isVisible({ timeout: 2000 })) {
                await element.click();
                await page.waitForTimeout(1000);
              }
            }
          } catch (e) {
            // Ignore popup errors
          }

          // Check for job listings with multiple selectors
          const jobsVisible = await page.locator('.jobTuple, .srp-jobtuple-wrapper, [data-job-id], .jobTupleHeader, .job-tuple').first().isVisible({ timeout: 5000 }).catch(() => false);
          
          if (jobsVisible) {
            jobsFound = true;
            break;
          }
        } catch (e) {
          logger.warn(`Naukri URL failed: ${searchUrl}`);
          continue;
        }
      }
      
      if (!jobsFound) {
        logger.warn('No job listings found on Naukri');
        return jobs;
      }

      // Scrape job listings with enhanced selectors
      const jobCards = await page.locator('.jobTuple, .srp-jobtuple-wrapper, [data-job-id], .jobTupleHeader, .job-tuple').all();
      
      for (let i = 0; i < Math.min(jobCards.length, config.scraping.max_jobs_per_site); i++) {
        try {
          const card = jobCards[i];
          
          const title = await card.locator('.title, .jobTupleHeader .ellipsis, [data-test="job-title"]').first().textContent().catch(() => 'N/A');
          const company = await card.locator('.subTitle, .companyInfo .ellipsis, [data-test="company-name"]').first().textContent().catch(() => 'N/A');
          const location = await card.locator('.location, .locationsContainer, [data-test="job-location"]').first().textContent().catch(() => 'N/A');
          const link = await card.locator('.title a, .jobTupleHeader a').first().getAttribute('href').catch(() => '#');
          
          if (title && title !== 'N/A' && this.isRelevantLocation(location)) {
            const finalLink = link && link.startsWith('http') ? link : `https://www.naukri.com${link}`;
            jobs.push({
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              link: finalLink,
              source: 'Naukri',
              scraped_at: new Date().toISOString(),
              description: ''
            });
          }
          
          await page.waitForTimeout(config.scraping.delay_between_requests);
        } catch (error) {
          logger.warn(`Error scraping Naukri job ${i}:`, error.message);
        }
      }

      await this.enrichJobsWithDescriptions(jobs, 'naukri');
      logger.info(`Naukri scraping completed: ${jobs.length} jobs found (descriptions enriched)`);
    } catch (error) {
      logger.error('Naukri scraping failed:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  isRelevantLocation(location) {
    if (!location || location === 'N/A') return true; // Include jobs with unknown location
    const locationLower = location.toLowerCase();
    return config.locations.primary.some(loc => 
      locationLower.includes(loc.toLowerCase())
    ) || locationLower.includes('remote') || locationLower.includes('work from home');
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
    } catch (error) {
      logger.error('Error during scraping:', error);
      throw error;
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

  async autoScroll(page) {
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 600;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 300);
        });
      });
    } catch (_) {}
  }

  async fetchJobDescription(url, site) {
    try {
      const page = await this.context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.scraping.timeout || 30000 });
      await page.waitForTimeout(1500);

      let selector = '';
      if (site === 'indeed') {
        selector = '#jobDescriptionText, .jobsearch-jobDescriptionText, [id="jobDescriptionText"]';
      } else if (site === 'linkedin') {
        selector = '.show-more-less-html__markup, .jobs-description__content, [data-test-job-description-text], [class*="description"]';
      } else if (site === 'naukri') {
        selector = '.dang-inner-html, .job-description, .jd-description, [class*="job-desc"]';
      }

      let text = '';
      if (selector) {
        try {
          const el = page.locator(selector).first();
          if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
            text = await el.innerText();
          }
        } catch (_) {}
      }

      if (!text || text.trim() === '') {
        // Fallback: get all text from main/content area
        try {
          const bodyText = await page.evaluate(() => document.body ? document.body.innerText : '');
          text = bodyText;
        } catch (_) {}
      }

      await page.close();
      return this.cleanText(text).slice(0, 4000) || 'Description not available';
    } catch (err) {
      logger.warn(`Failed to fetch job description for ${site}: ${url} - ${err.message}`);
      return 'Description not available';
    }
  }

  cleanText(input) {
    if (!input) return '';
    return String(input)
      .replace(/\r/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  async enrichJobsWithDescriptions(jobs, site) {
    const limit = (config.scraping && config.scraping.max_detail_fetch) || 20;
    const concurrency = (config.scraping && config.scraping.detail_concurrency) || 3;
    const targets = jobs.slice(0, Math.min(limit, jobs.length));
    let active = 0;
    let index = 0;
    let completed = 0;
    const start = Date.now();

    return await new Promise(resolve => {
      const next = () => {
        while (active < concurrency && index < targets.length) {
          const job = targets[index++];
          active++;
          this.fetchJobDescription(job.link, site)
            .then(desc => { job.description = desc; })
            .catch(() => { job.description = job.description || ''; })
            .finally(() => {
              active--;
              completed++;
              if (completed % 5 === 0) {
                logger.info(`Enriched ${completed}/${targets.length} ${site} jobs with descriptions`);
              }
              if (completed === targets.length) {
                const ms = Date.now() - start;
                logger.info(`Description enrichment completed for ${site}: ${completed} items in ${ms}ms`);
                resolve();
              } else {
                next();
              }
            });
        }
      };
      next();
    });
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
