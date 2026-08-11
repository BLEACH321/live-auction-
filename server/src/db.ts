import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/auction';

// We'll set a fast connection timeout for testing
export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 2000,
});

let useFallback = false;
const fallbackFilePath = path.join(__dirname, '..', 'db_fallback.json');

// Memory model for local JSON simulation
interface DbData {
  users: any[];
  teams: any[];
  auction_items: any[];
  bids: any[];
  purchases: any[];
  auction_state: { [key: string]: any };
}

let fallbackData: DbData = {
  users: [],
  teams: [],
  auction_items: [],
  bids: [],
  purchases: [],
  auction_state: {},
};

// Save fallback to disk
function saveFallback() {
  try {
    fs.writeFileSync(fallbackFilePath, JSON.stringify(fallbackData, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write fallback database file:', e);
  }
}

// Load fallback from disk
function loadFallback() {
  if (fs.existsSync(fallbackFilePath)) {
    try {
      const content = fs.readFileSync(fallbackFilePath, 'utf-8');
      fallbackData = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse fallback database file, using clean state:', e);
    }
  }
}

// Transparent Query Simulator
function querySimulator(text: string, params: any[] = []): { rows: any[] } {
  const queryClean = text.replace(/\s+/g, ' ').trim();

  // 1. Transaction controls
  if (queryClean === 'BEGIN' || queryClean === 'COMMIT' || queryClean === 'ROLLBACK') {
    return { rows: [] };
  }

  // 2. Schema check / Create tables
  if (queryClean.startsWith('CREATE TABLE')) {
    return { rows: [] };
  }

  // 3. COUNT Users
  if (queryClean.includes('SELECT COUNT(*) FROM users')) {
    return { rows: [{ count: fallbackData.users.length.toString() }] };
  }

  // 4. Find User by username
  if (queryClean.includes('FROM users WHERE username = $1')) {
    const username = params[0];
    const user = fallbackData.users.find(u => u.username === username);
    return { rows: user ? [user] : [] };
  }

  // Find Team by name
  if (queryClean.includes('FROM teams WHERE name = $1')) {
    const name = params[0];
    const team = fallbackData.teams.find(t => t.name === name);
    return { rows: team ? [team] : [] };
  }

  // 5. Find User by id
  if (queryClean.includes('SELECT * FROM users WHERE id = $1')) {
    const id = params[0];
    const user = fallbackData.users.find(u => u.id === id);
    return { rows: user ? [user] : [] };
  }

  // 6. Find Team by user_id
  if (queryClean.includes('SELECT id, name FROM teams WHERE user_id = $1')) {
    const userId = params[0];
    const team = fallbackData.teams.find(t => t.user_id === userId);
    return { rows: team ? [team] : [] };
  }

  // 7. Find Team by id
  if (queryClean.includes('FROM teams WHERE id = $1')) {
    const id = params[0];
    const team = fallbackData.teams.find(t => t.id === id);
    return { rows: team ? [team] : [] };
  }

  // 8. List all teams ordered
  if (queryClean.includes('SELECT * FROM teams ORDER BY name ASC') || 
      queryClean === 'SELECT * FROM teams' ||
      queryClean.includes('SELECT id, name, remaining_budget FROM teams')) {
    const sorted = [...fallbackData.teams].sort((a, b) => a.name.localeCompare(b.name));
    return { rows: sorted };
  }

  // 9. List all items ordered
  if (queryClean.includes('FROM auction_items') && !queryClean.includes('WHERE id = $1') && !queryClean.includes('INSERT INTO') && !queryClean.includes('UPDATE') && !queryClean.includes('DELETE')) {
    const sorted = [...fallbackData.auction_items].sort((a, b) => {
      const diff = (a.order_index || 0) - (b.order_index || 0);
      return diff !== 0 ? diff : a.id - b.id;
    });
    const mapped = sorted.map(item => {
      const purchaseCount = fallbackData.purchases
        .filter(p => p.item_id === item.id)
        .reduce((sum, p) => sum + (p.quantity || 1), 0);
      return {
        ...item,
        remaining_stock: item.stock - purchaseCount
      };
    });
    return { rows: mapped };
  }

  // 10. Find item by id
  if (queryClean.includes('FROM auction_items WHERE id = $1')) {
    const id = params[0];
    const item = fallbackData.auction_items.find(i => i.id === id);
    return { rows: item ? [item] : [] };
  }
  // Find item by name
  if (queryClean.includes('FROM auction_items WHERE name = $1')) {
    const name = params[0];
    const item = fallbackData.auction_items.find(i => i.name === name);
    return { rows: item ? [item] : [] };
  }
  // 11. Find MAX order_index
  if (queryClean.includes('SELECT MAX(order_index) FROM auction_items')) {
    const maxVal = fallbackData.auction_items.reduce((max, item) => Math.max(max, item.order_index || 0), 0);
    return { rows: [{ max: maxVal }] };
  }

  // 12. Load State
  if (queryClean.includes('SELECT value FROM auction_state WHERE key = $1')) {
    const key = params[0];
    const stateVal = fallbackData.auction_state[key];
    return { rows: stateVal ? [{ value: stateVal }] : [] };
  }

  // 13. Insert User
  if (queryClean.includes('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id')) {
    const id = fallbackData.users.length + 1;
    const newUser = { id, username: params[0], password_hash: params[1], role: params[2] };
    fallbackData.users.push(newUser);
    saveFallback();
    return { rows: [{ id }] };
  }

  // 14. Insert Team
  if (queryClean.includes('INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, 0.00)') ||
      queryClean.includes('INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, $5)')) {
    const id = fallbackData.teams.length + 1;
    const newTeam = {
      id,
      user_id: params[0],
      name: params[1],
      initial_budget: Number(params[2]),
      remaining_budget: Number(params[3]),
      total_spent: Number(params[4] || 0.00)
    };
    fallbackData.teams.push(newTeam);
    saveFallback();
    return { rows: [newTeam] };
  }

  // 15. Insert Item
  if (queryClean.includes('INSERT INTO auction_items (name, image_url, base_price, status, order_index) VALUES ($1, $2, $3, $4, $5)') ||
      queryClean.includes('INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ($1, $2, $3, $4, $5, $6)')) {
    const id = fallbackData.auction_items.length + 1;
    const hasStock = queryClean.includes(', stock)');
    const newItem = {
      id,
      name: params[0],
      image_url: params[1],
      base_price: Number(params[2]),
      status: params[3],
      winning_team_id: null,
      final_price: null,
      order_index: Number(params[4]),
      stock: hasStock && params[5] !== undefined ? Number(params[5]) : 1
    };
    fallbackData.auction_items.push(newItem);
    saveFallback();
    return { rows: [newItem] };
  }

  // 16. Insert Bid
  if (queryClean.includes('INSERT INTO bids (item_id, team_id, bid_amount) VALUES ($1, $2, $3)')) {
    const id = fallbackData.bids.length + 1;
    const newBid = {
      id,
      item_id: params[0],
      team_id: params[1],
      bid_amount: Number(params[2]),
      bid_time: new Date()
    };
    fallbackData.bids.push(newBid);
    saveFallback();
    return { rows: [newBid] };
  }

  // 17. Insert Purchase (supports quantity parameter)
  if (queryClean.includes('INSERT INTO purchases (item_id, team_id, price, quantity) VALUES ($1, $2, $3, $4)') ||
      queryClean.includes('INSERT INTO purchases (item_id, team_id, price) VALUES ($1, $2, $3)')) {
    const id = fallbackData.purchases.length + 1;
    const isExtended = queryClean.includes('quantity');
    const newPurchase = {
      id,
      item_id: params[0],
      team_id: params[1],
      price: Number(params[2]),
      quantity: isExtended ? Number(params[3]) : 1,
      purchase_time: new Date()
    };
    fallbackData.purchases.push(newPurchase);
    saveFallback();
    return { rows: [newPurchase] };
  }

  // 18. Update Team budget (remaining & spent)
  if (queryClean.includes('UPDATE teams SET remaining_budget = remaining_budget - $1, total_spent = total_spent + $1 WHERE id = $2')) {
    const amount = Number(params[0]);
    const teamId = params[1];
    const team = fallbackData.teams.find(t => t.id === teamId);
    if (team) {
      team.remaining_budget = Number(team.remaining_budget) - amount;
      team.total_spent = Number(team.total_spent) + amount;
      saveFallback();
    }
    return { rows: [] };
  }

  // 19. Admin: Set team budget
  if (queryClean.includes('UPDATE teams SET initial_budget = $1, remaining_budget = $1, total_spent = 0.00 WHERE id = $2')) {
    const amount = Number(params[0]);
    const teamId = params[1];
    const team = fallbackData.teams.find(t => t.id === teamId);
    if (team) {
      team.initial_budget = amount;
      team.remaining_budget = amount;
      team.total_spent = 0.00;
      saveFallback();
    }
    return { rows: [] };
  }

  // 20. Reset all teams
  if (queryClean.includes('UPDATE teams SET remaining_budget = initial_budget, total_spent = 0.00')) {
    fallbackData.teams.forEach(t => {
      t.remaining_budget = t.initial_budget;
      t.total_spent = 0.00;
    });
    saveFallback();
    return { rows: [] };
  }

  // 21. Update Item status, winner, price
  if (queryClean.includes("UPDATE auction_items SET status = 'sold', winning_team_id = $1, final_price = $2 WHERE id = $3")) {
    const teamId = params[0];
    const price = Number(params[1]);
    const itemId = params[2];
    const item = fallbackData.auction_items.find(i => i.id === itemId);
    if (item) {
      item.status = 'sold';
      item.winning_team_id = teamId;
      item.final_price = price;
      saveFallback();
    }
    return { rows: [] };
  }

  // 22. Update Item status = active
  if (queryClean.includes("UPDATE auction_items SET status = 'active' WHERE id = $1")) {
    const itemId = params[0];
    const item = fallbackData.auction_items.find(i => i.id === itemId);
    if (item) {
      item.status = 'active';
      saveFallback();
    }
    return { rows: [] };
  }

  // 23. Update Item status = unsold
  if (queryClean.includes("UPDATE auction_items SET status = 'unsold' WHERE id = $1")) {
    const itemId = params[0];
    const item = fallbackData.auction_items.find(i => i.id === itemId);
    if (item) {
      item.status = 'unsold';
      saveFallback();
    }
    return { rows: [] };
  }

  // 24. Reset all items
  if (queryClean.includes("UPDATE auction_items SET status = 'pending', winning_team_id = NULL, final_price = NULL") ||
      queryClean.includes("UPDATE auction_items SET status = 'pending', winning_team_id = null, final_price = null")) {
    fallbackData.auction_items.forEach(i => {
      i.status = 'pending';
      i.winning_team_id = null;
      i.final_price = null;
    });
    saveFallback();
    return { rows: [] };
  }

  // 25. Update state
  if (queryClean.includes('INSERT INTO auction_state (key, value) VALUES ($1, $2)') ||
      queryClean.includes('UPDATE auction_state SET value = $1 WHERE key = $2')) {
    // Both insert/update set or modify key
    const isInsert = queryClean.includes('INSERT INTO');
    const key = isInsert ? params[0] : params[1];
    const val = isInsert ? JSON.parse(params[1]) : JSON.parse(params[0]);
    fallbackData.auction_state[key] = val;
    saveFallback();
    return { rows: [] };
  }

  // 26. Delete Bids & Purchases
  if (queryClean === 'DELETE FROM bids') {
    fallbackData.bids = [];
    saveFallback();
    return { rows: [] };
  }
  if (queryClean === 'DELETE FROM purchases') {
    fallbackData.purchases = [];
    saveFallback();
    return { rows: [] };
  }

  // 27. Delete Bids / Purchases by team_id
  if (queryClean.includes('DELETE FROM bids WHERE team_id = $1')) {
    fallbackData.bids = fallbackData.bids.filter(b => b.team_id !== params[0]);
    saveFallback();
    return { rows: [] };
  }
  if (queryClean.includes('DELETE FROM purchases WHERE team_id = $1')) {
    fallbackData.purchases = fallbackData.purchases.filter(p => p.team_id !== params[0]);
    saveFallback();
    return { rows: [] };
  }

  // 28. Recent bids (complex JOIN simulation)
  if (queryClean.includes('SELECT b.*, t.name as team_name FROM bids b JOIN teams t ON b.team_id = t.id WHERE b.item_id = $1')) {
    const itemId = params[0];
    const filteredBids = fallbackData.bids
      .filter(b => b.item_id === itemId)
      .map(b => {
        const team = fallbackData.teams.find(t => t.id === b.team_id);
        return {
          ...b,
          team_name: team ? team.name : 'Unknown Team',
        };
      });
    // Sort descending by bid_amount, then bid_time
    filteredBids.sort((a, b) => b.bid_amount - a.bid_amount);
    return { rows: filteredBids.slice(0, 6) };
  }

  // 29. Results sold items query (from purchases)
  if (queryClean.includes('FROM purchases p JOIN auction_items ai ON p.item_id = ai.id JOIN teams t ON p.team_id = t.id')) {
    const soldList = fallbackData.purchases.map(p => {
      const item = fallbackData.auction_items.find(i => i.id === p.item_id);
      const team = fallbackData.teams.find(t => t.id === p.team_id);
      return {
        id: item ? item.id : p.item_id,
        name: item ? item.name : 'Unknown Item',
        image_url: item ? item.image_url : null,
        base_price: item ? item.base_price : 0,
        final_price: p.price,
        winning_team_id: p.team_id,
        team_name: team ? team.name : 'Unknown Team',
        quantity: p.quantity || 1
      };
    });
    soldList.sort((a, b) => b.final_price - a.final_price);
    return { rows: soldList };
  }

  // 30. Standings query (from purchases)
  if (queryClean.includes('FROM teams t LEFT JOIN purchases p ON t.id = p.team_id GROUP BY t.id')) {
    const standings = fallbackData.teams.map(t => {
      const itemsPurchasedCount = fallbackData.purchases.filter(
        p => p.team_id === t.id
      ).length;
      return {
        ...t,
        items_purchased: itemsPurchasedCount.toString(),
      };
    });
    standings.sort((a, b) => b.remaining_budget - a.remaining_budget);
    return { rows: standings };
  }

  // 31. Update Item stock
  if (queryClean.includes('UPDATE auction_items SET stock = $1 WHERE id = $2')) {
    const stock = Number(params[0]);
    const itemId = params[1];
    const item = fallbackData.auction_items.find(i => i.id === itemId);
    if (item) {
      item.stock = stock;
      saveFallback();
    }
    return { rows: [] };
  }

  // 32. Delete User (and cascade team)
  if (queryClean.includes('DELETE FROM users WHERE id = $1')) {
    const userId = params[0];
    const team = fallbackData.teams.find(t => t.user_id === userId);
    if (team) {
      fallbackData.bids = fallbackData.bids.filter(b => b.team_id !== team.id);
      fallbackData.purchases = fallbackData.purchases.filter(p => p.team_id !== team.id);
      fallbackData.teams = fallbackData.teams.filter(t => t.id !== team.id);
    }
    fallbackData.users = fallbackData.users.filter(u => u.id !== userId);
    saveFallback();
    return { rows: [] };
  }

  // Reset Item status
  if (queryClean.includes("UPDATE auction_items SET status = 'pending', winning_team_id = NULL, final_price = NULL WHERE id = $1") ||
      queryClean.includes("UPDATE auction_items SET status = 'pending', winning_team_id = null, final_price = null WHERE id = $1")) {
    const itemId = params[0];
    const item = fallbackData.auction_items.find(i => i.id === itemId);
    if (item) {
      item.status = 'pending';
      item.winning_team_id = null;
      item.final_price = null;
      saveFallback();
    }
    return { rows: [] };
  }

  // COUNT purchases of item
  if (queryClean.includes('SELECT COUNT(*) FROM purchases WHERE item_id = $1')) {
    const itemId = params[0];
    const count = fallbackData.purchases.filter(p => p.item_id === itemId).length;
    return { rows: [{ count: count.toString() }] };
  }

  // Get all purchases (joined with items)
  if (queryClean.includes('FROM purchases p JOIN auction_items ai ON p.item_id = ai.id')) {
    const list = fallbackData.purchases.map(p => {
      const item = fallbackData.auction_items.find(i => i.id === p.item_id);
      return {
        purchase_id: p.id,
        final_price: p.price,
        purchase_time: p.purchase_time,
        team_id: p.team_id,
        id: item ? item.id : p.item_id,
        name: item ? item.name : 'Unknown Item',
        image_url: item ? item.image_url : null,
        base_price: item ? item.base_price : 0
      };
    });
    list.sort((a, b) => new Date(b.purchase_time).getTime() - new Date(a.purchase_time).getTime());
    return { rows: list };
  }

  // Update Item complete
  if (queryClean.includes('UPDATE auction_items SET base_price = $1, stock = $2, image_url = $3 WHERE id = $4')) {
    const basePrice = Number(params[0]);
    const stock = Number(params[1]);
    const imageUrl = params[2];
    const id = Number(params[3]);
    const item = fallbackData.auction_items.find(i => i.id === id);
    if (item) {
      item.base_price = basePrice;
      item.stock = stock;
      if (imageUrl !== null && imageUrl !== undefined && imageUrl !== '') {
        item.image_url = imageUrl;
      }
      saveFallback();
    }
    return { rows: [] };
  }

  console.warn(`[Query Simulator] Unhandled query pattern. Returning empty rows: "${queryClean}"`);
  return { rows: [] };
}

// Exportable query function
export const query = (text: string, params?: any[]) => {
  if (useFallback) {
    return Promise.resolve(querySimulator(text, params) as any);
  }
  return pool.query(text, params);
};

export async function initDatabase() {
  console.log('Testing connection to PostgreSQL database...');
  try {
    const client = await pool.connect();
    client.release();
    console.log('✅ PostgreSQL connection verified. Using server SQL DB.');
  } catch (error: any) {
    console.warn('⚠️ Could not connect to PostgreSQL database:', error.message);
    console.warn('➡️ Switching to built-in JSON file-based database fallback.');
    useFallback = true;
    loadFallback();
  }

  if (useFallback) {
    // Initialize simulation schema if empty
    return initFallbackSchema();
  }

  // Otherwise run normal PG schema creations
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'team', 'viewer'))
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) UNIQUE NOT NULL,
      initial_budget DECIMAL(12, 2) NOT NULL,
      remaining_budget DECIMAL(12, 2) NOT NULL,
      total_spent DECIMAL(12, 2) DEFAULT 0.00
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS auction_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      image_url TEXT,
      base_price DECIMAL(12, 2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'sold', 'unsold')),
      winning_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      final_price DECIMAL(12, 2),
      order_index INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 1
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bids (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES auction_items(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      bid_amount DECIMAL(12, 2) NOT NULL,
      bid_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES auction_items(id) ON DELETE CASCADE,
      team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      price DECIMAL(12, 2) NOT NULL,
      quantity INTEGER DEFAULT 1,
      purchase_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS auction_state (
      key VARCHAR(50) PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);

  // Seed demo data if users table is empty
  const userCheck = await query('SELECT COUNT(*) FROM users');
  const count = parseInt(userCheck.rows[0].count, 10);

  if (count === 0) {
    await seedDatabase();
  }
}

// Seed helper for PostgreSQL
async function seedDatabase() {
  console.log('Seeding PostgreSQL database with demo data for Circuit Arena: The Finals...');
  const adminHash = bcrypt.hashSync('iic@2026', 10);
  const teamHash = bcrypt.hashSync('team123', 10);
  const viewerHash = bcrypt.hashSync('viewer123', 10);

  const adminUser = await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id', ['iic student', adminHash, 'admin']);
  const team1User = await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id', ['teama', teamHash, 'team']);
  const team2User = await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id', ['teamb', teamHash, 'team']);
  const team3User = await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id', ['teamc', teamHash, 'team']);
  await query('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', ['viewer', viewerHash, 'viewer']);

  await query('INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, 0.00)', [team1User.rows[0].id, 'Team Alpha', 2000.00, 2000.00]);
  await query('INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, 0.00)', [team2User.rows[0].id, 'Team Beta', 2000.00, 2000.00]);
  await query('INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, 0.00)', [team3User.rows[0].id, 'Team Gamma', 2000.00, 2000.00]);

  await query("INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ('Transistors (PNP & NPN)', 'https://docs.google.com/uc?export=view&id=1ziSqU-ZJK95Fj5oHgrfh-6Y-6uxALYXY', 100.00, 'pending', 1, 10)");
  await query("INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ('sensor', 'https://docs.google.com/uc?export=view&id=12DKA3eAN5tkrZqRiB3MkBVxT2fC3OF3C', 300.00, 'pending', 2, 6)");
  await query("INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ('Relays', 'https://docs.google.com/uc?export=view&id=1GBs_U3ZuDfvKxyN-zlUe6pLyamgVywyM', 500.00, 'pending', 3, 3)");
  await query("INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ('IC', 'https://docs.google.com/uc?export=view&id=1Du8noFEuUQMgVV3DdJTIG5zrCXTSwmqq', 250.00, 'pending', 4, 9)");
  await query("INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ('Breadboard', 'https://docs.google.com/uc?export=view&id=1NYwZtdlwwuaN75Cc1gZGTSOyxK7qDM_y', 500.00, 'pending', 5, 6)");

  const initialState = { status: 'idle', currentItemId: null, timer: 0, highestBid: null, highestBidderTeamId: null, highestBidderName: null };
  await query("INSERT INTO auction_state (key, value) VALUES ($1, $2)", ['current_state', JSON.stringify(initialState)]);
  console.log('Seeded PostgreSQL successfully.');
}

// Fallback JSON seed
function initFallbackSchema() {
  if (fallbackData.users.length === 0) {
    console.log('Seeding fallback JSON database file with demo data for Circuit Arena: The Finals...');
    const adminHash = bcrypt.hashSync('iic@2026', 10);
    const teamHash = bcrypt.hashSync('team123', 10);
    const viewerHash = bcrypt.hashSync('viewer123', 10);

    fallbackData.users = [
      { id: 1, username: 'iic student', password_hash: adminHash, role: 'admin' },
      { id: 2, username: 'teama', password_hash: teamHash, role: 'team' },
      { id: 3, username: 'teamb', password_hash: teamHash, role: 'team' },
      { id: 4, username: 'teamc', password_hash: teamHash, role: 'team' },
      { id: 5, username: 'viewer', password_hash: viewerHash, role: 'viewer' },
    ];

    fallbackData.teams = [
      { id: 1, user_id: 2, name: 'Team Alpha', initial_budget: 2000.00, remaining_budget: 2000.00, total_spent: 0.00 },
      { id: 2, user_id: 3, name: 'Team Beta', initial_budget: 2000.00, remaining_budget: 2000.00, total_spent: 0.00 },
      { id: 3, user_id: 4, name: 'Team Gamma', initial_budget: 2000.00, remaining_budget: 2000.00, total_spent: 0.00 },
    ];

    fallbackData.auction_items = [
      { id: 1, name: 'Transistors (PNP & NPN)', image_url: 'https://docs.google.com/uc?export=view&id=1ziSqU-ZJK95Fj5oHgrfh-6Y-6uxALYXY', base_price: 100.00, status: 'pending', winning_team_id: null, final_price: null, order_index: 1, stock: 10 },
      { id: 2, name: 'sensor', image_url: 'https://docs.google.com/uc?export=view&id=12DKA3eAN5tkrZqRiB3MkBVxT2fC3OF3C', base_price: 300.00, status: 'pending', winning_team_id: null, final_price: null, order_index: 2, stock: 6 },
      { id: 3, name: 'Relays', image_url: 'https://docs.google.com/uc?export=view&id=1GBs_U3ZuDfvKxyN-zlUe6pLyamgVywyM', base_price: 500.00, status: 'pending', winning_team_id: null, final_price: null, order_index: 3, stock: 3 },
      { id: 4, name: 'IC', image_url: 'https://docs.google.com/uc?export=view&id=1Du8noFEuUQMgVV3DdJTIG5zrCXTSwmqq', base_price: 250.00, status: 'pending', winning_team_id: null, final_price: null, order_index: 4, stock: 9 },
      { id: 5, name: 'Breadboard', image_url: 'https://docs.google.com/uc?export=view&id=1NYwZtdlwwuaN75Cc1gZGTSOyxK7qDM_y', base_price: 500.00, status: 'pending', winning_team_id: null, final_price: null, order_index: 5, stock: 6 },
    ];

    fallbackData.auction_state = {
      current_state: {
        status: 'idle',
        currentItemId: null,
        timer: 0,
        highestBid: null,
        highestBidderTeamId: null,
        highestBidderName: null
      }
    };

    saveFallback();
    console.log('Seeded fallback JSON database successfully.');
  }
}
