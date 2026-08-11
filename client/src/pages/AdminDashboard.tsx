import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Play, Pause, Square, Trash2, Plus, UserPlus, DollarSign, Shield, Activity, Clock, ArrowRight, ChevronDown } from 'lucide-react';

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
}

export const AdminDashboard: React.FC = () => {
  const { socket, connected } = useSocket();
  const { token } = useAuth();

  // Lists
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<AuctionItem[]>([]);

  // Auction live state
  const [auctionState, setAuctionState] = useState<any>(null);

  // Form inputs - Add Team
  const [teamName, setTeamName] = useState('');
  const [teamUser, setTeamUser] = useState('');
  const [teamPass, setTeamPass] = useState('');
  const [teamBudget, setTeamBudget] = useState('2000');
  
  // Bulk upload states
  const [teamAddMode, setTeamAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  // Form inputs - Add Item
  const [itemName, setItemName] = useState('');
  const [itemImage, setItemImage] = useState('');
  const [itemBasePrice, setItemBasePrice] = useState('200');
  
  // Bulk component states
  const [componentAddMode, setComponentAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkItemFile, setBulkItemFile] = useState<File | null>(null);
  const [bulkItemUploading, setBulkItemUploading] = useState(false);
  const [bulkItemStatus, setBulkItemStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  
  // Single component photo upload states
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'url'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Form inputs - Budget override
  const [selectedTeamId, setSelectedTeamId] = useState<number | ''>('');
  const [newBudgetVal, setNewBudgetVal] = useState('');

  // Selected item to start auction
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [auctionDuration, setAuctionDuration] = useState('30');

  // Logs
  const [recentBids, setRecentBids] = useState<any[]>([]);

  // Messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch initial teams and items
  const fetchData = async () => {
    try {
      const teamsRes = await fetch('http://localhost:5000/api/teams');
      const teamsData = await teamsRes.json();
      setTeams(teamsData);

      const itemsRes = await fetch('http://localhost:5000/api/items');
      const itemsData = await itemsRes.json();
      setItems(itemsData);
    } catch (e) {
      console.error('Error fetching dashboard lists:', e);
    }
  };

  useEffect(() => {
    fetchData();

    if (!socket) return;

    // Listen to real-time updates
    socket.on('auction:state', (newState: any) => {
      setAuctionState(newState);
      if (newState.recentBids) {
        setRecentBids(newState.recentBids);
      }
    });

    socket.on('teams:update', (updatedTeams: Team[]) => {
      setTeams(updatedTeams);
    });

    socket.on('items:update', (updatedItems: AuctionItem[]) => {
      setItems(updatedItems);
    });

    socket.on('system:reset', () => {
      fetchData();
      setRecentBids([]);
    });

    return () => {
      socket.off('auction:state');
      socket.off('teams:update');
      socket.off('items:update');
      socket.off('system:reset');
    };
  }, [socket]);

  // Actions
  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('http://localhost:5000/api/admin/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: teamName,
          username: teamUser,
          password: teamPass,
          initialBudget: teamBudget,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to add team');
      } else {
        setSuccessMsg(`Team "${teamName}" added successfully.`);
        setTeamName('');
        setTeamUser('');
        setTeamPass('');
        setTeamBudget('2000');
        fetchData();
      }
    } catch (err) {
      setErrorMsg('Network error adding team');
    }
  };

  // Bulk Upload logic
  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      throw new Error('CSV file is empty or missing headers');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name') || h === 'team');
    const userIdx = headers.findIndex(h => h.includes('user'));
    const passIdx = headers.findIndex(h => h.includes('pass'));
    const budgetIdx = headers.findIndex(h => h.includes('budget') || h.includes('coins') || h.includes('limit'));

    if (nameIdx === -1 || userIdx === -1 || passIdx === -1) {
      throw new Error('CSV columns must include: name, username, password');
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => item.trim().replace(/^["']|["']$/g, ''));
      if (row.length < 3) continue;
      
      results.push({
        name: row[nameIdx] || '',
        username: row[userIdx] || '',
        password: row[passIdx] || '',
        initialBudget: budgetIdx !== -1 && row[budgetIdx] ? Number(row[budgetIdx]) : 2000
      });
    }
    return results;
  };

  const parseJSON = (text: string) => {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('JSON structure must be a list of team objects');
    }
    return data.map((t: any) => ({
      name: t.name || t.teamName || '',
      username: t.username || '',
      password: t.password || '',
      initialBudget: t.initialBudget || t.budget || 2000
    }));
  };

  const handleBulkUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setBulkStatus(null);
  };

  const handleProcessBulk = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    setBulkStatus({ type: 'info', message: 'Reading file...' });

    try {
      const text = await bulkFile.text();
      let parsedTeams = [];
      
      if (bulkFile.name.endsWith('.json')) {
        parsedTeams = parseJSON(text);
      } else {
        parsedTeams = parseCSV(text);
      }

      if (parsedTeams.length === 0) {
        throw new Error('No valid team rows found in file.');
      }

      setBulkStatus({ type: 'info', message: `Found ${parsedTeams.length} teams. Initializing upload...` });

      let successCount = 0;
      let failLogs: string[] = [];

      for (let i = 0; i < parsedTeams.length; i++) {
        const team = parsedTeams[i];
        setBulkStatus({ type: 'info', message: `Uploading ${i + 1}/${parsedTeams.length}: ${team.name}...` });

        try {
          const response = await fetch('http://localhost:5000/api/admin/teams', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(team)
          });

          const data = await response.json();
          if (response.ok && data.success) {
            successCount++;
          } else {
            failLogs.push(`${team.name}: ${data.error || 'Server rejected'}`);
          }
        } catch (err) {
          failLogs.push(`${team.name}: Connection error`);
        }
      }

      fetchData();

      if (failLogs.length === 0) {
        setBulkStatus({ type: 'success', message: `Successfully registered all ${successCount} teams.` });
        setBulkFile(null);
      } else {
        setBulkStatus({
          type: 'error',
          message: `Registered ${successCount} teams. Errors in ${failLogs.length} rows:\n${failLogs.join('\n')}`
        });
      }
    } catch (err: any) {
      setBulkStatus({ type: 'error', message: err.message || 'File processing failed' });
    } finally {
      setBulkUploading(false);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setImagePreview(base64String);
      setItemImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('http://localhost:5000/api/admin/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: itemName,
          imageUrl: itemImage,
          basePrice: itemBasePrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to add component');
      } else {
        setSuccessMsg(`Component "${itemName}" added successfully.`);
        setItemName('');
        setItemImage('');
        setItemBasePrice('200');
        setSelectedFile(null);
        setImagePreview(null);
        fetchData();
      }
    } catch (err) {
      setErrorMsg('Network error adding component');
    }
  };

  // Bulk Component Upload logic
  const parseItemCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) {
      throw new Error('CSV file is empty or missing headers');
    }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name') || h === 'item');
    const imageIdx = headers.findIndex(h => h.includes('image') || h.includes('url') || h === 'img');
    const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('base') || h.includes('reserve') || h.includes('cost'));

    if (nameIdx === -1 || priceIdx === -1) {
      throw new Error('CSV columns must include: name, basePrice');
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => item.trim().replace(/^["']|["']$/g, ''));
      if (row.length < 2) continue;
      results.push({
        name: row[nameIdx] || '',
        imageUrl: imageIdx !== -1 && row[imageIdx] ? row[imageIdx] : null,
        basePrice: Number(row[priceIdx] || 0)
      });
    }
    return results;
  };

  const parseItemJSON = (text: string) => {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      throw new Error('JSON structure must be a list of component objects');
    }
    return data.map((item: any) => ({
      name: item.name || '',
      imageUrl: item.imageUrl || item.image || null,
      basePrice: Number(item.basePrice || item.price || 0)
    }));
  };

  const handleBulkItemChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkItemFile(file);
    setBulkItemStatus(null);
  };

  const handleProcessBulkItems = async () => {
    if (!bulkItemFile) return;
    setBulkItemUploading(true);
    setBulkItemStatus({ type: 'info', message: 'Reading file...' });

    try {
      const text = await bulkItemFile.text();
      let parsedItems = [];
      
      if (bulkItemFile.name.endsWith('.json')) {
        parsedItems = parseItemJSON(text);
      } else {
        parsedItems = parseItemCSV(text);
      }

      if (parsedItems.length === 0) {
        throw new Error('No valid component rows found in file.');
      }

      setBulkItemStatus({ type: 'info', message: `Found ${parsedItems.length} components. Initializing upload...` });

      let successCount = 0;
      let failLogs: string[] = [];

      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        setBulkItemStatus({ type: 'info', message: `Uploading ${i + 1}/${parsedItems.length}: ${item.name}...` });

        try {
          const response = await fetch('http://localhost:5000/api/admin/items', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(item)
          });

          const data = await response.json();
          if (response.ok && data.success) {
            successCount++;
          } else {
            failLogs.push(`${item.name}: ${data.error || 'Server rejected'}`);
          }
        } catch (err) {
          failLogs.push(`${item.name}: Connection error`);
        }
      }

      fetchData();

      if (failLogs.length === 0) {
        setBulkItemStatus({ type: 'success', message: `Successfully registered all ${successCount} components.` });
        setBulkItemFile(null);
      } else {
        setBulkItemStatus({
          type: 'error',
          message: `Registered ${successCount} components. Errors in ${failLogs.length} rows:\n${failLogs.join('\n')}`
        });
      }
    } catch (err: any) {
      setBulkItemStatus({ type: 'error', message: err.message || 'File processing failed' });
    } finally {
      setBulkItemUploading(false);
    }
  };

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('http://localhost:5000/api/admin/teams/budget', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          budget: newBudgetVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to update budget');
      } else {
        setSuccessMsg('Team budget updated successfully.');
        setNewBudgetVal('');
        setSelectedTeamId('');
        fetchData();
      }
    } catch (err) {
      setErrorMsg('Network error setting budget');
    }
  };

  // Socket triggers
  const handleStartAuction = () => {
    if (!socket || !selectedItemId) return;
    socket.emit('admin:start', { itemId: selectedItemId, duration: parseInt(auctionDuration) }, (res: any) => {
      if (res?.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg('Auction started.');
      }
    });
  };

  const handlePauseAuction = () => {
    if (!socket) return;
    socket.emit('admin:pause', {}, (res: any) => {
      if (res?.error) setErrorMsg(res.error);
    });
  };

  const handleResumeAuction = () => {
    if (!socket) return;
    socket.emit('admin:resume', {}, (res: any) => {
      if (res?.error) setErrorMsg(res.error);
    });
  };

  const handleSellAuction = () => {
    if (!socket) return;
    socket.emit('admin:sell', {}, (res: any) => {
      if (res?.error) setErrorMsg(res.error);
    });
  };

  const handleUnsoldAuction = () => {
    if (!socket) return;
    socket.emit('admin:unsold', {}, (res: any) => {
      if (res?.error) setErrorMsg(res.error);
    });
  };

  const handleResetState = () => {
    if (!socket) return;
    socket.emit('admin:reset', {}, (res: any) => {
      if (res?.error) setErrorMsg(res.error);
    });
  };

  // Load next pending component into selector
  const handleLoadNextComponent = () => {
    const nextItem = items.find(item => item.status === 'pending' || item.status === 'unsold');
    if (nextItem) {
      setSelectedItemId(nextItem.id);
      setSuccessMsg(`Prepared component: "${nextItem.name}"`);
    } else {
      setErrorMsg('No pending or unsold components remaining in inventory.');
    }
  };

  const handleSystemReset = async () => {
    if (!window.confirm('WARNING: This will reset all budgets to starting coins, clear bid logs, and set components back to pending. Continue?')) {
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('http://localhost:5000/api/admin/reset-system', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Reset failed');
      } else {
        setSuccessMsg('System reset completed successfully.');
      }
    } catch (err) {
      setErrorMsg('Network error performing system reset');
    }
  };

  const activeItem = auctionState?.currentItem;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-arena-border pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
            <Shield className="text-arena-accent w-8 h-8" />
            CIRCUIT ARENA: THE FINALS (OPERATIONS)
          </h1>
          <p className="text-sm text-arena-textMuted mt-1">
            Register teams, upload component inventory, and run real-time bidding rounds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
          <button
            onClick={handleSystemReset}
            className="px-3 py-1.5 border border-red-500/30 hover:border-red-500 bg-red-950/20 text-red-400 hover:text-red-200 text-xs rounded transition-colors flex items-center gap-1"
          >
            <Trash2 size={13} /> RESET SYSTEM
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/50 border border-red-500/50 text-red-200 text-sm rounded-md">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-sm rounded-md">
          {successMsg}
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Setup and Config forms */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Add Team Card */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-lg font-display font-black text-white flex items-center gap-2 mb-3 uppercase tracking-wide">
              <UserPlus className="text-arena-accent" size={18} />
              Add Event Team
            </h2>

            {/* Toggle Modes */}
            <div className="flex border-b border-arena-border/50 mb-4 text-xs font-mono">
              <button
                type="button"
                onClick={() => setTeamAddMode('single')}
                className={`flex-1 pb-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  teamAddMode === 'single' ? 'border-arena-accent text-arena-accent font-black' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Team
              </button>
              <button
                type="button"
                onClick={() => setTeamAddMode('bulk')}
                className={`flex-1 pb-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  teamAddMode === 'bulk' ? 'border-arena-accent text-arena-accent font-black' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Bulk Upload
              </button>
            </div>

            {teamAddMode === 'single' ? (
              <form onSubmit={handleAddTeam} className="space-y-3">
                <input
                  type="text"
                  placeholder="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Username"
                    value={teamUser}
                    onChange={(e) => setTeamUser(e.target.value)}
                    className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={teamPass}
                    onChange={(e) => setTeamPass(e.target.value)}
                    className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                    required
                  />
                </div>
                <input
                  type="number"
                  placeholder="Starting Budget (default 2000)"
                  value={teamBudget}
                  onChange={(e) => setTeamBudget(e.target.value)}
                  className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-arena-accent hover:bg-orange-600 text-white rounded text-sm font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus size={15} /> Add Team
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="border border-dashed border-arena-border hover:border-arena-accent/50 rounded p-4 text-center cursor-pointer relative bg-arena-bg/40 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={handleBulkUploadChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-1 font-mono text-[10px] select-none">
                    <span className="text-arena-glow block">CLICK OR DRAG FILE HERE</span>
                    <span className="text-slate-500 block uppercase">SUPPORTED FORMATS: .CSV, .JSON</span>
                  </div>
                </div>

                {bulkFile && (
                  <div className="p-2.5 bg-arena-bg rounded border border-arena-border flex justify-between items-center text-xs font-mono">
                    <span className="truncate text-slate-300 max-w-[150px]">{bulkFile.name}</span>
                    <span className="text-[9px] text-arena-textMuted uppercase">({(bulkFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}

                {bulkStatus && (
                  <div className={`p-2.5 rounded border text-[11px] font-mono whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto ${
                    bulkStatus.type === 'success' ? 'bg-arena-glowGreen/10 border-arena-glowGreen/20 text-arena-glowGreen' :
                    bulkStatus.type === 'error' ? 'bg-arena-glowPink/10 border-arena-glowPink/20 text-arena-glowPink' :
                    'bg-blue-950/20 border-arena-glow/20 text-arena-glow'
                  }`}>
                    {bulkStatus.message}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleProcessBulk}
                    disabled={!bulkFile || bulkUploading}
                    className="flex-1 py-2 bg-arena-accent hover:bg-orange-600 disabled:opacity-50 text-white rounded text-xs font-mono font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(255,107,0,0.2)] cursor-pointer"
                  >
                    {bulkUploading ? 'Uploading...' : 'Process File'}
                  </button>
                  <a
                    href="data:text/csv;charset=utf-8,name,username,password,initialBudget%0ATeam%20Delta,teamd,team123,2000%0ATeam%20Epsilon,teame,team123,2000"
                    download="teams_template.csv"
                    className="py-2 px-3 bg-arena-panel hover:bg-slate-800 text-slate-300 rounded text-xs font-mono font-bold uppercase tracking-wider border border-arena-border text-center flex items-center justify-center cursor-pointer"
                    title="Download CSV template"
                  >
                    Template
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Add Item Card */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-lg font-display font-black text-white flex items-center gap-2 mb-3 uppercase tracking-wide">
              <Plus className="text-arena-accent" size={18} />
              Add Component
            </h2>

            {/* Toggle Modes */}
            <div className="flex border-b border-arena-border/50 mb-4 text-xs font-mono">
              <button
                type="button"
                onClick={() => setComponentAddMode('single')}
                className={`flex-1 pb-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  componentAddMode === 'single' ? 'border-arena-accent text-arena-accent font-black' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Item
              </button>
              <button
                type="button"
                onClick={() => setComponentAddMode('bulk')}
                className={`flex-1 pb-2 border-b-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  componentAddMode === 'bulk' ? 'border-arena-accent text-arena-accent font-black' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Bulk Upload
              </button>
            </div>

            {componentAddMode === 'single' ? (
              <form onSubmit={handleAddItem} className="space-y-3">
                <input
                  type="text"
                  placeholder="Component Name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                  required
                />
                {/* Image Input Options */}
                <div className="space-y-2">
                  <div className="flex border-b border-arena-border/30 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => { setImageInputMode('upload'); setItemImage(''); setImagePreview(null); }}
                      className={`pb-1 pr-3 border-b-2 transition-colors cursor-pointer ${
                        imageInputMode === 'upload' ? 'border-arena-accent text-arena-accent font-bold' : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      UPLOAD PHOTO
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageInputMode('url'); setItemImage(''); setImagePreview(null); }}
                      className={`pb-1 pr-3 border-b-2 transition-colors cursor-pointer ${
                        imageInputMode === 'url' ? 'border-arena-accent text-arena-accent font-bold' : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      IMAGE URL
                    </button>
                  </div>

                  {imageInputMode === 'upload' ? (
                    <div className="space-y-2">
                      <div className="border border-dashed border-arena-border hover:border-arena-accent/40 rounded p-3 text-center cursor-pointer relative bg-arena-bg/20 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="font-mono text-[9px] text-slate-400 select-none">
                          {selectedFile ? selectedFile.name : 'CHOOSE PHOTO FILE...'}
                        </div>
                      </div>
                      {imagePreview && (
                        <div className="flex justify-center border border-arena-border p-2 rounded bg-arena-bg/50">
                          <img src={imagePreview} alt="Preview" className="h-20 object-contain rounded" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type="url"
                      placeholder="Component Image URL (optional)"
                      value={itemImage}
                      onChange={(e) => setItemImage(e.target.value)}
                      className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                    />
                  )}
                </div>

                <input
                  type="number"
                  placeholder="Starting Price Coins"
                  value={itemBasePrice}
                  onChange={(e) => setItemBasePrice(e.target.value)}
                  className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                  required
                />
                <button
                  type="submit"
                  className="w-full py-2 bg-arena-accent hover:bg-orange-600 text-white rounded text-sm font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus size={15} /> Add Component
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="border border-dashed border-arena-border hover:border-arena-accent/50 rounded p-4 text-center cursor-pointer relative bg-arena-bg/40 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={handleBulkItemChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-1 font-mono text-[10px] select-none">
                    <span className="text-arena-glow block">CLICK OR DRAG FILE HERE</span>
                    <span className="text-slate-500 block uppercase">SUPPORTED FORMATS: .CSV, .JSON</span>
                  </div>
                </div>

                {bulkItemFile && (
                  <div className="p-2.5 bg-arena-bg rounded border border-arena-border flex justify-between items-center text-xs font-mono">
                    <span className="truncate text-slate-300 max-w-[150px]">{bulkItemFile.name}</span>
                    <span className="text-[9px] text-arena-textMuted uppercase">({(bulkItemFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}

                {bulkItemStatus && (
                  <div className={`p-2.5 rounded border text-[11px] font-mono whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto ${
                    bulkItemStatus.type === 'success' ? 'bg-arena-glowGreen/10 border-arena-glowGreen/20 text-arena-glowGreen' :
                    bulkItemStatus.type === 'error' ? 'bg-arena-glowPink/10 border-arena-glowPink/20 text-arena-glowPink' :
                    'bg-blue-950/20 border-arena-glow/20 text-arena-glow'
                  }`}>
                    {bulkItemStatus.message}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleProcessBulkItems}
                    disabled={!bulkItemFile || bulkItemUploading}
                    className="flex-1 py-2 bg-arena-accent hover:bg-orange-600 disabled:opacity-50 text-white rounded text-xs font-mono font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(255,107,0,0.2)] cursor-pointer"
                  >
                    {bulkItemUploading ? 'Uploading...' : 'Process File'}
                  </button>
                  <a
                    href="data:text/csv;charset=utf-8,name,imageUrl,basePrice%0AServo%20Motor,,200%0AUltrasonic%20Sensor,,150"
                    download="components_template.csv"
                    className="py-2 px-3 bg-arena-panel hover:bg-slate-800 text-slate-300 rounded text-xs font-mono font-bold uppercase tracking-wider border border-arena-border text-center flex items-center justify-center cursor-pointer"
                    title="Download CSV template"
                  >
                    Template
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Budget Override Card */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <DollarSign className="text-arena-accent" size={18} />
              Set Team Coins Limit
            </h2>
            <form onSubmit={handleUpdateBudget} className="space-y-3">
              <div className="relative group">
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent appearance-none pr-10 cursor-pointer"
                  required
                >
                  <option value="">Select Team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Cur: {t.remaining_budget} Coins)
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 group-focus-within:text-arena-accent">
                  <ChevronDown size={16} className="transition-transform duration-300 group-focus-within:rotate-180" />
                </div>
              </div>
              <input
                type="number"
                placeholder="Set Coins (e.g. 2000)"
                value={newBudgetVal}
                onChange={(e) => setNewBudgetVal(e.target.value)}
                className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                required
              />
              <button
                type="submit"
                className="w-full py-2 bg-arena-glow hover:bg-cyan-600 text-slate-900 rounded text-sm font-semibold transition-colors cursor-pointer"
                disabled={!selectedTeamId}
              >
                Apply Coins & Reset Logs
              </button>
            </form>
          </div>

        </div>

        {/* Center: Live Bidding Controls */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5 glow-border">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <Activity className="text-arena-glow" size={18} />
              Live Auction Operations
            </h2>

            {/* In-Play Status Block */}
            <div className="p-4 bg-arena-bg rounded border border-arena-border mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-mono text-arena-textMuted uppercase tracking-wider">BLOCK STATUS:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  auctionState?.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' :
                  auctionState?.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                  'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {auctionState?.status || 'idle'}
                </span>
              </div>

              {activeItem ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {activeItem.image_url && (
                      <img src={activeItem.image_url} alt="" className="w-12 h-12 rounded object-cover border border-arena-border" />
                    )}
                    <div>
                      <h3 className="font-bold text-white leading-tight">{activeItem.name}</h3>
                      <p className="text-xs text-arena-textMuted">Starting Reserve: {activeItem.base_price} Coins</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-arena-border/50 pt-4">
                    <div>
                      <span className="block text-[10px] text-arena-textMuted font-mono">TIMER REMAINING:</span>
                      <span className="text-2xl font-bold text-white flex items-center gap-1">
                        <Clock size={18} className="text-arena-glow" />
                        {auctionState.timer}s
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-arena-textMuted font-mono">CURRENT HIGH BID:</span>
                      <span className="text-2xl font-bold text-arena-accent font-mono">
                        {auctionState.highestBid !== null ? `${auctionState.highestBid} Coins` : 'No Bids'}
                      </span>
                      {auctionState.highestBidderName && (
                        <span className="block text-[10px] text-emerald-400 truncate">
                          by {auctionState.highestBidderName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-arena-textMuted text-sm font-mono">
                  BLOCK EMPTY. PREPARE ITEM.
                </div>
              )}
            </div>

            {/* Launchpad Panel */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Launch Component Block</h3>
                <button
                  onClick={handleLoadNextComponent}
                  disabled={auctionState?.status === 'running' || auctionState?.status === 'paused'}
                  className="px-2 py-1 bg-arena-bg hover:bg-arena-border text-slate-300 rounded text-[10px] font-bold flex items-center gap-1 border border-arena-border disabled:opacity-50 transition-colors"
                >
                  <ArrowRight size={10} /> Next Component
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-arena-textMuted mb-1">SELECT COMPONENT</label>
                  <div className="relative group">
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent appearance-none pr-10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={auctionState?.status === 'running' || auctionState?.status === 'paused'}
                    >
                      <option value="">Choose Component...</option>
                      {items.filter(item => item.status === 'pending' || item.status === 'unsold').map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.status})
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 group-focus-within:text-arena-accent">
                      <ChevronDown size={16} className="transition-transform duration-300 group-focus-within:rotate-180" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-arena-textMuted mb-1">TIMER (SECONDS)</label>
                  <input
                    type="number"
                    value={auctionDuration}
                    onChange={(e) => setAuctionDuration(e.target.value)}
                    className="w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-sm text-white focus:outline-none focus:border-arena-accent"
                    disabled={auctionState?.status === 'running' || auctionState?.status === 'paused'}
                  />
                </div>
              </div>

              <button
                onClick={handleStartAuction}
                disabled={!selectedItemId || auctionState?.status === 'running' || auctionState?.status === 'paused'}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-sm font-bold flex items-center justify-center gap-1 transition-colors"
              >
                <Play size={16} /> START AUCTION
              </button>

              {/* Control Deck */}
              <div className="border-t border-arena-border/50 pt-4 mt-2">
                <label className="block text-[10px] text-arena-textMuted mb-2">OPERATOR CONTROLS</label>
                <div className="grid grid-cols-2 gap-2">
                  {auctionState?.status === 'running' ? (
                    <button
                      onClick={handlePauseAuction}
                      className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Pause size={14} /> PAUSE TIMER
                    </button>
                  ) : (
                    <button
                      onClick={handleResumeAuction}
                      disabled={auctionState?.status !== 'paused'}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Play size={14} /> START/RESUME TIMER
                    </button>
                  )}
                  <button
                    onClick={handleResetState}
                    disabled={auctionState?.status === 'idle'}
                    className="py-2 px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <Square size={14} /> RESET STATE
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={handleSellAuction}
                    disabled={!activeItem}
                    className="py-2 px-3 bg-arena-accent hover:bg-orange-600 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    SELL (DEDUCT COINS)
                  </button>
                  <button
                    onClick={handleUnsoldAuction}
                    disabled={!activeItem}
                    className="py-2 px-3 bg-red-950 hover:bg-red-900 border border-red-500/30 text-red-200 disabled:opacity-50 rounded text-xs font-semibold transition-colors"
                  >
                    MARK UNSOLD
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bid Log */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Bid History</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {recentBids.length > 0 ? (
                recentBids.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    className={`flex justify-between items-center p-2 rounded text-xs border font-mono ${idx === 0 ? 'bg-orange-950/20 border-arena-accent/40 text-white' : 'bg-arena-bg border-transparent text-slate-400'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-arena-textMuted">[{new Date(b.bid_time).toLocaleTimeString()}]</span>
                      <span className="font-bold text-slate-200">{b.team_name}</span>
                    </div>
                    <span className="font-bold text-arena-glow">{b.bid_amount} Coins</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-arena-textMuted text-xs font-mono">
                  NO BIDS SUBMITTED
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Lists */}
        <div className="lg:col-span-3 space-y-6">
          {/* Team Coins Balance List */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Teams Ledger</h2>
            <div className="space-y-2">
              {teams.map((t) => (
                <div key={t.id} className="p-2.5 bg-arena-bg rounded border border-arena-border flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-white">{t.name}</h4>
                    <span className="text-[10px] text-arena-textMuted">Spent: {t.total_spent} Coins</span>
                  </div>
                  <span className="text-xs font-bold font-mono text-emerald-400">
                    {t.remaining_budget} Coins
                  </span>
                </div>
              ))}
              {teams.length === 0 && (
                <div className="text-center py-4 text-arena-textMuted text-xs font-mono">
                  No teams registered.
                </div>
              )}
            </div>
          </div>

          {/* Component Inventory Status List */}
          <div className="bg-arena-panel rounded-lg border border-arena-border p-5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Component Catalog</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="p-2 bg-arena-bg rounded border border-arena-border flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300 truncate max-w-[130px]">{item.name}</span>
                  <span className={`px-2 py-0.5 rounded-[3px] text-[10px] font-bold uppercase ${
                    item.status === 'sold' ? 'bg-arena-glowGreen/10 text-arena-glowGreen border border-arena-glowGreen/20' :
                    item.status === 'unsold' ? 'bg-arena-glowPink/10 text-arena-glowPink border border-arena-glowPink/20' :
                    item.status === 'active' ? 'bg-orange-950/20 text-arena-accent border border-arena-accent/20 animate-pulse' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
