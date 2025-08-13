# 🚀 Quick Start Guide

Get your job scraper running in 5 minutes!

## Prerequisites

- Docker and Docker Compose installed
- Node.js (v18+) installed
- Gmail account with App Password

## Step 1: Initial Setup

```bash
# Run interactive setup
npm run setup-interactive
```

This will ask for:
- Your name and email
- Gmail credentials (for notifications)
- Your skills and preferred job roles
- Experience level

## Step 2: Start the System

```bash
# Start all services (automated)
./start.sh
```

Or manually:
```bash
# Install dependencies
npm install

# Start Docker services
npm run setup

# Wait 2-3 minutes for services to initialize
# Run tests
npm test
```

## Step 3: Setup n8n Workflow

1. Open http://localhost:5678
2. Login with `admin` / `admin123`
3. Click "Import from file"
4. Select `workflows/daily-job-scraper.json`
5. Click "Activate" to enable daily automation

## Step 4: Test the System

```bash
# Manual test run
curl -X POST http://localhost:3000/api/workflow

# Or run individual components
npm run test-scraper  # Test job scraping
npm run test-ai       # Test AI analysis
npm run test-email    # Test email sending
```

## That's It! 🎉

Your job scraper will now:
- Run automatically every day at 9 AM
- Scrape LinkedIn, Indeed, and Naukri
- Analyze jobs with AI (relevance score 1-10)
- Email you the best matches (score ≥ 7)

## Quick Commands

```bash
# View logs
npm run logs

# Stop services
npm run stop

# Restart services
npm run restart

# Check status
npm run status

# Clean everything
npm run clean
```

## Troubleshooting

**Services not starting?**
```bash
docker-compose logs
```

**Email not working?**
- Check Gmail App Password
- Verify 2FA is enabled
- Test: `npm run test-email`

**AI analysis failing?**
- Wait for Ollama to download models (5-10 minutes)
- Check: `curl http://localhost:11434/api/tags`

**No jobs found?**
- Update skills in `config/config.json`
- Check location filters
- Test individual scrapers

## Need Help?

See the full [README.md](README.md) for detailed documentation.

---

**Happy Job Hunting! 🎯**