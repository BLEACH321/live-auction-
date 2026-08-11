const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'AdminDashboard.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Add import if not present
if (!content.includes("import { API_URL }")) {
  content = content.replace(
    "import { useAuth } from '../context/AuthContext';",
    "import { useAuth } from '../context/AuthContext';\nimport { API_URL } from '../config';"
  );
}

// Replace 'http://localhost:5000' with `${API_URL}`
// For example: 'http://localhost:5000/api/admin/teams' -> `${API_URL}/api/admin/teams`
// Wait, we need to match single or double quoted strings starting with http://localhost:5000
const regex = /'http:\/\/localhost:5000([^']*)'/g;
content = content.replace(regex, '`${API_URL}$1`');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully updated URLs in AdminDashboard.tsx');
