export type UserRole = 'admin' | 'team' | 'viewer';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  password_hash?: string;
}

export interface Team {
  id: number;
  user_id: number;
  name: string;
  initial_budget: number;
  remaining_budget: number;
  total_spent: number;
}

export interface AuctionItem {
  id: number;
  name: string;
  image_url: string | null;
  base_price: number;
  status: 'pending' | 'active' | 'sold' | 'unsold';
  winning_team_id: number | null;
  final_price: number | null;
  order_index?: number;
  stock: number;
}

export interface Bid {
  id: number;
  item_id: number;
  team_id: number;
  team_name?: string;
  bid_amount: number;
  bid_time: Date;
}

export interface LiveAuctionState {
  status: 'idle' | 'running' | 'paused' | 'completed';
  currentItemId: number | null;
  timer: number; // remaining seconds
  highestBid: number | null;
  highestBidderTeamId: number | null;
  highestBidderName: string | null;
}
