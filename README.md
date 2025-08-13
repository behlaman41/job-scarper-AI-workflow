# 🎯 Job Scraper Automation

A comprehensive daily job scraping system that monitors LinkedIn, Indeed, and Naukri for relevant positions in Delhi/Noida/Gurgaon, analyzes them with AI, and emails results automatically.

## 🚀 Features

- **Multi-Platform Scraping**: LinkedIn, Indeed, and Naukri job boards
- **AI-Powered Analysis**: Uses Ollama (llama3.1) for intelligent job relevance scoring
- **Smart Filtering**: Location-based filtering for Delhi NCR region
- **Automated Email Reports**: Beautiful HTML email reports with top job matches
- **Daily Automation**: Runs automatically every day at 9 AM via n8n workflows
- **Containerized Deployment**: Complete Docker Compose setup
- **Respectful Scraping**: Built-in rate limiting and error handling

## 🏗️ Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    n8n      │───▶│  Playwright │───▶│   Ollama    │
│ Workflow    │    │  Scraper    │    │ AI Analysis │
│ Scheduler   │    │  Service    │    │   Service   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ▼
                  ┌─────────────┐
                  │   Email     │
                  │  Service    │
                  └─────────────┘
```

## 📋 Prerequisites

- Docker and Docker Compose
- At least 4GB RAM (for Ollama AI model)
- Gmail account with App Password (for email notifications)

## ⚡ Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo>
cd jobscraper
```

### 2. Configure Settings

Edit `config/config.json`:

```json
{
  "user": {
    "name": "Your Name",
    "email": "your-email@example.com",
    "skills": ["JavaScript", "React", "Node.js", "Python"],
    "preferred_roles": ["Full Stack Developer", "Backend Developer"]
  },
  "email": {
    "smtp_user": "your-email@gmail.com",
    "smtp_password": "your-app-password"
  }
}
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 4. Access n8n Dashboard

1. Open http://localhost:5678
2. Login with `admin` / `admin123`
3. Import the workflow from `workflows/daily-job-scraper.json`
4. Activate the workflow

## 🔧 Configuration Guide

### Email Setup (Gmail)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. Update `config/config.json` with your email and app password

### Skills and Preferences

Customize your job search in `config/config.json`:

```json
{
  "user": {
    "skills": ["React", "Node.js", "Python", "AWS", "Docker"],
    "preferred_roles": ["Full Stack Developer", "DevOps Engineer"],
    "experience_level": "mid-level"
  },
  "locations": {
    "primary": ["Delhi", "Noida", "Gurgaon", "Gurugram"]
  },
  "filters": {
    "min_salary": 500000,
    "max_salary": 2000000,
    "exclude_keywords": ["intern", "trainee"]
  }
}
```

### AI Analysis Settings

```json
{
  "ai_analysis": {
    "model": "llama3.1",
    "min_relevance_score": 7,
    "temperature": 0.3
  }
}
```

## 🎮 Usage

### Manual Testing

```bash
# Test scraping only
node scrapers/index.js

# Test AI analysis
node scrapers/ai-analyzer.js

# Test email service
node scrapers/email-service.js

# Test complete workflow
curl -X POST http://localhost:3000/api/workflow
```

### API Endpoints

- `GET /health` - Service health check
- `POST /api/scrape` - Scrape jobs from all sites
- `POST /api/analyze` - Analyze jobs with AI
- `POST /api/email` - Send email report
- `POST /api/workflow` - Run complete workflow
- `GET /api/results/latest` - Get latest results
- `GET /api/logs` - View service logs

### n8n Workflow

The workflow runs automatically daily at 9 AM and:

1. **Triggers** at scheduled time
2. **Scrapes** jobs from LinkedIn, Indeed, Naukri
3. **Analyzes** each job with AI for relevance (1-10 score)
4. **Filters** jobs with score ≥ 7
5. **Emails** formatted report with top matches

## 📊 Sample Output

### Email Report

```
🎯 Daily Job Report - December 15, 2024

📊 Today's Summary
✅ 12 Relevant Jobs
📈 45 Total Analyzed
⭐ 7.8 Average Score
🏢 8 Companies

🔥 Top Jobs:

1. Senior Full Stack Developer - Tech Corp (9/10)
   📍 Gurgaon | 💰 12-18 LPA
   ✅ React, Node.js, AWS match
   🎯 Great growth opportunity, modern tech stack

2. Backend Developer - StartupXYZ (8/10)
   📍 Noida | 💰 10-15 LPA
   ✅ Python, Docker, MongoDB match
   🎯 Startup environment, equity options
```

### Console Logs

```
2024-12-15 09:00:01 [INFO] Starting daily job workflow...
2024-12-15 09:00:05 [INFO] LinkedIn scraping completed: 18 jobs found
2024-12-15 09:00:12 [INFO] Indeed scraping completed: 15 jobs found
2024-12-15 09:00:18 [INFO] Naukri scraping completed: 12 jobs found
2024-12-15 09:00:20 [INFO] Total unique jobs scraped: 45
2024-12-15 09:02:15 [INFO] AI analysis completed: 12/45 jobs are relevant
2024-12-15 09:02:18 [INFO] Email sent successfully: <message-id>
```

## 🛠️ Troubleshooting

### Common Issues

**Ollama not responding:**
```bash
# Check Ollama container
docker-compose logs ollama

# Restart Ollama
docker-compose restart ollama
```

**Email not sending:**
```bash
# Verify email configuration
curl -X GET http://localhost:3000/api/config

# Test email connection
node scrapers/email-service.js
```

**Scraping failures:**
```bash
# Check scraper logs
docker-compose logs playwright-scraper

# Test individual scrapers
node scrapers/index.js
```

**n8n workflow not running:**
1. Check if workflow is activated in n8n dashboard
2. Verify cron expression: `0 9 * * *` (9 AM daily)
3. Check n8n logs: `docker-compose logs n8n`

### Performance Optimization

**Reduce memory usage:**
- Decrease `max_jobs_per_site` in config
- Use lighter AI model (mistral instead of llama3.1)
- Increase `delay_between_requests`

**Improve accuracy:**
- Update skills list in config
- Adjust `min_relevance_score`
- Refine `exclude_keywords` and `include_keywords`

## 📁 Project Structure

```
jobscraper/
├── docker-compose.yml          # Main orchestration
├── Dockerfile.scraper          # Scraper service image
├── package.json               # Node.js dependencies
├── config/
│   └── config.json           # Main configuration
├── scrapers/
│   ├── index.js              # Main scraper module
│   ├── ai-analyzer.js        # AI analysis service
│   ├── email-service.js      # Email notification service
│   └── server.js             # HTTP API server
├── workflows/
│   └── daily-job-scraper.json # n8n workflow definition
├── data/                     # Generated data and logs
│   ├── cookies.json          # Saved browser cookies
│   ├── raw-jobs.json         # Scraped job data
│   ├── analyzed-jobs.json    # AI analysis results
│   └── *.log                 # Service logs
└── README.md                 # This file
```

## 🔒 Security Notes

- Never commit email passwords to version control
- Use environment variables for sensitive data in production
- Regularly rotate email app passwords
- Monitor scraping rate limits to avoid IP blocking
- Keep Docker images updated for security patches

## 🚀 Advanced Features

### Custom AI Prompts

Modify the AI analysis prompt in `scrapers/ai-analyzer.js` to customize job evaluation criteria.

### Additional Job Sites

Add new scrapers by extending the `JobScraper` class in `scrapers/index.js`.

### Webhook Integration

Use n8n's webhook nodes to integrate with Slack, Discord, or other notification systems.

### Database Storage

Add PostgreSQL or MongoDB to store historical job data and track application status.

## 📈 Monitoring

- View real-time logs: `docker-compose logs -f`
- Check service health: `curl http://localhost:3000/health`
- Monitor n8n executions in the dashboard
- Review email delivery in your email client

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review Docker and n8n logs
3. Open an issue with detailed error information

---

**Happy Job Hunting! 🎯**