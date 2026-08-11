import express, { Request, Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

import authRouter, { authenticateToken, requireRole, AuthenticatedRequest } from './auth';
import { initDatabase, query } from './db';
import { initAuction, loadStateFromDb, broadcastState, reloadTeamBudgetsCache } from './auction';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow connections from all origins for testing speed
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);

// Public & Protected REST Endpoints

// Get all teams
app.get('/api/teams', async (req: Request, res: Response) => {
  try {
    const teamsRes = await query('SELECT * FROM teams ORDER BY name ASC');
    return res.json(teamsRes.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Admin: Add a team
app.post('/api/admin/teams', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, username, password, initialBudget } = req.body;

  if (!name || !username || !password || initialBudget === undefined) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const budget = Number(initialBudget);
  if (isNaN(budget) || budget < 0) {
    return res.status(400).json({ error: 'Invalid initial budget' });
  }

  try {
    // Check if username already exists
    const userCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if team name already exists
    const teamCheck = await query('SELECT id FROM teams WHERE name = $1', [name]);
    if (teamCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Team name already exists' });
    }

    // Create User & Team in Transaction
    await query('BEGIN');
    const passHash = bcrypt.hashSync(password, 10);
    const userRes = await query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [username, passHash, 'team']
    );

    const userId = userRes.rows[0].id;
    await query(
      'INSERT INTO teams (user_id, name, initial_budget, remaining_budget, total_spent) VALUES ($1, $2, $3, $4, 0.00)',
      [userId, name, budget, budget]
    );

    await query('COMMIT');

    // Update team budget cache
    await reloadTeamBudgetsCache();

    // Notify all clients of new team list
    const allTeams = await query('SELECT * FROM teams ORDER BY name ASC');
    io.emit('teams:update', allTeams.rows);

    return res.status(201).json({ success: true, message: 'Team created successfully' });
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error adding team:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Set budget
app.post('/api/admin/teams/budget', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { teamId, budget } = req.body;

  if (teamId === undefined || budget === undefined) {
    return res.status(400).json({ error: 'Team ID and budget are required' });
  }

  const amt = Number(budget);
  if (isNaN(amt) || amt < 0) {
    return res.status(400).json({ error: 'Invalid budget value' });
  }

  try {
    await query(
      'UPDATE teams SET initial_budget = $1, remaining_budget = $1, total_spent = 0.00 WHERE id = $2',
      [amt, teamId]
    );
    // Clear any purchases this team made since we are resetting budget
    await query('UPDATE auction_items SET status = \'pending\', winning_team_id = NULL, final_price = NULL WHERE winning_team_id = $1', [teamId]);
    await query('DELETE FROM purchases WHERE team_id = $1', [teamId]);
    await query('DELETE FROM bids WHERE team_id = $1', [teamId]);

    // Update team budget cache
    await reloadTeamBudgetsCache();

    const allTeams = await query('SELECT * FROM teams ORDER BY name ASC');
    io.emit('teams:update', allTeams.rows);
    await broadcastState();

    return res.json({ success: true, message: 'Budget set and team history cleared' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to update budget' });
  }
});

// Get all auction items
app.get('/api/items', async (req: Request, res: Response) => {
  try {
    const itemsRes = await query('SELECT * FROM auction_items ORDER BY order_index ASC, id ASC');
    return res.json(itemsRes.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Admin: Add an auction item
app.post('/api/admin/items', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, imageUrl, basePrice, stock } = req.body;

  if (!name || basePrice === undefined) {
    return res.status(400).json({ error: 'Name and base price are required' });
  }

  const price = Number(basePrice);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: 'Invalid base price' });
  }

  const qty = stock !== undefined ? Number(stock) : 1;
  if (isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: 'Invalid stock value' });
  }

  try {
    // Get max order index
    const maxOrderRes = await query('SELECT MAX(order_index) FROM auction_items');
    const nextOrder = (maxOrderRes.rows[0].max || 0) + 1;

    await query(
      'INSERT INTO auction_items (name, image_url, base_price, status, order_index, stock) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, imageUrl || null, price, 'pending', nextOrder, qty]
    );

    // Notify clients of item list change
    const allItems = await query('SELECT * FROM auction_items ORDER BY order_index ASC, id ASC');
    io.emit('items:update', allItems.rows);

    return res.status(201).json({ success: true, message: 'Auction item added successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to add item' });
  }
});

// Admin: Update component stock
app.post('/api/admin/items/stock', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  const { itemId, stock } = req.body;

  if (itemId === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Item ID and stock are required' });
  }

  const qty = Number(stock);
  if (isNaN(qty) || qty < 0) {
    return res.status(400).json({ error: 'Invalid stock value' });
  }

  try {
    await query('UPDATE auction_items SET stock = $1 WHERE id = $2', [qty, itemId]);

    // Notify clients of item list change
    const allItems = await query('SELECT * FROM auction_items ORDER BY order_index ASC, id ASC');
    io.emit('items:update', allItems.rows);

    return res.json({ success: true, message: 'Stock updated successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update component stock' });
  }
});

// Get auction results / standings
app.get('/api/results', async (req: Request, res: Response) => {
  try {
    const itemsRes = await query(
      `SELECT ai.*, t.name as team_name 
       FROM auction_items ai 
       LEFT JOIN teams t ON ai.winning_team_id = t.id 
       WHERE ai.status = 'sold' 
       ORDER BY ai.final_price DESC`
    );

    const teamsRes = await query(
      `SELECT t.*, COUNT(ai.id) as items_purchased 
       FROM teams t 
       LEFT JOIN auction_items ai ON t.id = ai.winning_team_id AND ai.status = 'sold'
       GROUP BY t.id 
       ORDER BY t.remaining_budget DESC`
    );

    return res.json({
      soldItems: itemsRes.rows,
      teamStandings: teamsRes.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Admin: Reset entire system
app.post('/api/admin/reset-system', authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await query('BEGIN');
    
    // 1. Delete bids
    await query('DELETE FROM bids');
    
    // 2. Delete purchases
    await query('DELETE FROM purchases');

    // 3. Reset item statuses
    await query("UPDATE auction_items SET status = 'pending', winning_team_id = NULL, final_price = NULL");

    // 4. Reset team budgets
    await query("UPDATE teams SET remaining_budget = initial_budget, total_spent = 0.00");

    // 5. Reset global state
    const resetState = {
      status: 'idle',
      currentItemId: null,
      timer: 0,
      highestBid: null,
      highestBidderTeamId: null,
      highestBidderName: null
    };
    await query(
      'UPDATE auction_state SET value = $1 WHERE key = $2',
      [JSON.stringify(resetState), 'current_state']
    );

    await query('COMMIT');

    // Broadcast reset state to everyone
    io.emit('system:reset', { success: true });
    
    // Fetch refreshed lists and emit
    const allTeams = await query('SELECT * FROM teams ORDER BY name ASC');
    io.emit('teams:update', allTeams.rows);

    const allItems = await query('SELECT * FROM auction_items ORDER BY order_index ASC, id ASC');
    io.emit('items:update', allItems.rows);

    // Call local in-memory reset
    // We can force reload state
    await loadStateFromDb();
    await reloadTeamBudgetsCache();
    await broadcastState();

    return res.json({ success: true, message: 'System reset completed successfully' });
  } catch (error) {
    await query('ROLLBACK');
    console.error('System reset error:', error);
    return res.status(500).json({ error: 'Failed to reset system' });
  }
});

// Start Servers
async function start() {
  try {
    // 1. Connect and initialize DB
    await initDatabase();

    // 2. Load active auction state from DB
    await loadStateFromDb();

    // 3. Initialize Socket.IO handlers
    initAuction(io);

    // 4. Run Express server
    server.listen(PORT, () => {
      console.log(`⚡ Server running on port http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start application server:', error);
    process.exit(1);
  }
}

start();
