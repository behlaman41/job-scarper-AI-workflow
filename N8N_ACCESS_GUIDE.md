# 🔐 n8n Access Guide

## Current Status
✅ n8n is running at: http://localhost:5678

## Access Methods

### Method 1: Direct Browser Access (Recommended)

1. **Open your browser** and go to: http://localhost:5678
2. **If prompted for login**, try these credentials:
   - Username: `admin`
   - Password: `admin123`

### Method 2: First-Time Setup (If Method 1 doesn't work)

If you see a setup screen instead of login:

1. **Create Owner Account**:
   - Email: `admin@example.com` (or your email)
   - First Name: `Admin`
   - Last Name: `User`
   - Password: `admin123`

2. **Complete Setup** and proceed to the main interface

### Method 3: Disable Basic Auth (Alternative)

If authentication is causing issues, you can temporarily disable it:

```bash
# Stop current n8n
docker stop jobscraper-n8n

# Start without basic auth
docker run -d \
  --name jobscraper-n8n-temp \
  -p 5678:5678 \
  -e GENERIC_TIMEZONE=Asia/Kolkata \
  -v n8n_data:/home/node/.n8n \
  -v $(pwd)/workflows:/home/node/.n8n/workflows \
  n8nio/n8n:latest
```

## 📥 Import Workflow

Once you're in n8n:

1. **Click "+ Add workflow"** or **"Import from file"**
2. **Select file**: `workflows/daily-job-scraper.json`
3. **Click "Import"**
4. **Save the workflow**
5. **Toggle to "Active"** to enable daily automation

## 🧪 Test Workflow

1. **Manual Test**: Click "Execute Workflow" button
2. **Check Execution**: Monitor each node for success/failure
3. **View Results**: Check the output of each step

## 🔧 Troubleshooting

### If you can't access n8n:
```bash
# Check if container is running
docker ps | grep n8n

# Check logs
docker logs jobscraper-n8n

# Restart if needed
docker restart jobscraper-n8n
```

### If authentication fails:
```bash
# Reset n8n data (WARNING: This will delete existing workflows)
docker stop jobscraper-n8n
docker volume rm n8n_data
docker start jobscraper-n8n
```

## 🎯 Next Steps

1. **Access n8n**: Use Method 1 above
2. **Import workflow**: Follow the import steps
3. **Test manually**: Execute the workflow once
4. **Enable automation**: Toggle workflow to "Active"
5. **Monitor**: Check executions daily

---

**💡 Tip**: If you're still having issues, try opening http://localhost:5678 in an incognito/private browser window to avoid any cached authentication issues.