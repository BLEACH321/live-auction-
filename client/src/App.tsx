import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { TeamDashboard } from './pages/TeamDashboard';
import { PublicLive } from './pages/PublicLive';
import { Results } from './pages/Results';
import { Terminal, Shield, Users, Trophy, LogOut, LogIn } from 'lucide-react';

// Protected Route Guard
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRole: 'admin' | 'team' }> = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center text-arena-textMuted font-mono">
        LOADING SECTOR DATA...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== allowedRole) {
    // If not matching, redirect to their default home
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'team') return <Navigate to="/team" replace />;
    return <Navigate to="/results" replace />;
  }

  return <>{children}</>;
};

// Navigation Bar Layout wrapper
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isLinkActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-arena-bg flex flex-col">
      {/* Navigation Header */}
      <nav className="bg-arena-panel border-b border-arena-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-2 text-white font-display font-black tracking-widest text-sm sm:text-base uppercase">
                <Terminal className="text-arena-accent w-5 h-5 animate-pulse" />
                <span>CIRCUIT <span className="text-arena-glow">ARENA</span></span>
              </Link>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center space-x-2">
                {user?.role === 'admin' && (
                  <Link
                    to="/admin"
                    className={`px-3 py-1.5 rounded text-xs font-bold tracking-wider flex items-center gap-1 transition-all ${
                      isLinkActive('/admin') ? 'bg-arena-accent text-white shadow-[0_0_10px_rgba(255,107,0,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <Shield size={13} /> DASHBOARD
                  </Link>
                )}

                {user?.role === 'team' && (
                  <Link
                    to="/team"
                    className={`px-3 py-1.5 rounded text-xs font-bold tracking-wider flex items-center gap-1 transition-all ${
                      isLinkActive('/team') ? 'bg-arena-accent text-white shadow-[0_0_10px_rgba(255,107,0,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <Users size={13} /> BID BLOCK
                  </Link>
                )}

                <Link
                  to="/results"
                  className={`px-3 py-1.5 rounded text-xs font-bold tracking-wider flex items-center gap-1 transition-all ${
                    isLinkActive('/results') ? 'bg-arena-accent text-white shadow-[0_0_10px_rgba(255,107,0,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Trophy size={13} /> SCOREBOARD
                </Link>
              </div>
            </div>

            {/* Profile & Auth controls */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-xs font-bold text-white leading-tight">
                      {user.teamName || user.username}
                    </span>
                    <span className="text-[9px] text-arena-textMuted uppercase font-mono tracking-wider">
                      {user.role} ACCESS
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-1.5 border border-arena-border hover:border-red-500 bg-arena-bg text-slate-400 hover:text-red-400 rounded transition-all flex items-center gap-1 text-xs cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut size={13} /> <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                location.pathname !== '/login' && (
                  <Link
                    to="/login"
                    className="py-1.5 px-3 bg-arena-accent hover:bg-orange-600 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors shadow-[0_0_10px_rgba(255,107,0,0.2)]"
                  >
                    <LogIn size={13} /> Login
                  </Link>
                )
              )}
            </div>
          </div>
        </div>

        {/* Small screen mobile nav tabs */}
        <div className="md:hidden flex justify-around border-t border-arena-border py-2 bg-arena-bg/80">
          {user?.role === 'admin' && (
            <Link to="/admin" className={`p-1 text-[10px] font-bold ${isLinkActive('/admin') ? 'text-arena-accent' : 'text-slate-400'}`}>
              ADMIN
            </Link>
          )}
          {user?.role === 'team' && (
            <Link to="/team" className={`p-1 text-[10px] font-bold ${isLinkActive('/team') ? 'text-arena-accent' : 'text-slate-400'}`}>
              BID
            </Link>
          )}
          <Link to="/results" className={`p-1 text-[10px] font-bold ${isLinkActive('/results') ? 'text-arena-accent' : 'text-slate-400'}`}>
            RESULTS
          </Link>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
};

// Route Selector / Default redirect
const HomeRedirect: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-arena-bg flex items-center justify-center text-arena-textMuted font-mono">
        LOADING SECTOR DATA...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'team') return <Navigate to="/team" replace />;
  return <Navigate to="/results" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<Login />} />
              
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              
              <Route
                path="/team"
                element={
                  <ProtectedRoute allowedRole="team">
                    <TeamDashboard />
                  </ProtectedRoute>
                }
              />
              
              <Route path="/live" element={<PublicLive />} />
              <Route path="/results" element={<Results />} />
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
