#!/usr/bin/env node

// One-command runner: scrape -> analyze -> email

const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const JobScraper = require('../scrapers/index');
const AIJobAnalyzer = require('../scrapers/ai-analyzer');
const EmailService = require('../scrapers/email-service');
const config = require('../config/config.json');

function log(msg, type = 'info') {
  const colors = { info: '\x1b[36m', success: '\x1b[32m', warning: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' };
  const prefix = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
  console.log(`${colors[type] || ''}${prefix} ${msg}${colors.reset}`);
}

(async () => {
  try {
    await fs.ensureDir(path.join(__dirname, '../data'));

    log('Starting job scraping...');
    const scraper = new JobScraper();
    const jobs = await scraper.scrapeAllSites();
    await fs.writeJson(path.join(__dirname, '../data/raw-jobs.json'), jobs, { spaces: 2 });
    log(`Scraped ${jobs.length} unique jobs`, jobs.length > 0 ? 'success' : 'warning');

    if (jobs.length === 0) {
      log('No jobs found to analyze. Exiting.', 'warning');
      process.exit(0);
    }

    const analyzer = new AIJobAnalyzer();
    log('Checking AI service/model...');
    const connected = await analyzer.testConnection();
    if (!connected) {
      log('AI service not available or model missing. Using fallback scoring.', 'warning');
      analyzer.forceFallback = true;
    }

    log(`Analyzing ${jobs.length} jobs with AI...`);
    const analysisResult = await analyzer.analyzeBatch(jobs);
    await fs.writeJson(path.join(__dirname, '../data/analyzed-jobs.json'), analysisResult, { spaces: 2 });
    log(`Relevant jobs: ${analysisResult.relevant_jobs.length}/${jobs.length}`, 'success');

    const emailService = new EmailService();
    log('Verifying email configuration...');
    const mailOk = await emailService.testConnection();
    if (!mailOk) throw new Error('Email service not configured or unreachable');

    const sendIfEmpty = (config.email && config.email.send_empty_reports) === true;
    if (analysisResult.relevant_jobs.length === 0 && !sendIfEmpty) {
      log('No relevant jobs found. Skipping email (empty reports disabled).', 'warning');
    } else {
      log('Sending email report...');
      const result = await emailService.sendJobReport(analysisResult);
      if (!result.success) throw new Error(`Email failed: ${result.error}`);
      log(`Email sent. Message ID: ${result.messageId}`, 'success');
    }

    await fs.writeJson(path.join(__dirname, '../data/workflow-result.json'), {
      ...analysisResult,
      workflow_completed_at: new Date().toISOString()
    }, { spaces: 2 });

    // Summary
    const summary = analysisResult.analysis_summary || {};
    const line = `SCRAPED=${jobs.length} RELEVANT=${summary.relevant_count || 0} AVG=${(summary.average_score || 0).toFixed ? summary.average_score.toFixed(2) : summary.average_score}`;
    log(`Done. ${line}`,'success');
    try { await fs.appendFile(path.join(__dirname, '../data/runner.log'), `${new Date().toISOString()} ${line}\n`); } catch (_) {}
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);
    log(msg, 'error');
    try { await fs.appendFile(path.join(__dirname, '../data/runner.log'), `${new Date().toISOString()} ERROR ${msg}\n`); } catch (_) {}
    process.exit(1);
  }
})();
