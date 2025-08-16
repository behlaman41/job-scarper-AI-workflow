#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();
const config = require('./config/config.json');

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}${message}${colors.reset}`);
}

class SystemTester {
  constructor() {
    this.scraperUrl = process.env.SCRAPER_BASE_URL || 'http://localhost:3000';
    this.n8nUrl = process.env.N8N_BASE_URL || 'http://localhost:5678';
    this.ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || (config.ai_analysis && config.ai_analysis.model) || 'llama3.1';
    this.results = {
      scraper: false,
      ollama: false,
      n8n: false,
      email: false,
      workflow: false
    };
  }

  async testScraperService() {
    log('🔍 Testing Scraper Service...', 'info');
    try {
      const response = await axios.get(`${this.scraperUrl}/health`, { timeout: 5000 });
      if (response.data.status === 'healthy') {
        log('✅ Scraper service is healthy', 'success');
        this.results.scraper = true;
        return true;
      } else {
        log('❌ Scraper service is unhealthy', 'error');
        return false;
      }
    } catch (error) {
      log(`❌ Scraper service connection failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testOllamaService() {
    log('🤖 Testing Ollama AI Service...', 'info');
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 10000 });
      const models = response.data.models || [];
      const hasModel = this.model ? models.some(model => model.name.includes(this.model)) : models.length > 0;
      
      if (hasModel) {
        log(`✅ Ollama service is running with model: ${this.model}`, 'success');
        this.results.ollama = true;
        return true;
      } else {
        log(`⚠️ Ollama is running but model not found: ${this.model}`, 'warning');
        log('Available models:', 'info');
        models.forEach(model => log(`  - ${model.name}`, 'info'));
        return false;
      }
    } catch (error) {
      log(`❌ Ollama service connection failed: ${error.message}`, 'error');
      log('💡 Tip: Ollama might still be downloading the model. Wait a few minutes.', 'warning');
      return false;
    }
  }

  async testN8nService() {
    log('🔄 Testing n8n Service...', 'info');
    try {
      const response = await axios.get(`${this.n8nUrl}/healthz`, { timeout: 5000 });
      if (response.status === 200) {
        log('✅ n8n service is running', 'success');
        this.results.n8n = true;
        return true;
      } else {
        log('❌ n8n service is not responding correctly', 'error');
        return false;
      }
    } catch (error) {
      log(`❌ n8n service connection failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testEmailConfiguration() {
    log('📧 Testing Email Configuration...', 'info');
    try {
      const EmailService = require('./scrapers/email-service');
      const emailService = new EmailService();
      
      const connected = await emailService.testConnection();
      if (connected) {
        log('✅ Email configuration is valid', 'success');
        this.results.email = true;
        return true;
      } else {
        log('❌ Email configuration test failed', 'error');
        return false;
      }
    } catch (error) {
      log(`❌ Email test failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testScraping() {
    log('🕷️ Testing Job Scraping...', 'info');
    try {
      const JobScraper = require('./scrapers/index');
      const scraper = new JobScraper();
      
      log('  Testing Indeed scraper...', 'info');
      const jobs = await scraper.scrapeIndeed();
      
      if (jobs.length > 0) {
        log(`✅ Scraping test successful: ${jobs.length} jobs found`, 'success');
        log(`  Sample job: ${jobs[0].title} at ${jobs[0].company}`, 'info');
        return true;
      } else {
        log('⚠️ Scraping test returned no jobs', 'warning');
        return false;
      }
    } catch (error) {
      log(`❌ Scraping test failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testAIAnalysis() {
    log('🧠 Testing AI Analysis...', 'info');
    try {
      const AIJobAnalyzer = require('./scrapers/ai-analyzer');
      const analyzer = new AIJobAnalyzer();
      
      const sampleJob = {
        title: 'Full Stack Developer',
        company: 'Test Company',
        location: 'Delhi',
        source: 'Test',
        description: 'Looking for a full stack developer with React, Node.js, and MongoDB experience. Great opportunity for growth.'
      };
      
      const result = await analyzer.analyzeJob(sampleJob);
      
      if (result.ai_analysis && result.ai_analysis.relevance_score > 0) {
        log(`✅ AI analysis successful: Score ${result.ai_analysis.relevance_score}/10`, 'success');
        log(`  Summary: ${result.ai_analysis.summary}`, 'info');
        return true;
      } else {
        log('❌ AI analysis failed to return valid results', 'error');
        return false;
      }
    } catch (error) {
      log(`❌ AI analysis test failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testCompleteWorkflow() {
    log('🔄 Testing Complete Workflow...', 'info');
    try {
      const response = await axios.post(`${this.scraperUrl}/api/workflow`, {}, {
        timeout: 120000 // 2 minutes timeout
      });
      
      if (response.data.success) {
        log('✅ Complete workflow test successful', 'success');
        log(`  Summary: ${JSON.stringify(response.data.summary)}`, 'info');
        this.results.workflow = true;
        return true;
      } else {
        log(`❌ Workflow test failed: ${response.data.error}`, 'error');
        return false;
      }
    } catch (error) {
      log(`❌ Workflow test failed: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    log('🧪 Job Scraper System Tests', 'info');
    log('============================\n', 'info');

    const tests = [
      { name: 'Scraper Service', fn: () => this.testScraperService() },
      { name: 'Ollama AI Service', fn: () => this.testOllamaService() },
      { name: 'n8n Service', fn: () => this.testN8nService() },
      { name: 'Email Configuration', fn: () => this.testEmailConfiguration() },
      { name: 'Job Scraping', fn: () => this.testScraping() },
      { name: 'AI Analysis', fn: () => this.testAIAnalysis() },
      { name: 'Complete Workflow', fn: () => this.testCompleteWorkflow() }
    ];

    let passed = 0;
    let total = tests.length;

    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) passed++;
      } catch (error) {
        log(`❌ ${test.name} test crashed: ${error.message}`, 'error');
      }
      log(''); // Empty line for readability
    }

    // Summary
    log('📊 Test Summary', 'info');
    log('===============', 'info');
    log(`✅ Passed: ${passed}/${total}`, passed === total ? 'success' : 'warning');
    
    if (passed === total) {
      log('🎉 All tests passed! Your job scraper is ready to use.', 'success');
      log('\n🚀 Next steps:', 'info');
      log('1. Access n8n dashboard: http://localhost:5678', 'info');
      log('2. Import and activate the workflow', 'info');
      log('3. The system will run automatically every day at 9 AM', 'info');
    } else {
      log('⚠️ Some tests failed. Please check the errors above.', 'warning');
      log('\n🔧 Troubleshooting tips:', 'info');
      log('- Ensure all Docker containers are running: docker-compose ps', 'info');
      log('- Check logs: docker-compose logs', 'info');
      log('- Wait for Ollama to download models (can take 5-10 minutes)', 'info');
      log('- Verify email credentials in config/config.json', 'info');
    }

    return passed === total;
  }
}

async function main() {
  const tester = new SystemTester();
  const success = await tester.runAllTests();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Test suite failed: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = SystemTester;
