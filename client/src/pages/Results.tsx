import React, { useEffect, useState } from 'react';
import { Trophy, Award, List, RefreshCw } from 'lucide-react';

import { API_URL } from '../config';

interface SoldItem {
  id: number;
  name: string;
  image_url: string | null;
  base_price: number;
  final_price: number;
  team_name: string;
  quantity: number;
}

interface TeamStanding {
  id: number;
  name: string;
  initial_budget: number;
  remaining_budget: number;
  total_spent: number;
  items_purchased: string;
}

export const Results: React.FC = () => {
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/results`);
      if (!res.ok) {
        throw new Error('Failed to fetch results from database');
      }
      const data = await res.json();
      setSoldItems(data.soldItems);
      setStandings(data.teamStandings);
    } catch (e: any) {
      setError(e.message || 'Cannot fetch results');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-arena-border pb-4">
        <div>
          <h1 className="text-3xl font-display font-black text-white flex items-center gap-3 uppercase tracking-wide">
            <Trophy className="text-arena-glow" size={28} />
            CIRCUIT <span className="text-arena-accent">ARENA</span> STANDINGS
          </h1>
          <p className="text-[10px] text-arena-textMuted mt-1 font-mono uppercase tracking-widest">
            // OFFICIAL SCOREBOARD & TRANSACTION LOG
          </p>
        </div>
        <button
          onClick={fetchResults}
          disabled={loading}
          className="p-2 bg-arena-panel hover:bg-slate-800/60 text-slate-300 hover:text-white rounded border border-arena-border flex items-center gap-1 transition-colors text-xs font-mono uppercase cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Sync Datastream
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-500/50 text-red-200 text-sm rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-arena-textMuted font-mono">
          AGGREGATING TRANSACTIONS...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: Standings (7 cols) */}
          <div className="lg:col-span-7 bg-arena-panel rounded border border-arena-border p-5">
            <h2 className="text-sm font-display font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-arena-border/50 pb-2">
              <Award className="text-arena-glow" size={18} />
              Team Leaderboard
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-arena-border text-xs font-mono text-arena-textMuted">
                    <th className="pb-3 pr-2">RANK</th>
                    <th className="pb-3">TEAM NAME</th>
                    <th className="pb-3 text-right">ACQUIRED COMPONENTS</th>
                    <th className="pb-3 text-right">COINS SPENT</th>
                    <th className="pb-3 text-right">COINS REMAINING</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-arena-border/50">
                  {standings.map((team, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr key={team.id} className="text-sm hover:bg-arena-bg/30">
                        <td className="py-3.5 pr-2 font-mono">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                            rank === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            rank === 2 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                            rank === 3 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {rank}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-white uppercase">{team.name}</td>
                        <td className="py-3.5 text-right font-semibold text-arena-glow font-mono">
                          {team.items_purchased}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {team.total_spent}
                        </td>
                        <td className="py-3.5 text-right font-bold font-mono text-arena-glowGreen">
                          {team.remaining_budget}
                        </td>
                      </tr>
                    );
                  })}
                  {standings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-arena-textMuted text-xs font-mono">
                        NO TEAMS REGISTERED
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Component acquisitions list (5 cols) */}
          <div className="lg:col-span-5 bg-arena-panel rounded border border-arena-border p-5">
            <h2 className="text-sm font-display font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2 border-b border-arena-border/50 pb-2">
              <List className="text-arena-accent animate-pulse" size={18} />
              Acquisition Ledger
            </h2>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {soldItems.map((item) => (
                <div key={item.id} className="p-3 bg-arena-bg rounded border border-arena-border flex justify-between items-center text-xs">
                  <div className="flex items-center gap-3">
                    {item.image_url && (
                      <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded border border-arena-border" />
                    )}
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm uppercase">{item.name}</h4>
                      <p className="text-[10px] text-arena-textMuted mt-0.5">
                        Sold to <span className="font-semibold text-arena-accent uppercase">{item.team_name}</span> (Qty: {item.quantity || 1})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block font-bold text-arena-glowGreen font-mono text-sm">{item.final_price} Coins</span>
                    <span className="text-[9px] text-arena-textMuted font-mono uppercase tracking-wider">Reserve: {item.base_price}</span>
                  </div>
                </div>
              ))}
              {soldItems.length === 0 && (
                <div className="text-center py-12 text-arena-textMuted text-xs font-mono">
                  NO TRANSACTIONS RECORDED
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
