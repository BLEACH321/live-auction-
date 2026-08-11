import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Trophy, Radio } from 'lucide-react';
import { API_URL } from '../config';

interface Purchase {
  purchase_id: number;
  final_price: number;
  purchase_time: string;
  team_name: string;
  name: string;
  quantity: number;
}

export const PublicLive: React.FC = () => {
  const { socket, connected } = useSocket();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPurchases = async () => {
    try {
      const res = await fetch(`${API_URL}/api/purchases`);
      if (!res.ok) throw new Error('Failed to fetch purchases');
      const data = await res.json();
      setPurchases(data);
    } catch (e) {
      console.error('Error fetching purchases:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();

    if (!socket) return;

    // Listen for new sales in real-time
    socket.on('auction:sold', () => {
      fetchPurchases();
    });

    socket.on('system:reset', () => {
      setPurchases([]);
    });

    return () => {
      socket.off('auction:sold');
      socket.off('system:reset');
    };
  }, [socket]);

  const latestPurchase = purchases.length > 0 ? purchases[0] : null;

  return (
    <div className="min-h-[85vh] flex flex-col justify-between py-4">
      {/* Header Banner */}
      <div className="flex justify-between items-center border-b border-arena-border pb-4 mb-6">
        <div>
          <h1 className="text-4xl font-display font-black tracking-wider text-white glow-text-orange flex items-center gap-3 uppercase">
            <Radio className="text-arena-accent animate-pulse" size={32} />
            CIRCUIT <span className="text-arena-glow">ARENA</span>
          </h1>
          <p className="text-[10px] text-arena-textMuted font-mono tracking-widest mt-1">// LIVE RESULTS BROADCAST PROTOCOL</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-3.5 h-3.5 rounded-full ${connected ? 'bg-arena-glowGreen animate-pulse shadow-[0_0_10px_rgba(0,255,102,0.4)]' : 'bg-arena-glowPink'}`}></span>
          <span className="text-xs font-mono text-arena-textMuted uppercase tracking-wider">
            {connected ? 'BROADCAST ONLINE' : 'BROADCAST OFFLINE'}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {/* Latest Result Banner */}
        <div className="bg-arena-panel rounded-lg border border-arena-border p-6 glow-border relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-32 h-32 bg-arena-glow/5 rounded-full filter blur-2xl"></div>
          <span className="inline-flex px-3 py-1 bg-arena-accent/10 border border-arena-accent/20 rounded text-xs font-mono text-arena-accent uppercase tracking-widest mb-3">
            LATEST LIVE ACQUISITION
          </span>
          {latestPurchase ? (
            <h2 className="text-2xl md:text-3xl font-display font-black text-white tracking-wide uppercase leading-snug">
              <span className="text-arena-glow">{latestPurchase.team_name}</span> - <span className="text-white">{latestPurchase.name}</span> with the price of <span className="text-arena-glowGreen glow-text-green font-mono">{latestPurchase.final_price} point</span>
            </h2>
          ) : (
            <h2 className="text-xl font-display font-bold text-arena-textMuted uppercase tracking-wider">
              AWAITING FIRST COMPONENT ACQUISITION BLOCK...
            </h2>
          )}
        </div>

        {/* Acquisitions Timeline */}
        <div className="bg-arena-panel rounded-lg border border-arena-border p-6 flex-1 flex flex-col">
          <h3 className="text-xs font-display font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-1.5 border-b border-arena-border/40 pb-3">
            <Trophy size={14} className="text-arena-accent animate-pulse" />
            LIVE RESULTS LIST
          </h3>

          {loading ? (
            <div className="text-center py-12 text-arena-textMuted font-mono flex-1 flex items-center justify-center">
              SYNCHRONIZING RESULTS...
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[50vh] pr-1 flex-1">
              {purchases.map((p, idx) => (
                <div
                  key={p.purchase_id}
                  className={`p-4 rounded border font-mono text-sm sm:text-base transition-all duration-300 flex justify-between items-center ${
                    idx === 0
                      ? 'bg-gradient-to-r from-orange-950/20 to-red-950/20 border-arena-accent/50 scale-[1.01] text-white shadow-[0_0_15px_rgba(255,107,0,0.15)]'
                      : 'bg-arena-bg border-arena-border/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-arena-glow animate-ping' : 'bg-arena-border'}`}></span>
                    <span className="text-white uppercase font-bold tracking-wide">
                      <span className="text-arena-glow">{p.team_name}</span> - <span className="text-slate-100">{p.name}</span> with the price of <span className="text-arena-glowGreen font-bold font-sans">{p.final_price} point</span>
                    </span>
                  </div>
                  
                  <span className="text-xs text-arena-textMuted hidden sm:inline">
                    {new Date(p.purchase_time).toLocaleTimeString()}
                  </span>
                </div>
              ))}

              {purchases.length === 0 && (
                <div className="text-center py-12 text-arena-textMuted text-sm font-mono uppercase tracking-widest border border-dashed border-arena-border/30 rounded flex-1 flex items-center justify-center min-h-[30vh]">
                  No auction acquisitions recorded yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-arena-border mt-8 pt-4 text-center text-[10px] font-mono text-arena-textMuted uppercase tracking-widest">
        CIRCUIT ARENA ENGINEERING INVENTORY & COORDINATION SYSTEM
      </div>
    </div>
  );
};
