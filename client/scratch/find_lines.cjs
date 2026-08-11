const fs = require('fs');
const file = 'c:\\Users\\sunny gupta\\OneDrive\\Desktop\\auction\\client\\src\\pages\\AdminDashboard.tsx';
const content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('blue') || line.includes('violet') || line.includes('purple')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
