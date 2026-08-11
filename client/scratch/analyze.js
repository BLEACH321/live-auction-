const fs = require('fs');
const path = require('path');

const jsPath = 'C:\\Users\\sunny gupta\\.gemini\\antigravity\\brain\\88cd52be-37a7-42c5-b897-13cffa27a6a8\\.system_generated\\steps\\40\\content.md';
let content = fs.readFileSync(jsPath, 'utf8');

// The file has some header markdown, let's remove it
const markdownHeaderEnd = content.indexOf('---');
if (markdownHeaderEnd !== -1) {
  content = content.substring(markdownHeaderEnd + 3);
}

// Find all backtick, double quote, single quote strings in JS
console.log('Finding strings containing key terms...');

const keyTerms = ['circuit', 'arena', 'bid', 'budget', 'procure', 'component', 'viva', 'quiz', 'team', 'round', 'dashboard', 'admin', 'player', 'rules', 'live', 'finals', 'voltage', 'power', 'component', 'resistor', 'transistor', 'led', 'capacitor', 'diode', 'ic', 'multimeter', 'breadboard'];

// Simple scan for strings
const regex = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
let match;
const found = new Set();
while ((match = regex.exec(content)) !== null) {
  const str = (match[1] || match[2] || match[3] || '').trim();
  if (str.length > 5 && str.length < 200) {
    const lower = str.toLowerCase();
    const hasKey = keyTerms.some(term => lower.includes(term));
    if (hasKey && !str.includes('\n') && !str.includes(';') && !str.includes('{') && !str.includes('}') && !str.includes('class') && !str.includes('px-') && !str.includes('bg-')) {
      found.add(str);
    }
  }
}

console.log('Matches found:', found.size);
const sorted = Array.from(found).sort((a,b) => a.length - b.length);
for (const s of sorted.slice(0, 150)) {
  console.log('-', s);
}
