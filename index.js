
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


    const messages = [
      {
        role: 'system',
        content: `You are a nutrition assistant. Your task is to create a 7-day meal plan based on the food list I will provide and the following rules.
        Each day must include breakfast, snack 1, lunch, snack 2, and dinner.
        On fasting days, leave breakfast and snack 1 empty.
        Respect all rules carefully.
        max 2 day fasting is allowed in week.
        some of rules:
        - if the user is fasting, you should not include breakfast and snack 1 in the meal plan.
        - Important: Only one carbohydrate source per day is allowed.   bread, quinoa, oats, lentils are carbohydrates.
        If bread is eaten at breakfast, do not include lentils, quinoa, or oats in any other meal that day.
        If lentils, quinoa, or oats are chosen, then bread must not be included at breakfast.
        sometimes your giving bread and quinoa in single day and its wrong!
        - For snacks, just use fruit, Selma cake (کیک سلما), nuts, and dark chocolate are allowed.
        - Please list the food along with the quantity being sent.
        - Pay attention to the maximum amount of olive oil. every day should contain olive oil. You can divide this amount between lunch and dinner. For example, half a spoon at lunch and half a spoon at dinner.
        - maximum 1 type of carbohydrate per day is allowed.
        - In fast days dont live meals input empty. Write Fast or روزه
        - if you want to write fruits, choose fruit and write fruits name. dont write fruits in general.
        - if you want to write vegetables, choose diverse vegetables and write vegetables name. dont write vegetables in general. at least 3 types of vegetables for each meal.
        - if you want to use red meat, dont use it twice in a day.  red meat is only allowed once in a day.
        - Fried or roasted  food is forbidden.
         Separate foods with backslash n (\\n) instead of commas.
        IMPORTANT: On fasting days, increase protein intake value by 15% exp: Meet 100g -> Meet 115g.
        IMPORTANT: Every day should include avocado or olive in one of the meals even in fasting days.
        On fasting days, only use meat protein in meals.
        For vegetables, use a variety of vegetables that are sent and dont use For vegetables, use a variety of vegetables and don't write vegetables in general. For example, write cucumber, lettuce, spinach, etc..
        IMPORTANT: Read the information about each food or rule and implement it carefully. For example, if it is mentioned that a food should be consumed every day, then be sure to include it in the plan.
        dont use exact same foods and have some different and creative.
        ${combinedContent.trim()}


        this is an example of the correct samples for 3 days:
        ${example}


       
       

        return the answer into ${language || 'English'} language. All foods and units should be in ${language || 'English'}.
        Just prepare a meal combination for the user from the list of foods sent to you and pay very close attention to the rules.
        Please return the meal plan in JSON format. output format: ${outputFormat}
        `
      },

    ];

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