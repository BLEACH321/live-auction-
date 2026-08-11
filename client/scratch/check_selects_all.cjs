const fs = require('fs');
const path = require('path');

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
};

const files = walk('c:\\Users\\sunny gupta\\OneDrive\\Desktop\\auction\\client\\src');
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('<select')) {
    console.log('Found <select in:', f);
  }
});
