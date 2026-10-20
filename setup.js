#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

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

function checkCommand(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkDockerCompose() {
  try {
    execSync('docker-compose --version', { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync('docker compose version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

async function main() {
  log('🎯 Job Scraper Automation Setup', 'info');
  log('=====================================\n', 'info');

  // Check prerequisites
  log('📋 Checking prerequisites...', 'info');
  
  if (!checkCommand('docker')) {
    log('❌ Docker is not installed. Please install Docker first.', 'error');
    process.exit(1);
  }
  log('✅ Docker found', 'success');

  if (!checkDockerCompose()) {
    log('❌ Docker Compose is not installed. Please install Docker Compose first.', 'error');
    process.exit(1);
  }
  log('✅ Docker Compose found', 'success');

  if (!checkCommand('node')) {
    log('❌ Node.js is not installed. Please install Node.js first.', 'error');
    process.exit(1);
  }
  log('✅ Node.js found', 'success');

  // Check if config exists
  const configPath = path.join(__dirname, 'config', 'config.json');
  if (!await fs.pathExists(configPath)) {
    log('❌ Configuration file not found!', 'error');
    process.exit(1);
  }

  // Interactive configuration
  log('\n🔧 Configuration Setup', 'info');
  log('Please provide the following information:\n', 'info');

  const config = await fs.readJson(configPath);
  
  // User details
  const userName = await question('👤 Your name: ');
  const userEmail = await question('📧 Your email address: ');
  
  // Email configuration
  log('\n📮 Email Configuration (for notifications)', 'info');
  log('For Gmail, you need to generate an App Password:', 'warning');
  log('1. Enable 2FA on your Google account', 'warning');
  log('2. Go to Google Account Settings > Security > App passwords', 'warning');
  log('3. Generate a password for "Mail"\n', 'warning');
  
  const smtpUser = await question('📧 Gmail address: ');
  const smtpPassword = await question('🔑 Gmail App Password: ');
  
  // Skills configuration
  log('\n🛠️ Skills Configuration', 'info');
  const skillsInput = await question('💼 Your skills (comma-separated): ');
  const skills = skillsInput.split(',').map(s => s.trim()).filter(s => s);
  
  const rolesInput = await question('🎯 Preferred job roles (comma-separated): ');
  const roles = rolesInput.split(',').map(r => r.trim()).filter(r => r);
  
  const experienceLevel = await question('📈 Experience level (fresher/junior/mid-level/senior): ');

  // Update configuration
  config.user.name = userName;
  config.user.email = userEmail;
  config.user.skills = skills.length > 0 ? skills : config.user.skills;
  config.user.preferred_roles = roles.length > 0 ? roles : config.user.preferred_roles;
  config.user.experience_level = experienceLevel || config.user.experience_level;
  
  config.email.smtp_user = smtpUser;
  config.email.smtp_password = smtpPassword;

  // Save updated configuration
  await fs.writeJson(configPath, config, { spaces: 2 });
  log('\n✅ Configuration saved successfully!', 'success');

  // Create data directory
  await fs.ensureDir(path.join(__dirname, 'data'));
  log('✅ Data directory created', 'success');

  // Install dependencies
  log('\n📦 Installing dependencies...', 'info');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
    log('✅ Dependencies installed successfully!', 'success');
  } catch (error) {
    log('❌ Failed to install dependencies', 'error');
    log(error.message, 'error');
    process.exit(1);
  }

  // Test configuration
  log('\n🧪 Testing configuration...', 'info');
  
  try {
    const EmailService = require('./scrapers/email-service');
    const emailService = new EmailService();
    
    // Override config for testing
    const originalConfig = require('./config/config.json');
    originalConfig.email.smtp_user = smtpUser;
    originalConfig.email.smtp_password = smtpPassword;
    
    const connected = await emailService.testConnection();
    if (connected) {
      log('✅ Email configuration is valid', 'success');
    } else {
      log('⚠️ Email configuration test failed - please check your credentials', 'warning');
    }
  } catch (error) {
    log('⚠️ Could not test email configuration', 'warning');
  }

  // Setup instructions
  log('\n🚀 Setup Complete!', 'success');
  log('=====================================', 'info');
  log('\nNext steps:', 'info');
  log('1. Start the services: npm run setup', 'info');
  log('2. Wait for all services to be ready (2-3 minutes)', 'info');
  log('3. Access n8n dashboard: http://localhost:5678', 'info');
  log('4. Login with N8N_BASIC_AUTH_USER / N8N_BASIC_AUTH_PASSWORD from .env', 'info');
  log('5. Import workflow from workflows/daily-job-scraper.json', 'info');
  log('6. Activate the workflow for daily automation', 'info');
  log('\nManual testing:', 'info');
  log('- Test scraping: npm run scrape', 'info');
  log('- View logs: npm run logs', 'info');
  log('- Stop services: npm run stop', 'info');
  log('\n📖 For detailed instructions, see README.md', 'info');

  rl.close();
}

if (require.main === module) {
  main().catch(error => {
    log(`❌ Setup failed: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { main };