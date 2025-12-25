import React, { useState, useEffect } from 'react';
import { LineraProvider, useLinera } from './components/LineraProvider';
import WalletHUD from './components/WalletHUD';
import ProfileEditor from './components/ProfileEditor';
import ParallelPulse from './components/ParallelPulse';
import Sidebar from './components/Sidebar';
import CreatorExplorer from './components/CreatorExplorer';
import CreatorDetail from './components/CreatorDetail';
import DonationOverlay from './components/DonationOverlay';
import AlertPopup from './components/AlertPopup';
import LandingPage from './components/LandingPage';
import { WalletState, UserProfile, AppView, Creator } from './types';
import { pb } from './components/pocketbase';
import Marketplace from './components/Marketplace';
import ProductDetail from './components/ProductDetail';

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

const AppContent: React.FC = () => {
  const {
    connectWallet,
    status,
    loading,
    balances,
    accountOwner,
    chainId,
    application
  } = useLinera();

  // Navigation State (removed view state, using router)
  const location = useLocation();
  const navigate = useNavigate();

  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [viewingCreator, setViewingCreator] = useState<Creator | null>(null); // Still needed for passed props if not using URL for details yet, but plan says /item/:itemId. For now keeping creator detail as is or refactoring? The plan said /owner/:id. CreatorDetail is usually a modal or sub-view. Let's keep it simple for now or fully route it.
  // Actually, CreatorDetail was a view 'CREATOR_DETAIL'. Let's make it a route /creator/:id?
  // User asked for: /owner/owner_here/item/item-idhere and /owner/owner_here on marketplace.
  // Existing CreatorDetail is for *donations*. Let's keep it at /creator/:id for consistency? Or just keep it as is?
  // To match the existing flow: Landing -> Explore -> CreatorDetail.

  const [donationTarget, setDonationTarget] = useState<Creator | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    displayName: 'Anon User',
    bio: 'Just a fan of the decentralized web.',
    socials: { twitter: '', instagram: '', youtube: '', tiktok: '' }
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // Alert State
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }>({ isOpen: false, message: '' });

  const [myDonations, setMyDonations] = useState<any[]>([]);
  const [allDonations, setAllDonations] = useState<any[]>([]);

  // Map Linera state to WalletState for compatibility
  const walletState: WalletState = {
    ownerAddress: accountOwner || '',
    ownerBalance: parseFloat(balances.accountBalance) || 0,
    chainBalance: parseFloat(balances.chainBalance) || 0,
    chainId: chainId || '',
    isConnected: status === 'Ready'
  };

  // 1. Fetch Global Data (Profiles, Donations & Products)
  // We keep this separate to allow manual refreshes or specific trigger refreshes
  const fetchData = async (silent = false) => {
    try {
      if (!silent) console.log('🔄 [App] Fetching global data...');
      const records = await pb.collection('profiles').getFullList();
      const donations = await pb.collection('donations').getFullList({
        sort: '-timestamp'
      });
      const productsList = await pb.collection('products').getFullList();

      setAllDonations(donations);

      const mappedCreators: Creator[] = records.map((record: any) => {
        const creatorDonations = donations.filter((d: any) => d.to_owner === record.owner);
        const raised = creatorDonations.reduce((sum: number, d: any) => sum + d.amount, 0);
        const recentDonations = creatorDonations.slice(0, 3);

        // Count products for this creator
        const productCount = productsList.filter((p: any) => p.owner === record.owner).length;

        return {
          id: record.id,
          name: record.name || 'Unknown',
          category: 'Creator',
          raised: raised,
          shortBio: record.bio ? record.bio.substring(0, 100) + '...' : 'No bio.',
          fullBio: record.bio || 'No bio available.',
          followers: 0,
          contractAddress: record.owner,
          chainId: record.chain_id,
          socials: record.socials || [],
          donations: recentDonations,
          productsCount: productCount
        };
      });

      setCreators(mappedCreators);
    } catch (e: any) {
      console.error('❌ [App] Global fetch failed:', e);
    }
  };

  useEffect(() => {
    fetchData();

    // Single subscription setup - Log only, no automatic fetch
    const safeSubscribe = async (col: string, filter: string, handler: (e: any) => void) => {
      try {
        return await pb.collection(col).subscribe(filter, handler);
      } catch (e) {
        console.warn(`Failed to subscribe to ${col}:`, e);
        return () => Promise.resolve(); // Return no-op async unsub
      }
    };

    const unsubDonationsPromise = safeSubscribe('donations', '*', (e) => {
      console.log('🔔 [REALTIME] Donation event:', e.action);
      if (e.action === 'create') {
        setAllDonations(prev => [e.record, ...prev]);
      } else if (e.action === 'update') {
        setAllDonations(prev => prev.map(d => d.id === e.record.id ? e.record : d));
      } else if (e.action === 'delete') {
        setAllDonations(prev => prev.filter(d => d.id !== e.record.id));
      }
    });

    const unsubProfilesPromise = safeSubscribe('profiles', '*', (e) => {
      console.log('🔔 [REALTIME] Profile event:', e.action);
    });

    const unsubProductsPromise = safeSubscribe('products', '*', (e) => {
      console.log('🔔 [REALTIME] Product event:', e.action);
      window.dispatchEvent(new CustomEvent('pb-refresh-products', { detail: { action: e.action, record: e.record } }));
    });

    return () => {
      unsubDonationsPromise.then(fn => fn && fn().catch(() => { }));
      unsubProfilesPromise.then(fn => fn && fn().catch(() => { }));
      unsubProductsPromise.then(fn => fn && fn().catch(() => { }));
    };
  }, [accountOwner]);

  // 2. Filter User Donations when accountOwner or donations change
  useEffect(() => {
    if (accountOwner && allDonations.length > 0) {
      const userDonations = allDonations.filter((d: any) => {
        return d.to_owner.toLowerCase() === accountOwner.toLowerCase();
      });
      setMyDonations(userDonations);
    } else {
      setMyDonations([]);
    }
  }, [accountOwner, allDonations]);

  // 3. Check if user has profile
  useEffect(() => {
    const checkProfile = async () => {
      if (!accountOwner || !application) {
        setHasProfile(false);
        return;
      }

      try {
        const query = `query {
          profile(owner: "${accountOwner}") {
            name
          }
        }`;

        const result: any = await application.query(JSON.stringify({ query }));
        let data = result;
        if (typeof result === 'string') {
          data = JSON.parse(result);
        }

        const profileData = data?.data?.profile || data?.profile;
        const hasValidProfile = !!profileData && !!profileData.name;

        console.log('👤 Profile Check:', { owner: accountOwner, exists: hasValidProfile, data: profileData });
        setHasProfile(hasValidProfile);

      } catch (e) {
        console.error('Profile check failed:', e);
        setHasProfile(false);
      }
    };

    checkProfile();
  }, [accountOwner, balances.accountBalance, application]);

  // Handlers
  const handleConnectWallet = async () => {
    setIsInteracting(true);
    await connectWallet();
    setTimeout(() => setIsInteracting(false), 1000);
  };

  const handleMint = () => { };
  const handleWithdraw = () => { };

  const handleSaveProfile = (newProfile: UserProfile) => {
    console.log('✅ Profile saved locally, updating state...');
    setProfile(newProfile);
    setHasProfile(true);
    setIsInteracting(true);
    setTimeout(() => setIsInteracting(false), 1000);
  };

  const handleDonation = (amount: number, message: string) => {
    setDonationTarget(null);
    setIsInteracting(true);
    setTimeout(() => setIsInteracting(false), 800);
  };

  const handleSelectCreator = (creator: Creator) => {
    setViewingCreator(creator);
    // Since CreatorDetail is not fully routed yet in the original logic (it was a view),
    // let's keep it simple: We probably want a route for it too.
    navigate(`/creator/${creator.id}`);
  };

  const handleDonateClick = (creator: Creator) => {
    if (!hasProfile) {
      setAlertConfig({
        isOpen: true,
        message: 'Access Denied. Protocol requires identity verification before transmission.',
        actionLabel: 'INITIALIZE IDENTITY',
        onAction: () => {
          navigate('/profile');
          setAlertConfig(prev => ({ ...prev, isOpen: false }));
        }
      });
      return;
    }
    setDonationTarget(creator);
  };

  // Decide current view for Sidebar based on path
  const currentView = location.pathname === '/profile' ? 'PROFILE'
    : location.pathname.startsWith('/marketplace') || location.pathname.startsWith('/chain') ? 'MARKETPLACE'
      : 'EXPLORE';

  return (
    <div className="min-h-screen w-full bg-paper-white bg-grid-pattern relative overflow-x-hidden selection:bg-linera-red selection:text-white font-sans">

      <ParallelPulse isInteracting={isInteracting} />

      <Routes>
        <Route path="/landing" element={<LandingPage onEnter={() => navigate('/')} />} />

        {/* Main Routes with Layout */}
        <Route path="/*" element={
          <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
            <Sidebar
              currentView={currentView}
              setView={(view) => {
                if (view === 'LANDING') navigate('/landing');
                else if (view === 'PROFILE') navigate('/profile');
                else if (view === 'MARKETPLACE') navigate('/marketplace');
                else navigate('/');
              }}
              wallet={walletState}
              onToggleWallet={() => {
                if (!walletState.isConnected) handleConnectWallet();
                setIsWalletOpen(true);
              }}
            />

            <main className="flex-1 ml-0 lg:ml-64 p-4 md:p-8 lg:p-12 pb-24 lg:pb-12 transition-all duration-300">
              <Routes>
                <Route path="/" element={
                  <CreatorExplorer
                    creators={creators}
                    onSelectCreator={handleSelectCreator}
                    currentUserAddress={accountOwner || undefined}
                  />
                } />
                <Route path="/creator/:id" element={
                  viewingCreator ? (
                    <CreatorDetail
                      creator={viewingCreator}
                      allDonations={allDonations}
                      onBack={() => navigate('/')}
                      onDonate={() => handleDonateClick(viewingCreator)}
                    />
                  ) : <Navigate to="/" />
                } />
                <Route path="/profile" element={
                  <div className="flex items-start justify-center h-full">
                    <ProfileEditor
                      initialProfile={profile}
                      onSave={handleSaveProfile}
                      donations={myDonations}
                    />
                  </div>
                } />

                {/* Marketplace Routes */}
                <Route path="/marketplace" element={<Marketplace currentUserAddress={accountOwner || undefined} />} />
                <Route path="/chain/:chainId" element={<Marketplace currentUserAddress={accountOwner || undefined} />} />
                <Route path="/chain/:chainId/product/:productId" element={<ProductDetail />} />

              </Routes>
            </main>
          </div>
        } />
      </Routes>

      {/* OVERLAYS */}
      {isWalletOpen && (
        <WalletHUD
          onClose={() => setIsWalletOpen(false)}
          wallet={walletState}
          onConnect={handleConnectWallet}
          onMint={handleMint}
          onWithdraw={handleWithdraw}
        />
      )}

      {donationTarget && (
        <DonationOverlay
          creator={donationTarget}
          onClose={() => setDonationTarget(null)}
          onConfirm={handleDonation}
        />
      )}

      {alertConfig.isOpen && (
        <AlertPopup
          message={alertConfig.message}
          onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
          actionLabel={alertConfig.actionLabel}
          onAction={alertConfig.onAction}
        />
      )}

    </div>
  );
};

const App: React.FC = () => {
  return (
    <LineraProvider>
      <Router>
        <AppContent />
      </Router>
    </LineraProvider>
  );
};

export default App;