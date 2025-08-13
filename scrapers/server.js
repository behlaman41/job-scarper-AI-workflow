const express = require('express');
const winston = require('winston');
const fs = require('fs-extra');
const path = require('path');
const JobScraper = require('./index');
const AIJobAnalyzer = require('./ai-analyzer');
const EmailService = require('./email-service');
const config = require('../config/config.json');

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'data/server.log' }),
    new winston.transports.Console()
  ]
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version
  });
});

// Get configuration
app.get('/api/config', (req, res) => {
  try {
    // Return config without sensitive information
    const safeConfig = {
      ...config,
      email: {
        ...config.email,
        smtp_user: config.email.smtp_user ? '***@***' : '',
        smtp_password: '***'
      }
    };
    res.json(safeConfig);
  } catch (error) {
    logger.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// Scrape jobs endpoint
app.post('/api/scrape', async (req, res) => {
  try {
    logger.info('Starting job scraping...');
    
    const scraper = new JobScraper();
    const jobs = await scraper.scrapeAllSites();
    
    // Save raw jobs data
    await fs.ensureDir('data');
    await fs.writeJson('data/raw-jobs.json', jobs, { spaces: 2 });
    
    logger.info(`Scraping completed: ${jobs.length} jobs found`);
    
    res.json({
      success: true,
      jobs: jobs,
      count: jobs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Scraping failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analyze jobs with AI endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { jobs } = req.body;
    
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({
        success: false,
        error: 'Jobs array is required in request body'
      });
    }
    
    logger.info(`Starting AI analysis for ${jobs.length} jobs...`);
    
    const analyzer = new AIJobAnalyzer();
    
    // Test Ollama connection first
    const connected = await analyzer.testConnection();
    if (!connected) {
      return res.status(503).json({
        success: false,
        error: 'AI service (Ollama) is not available'
      });
    }
    
    const analysisResult = await analyzer.analyzeBatch(jobs);
    
    // Save analysis results
    await fs.writeJson('data/analyzed-jobs.json', analysisResult, { spaces: 2 });
    
    logger.info(`AI analysis completed: ${analysisResult.relevant_jobs.length} relevant jobs`);
    
    res.json({
      success: true,
      ...analysisResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('AI analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send email report endpoint
app.post('/api/email', async (req, res) => {
  try {
    const { analysisResult } = req.body;
    
    if (!analysisResult) {
      return res.status(400).json({
        success: false,
        error: 'Analysis result is required in request body'
      });
    }
    
    logger.info('Sending email report...');
    
    const emailService = new EmailService();
    
    // Test email connection first
    const connected = await emailService.testConnection();
    if (!connected) {
      return res.status(503).json({
        success: false,
        error: 'Email service is not available'
      });
    }
    
    const emailResult = await emailService.sendJobReport(analysisResult);
    
    if (emailResult.success) {
      logger.info(`Email sent successfully: ${emailResult.messageId}`);
    } else {
      logger.error(`Email sending failed: ${emailResult.error}`);
    }
    
    res.json({
      ...emailResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Email sending failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Complete workflow endpoint (scrape + analyze + email)
app.post('/api/workflow', async (req, res) => {
  try {
    logger.info('Starting complete job workflow...');
    
    // Step 1: Scrape jobs
    logger.info('Step 1: Scraping jobs...');
    const scraper = new JobScraper();
    const jobs = await scraper.scrapeAllSites();
    
    if (jobs.length === 0) {
      logger.warn('No jobs found during scraping');
      return res.json({
        success: true,
        message: 'No jobs found to analyze',
        jobs: [],
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 2: Analyze with AI
    logger.info(`Step 2: Analyzing ${jobs.length} jobs with AI...`);
    const analyzer = new AIJobAnalyzer();
    
    const connected = await analyzer.testConnection();
    if (!connected) {
      throw new Error('AI service (Ollama) is not available');
    }
    
    const analysisResult = await analyzer.analyzeBatch(jobs);
    
    // Step 3: Send email if relevant jobs found
    if (analysisResult.relevant_jobs.length > 0 || config.email.send_empty_reports) {
      logger.info(`Step 3: Sending email report for ${analysisResult.relevant_jobs.length} relevant jobs...`);
      
      const emailService = new EmailService();
      const emailConnected = await emailService.testConnection();
      
      if (emailConnected) {
        const emailResult = await emailService.sendJobReport(analysisResult);
        
        if (!emailResult.success) {
          logger.error(`Email sending failed: ${emailResult.error}`);
        }
      } else {
        logger.warn('Email service not available, skipping email step');
      }
    } else {
      logger.info('No relevant jobs found and empty reports disabled, skipping email');
    }
    
    // Save final results
    await fs.ensureDir('data');
    await fs.writeJson('data/workflow-result.json', {
      ...analysisResult,
      workflow_completed_at: new Date().toISOString()
    }, { spaces: 2 });
    
    logger.info('Complete workflow finished successfully');
    
    res.json({
      success: true,
      message: 'Workflow completed successfully',
      summary: {
        jobs_scraped: jobs.length,
        jobs_analyzed: analysisResult.all_jobs.length,
        relevant_jobs: analysisResult.relevant_jobs.length,
        average_score: analysisResult.analysis_summary.average_score
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Workflow failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get latest results
app.get('/api/results/latest', async (req, res) => {
  try {
    const files = {
      workflow: 'data/workflow-result.json',
      analyzed: 'data/analyzed-jobs.json',
      raw: 'data/raw-jobs.json'
    };
    
    const results = {};
    
    for (const [key, filePath] of Object.entries(files)) {
      if (await fs.pathExists(filePath)) {
        results[key] = await fs.readJson(filePath);
      }
    }
    
    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting latest results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get logs
app.get('/api/logs', async (req, res) => {
  try {
    const logFiles = ['server.log', 'scraper.log', 'ai-analyzer.log', 'email-service.log'];
    const logs = {};
    
    for (const logFile of logFiles) {
      const logPath = path.join('data', logFile);
      if (await fs.pathExists(logPath)) {
        const content = await fs.readFile(logPath, 'utf8');
        logs[logFile] = content.split('\n').slice(-50).join('\n'); // Last 50 lines
      }
    }
    
    res.json({
      success: true,
      logs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Job Scraper API server running on port ${PORT}`);
  
  // Ensure data directory exists
  fs.ensureDir('data').catch(err => {
    logger.error('Failed to create data directory:', err);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;