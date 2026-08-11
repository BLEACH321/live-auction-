import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { TrendingUp, Trophy, Radio, AlertCircle } from 'lucide-react';

interface SoldResult {
  itemId: number;
  itemName: string;
  winningTeamName: string;
  price: number;
}

interface UnsoldResult {
  itemId: number;
  itemName: string;
}

export const PublicLive: React.FC = () => {
  const { socket, connected } = useSocket();
  const [auctionState, setAuctionState] = useState<any>(null);
  const [recentBids, setRecentBids] = useState<any[]>([]);

  // Persistent result overlays for between rounds
  const [lastSold, setLastSold] = useState<SoldResult | null>(null);
  const [lastUnsold, setLastUnsold] = useState<UnsoldResult | null>(null);
  const [localTimer, setLocalTimer] = useState<number>(0);

  useEffect(() => {
    if (auctionState?.status === 'running' && auctionState?.bidDeadline) {
      const updateTimer = () => {
        const rem = Math.max(0, Math.ceil((auctionState.bidDeadline - Date.now()) / 1000));
        setLocalTimer(rem);
      };
      updateTimer();
      const interval = setInterval(updateTimer, 100);
      return () => clearInterval(interval);
    } else {
      setLocalTimer(auctionState?.timer || 0);
    }
  }, [auctionState?.bidDeadline, auctionState?.timer, auctionState?.status]);

  useEffect(() => {
    if (!socket) return;

    socket.on('auction:state', (newState: any) => {
      setAuctionState(newState);
      if (newState.recentBids) {
        setRecentBids(newState.recentBids);
      }

      // If a new item is running or active, clear the previous round result banner
      if (newState.status === 'running' || newState.status === 'paused') {
        setLastSold(null);
        setLastUnsold(null);
      }
    });

    socket.on('auction:timer', (data: { timer: number; bidDeadline: number | null }) => {
      setAuctionState((prev: any) => (prev ? { ...prev, timer: data.timer, bidDeadline: data.bidDeadline } : null));
    });

    socket.on('auction:sold', (data: any) => {
      if (auctionState?.currentItem) {
        setLastSold({
          itemId: data.itemId,
          itemName: auctionState.currentItem.name,
          winningTeamName: data.winningTeamName,
          price: data.price,
        });
      }
    });

    socket.on('auction:unsold', (data: any) => {
      if (auctionState?.currentItem) {
        setLastUnsold({
          itemId: data.itemId,
          itemName: auctionState.currentItem.name,
        });
      }
    });

    socket.on('system:reset', () => {
      setLastSold(null);
      setLastUnsold(null);
      setRecentBids([]);
    });

    return () => {
      socket.off('auction:state');
      socket.off('auction:timer');
      socket.off('auction:sold');
      socket.off('auction:unsold');
      socket.off('system:reset');
    };
  }, [socket, auctionState]);

  const activeItem = auctionState?.currentItem;
  const currentHighestBid = auctionState?.highestBid;

  return (
    <div className="min-h-[85vh] flex flex-col justify-between py-4">
      {/* Header Banner */}
      <div className="flex justify-between items-center border-b border-arena-border pb-4 mb-6">
        <div>
          <h1 className="text-4xl font-display font-black tracking-wider text-white glow-text-orange flex items-center gap-3 uppercase">
            <Radio className="text-arena-accent animate-pulse" size={32} />
            CIRCUIT <span className="text-arena-glow">ARENA</span>
          </h1>
          <p className="text-[10px] text-arena-textMuted font-mono tracking-widest mt-1">// LIVE BROADCAST PROTOCOL ENABLED</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-3.5 h-3.5 rounded-full ${connected ? 'bg-arena-glowGreen animate-pulse shadow-[0_0_10px_rgba(0,255,102,0.4)]' : 'bg-arena-glowPink'}`}></span>
          <span className="text-xs font-mono text-arena-textMuted uppercase tracking-wider">
            {connected ? 'BROADCAST ONLINE' : 'BROADCAST OFFLINE'}
          </span>
        </div>
      </div>

      {/* Main Grid: optimised for high readability */}
      {activeItem ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          
          {/* Left panel (65% width): Component Graphic */}
          <div className="lg:col-span-8 bg-arena-panel rounded border border-arena-border p-6 flex flex-col justify-between glow-border relative overflow-hidden">
            
            <div className="absolute top-0 right-0 w-32 h-32 bg-arena-glow/5 rounded-full filter blur-2xl"></div>

            <div className="space-y-4">
              <span className="inline-flex px-3 py-1 bg-arena-accent/10 border border-arena-accent/20 rounded text-xs font-mono text-arena-accent uppercase tracking-widest">
                Active Component Block
              </span>
              <h2 className="text-4xl font-display font-black text-white tracking-wider leading-tight uppercase">
                {activeItem.name}
              </h2>
              <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
                <span className="text-sm font-bold text-arena-glowGreen bg-arena-glowGreen/10 border border-arena-glowGreen/20 px-2.5 py-0.5 rounded">
                  QUANTITY: {activeItem.stock}
                </span>
                <p className="text-xs text-arena-textMuted font-mono uppercase tracking-wider">
                  STARTING RESERVE: <span className="text-slate-200 font-bold font-sans">{activeItem.base_price} Circuit Coins</span>
                </p>
              </div>
            </div>

            {/* Display large item graphic */}
            <div className="my-6 bg-arena-bg border border-arena-border/60 rounded-md p-3 flex items-center justify-center h-80 relative">
              {activeItem.image_url ? (
                <img src={activeItem.image_url} alt="" className="max-w-full max-h-full object-contain rounded animate-pulse" />
              ) : (
                <div className="text-arena-textMuted text-sm font-mono uppercase tracking-widest">
                  CIRCUIT DATA GRID ONLINE...
                </div>
              )}
            </div>

            <div className="border-t border-arena-border pt-4 text-xs font-mono text-arena-textMuted flex justify-between items-center">
              <span>CIRCUIT ARENA ENGINEERING COMMITTEE</span>
              <span>ITEM SERIAL #{activeItem.id}</span>
            </div>
          </div>

          {/* Right Panel (35% width): Large stats & bid lists */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-6">
            
            {/* Timer & High Bid Panels */}
            <div className="space-y-6">
              
              {/* Massive Timer panel */}
              <div className={`bg-arena-panel rounded border p-6 text-center relative overflow-hidden transition-all duration-300 ${localTimer < 10 ? 'glow-border-pink border-arena-glowPink/40' : 'border-arena-border'}`}>
                <span className="block text-xs font-mono text-arena-textMuted mb-2 tracking-widest uppercase">// COUNTDOWN SECONDS</span>
                <div className={`text-6xl font-display font-black tracking-tighter ${localTimer < 10 ? 'text-arena-glowPink animate-pulse glow-text-pink' : 'text-white'}`}>
                  {localTimer}s
                </div>
                <div className="w-full bg-arena-bg h-1 rounded overflow-hidden mt-4">
                  <div
                    className={`h-full transition-all duration-300 ${localTimer < 10 ? 'bg-arena-glowPink shadow-[0_0_10px_#ff1a40]' : 'bg-arena-accent shadow-[0_0_10px_#ff6b00]'}`}
                    style={{ width: `${Math.min(100, (localTimer / (auctionState.highestBid !== null ? 5 : (auctionState.initialDuration || 30))) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Massive Highest Bid Panel */}
              <div className="bg-arena-panel rounded border p-6 text-center relative overflow-hidden glow-border-orange border-arena-accent/40">
                <span className="block text-xs font-mono text-arena-textMuted mb-2 tracking-widest uppercase">// CURRENT HIGH BID</span>
                <div className="text-6xl font-display font-black text-arena-glowGreen font-mono tracking-tighter glow-text-cyan">
                  {currentHighestBid !== null ? `${currentHighestBid}` : '---'}
                </div>
                <span className="text-xs font-mono text-arena-textMuted mt-1 block tracking-wider uppercase">CIRCUIT COINS</span>
                
                {auctionState.highestBidderName ? (
                  <div className="mt-4 pt-3 border-t border-arena-border">
                    <span className="text-[10px] font-mono text-arena-textMuted uppercase tracking-widest">LEADING BIDDER</span>
                    <div className="text-lg font-display font-black text-white flex items-center justify-center gap-1.5 mt-0.5 uppercase tracking-wide">
                      <Trophy size={16} className="text-arena-glow animate-bounce" />
                      {auctionState.highestBidderName}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-arena-border text-xs text-arena-textMuted font-mono uppercase tracking-widest">
                    AWAITING BID SUBMISSIONS
                  </div>
                )}
              </div>

            </div>

            {/* Rolling Bid log */}
            <div className="bg-arena-panel rounded border border-arena-border p-5 flex-1 flex flex-col">
              <h3 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <TrendingUp size={14} className="text-arena-accent animate-pulse" />
                LOG DATASTREAM
              </h3>
              <div className="space-y-2 flex-1 overflow-y-auto max-h-64 pr-1">
                {recentBids.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    className={`flex justify-between items-center p-2.5 rounded text-xs transition-all border font-mono ${
                      idx === 0
                        ? 'bg-gradient-to-r from-orange-950/20 to-red-950/20 border-arena-accent/50 scale-[1.02] text-white'
                        : 'bg-arena-bg border-transparent text-slate-300'
                    }`}
                  >
                    <span className="font-bold uppercase tracking-wider">{b.team_name}</span>
                    <span className="font-bold text-arena-glow">{b.bid_amount} Coins</span>
                  </div>
                ))}
                {recentBids.length === 0 && (
                  <div className="h-full flex items-center justify-center text-arena-textMuted text-xs font-mono py-12 uppercase tracking-wider">
                    NO LOG ENTRIES
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* If no item is active, display the persistent last result */
        <div className="flex-1 flex items-center justify-center bg-arena-panel rounded border border-arena-border p-8 glow-border min-h-[50vh]">
          {lastSold ? (
            <div className="text-center space-y-6 max-w-lg">
              <span className="inline-flex px-4 py-1.5 bg-arena-glowGreen/10 border border-arena-glowGreen/20 text-arena-glowGreen rounded text-xs font-mono font-bold uppercase tracking-widest animate-bounce shadow-[0_0_15px_rgba(0,255,102,0.15)]">
                // COMPONENT SOLD
              </span>
              <h2 className="text-5xl font-display font-black text-white leading-tight uppercase tracking-wide">
                {lastSold.itemName}
              </h2>
              <div className="bg-arena-bg p-6 rounded border border-arena-border space-y-3">
                <p className="text-xs text-arena-textMuted font-mono tracking-wider uppercase">ACQUIRED BY</p>
                <h3 className="text-3xl font-display font-black text-arena-accent flex items-center justify-center gap-2 uppercase tracking-wide">
                  <Trophy className="text-arena-glow animate-pulse" size={32} />
                  {lastSold.winningTeamName}
                </h3>
                <div className="text-xs text-arena-textMuted font-mono pt-3 border-t border-arena-border/50 uppercase tracking-wider">
                  FINAL TRANSACTION PRICE: <span className="text-arena-glowGreen font-bold text-lg font-mono">{lastSold.price} coins</span>
                </div>
              </div>
              <p className="text-xs text-arena-textMuted font-mono animate-pulse tracking-wider">
                STANDING BY FOR THE NEXT BLOCK DATA...
              </p>
            </div>
          ) : lastUnsold ? (
            <div className="text-center space-y-6 max-w-lg">
              <span className="inline-flex px-4 py-1.5 bg-arena-glowPink/10 border border-arena-glowPink/20 text-arena-glowPink rounded text-xs font-mono font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(255,26,64,0.15)]">
                // COMPONENT UNSOLD
              </span>
              <h2 className="text-5xl font-display font-black text-white leading-tight uppercase tracking-wide">
                {lastUnsold.itemName}
              </h2>
              <div className="bg-arena-bg p-6 rounded border border-arena-border flex items-center justify-center gap-2 text-slate-300 font-mono text-sm uppercase">
                <AlertCircle className="text-arena-glowPink" size={24} />
                <span className="font-bold">No bids submitted in round</span>
              </div>
              <p className="text-xs text-arena-textMuted font-mono animate-pulse tracking-wider">
                STANDING BY FOR THE NEXT BLOCK DATA...
              </p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <Radio className="w-16 h-16 mx-auto text-arena-border animate-pulse mb-2" />
              <h2 className="text-2xl font-display font-black text-white uppercase tracking-wider">Circuit Arena block</h2>
              <p className="text-xs text-arena-textMuted max-w-xs mx-auto font-mono uppercase tracking-wider leading-relaxed">
                Bidding datastream offline. Stand by for the moderator to initiate a component block.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
