const axios = require('axios');
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
    new winston.transports.File({ filename: 'data/ai-analyzer.log' }),
    new winston.transports.Console()
  ]
});

class AIJobAnalyzer {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_HOST || config.ai_analysis.ollama_url || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || config.ai_analysis.model;
    this.minRelevanceScore = config.ai_analysis.min_relevance_score;
  }

  async analyzeJob(job) {
    try {
      const prompt = this.createAnalysisPrompt(job);
      const response = await this.callOllama(prompt);
      const analysis = this.parseAnalysisResponse(response);
      
      return {
        ...job,
        ai_analysis: {
          relevance_score: analysis.score,
          summary: analysis.summary,
          key_skills: analysis.skills,
          pros: analysis.pros,
          cons: analysis.cons,
          salary_estimate: analysis.salary,
          analyzed_at: new Date().toISOString()
        },
        is_relevant: analysis.score >= this.minRelevanceScore
      };
    } catch (error) {
      logger.error(`Failed to analyze job: ${job.title}`, error);
      return {
        ...job,
        ai_analysis: {
          relevance_score: 0,
          summary: 'Analysis failed',
          error: error.message,
          analyzed_at: new Date().toISOString()
        },
        is_relevant: false
      };
    }
  }

  createAnalysisPrompt(job) {
    const userSkills = config.user.skills.join(', ');
    const preferredRoles = config.user.preferred_roles.join(', ');
    const experienceLevel = config.user.experience_level;

    return `You are an AI job analyst. Analyze this job posting and provide a relevance score from 1-10 for a ${experienceLevel} candidate.

Candidate Profile:
- Skills: ${userSkills}
- Preferred Roles: ${preferredRoles}
- Experience Level: ${experienceLevel}
- Location Preference: ${config.locations.primary.join(', ')}

Job Details:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Source: ${job.source}
- Description: ${job.description}

Please respond in the following JSON format:
{
  "score": <number 1-10>,
  "summary": "<brief 2-3 sentence summary>",
  "skills": ["<skill1>", "<skill2>", "<skill3>"],
  "pros": ["<pro1>", "<pro2>"],
  "cons": ["<con1>", "<con2>"],
  "salary": "<estimated salary range in INR>"
}

Consider:
1. Skill match percentage
2. Role alignment
3. Location preference
4. Company reputation
5. Growth potential
6. Experience level fit

Be honest and critical in your assessment.`;
  }

  async callOllama(prompt) {
    try {
      const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || `${config.ai_analysis.temperature || 0.3}`),
          num_predict: parseInt(process.env.OLLAMA_MAX_TOKENS || `${config.ai_analysis.max_tokens || 512}`)
        }
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data.response;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running. Please start Ollama first.');
      }
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  parseAnalysisResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: Math.max(1, Math.min(10, parseInt(parsed.score) || 1)),
          summary: parsed.summary || 'No summary provided',
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          pros: Array.isArray(parsed.pros) ? parsed.pros : [],
          cons: Array.isArray(parsed.cons) ? parsed.cons : [],
          salary: parsed.salary || 'Not specified'
        };
      }
    } catch (error) {
      logger.warn('Failed to parse AI response as JSON:', error.message);
    }

    // Fallback parsing for non-JSON responses
    const scoreMatch = response.match(/score["']?\s*:?\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;

    return {
      score: Math.max(1, Math.min(10, score)),
      summary: this.extractSummary(response),
      skills: this.extractSkills(response),
      pros: [],
      cons: [],
      salary: 'Not specified'
    };
  }

  extractSummary(response) {
    const lines = response.split('\n').filter(line => line.trim());
    return lines.slice(0, 2).join(' ').substring(0, 200) + '...';
  }

  extractSkills(response) {
    const skills = [];
    const skillKeywords = config.user.skills;
    
    skillKeywords.forEach(skill => {
      if (response.toLowerCase().includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    });
    
    return skills.slice(0, 5);
  }

  async analyzeBatch(jobs) {
    logger.info(`Starting AI analysis for ${jobs.length} jobs`);
    const analyzedJobs = [];
    
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      logger.info(`Analyzing job ${i + 1}/${jobs.length}: ${job.title}`);
      
      const analyzedJob = await this.analyzeJob(job);
      analyzedJobs.push(analyzedJob);
      
      // Add delay between requests to avoid overwhelming Ollama
      if (i < jobs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const relevantJobs = analyzedJobs.filter(job => job.is_relevant);
    logger.info(`AI analysis completed: ${relevantJobs.length}/${jobs.length} jobs are relevant`);
    
    return {
      all_jobs: analyzedJobs,
      relevant_jobs: relevantJobs,
      analysis_summary: {
        total_analyzed: jobs.length,
        relevant_count: relevantJobs.length,
        average_score: analyzedJobs.reduce((sum, job) => sum + job.ai_analysis.relevance_score, 0) / jobs.length,
        top_companies: this.getTopCompanies(relevantJobs),
        top_skills: this.getTopSkills(relevantJobs)
      }
    };
  }

  getTopCompanies(jobs) {
    const companies = {};
    jobs.forEach(job => {
      companies[job.company] = (companies[job.company] || 0) + 1;
    });
    
    return Object.entries(companies)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));
  }

  getTopSkills(jobs) {
    const skills = {};
    jobs.forEach(job => {
      job.ai_analysis.key_skills.forEach(skill => {
        skills[skill] = (skills[skill] || 0) + 1;
      });
    });
    
    return Object.entries(skills)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([skill, count]) => ({ skill, count }));
  }

  async testConnection() {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 5000 });
      const models = response.data.models || [];
      const target = (this.model || '').trim();
      const hasModel = target ? models.some(m => m.name.includes(target)) : models.length > 0;
      
      if (!hasModel) {
        logger.warn(`Model ${this.model} not found. Available models:`, models.map(m => m.name));
        return false;
      }
      
      logger.info('Ollama connection successful');
      return true;
    } catch (error) {
      logger.error('Ollama connection failed:', error.message);
      return false;
    }
  }
}

module.exports = AIJobAnalyzer;

// Test the analyzer if run directly
if (require.main === module) {
  (async () => {
    const analyzer = new AIJobAnalyzer();
    
    // Test connection
    const connected = await analyzer.testConnection();
    if (!connected) {
      console.error('Cannot connect to Ollama. Please ensure it is running.');
      process.exit(1);
    }
    
    // Test with sample job
    const sampleJob = {
      title: 'Full Stack Developer',
      company: 'Tech Company',
      location: 'Delhi',
      source: 'Test',
      description: 'Looking for a full stack developer with React, Node.js, and MongoDB experience'
    };
    
    const result = await analyzer.analyzeJob(sampleJob);
    console.log(JSON.stringify(result, null, 2));
  })();
}
