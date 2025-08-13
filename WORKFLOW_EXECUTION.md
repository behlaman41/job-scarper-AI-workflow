# Job Scraper Workflow Execution Guide

## Quick Start

1. **Start the services:**
   ```bash
   docker-compose up -d --build
   ```

2. **Access n8n dashboard:**
   - Open http://localhost:5678 in your browser
   - Import the workflow from `workflows/daily-job-scraper.json`

3. **Execute the workflow:**
   - Click "Execute Workflow" button in n8n
   - Monitor the execution logs
   - Check email for job alerts

## Services

- **Job Scraper API**: http://localhost:3000
- **n8n Workflow Engine**: http://localhost:5678

## Workflow Features

- Daily automated job scraping at 9:00 AM IST
- Health checks before execution
- Email notifications for relevant jobs
- Error handling and logging

## Troubleshooting

- If containers fail to start: `docker-compose down && docker-compose up -d --build`
- Check logs: `docker-compose logs -f`
- Verify services: `docker ps`