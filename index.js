
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const _fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const app = express();
const port = process.env.BACKEND_PORT || 3000;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.post('/api/generate_vip', async (req, res) => {
  try {
    if (!openAiApiKey) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const userInput = req.body

    if (!userInput) {
      return res.status(400).json({ error: 'No input provided. Send input or a JSON payload.' });
    }

    const { clean_rules, clean_foods, foods_good_for_user, foods_not_good_for_user, language } = userInput;

    let combinedContent = '';
    if (clean_rules) combinedContent += clean_rules + '\n\n';
    if (clean_foods) combinedContent += "Foods: " + clean_foods + '\n\n';
    if (foods_good_for_user) combinedContent += "Foods good for user: " + foods_good_for_user + '\n\n';
    if (foods_not_good_for_user) combinedContent += "Foods not good for user: " + foods_not_good_for_user + '\n\n';

    // مرحله اول: خلاصه‌سازی و بهینه‌سازی قوانین
    const staticRules = `Create a 7-day meal plan with breakfast, snack 1, lunch, snack 2, and dinner.
    
    FASTING RULES:
    - Max 2 fasting days per week
    - On fasting days: skip breakfast and snack 1, write "Fast" or "روزه" for empty meals
    - Increase protein by 15% on fasting days (e.g., 100g → 115g)
    - Use only meat protein on fasting days
    
    CARBOHYDRATE RULES:
    - Only ONE carbohydrate source per day (bread, quinoa, oats, lentils)
    - If bread at breakfast → no quinoa/oats/lentils that day
    - If quinoa/oats/lentils chosen → no bread at breakfast
    
    SNACK RULES:
    - Only: fruits (specify name), Selma cake (کیک سلما), nuts, dark chocolate
    
    GENERAL RULES:
    - List foods with quantities
    - Include olive oil daily (split between lunch/dinner)
    - Red meat max once per day
    - No fried/roasted foods
    - Separate foods with \\n, not commas
    - Include avocado or olive daily (even on fasting days)
    - Use 3+ diverse vegetables per meal (specify names like cucumber, lettuce, spinach)
    - Be creative, avoid repetitive foods
    - Follow all food-specific rules carefully`;

    const summarizeMessages = [
      {
        role: 'system',
        content: `You are a nutrition rules optimizer. Your task is to summarize and optimize the nutrition rules and food information provided by the user.
        
        Your job is to:
        1. Extract the most important nutrition rules
        2. Summarize food lists and preferences
        3. Create a concise, clear set of rules that can be easily understood by another AI model
        4. Keep all critical information but make it more organized and concise
        5. Maintain the original meaning and requirements
        
        Return the optimized rules in a clear, structured format that another AI can easily follow.
        Use the same language as the input (${language || 'English'}) for plans but return summarize in english language.`
      },
      {
        role: 'user',
        content: `Please optimize and summarize these nutrition rules and food information:

STATIC NUTRITION RULES:
${staticRules}

USER-SPECIFIC RULES AND FOOD INFORMATION:
${combinedContent.trim()}
Dont miss any rule or food information. only summarize them.
`
      }
    ];
    


    // درخواست اول برای خلاصه‌سازی
    const summarizeResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: openAiModel,
      messages: summarizeMessages
    }, {
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json'
      },
    });

    const optimizedRules = summarizeResponse.data?.choices?.[0]?.message?.content ?? '';

    const outputFormat = `[
    {
        day:1,
        fast:true/false,
        meals:[
            {
                meal:"breakfast", 
                des:"ماهی و سبزیجات",
            }
        ]
    }
]`;

    const example = _fs.readFileSync(path.join(__dirname, 'exmple.txt'), 'utf8');

    // مرحله دوم: تولید برنامه غذایی با قوانین بهینه‌شده
    const messages = [
      {
        role: 'system',
        content: `You are a nutrition assistant. Your task is to create a 7-day meal plan based on the optimized rules provided.
        
        OPTIMIZED RULES AND FOOD INFORMATION:
        ${optimizedRules}

        this is an example of the correct samples for 3 days:
        ${example}

        return the answer into ${language || 'English'} language. All foods and units should be in ${language || 'English'}.
        Just prepare a meal combination for the user from the list of foods sent to you and pay very close attention to the rules.
        Please return the meal plan in JSON format. output format: ${outputFormat}
        `
      },
    ];

    // درخواست دوم برای تولید برنامه غذایی
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: openAiModel,
      messages
    }, {
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json'
      },
    });

    const content = response.data?.choices?.[0]?.message?.content ?? '';

    const extractJsonFromMarkdown = (text) => {
      if (typeof text !== 'string') return null;
      const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
      const match = text.match(fenceRegex);
      return match ? match[1].trim() : text.trim();
    };

    const cleaned = extractJsonFromMarkdown(content);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({ error: 'LLM output is not valid JSON', details: e.message });
    }

    return res.json({
      content: parsed,
      model: response.data?.model || openAiModel,
      usage: response.data?.usage || null,
      optimizedRules: optimizedRules, // اضافه کردن قوانین بهینه‌شده به پاسخ
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data;
    console.error('OpenAI API error:', data || error.message);

    return res.status(status).json({
      error: 'Failed to generate response',
      details: data || error.message
    });
  }
});

const config = {
  key: _fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/privkey.pem"),
  cert: _fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/fullchain.pem")
}

const server = https.createServer({
  ...config
}, app);

server.listen(port, () => {
  console.log(`Server listening on https://nutrostyle.nutrosal.com:${port}`);
});



