const fs = require('fs');
const file = 'c:\\Users\\sunny gupta\\OneDrive\\Desktop\\auction\\client\\src\\pages\\AdminDashboard.tsx';
const content = fs.readFileSync(file, 'utf8');

const regex = /(?:bg|text|border|ring|shadow|from|to|via)-(?:blue|violet|emerald|purple|red)-\d+/g;
const matches = content.match(regex);
console.log('Matches:', matches ? Array.from(new Set(matches)) : 'None');
