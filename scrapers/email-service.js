const nodemailer = require('nodemailer');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
require('dotenv').config();
const config = require('../config/config.json');

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'data/email-service.log' }),
    new winston.transports.Console()
  ]
});

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      const host = process.env.SMTP_HOST || config.email.smtp_host || 'smtp.gmail.com';
      const port = parseInt(process.env.SMTP_PORT || `${config.email.smtp_port || 587}`, 10);
      const secure = (process.env.SMTP_SECURE || `${config.email.smtp_secure || false}`).toString() === 'true';
      const user = process.env.EMAIL_USER || config.email.smtp_user;
      const pass = process.env.EMAIL_PASS || config.email.smtp_password;

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        tls: {
          rejectUnauthorized: false
        }
      });
      
      logger.info('Email transporter initialized');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      throw error;
    }
  }

  async sendJobReport(analysisResult) {
    try {
      const { relevant_jobs, analysis_summary } = analysisResult;
      
      const sendEmpty = (process.env.EMAIL_SEND_EMPTY_REPORTS || '').toString().toLowerCase() === 'true' || !!config.email.send_empty_reports;
      if (relevant_jobs.length === 0 && !sendEmpty) {
        logger.info('No relevant jobs found and empty reports disabled');
        return { success: true, message: 'No relevant jobs to report' };
      }

      const emailContent = this.generateEmailContent(relevant_jobs, analysis_summary);
      const subject = this.generateSubject(relevant_jobs.length);

      const fromName = process.env.EMAIL_FROM_NAME || config.email.from_name || 'Job Scraper Bot';
      const fromUser = process.env.EMAIL_USER || config.email.smtp_user;
      const toAddress = process.env.EMAIL_TO || config.user.email;

      const mailOptions = {
        from: `"${fromName}" <${fromUser}>`,
        to: toAddress,
        subject: subject,
        html: emailContent,
        attachments: [
          {
            filename: 'jobs-data.json',
            content: JSON.stringify(relevant_jobs, null, 2),
            contentType: 'application/json'
          }
        ]
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${result.messageId}`);
      
      return {
        success: true,
        messageId: result.messageId,
        jobCount: relevant_jobs.length
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateSubject(jobCount) {
    const date = new Date().toLocaleDateString('en-IN');
    return config.email.subject_template
      .replace('{date}', date)
      .replace('{count}', jobCount);
  }

  generateEmailContent(jobs, summary) {
    const date = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let html = `
<!DOCTYPE html>

<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Job Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #007acc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #007acc;
            margin: 0;
            font-size: 28px;
        }
        .header p {
            color: #666;
            margin: 10px 0 0 0;
            font-size: 16px;
        }
        .summary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .summary h2 {
            margin: 0 0 15px 0;
            font-size: 20px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .summary-item {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 10px;
            border-radius: 5px;
        }
        .summary-item .number {
            font-size: 24px;
            font-weight: bold;
            display: block;
        }
        .summary-item .label {
            font-size: 12px;
            opacity: 0.9;
        }
        .job-card {
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            background: white;
            transition: box-shadow 0.3s ease;
        }
        .job-card:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }
        .job-title {
            font-size: 18px;
            font-weight: bold;
            color: #007acc;
            margin: 0;
            flex: 1;
        }
        .relevance-score {
            background: #28a745;
            color: white;
            padding: 4px 8px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: bold;
            margin-left: 10px;
        }
        .job-meta {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .job-meta span {
            margin-right: 15px;
        }
        .job-summary {
            color: #555;
            font-size: 14px;
            margin-bottom: 15px;
            line-height: 1.5;
        }
        .skills-tags {
            margin-bottom: 15px;
        }
        .skill-tag {
            display: inline-block;
            background: #e3f2fd;
            color: #1976d2;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            margin: 2px 4px 2px 0;
        }
        .job-actions {
            text-align: right;
        }
        .apply-btn {
            background: #007acc;
            color: white;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 5px;
            font-size: 14px;
            display: inline-block;
        }
        .apply-btn:hover {
            background: #005a9e;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #666;
            font-size: 12px;
        }
        .no-jobs {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        @media (max-width: 600px) {
            .job-header {
                flex-direction: column;
            }
            .relevance-score {
                margin: 10px 0 0 0;
                align-self: flex-start;
            }
            .summary-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 Daily Job Report</h1>
            <p>${date}</p>
        </div>

        <div class="summary">
            <h2>📊 Today's Summary</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="number">${summary.relevant_count}</span>
                    <span class="label">Relevant Jobs</span>
                </div>
                <div class="summary-item">
                    <span class="number">${summary.total_analyzed}</span>
                    <span class="label">Total Analyzed</span>
                </div>
                <div class="summary-item">
                    <span class="number">${summary.average_score.toFixed(1)}</span>
                    <span class="label">Avg Score</span>
                </div>
                <div class="summary-item">
                    <span class="number">${summary.top_companies.length}</span>
                    <span class="label">Companies</span>
                </div>
            </div>
        </div>
`;

    if (jobs.length === 0) {
      html += `
        <div class="no-jobs">
            <h3>🔍 No Relevant Jobs Found Today</h3>
            <p>Don't worry! We'll keep looking for opportunities that match your profile.</p>
            <p>Consider updating your skills or expanding your location preferences in the config.</p>
        </div>
`;
    } else {
      // Sort jobs by relevance score
      const sortedJobs = jobs.sort((a, b) => b.ai_analysis.relevance_score - a.ai_analysis.relevance_score);
      
      sortedJobs.forEach((job, index) => {
        const scoreColor = job.ai_analysis.relevance_score >= 8 ? '#28a745' : 
                          job.ai_analysis.relevance_score >= 7 ? '#ffc107' : '#dc3545';
        
        html += `
        <div class="job-card">
            <div class="job-header">
                <h3 class="job-title">${job.title}</h3>
                <span class="relevance-score" style="background: ${scoreColor}">
                    ${job.ai_analysis.relevance_score}/10
                </span>
            </div>
            
            <div class="job-meta">
                <span>🏢 ${job.company}</span>
                <span>📍 ${job.location}</span>
                <span>🌐 ${job.source}</span>
            </div>
            
            <div class="job-summary">
                ${job.ai_analysis.summary}
            </div>
            
            ${job.ai_analysis.key_skills.length > 0 ? `
            <div class="skills-tags">
                ${job.ai_analysis.key_skills.map(skill => 
                  `<span class="skill-tag">${skill}</span>`
                ).join('')}
            </div>
            ` : ''}
            
            ${job.ai_analysis.pros.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <strong>✅ Pros:</strong> ${job.ai_analysis.pros.join(', ')}
            </div>
            ` : ''}
            
            ${job.ai_analysis.cons.length > 0 ? `
            <div style="margin-bottom: 15px;">
                <strong>⚠️ Cons:</strong> ${job.ai_analysis.cons.join(', ')}
            </div>
            ` : ''}
            
            <div class="job-actions">
                <a href="${job.link}" class="apply-btn" target="_blank">View Job →</a>
            </div>
        </div>
`;
      });
    }

    // Add top companies and skills sections
    if (summary.top_companies.length > 0) {
      html += `
        <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <h3>🏆 Top Companies Today</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${summary.top_companies.map(company => 
                  `<span style="background: white; padding: 8px 12px; border-radius: 15px; font-size: 14px;">
                     ${company.company} (${company.count})
                   </span>`
                ).join('')}
            </div>
        </div>
`;
    }

    if (summary.top_skills.length > 0) {
      html += `
        <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <h3>🔧 Most Demanded Skills</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                ${summary.top_skills.map(skill => 
                  `<span style="background: white; padding: 8px 12px; border-radius: 15px; font-size: 14px;">
                     ${skill.skill} (${skill.count})
                   </span>`
                ).join('')}
            </div>
        </div>
`;
    }

    html += `
        <div class="footer">
            <p>🤖 Generated by Job Scraper Bot | ${new Date().toLocaleString('en-IN')}</p>
            <p>This report was automatically generated from LinkedIn, Indeed, and Naukri job postings.</p>
        </div>
    </div>
</body>
</html>
`;

    return html;
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}

module.exports = EmailService;

// Test the email service if run directly
if (require.main === module) {
  (async () => {
    const emailService = new EmailService();
    
    // Test connection
    const connected = await emailService.testConnection();
    if (!connected) {
      console.error('Cannot connect to email service. Please check your email configuration.');
      process.exit(1);
    }
    
    // Test with sample data
    const sampleData = {
      relevant_jobs: [
        {
          title: 'Full Stack Developer',
          company: 'Tech Corp',
          location: 'Delhi',
          source: 'LinkedIn',
          link: 'https://example.com/job1',
          ai_analysis: {
            relevance_score: 8,
            summary: 'Great opportunity for full stack development with modern technologies.',
            key_skills: ['React', 'Node.js', 'MongoDB'],
            pros: ['Good salary', 'Remote work'],
            cons: ['High pressure']
          }
        }
      ],
      analysis_summary: {
        total_analyzed: 25,
        relevant_count: 1,
        average_score: 6.2,
        top_companies: [{ company: 'Tech Corp', count: 1 }],
        top_skills: [{ skill: 'React', count: 1 }]
      }
    };
    
    const result = await emailService.sendJobReport(sampleData);
    console.log('Email test result:', result);
  })();
}
