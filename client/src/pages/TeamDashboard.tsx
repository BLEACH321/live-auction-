import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Clock, Trophy, History, CheckCircle, AlertTriangle } from 'lucide-react';

import { API_URL } from '../config';

interface Team {
  id: number;
  name: string;
  initial_budget: number;
  remaining_budget: number;
  total_spent: number;
}

interface AuctionItem {
  id: number;
  name: string;
  image_url: string | null;
  base_price: number;
  status: 'pending' | 'active' | 'sold' | 'unsold';
  winning_team_id: number | null;
  final_price: number | null;
  stock: number;
}

export const TeamDashboard: React.FC = () => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [teamInfo, setTeamInfo] = useState<Team | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [auctionState, setAuctionState] = useState<any>(null);
  const [biddingError, setBiddingError] = useState<string | null>(null);
  const [biddingSuccess, setBiddingSuccess] = useState<boolean>(false);
  const [recentBids, setRecentBids] = useState<any[]>([]);

  const fetchTeamAndItems = async () => {
    if (!user?.teamId) return;
    try {
      const teamsRes = await fetch(`${API_URL}/api/teams`);
      const teamsData = await teamsRes.json();
      const myTeam = teamsData.find((t: any) => t.id === user.teamId);
      if (myTeam) setTeamInfo(myTeam);

      const itemsRes = await fetch(`${API_URL}/api/items`);
      const itemsData = await itemsRes.json();
      setItems(itemsData);
    } catch (e) {
      console.error('Error fetching team details:', e);
    }
  };

  useEffect(() => {
    fetchTeamAndItems();

    if (!socket) return;

    socket.on('auction:state', (newState: any) => {
      setAuctionState(newState);
      if (newState.recentBids) {
        setRecentBids(newState.recentBids);
      }
    });

    socket.on('teams:update', (updatedTeams: Team[]) => {
      const myTeam = updatedTeams.find((t) => t.id === user?.teamId);
      if (myTeam) setTeamInfo(myTeam);
    });

    socket.on('items:update', (updatedItems: AuctionItem[]) => {
      setItems(updatedItems);
    });

    socket.on('auction:sold', () => {
      fetchTeamAndItems();
      setBiddingSuccess(false);
      setBiddingError(null);
    });

    socket.on('auction:unsold', () => {
      fetchTeamAndItems();
      setBiddingSuccess(false);
      setBiddingError(null);
    });

    socket.on('system:reset', () => {
      fetchTeamAndItems();
      setRecentBids([]);
      setBiddingSuccess(false);
      setBiddingError(null);
    });

    return () => {
      socket.off('auction:state');
      socket.off('teams:update');
      socket.off('items:update');
      socket.off('auction:sold');
      socket.off('auction:unsold');
      socket.off('system:reset');
    };
  }, [socket, user]);

  const activeItem = auctionState?.currentItem;
  const currentHighestBid = auctionState?.highestBid;
  const highestBidderId = auctionState?.highestBidderTeamId;

  // Next bid is exactly current highest bid + 25, or starting price + 25 (if no bids)
  // Let's calculate next bid amount
  const basePrice = activeItem ? Number(activeItem.base_price) : 0;
  const nextBidAmount = activeItem
    ? currentHighestBid !== null && currentHighestBid !== undefined
      ? currentHighestBid + 25
      : basePrice + 25
    : 0;

  const isHighestBidder = user?.teamId === highestBidderId;
  const hasBudget = teamInfo ? teamInfo.remaining_budget >= nextBidAmount : false;
  const isAuctionRunning = auctionState?.status === 'running' && auctionState?.timer > 0;

  const handlePlaceBid = () => {
    if (!socket || !activeItem || !isAuctionRunning || !hasBudget || isHighestBidder) return;

    setBiddingError(null);
    setBiddingSuccess(false);

    socket.emit('bid:place', {
      itemId: activeItem.id,
      bidAmount: nextBidAmount,
    }, (response: any) => {
      if (response?.error) {
        setBiddingError(response.error);
      } else {
        setBiddingSuccess(true);
        setTimeout(() => setBiddingSuccess(false), 2000);
      }
    });
  };

  // Get items purchased by THIS team
  const myPurchases = items.filter(item => item.winning_team_id === user?.teamId && item.status === 'sold');

  return (
    <div className="space-y-6">
      {/* Top Banner Team Stats Row */}
      {teamInfo && (
        <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[10px] font-mono text-arena-textMuted uppercase tracking-widest">// ACTIVE TEAM NODE</span>
              <h1 className="text-2xl font-display font-black text-white flex items-center gap-1.5 mt-0.5 uppercase tracking-wide">
                <Trophy className="text-arena-glow animate-pulse" size={24} />
                {teamInfo.name.toUpperCase()}
              </h1>
            </div>
            
            <div className="grid grid-cols-3 gap-4 w-full sm:w-auto">
              <div className="bg-arena-bg px-3 py-2 rounded border border-arena-border text-center font-mono">
                <span className="block text-[9px] text-arena-textMuted uppercase tracking-wider">STARTING COINS</span>
                <span className="text-sm font-bold text-slate-300">{teamInfo.initial_budget}</span>
              </div>
              <div className="bg-arena-bg px-3 py-2 rounded border border-arena-border text-center font-mono">
                <span className="block text-[9px] text-arena-textMuted uppercase tracking-wider">COINS SPENT</span>
                <span className="text-sm font-bold text-arena-glowPink">{teamInfo.total_spent}</span>
              </div>
              <div className="bg-arena-bg px-4 py-2 rounded border border-arena-border text-center glow-border-orange font-mono">
                <span className="block text-[9px] text-arena-textMuted uppercase tracking-wider">REMAINING COINS</span>
                <span className="text-lg font-black text-arena-glowGreen">{teamInfo.remaining_budget}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left/Center: Bidding Panel */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-arena-panel rounded border border-arena-border p-6 glow-border">
            <h2 className="text-base font-display font-black text-white uppercase tracking-widest mb-4 border-b border-arena-border pb-2 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isAuctionRunning ? 'bg-arena-glowGreen animate-pulse shadow-[0_0_8px_#00ff66]' : 'bg-slate-700'}`}></span>
              Live Component Block
            </h2>

            {activeItem ? (
              <div className="space-y-6">
                
                {/* Active Item Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Image wrapper */}
                  <div className="bg-arena-bg rounded border border-arena-border flex items-center justify-center p-2 h-64 overflow-hidden relative">
                    {activeItem.image_url ? (
                      <img src={activeItem.image_url} alt={activeItem.name} className="max-w-full max-h-full object-contain rounded" />
                    ) : (
                      <div className="text-arena-textMuted text-xs font-mono uppercase tracking-widest">// DATA LINK LINKING...</div>
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-arena-panel/90 border border-arena-border rounded text-[9px] font-mono text-arena-textMuted uppercase tracking-wider">
                      ITEM #{activeItem.id}
                    </span>
                  </div>

                  {/* Pricing stats */}
                  <div className="flex flex-col justify-between space-y-4">
                    <div>
                      <span className="text-xs font-mono text-arena-glow uppercase tracking-widest">// CURRENT GRID COMPONENT</span>
                      <h3 className="text-2xl font-display font-black text-white mt-1 leading-tight uppercase tracking-wide">{activeItem.name.toUpperCase()}</h3>
                      <p className="text-xs text-arena-textMuted mt-1 font-mono uppercase">Reserve Price: <span className="font-semibold text-slate-200 font-sans">{activeItem.base_price} coins</span></p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-arena-bg/50 p-4 rounded border border-arena-border">
                      <div>
                        <span className="block text-[9px] text-arena-textMuted font-mono uppercase tracking-wider">TIMER</span>
                        <div className="text-3xl font-display font-black text-white flex items-center gap-1.5 mt-0.5">
                          <Clock className={`w-5 h-5 ${auctionState.timer < 10 ? 'text-arena-glowPink animate-pulse glow-text-pink' : 'text-arena-accent'}`} />
                          <span className={auctionState.timer < 10 ? 'text-arena-glowPink' : 'text-white'}>{auctionState.timer}s</span>
                        </div>
                      </div>
                      <div>
                        <span className="block text-[9px] text-arena-textMuted font-mono uppercase tracking-wider">CURRENT BID</span>
                        <div className="text-3xl font-display font-black text-arena-glowGreen mt-0.5">
                          {currentHighestBid !== null ? `${currentHighestBid}` : '---'}
                        </div>
                        {auctionState?.highestBidderName && (
                          <span className="text-[10px] text-arena-textMuted truncate block max-w-full">
                            by {auctionState.highestBidderName.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dynamic statuses */}
                    <div className="space-y-1.5 font-mono text-xs uppercase">
                      {isHighestBidder && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-arena-glowGreen/10 border border-arena-glowGreen/20 text-arena-glowGreen rounded">
                          <CheckCircle size={14} /> Leading Bid secure
                        </div>
                      )}
                      {!hasBudget && activeItem && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-arena-glowPink/10 border border-arena-glowPink/20 text-arena-glowPink rounded animate-pulse">
                          <AlertTriangle size={14} /> Budget Alert: Exceeds wallet limit
                        </div>
                      )}
                      {!isAuctionRunning && (
                        <div className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded">
                          <AlertTriangle size={14} /> Bid locks active (moderated)
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Big PLACE BID Button Interface */}
                <div className="border-t border-arena-border/50 pt-6 mt-4 font-mono">
                  <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                    <div>
                      <span className="block text-[9px] text-arena-textMuted uppercase tracking-wider mb-1">HIGHEST BIDDER</span>
                      <span className="text-sm font-display font-bold text-white uppercase tracking-wide">
                        {auctionState?.highestBidderName ? auctionState.highestBidderName.toUpperCase() : 'NONE'}
                      </span>
                      <span className="block text-[9px] text-arena-textMuted uppercase tracking-wider mt-2.5 mb-1">BID LEVEL</span>
                      <span className="text-lg font-display font-black text-arena-glow">
                        {nextBidAmount} Coins
                      </span>
                    </div>

                    <div className="flex-1 max-w-md">
                      <button
                        onClick={handlePlaceBid}
                        disabled={!isAuctionRunning || !hasBudget || isHighestBidder}
                        className={`w-full py-5 px-6 rounded text-lg font-display font-black tracking-widest uppercase transition-all shadow-md active:scale-[0.98] cursor-pointer ${
                          isHighestBidder
                            ? 'bg-arena-glowGreen/10 cursor-not-allowed border border-arena-glowGreen/20 text-arena-glowGreen/70'
                            : !isAuctionRunning
                            ? 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'
                            : !hasBudget
                            ? 'bg-arena-glowPink/15 text-arena-glowPink cursor-not-allowed border border-arena-glowPink/25'
                            : 'bg-gradient-to-r from-arena-accent to-arena-glow hover:brightness-110 hover:shadow-[0_0_15px_rgba(255,107,0,0.3)] ring-1 ring-arena-accent ring-offset-2 ring-offset-arena-bg'
                        }`}
                      >
                        {isHighestBidder
                          ? 'HIGH BID HELD'
                          : !isAuctionRunning
                          ? 'BIDDING LOCKED'
                          : !hasBudget
                          ? 'INSUFFICIENT FUNDS'
                          : `SUBMIT BID (${nextBidAmount} Coins)`}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Local Response logs */}
                {biddingError && (
                  <div className="p-3 bg-red-950/50 border border-red-500/50 text-red-200 text-xs rounded-md">
                    {biddingError}
                  </div>
                )}
                {biddingSuccess && (
                  <div className="p-3 bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-xs rounded-md">
                    Bid successfully registered on network.
                  </div>
                )}

              </div>
            ) : (
              <div className="text-center py-16 text-arena-textMuted">
                <Clock className="w-12 h-12 mx-auto text-arena-border mb-3 animate-pulse" />
                <h3 className="font-bold text-white text-lg">STAND BY FOR BLOCK</h3>
                <p className="text-xs text-arena-textMuted max-w-xs mx-auto mt-1">
                  The auctioneer will load the next active component to the grid block shortly.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Bids log & Purchases */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Bid History */}
          <div className="bg-arena-panel rounded border border-arena-border p-5">
            <h2 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <History size={16} className="text-arena-glow animate-pulse" />
              Round Bids
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {recentBids.length > 0 ? (
                recentBids.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    className={`flex justify-between items-center p-2 rounded text-xs border font-mono ${b.team_id === user?.teamId ? 'bg-orange-950/20 border-arena-accent/40 text-white' : 'bg-arena-bg border-transparent text-slate-400'}`}
                  >
                    <span className={`font-bold ${b.team_id === user?.teamId ? 'text-arena-accent' : 'text-slate-300'}`}>
                      {b.team_name.toUpperCase()} {b.team_id === user?.teamId && '(You)'}
                    </span>
                    <span className="font-bold text-arena-glow">{b.bid_amount} Coins</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-arena-textMuted text-xs font-mono uppercase tracking-wider">
                  NO BIDS IN LOG
                </div>
              )}
            </div>
          </div>

          {/* Purchased Items List */}
          <div className="bg-arena-panel rounded border border-arena-border p-5">
            <h2 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Trophy size={16} className="text-arena-accent animate-pulse" />
              Acquisitions ({myPurchases.length})
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {myPurchases.length > 0 ? (
                myPurchases.map((p) => (
                  <div key={p.id} className="p-2.5 bg-arena-bg rounded border border-arena-border flex justify-between items-center text-xs font-mono">
                    <div>
                      <h4 className="font-bold text-slate-200">{p.name.toUpperCase()}</h4>
                      <span className="text-[9px] text-arena-textMuted">ID: #{p.id}</span>
                    </div>
                    <span className="font-bold text-arena-glowGreen text-sm">{p.final_price} Coins</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-arena-textMuted text-xs font-mono uppercase tracking-wider">
                  NO ACQUISITIONS RECORDED
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
