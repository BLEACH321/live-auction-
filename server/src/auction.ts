import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from './db';
import { LiveAuctionState, AuctionItem, Bid, Team } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'circuit_arena_secret_key_123!@#';

// In-memory master state
let state: LiveAuctionState = {
  status: 'idle',
  currentItemId: null,
  timer: 0,
  highestBid: null,
  highestBidderTeamId: null,
  highestBidderName: null,
};

let activeItemBasePrice: number = 0;
let timerInterval: NodeJS.Timeout | null = null;
let ioInstance: Server | null = null;

// Synchronous budget cache to prevent race conditions on yields
export const teamBudgetsCache = new Map<number, { name: string; remaining_budget: number }>();

export async function reloadTeamBudgetsCache() {
  try {
    const res = await query('SELECT id, name, remaining_budget FROM teams');
    teamBudgetsCache.clear();
    for (const row of res.rows) {
      teamBudgetsCache.set(row.id, {
        name: row.name,
        remaining_budget: Number(row.remaining_budget),
      });
    }
    console.log(`[Cache] Synchronized ${teamBudgetsCache.size} teams' budget limits.`);
  } catch (e) {
    console.error('[Cache] Failed to reload team budgets:', e);
  }
}

// Helper to broadcast state to all clients
export async function broadcastState() {
  if (!ioInstance) return;

  try {
    let currentItem: AuctionItem | null = null;
    let recentBids: any[] = [];

    if (state.currentItemId) {
      const itemRes = await query('SELECT * FROM auction_items WHERE id = $1', [state.currentItemId]);
      if (itemRes.rows.length > 0) {
        currentItem = itemRes.rows[0];
      }

      const bidsRes = await query(
        `SELECT b.*, t.name as team_name 
         FROM bids b 
         JOIN teams t ON b.team_id = t.id 
         WHERE b.item_id = $1 
         ORDER BY b.bid_amount DESC, b.bid_time DESC 
         LIMIT 10`,
        [state.currentItemId]
      );
      recentBids = bidsRes.rows;
    }

    const payload = {
      ...state,
      currentItem,
      recentBids,
    };

    ioInstance.emit('auction:state', payload);
  } catch (error) {
    console.error('Error broadcasting state:', error);
  }
}

// Save state to database so it survives restarts
async function saveStateToDb() {
  try {
    await query(
      'INSERT INTO auction_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      ['current_state', JSON.stringify(state)]
    );
  } catch (error) {
    console.error('Error saving state to DB:', error);
  }
}

// Load state from DB on server start
export async function loadStateFromDb() {
  try {
    const res = await query('SELECT value FROM auction_state WHERE key = $1', ['current_state']);
    if (res.rows.length > 0) {
      state = res.rows[0].value;
      console.log('Restored auction state:', state);

      // If it was running, we set it to paused so it doesn't run with dead intervals
      if (state.status === 'running') {
        state.status = 'paused';
      }

      // Restore active item base price if item is set
      if (state.currentItemId) {
        const itemRes = await query('SELECT base_price FROM auction_items WHERE id = $1', [state.currentItemId]);
        if (itemRes.rows.length > 0) {
          activeItemBasePrice = Number(itemRes.rows[0].base_price);
        }
      }
    }
    // Also load team budget map
    await reloadTeamBudgetsCache();
  } catch (error) {
    console.error('Error loading state from DB:', error);
  }
}

// Handle timer expiration
async function handleTimerExpiry() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const itemId = state.currentItemId;
  if (!itemId) return;

  try {
    if (state.highestBid !== null && state.highestBidderTeamId !== null) {
      const winningBid = state.highestBid;
      const teamId = state.highestBidderTeamId;

      // 1. Fetch team budget from DB just to double-check
      const teamRes = await query('SELECT * FROM teams WHERE id = $1', [teamId]);
      if (teamRes.rows.length === 0) {
        throw new Error('Winning team not found');
      }

      const team: Team = teamRes.rows[0];
      if (Number(team.remaining_budget) < winningBid) {
        console.warn(`Winning team ${team.name} has insufficient budget at closing. Marking unsold.`);
        await query("UPDATE auction_items SET status = 'unsold' WHERE id = $1", [itemId]);
        state.status = 'idle';
        state.currentItemId = null;
        state.highestBid = null;
        state.highestBidderTeamId = null;
        state.highestBidderName = null;
        state.timer = 0;
        await saveStateToDb();
        await broadcastState();
        if (ioInstance) ioInstance.emit('auction:unsold', { itemId, message: 'Insufficient budget at closing' });
        return;
      }

      // 2. Perform database updates in a TRANSACTION
      await query('BEGIN');
      
      // Update team budget
      await query(
        `UPDATE teams 
         SET remaining_budget = remaining_budget - $1, 
             total_spent = total_spent + $1 
         WHERE id = $2`,
        [winningBid, teamId]
      );

      // Update item status
      await query(
        `UPDATE auction_items 
         SET status = 'sold', 
             winning_team_id = $1, 
             final_price = $2 
         WHERE id = $3`,
        [teamId, winningBid, itemId]
      );

      // Insert purchase log
      await query(
        `INSERT INTO purchases (item_id, team_id, price) 
         VALUES ($1, $2, $3)`,
        [itemId, teamId, winningBid]
      );

      await query('COMMIT');

      // Update in-memory budgets cache
      const cachedTeam = teamBudgetsCache.get(teamId);
      if (cachedTeam) {
        cachedTeam.remaining_budget -= winningBid;
      }

      // Update state
      state.status = 'idle';
      state.currentItemId = null;
      state.highestBid = null;
      state.highestBidderTeamId = null;
      state.highestBidderName = null;
      state.timer = 0;
      activeItemBasePrice = 0;

      await saveStateToDb();
      await broadcastState();

      if (ioInstance) {
        ioInstance.emit('auction:sold', {
          itemId,
          winningTeamId: teamId,
          winningTeamName: team.name,
          price: winningBid,
        });
        // Send global team budget updates
        const allTeamsRes = await query('SELECT * FROM teams');
        ioInstance.emit('teams:update', allTeamsRes.rows);
      }

      console.log(`Item ${itemId} SOLD to Team ID ${teamId} for ${winningBid} Coins.`);
    } else {
      // Unsold
      await query("UPDATE auction_items SET status = 'unsold' WHERE id = $1", [itemId]);
      
      state.status = 'idle';
      state.currentItemId = null;
      state.highestBid = null;
      state.highestBidderTeamId = null;
      state.highestBidderName = null;
      state.timer = 0;
      activeItemBasePrice = 0;

      await saveStateToDb();
      await broadcastState();

      if (ioInstance) {
        ioInstance.emit('auction:unsold', { itemId });
      }

      console.log(`Item ${itemId} went UNSOLD`);
    }
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error during timer expiry processing:', error);
  }
}

// Start Countdown Interval
function startCountdown() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    if (state.status === 'running') {
      if (state.timer > 0) {
        state.timer -= 1;
        if (ioInstance) {
          ioInstance.emit('auction:timer', { timer: state.timer });
        }
        await saveStateToDb();
      } else {
        await handleTimerExpiry();
      }
    }
  }, 1000);
}

// Initializing WebSocket listeners
export function initAuction(io: Server) {
  ioInstance = io;

  // Socket middleware for authorization
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        return next(new Error('Authentication error: Invalid token'));
      }
      socket.data.user = decoded;
      next();
    });
  });

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.username} (${user.role})`);

    // Immediately send current state
    let currentItem: AuctionItem | null = null;
    let recentBids: any[] = [];
    try {
      if (state.currentItemId) {
        const itemRes = await query('SELECT * FROM auction_items WHERE id = $1', [state.currentItemId]);
        currentItem = itemRes.rows[0] || null;

        const bidsRes = await query(
          `SELECT b.*, t.name as team_name 
           FROM bids b 
           JOIN teams t ON b.team_id = t.id 
           WHERE b.item_id = $1 
           ORDER BY b.bid_amount DESC, b.bid_time DESC 
           LIMIT 10`,
          [state.currentItemId]
        );
        recentBids = bidsRes.rows;
      }
      socket.emit('auction:state', {
        ...state,
        currentItem,
        recentBids,
      });
    } catch (e) {
      console.error(e);
    }

    // --- TEAM EVENTS ---
    
    // Bidding Event with strict sequential concurrency locking
    socket.on('bid:place', async (data: { itemId: number; bidAmount: number }, callback: Function) => {
      if (user.role !== 'team' || !user.teamId) {
        return callback({ error: 'Only team accounts can place bids.' });
      }

      // --- SYNCHRONOUS CHECKS (Thread-safe concurrency block) ---
      if (state.status !== 'running' || state.timer <= 0) {
        return callback({ error: 'Bidding is locked. Auction is not active.' });
      }

      if (state.currentItemId !== data.itemId) {
        return callback({ error: 'Component mismatch. Please refresh.' });
      }

      // Expected next bid is exactly current highest bid + 25, or starting price + 25 (if no bids)
      // Wait, let's verify if first bid is base_price + 25 or exactly base_price?
      // "Starting Bid: 200. Team A -> 225." So starting bid is 200, and first bid is 225.
      // That means expected bid is starting_price + 25.
      const expectedBid = (state.highestBid !== null ? state.highestBid : activeItemBasePrice) + 25;
      
      const requestedBid = Number(data.bidAmount);
      if (requestedBid !== expectedBid) {
        return callback({ error: `Bid rejected. Next valid bid amount is ${expectedBid} Coins.` });
      }

      // Retrieve team budget from synchronous in-memory cache
      const cachedTeam = teamBudgetsCache.get(user.teamId);
      if (!cachedTeam) {
        return callback({ error: 'Team records not found in server cache.' });
      }

      if (cachedTeam.remaining_budget < expectedBid) {
        return callback({ error: 'Insufficient Circuit Coins to place bid!' });
      }

      // Cannot bid against yourself
      if (state.highestBidderTeamId === user.teamId) {
        return callback({ error: 'You are already holding the highest bid!' });
      }

      // --- COMMIT STATE SYNCHRONOUSLY to lock out race conditions ---
      state.highestBid = expectedBid;
      state.highestBidderTeamId = user.teamId;
      state.highestBidderName = cachedTeam.name;

      // Auto-increment timer on late-game bids (anti-snipe, e.g., reset to 10s if timer < 10)
      if (state.timer < 10) {
        state.timer = 10;
        io.emit('auction:timer', { timer: state.timer });
      }

      // Trigger asynchronous database updates
      const winningAmount = expectedBid;
      const itemId = data.itemId;
      const teamId = user.teamId;
      const teamName = cachedTeam.name;

      // Async DB write
      query('INSERT INTO bids (item_id, team_id, bid_amount) VALUES ($1, $2, $3)', [itemId, teamId, winningAmount])
        .then(() => {
          saveStateToDb();
          broadcastState();
          
          // Callback success
          callback({ success: true, bidAmount: winningAmount });

          // Broadcast notifications
          io.emit('bid:new', {
            itemId,
            teamName,
            bidAmount: winningAmount,
          });
        })
        .catch((err) => {
          console.error('[DB] Failed to log bid:', err);
          // Rollback state in case of server DB error
          if (state.highestBid === winningAmount && state.highestBidderTeamId === teamId) {
            state.highestBid = null; // simple reset fallback
            state.highestBidderTeamId = null;
            state.highestBidderName = null;
            broadcastState();
          }
          callback({ error: 'Failed to write bid to database.' });
        });
    });

    // --- ADMIN EVENTS ---
    
    // Start component bidding
    socket.on('admin:start', async (data: { itemId: number; duration: number }, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      try {
        const itemRes = await query('SELECT * FROM auction_items WHERE id = $1', [data.itemId]);
        if (itemRes.rows.length === 0) {
          return callback({ error: 'Component not found' });
        }

        const item = itemRes.rows[0];
        activeItemBasePrice = Number(item.base_price);

        await query("UPDATE auction_items SET status = 'active' WHERE id = $1", [data.itemId]);

        state.status = 'running';
        state.currentItemId = data.itemId;
        state.timer = data.duration || 30;
        state.highestBid = null;
        state.highestBidderTeamId = null;
        state.highestBidderName = null;

        await saveStateToDb();
        startCountdown();
        await broadcastState();

        callback({ success: true });
        console.log(`Admin launched component ${item.name}`);
      } catch (e) {
        console.error(e);
        callback({ error: 'Failed to launch component auction' });
      }
    });

    // Pause timer
    socket.on('admin:pause', (data: any, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      if (state.status !== 'running') {
        return callback({ error: 'Auction timer is not running' });
      }

      state.status = 'paused';
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      saveStateToDb().then(broadcastState);
      callback({ success: true });
      console.log('Admin paused the auction clock.');
    });

    // Resume timer
    socket.on('admin:resume', (data: any, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      if (state.status !== 'paused') {
        return callback({ error: 'Auction timer is not paused' });
      }

      state.status = 'running';
      startCountdown();
      saveStateToDb().then(broadcastState);
      callback({ success: true });
      console.log('Admin resumed the auction clock.');
    });

    // Sell Component early (Trigger immediate expiry)
    socket.on('admin:sell', async (data: any, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      if (!state.currentItemId) {
        return callback({ error: 'No active component on block' });
      }

      await handleTimerExpiry();
      callback({ success: true });
    });

    // Mark Unsold early
    socket.on('admin:unsold', async (data: any, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      if (!state.currentItemId) {
        return callback({ error: 'No active component on block' });
      }

      state.highestBid = null;
      state.highestBidderTeamId = null;
      state.highestBidderName = null;

      await handleTimerExpiry();
      callback({ success: true });
    });

    // Reset current active state
    socket.on('admin:reset', async (data: any, callback: Function) => {
      if (user.role !== 'admin') {
        return callback({ error: 'Unauthorized command' });
      }

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      state.status = 'idle';
      state.currentItemId = null;
      state.timer = 0;
      state.highestBid = null;
      state.highestBidderTeamId = null;
      state.highestBidderName = null;
      activeItemBasePrice = 0;

      await saveStateToDb();
      await broadcastState();
      callback({ success: true });
      console.log('Admin cleared block state');
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.username}`);
    });
  });
}
