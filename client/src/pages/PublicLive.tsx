import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Trophy, Radio } from 'lucide-react';
import { API_URL } from '../config';

interface AuctionItem {
  id: number;
  name: string;
  image_url: string | null;
  base_price: number;
  status: 'pending' | 'active' | 'sold' | 'unsold';
  stock: number;
  remaining_stock: number;
}

interface Purchase {
  purchase_id: number;
  final_price: number;
  purchase_time: string;
  team_id: number;
  quantity: number;
  id: number;
  name: string;
  image_url: string | null;
  base_price: number;
  team_name: string;
}

export const PublicLive: React.FC = () => {
  const { socket, connected } = useSocket();
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const itemsRes = await fetch(`${API_URL}/api/items`);
      const itemsData = await itemsRes.json();
      setItems(itemsData);

      const purchasesRes = await fetch(`${API_URL}/api/purchases`);
      const purchasesData = await purchasesRes.json();
      setPurchases(purchasesData);
    } catch (e) {
      console.error('Error fetching live data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (!socket) return;

    socket.on('items:update', (updatedItems: AuctionItem[]) => {
      setItems(updatedItems);
    });

    socket.on('auction:sold', () => {
      fetchData();
    });

    socket.on('auction:unsold', () => {
      fetchData();
    });

    socket.on('system:reset', () => {
      fetchData();
    });

    return () => {
      socket.off('items:update');
      socket.off('auction:sold');
      socket.off('auction:unsold');
      socket.off('system:reset');
    };
  }, [socket]);

  return (
    <div className="min-h-[85vh] flex flex-col justify-between py-4">
      {/* Header Banner */}
      <div className="flex justify-between items-center border-b border-arena-border pb-4 mb-6">
        <div>
          <h1 className="text-4xl font-display font-black tracking-wider text-white glow-text-orange flex items-center gap-3 uppercase">
            <Radio className="text-arena-accent animate-pulse" size={32} />
            CIRCUIT <span className="text-arena-glow">ARENA</span>
          </h1>
          <p className="text-[10px] text-arena-textMuted font-mono tracking-widest mt-1">// COMPONENT INVENTORY & ACQUISITION STATUS</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-3.5 h-3.5 rounded-full ${connected ? 'bg-arena-glowGreen animate-pulse shadow-[0_0_10px_rgba(0,255,102,0.4)]' : 'bg-arena-glowPink'}`}></span>
          <span className="text-xs font-mono text-arena-textMuted uppercase tracking-wider">
            {connected ? 'BROADCAST ONLINE' : 'BROADCAST OFFLINE'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-arena-textMuted font-mono flex-1 flex items-center justify-center">
          LOADING COMPONENT ALLOCATIONS...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1 items-start">
          {items.map((item) => {
            // Find purchases matching this item id
            const itemPurchases = purchases.filter((p) => p.id === item.id);
            const remaining = item.remaining_stock !== undefined ? item.remaining_stock : item.stock;

            return (
              <div key={item.id} className="bg-arena-panel rounded-lg border border-arena-border p-5 hover:border-arena-accent/50 transition-all duration-300 relative overflow-hidden flex flex-col h-full justify-between animate-fadeIn">
                
                {/* Decorative glow for sold out vs available */}
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full filter blur-2xl ${remaining === 0 ? 'bg-arena-glowPink/5' : 'bg-arena-glowGreen/5'}`}></div>

                <div>
                  {/* Top: Image & Status */}
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="w-20 h-20 bg-arena-bg border border-arena-border/60 rounded p-1.5 flex items-center justify-center relative overflow-hidden">
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="max-w-full max-h-full object-contain rounded" />
                      ) : (
                        <span className="text-[9px] font-mono text-arena-textMuted text-center">NO IMAGE</span>
                      )}
                    </div>
                    
                    <div className="flex-1 text-right">
                      <span className={`inline-block px-2.5 py-0.5 rounded-[3px] text-[10px] font-bold uppercase tracking-wider font-mono border ${
                        remaining === 0 
                          ? 'bg-arena-glowPink/10 text-arena-glowPink border-arena-glowPink/20' 
                          : 'bg-arena-glowGreen/10 text-arena-glowGreen border-arena-glowGreen/20 animate-pulse'
                      }`}>
                        {remaining === 0 ? 'SOLD OUT' : `${remaining}/${item.stock} AVAILABLE`}
                      </span>
                      <div className="text-[10px] text-arena-textMuted font-mono mt-1">
                        RESERVE: <span className="font-bold text-white font-sans">{item.base_price}</span> Coins
                      </div>
                    </div>
                  </div>

                  {/* Component Title */}
                  <h3 className="text-lg font-display font-black text-white uppercase tracking-wide mb-3 leading-tight border-b border-arena-border/30 pb-2">
                    {item.name}
                  </h3>

                  {/* Stock status progress bar */}
                  <div className="w-full bg-arena-bg h-1 rounded overflow-hidden mb-4">
                    <div
                      className={`h-full transition-all duration-500 ${remaining === 0 ? 'bg-arena-glowPink' : 'bg-arena-glowGreen'}`}
                      style={{ width: `${(remaining / item.stock) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Acquisitions sub-list */}
                <div className="space-y-2 mt-auto">
                  <h4 className="text-[10px] font-mono text-arena-textMuted uppercase tracking-wider">// ACQUISITION REGISTER</h4>
                  <div className="space-y-1.5 min-h-[90px]">
                    {itemPurchases.length > 0 ? (
                      itemPurchases.map((p) => (
                        <div key={p.purchase_id} className="p-2 bg-arena-bg/60 rounded border border-arena-border/40 flex justify-between items-center text-xs font-mono">
                          <div className="flex items-center gap-1.5">
                            <Trophy size={11} className="text-arena-glow" />
                            <span className="font-bold text-white uppercase truncate max-w-[100px]">{p.team_name}</span>
                            <span className="text-[9px] text-arena-textMuted">(Qty: {p.quantity || 1})</span>
                          </div>
                          <span className="font-bold text-emerald-400 font-sans">
                            {p.final_price} Coins
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="h-[90px] flex items-center justify-center border border-dashed border-arena-border/40 rounded text-center p-3">
                        <span className="text-[10px] font-mono text-arena-textMuted uppercase tracking-widest">
                          Awaiting auction block
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-arena-border mt-8 pt-4 text-center text-[10px] font-mono text-arena-textMuted uppercase tracking-widest">
        CIRCUIT ARENA ENGINEERING INVENTORY & COORDINATION SYSTEM
      </div>
    </div>
  );
};
