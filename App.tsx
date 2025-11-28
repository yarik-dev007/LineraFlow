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

  const [view, setView] = useState<AppView>('LANDING');
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [viewingCreator, setViewingCreator] = useState<Creator | null>(null);
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

  // 1. Fetch Global Data (Profiles & Donations)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const records = await pb.collection('profiles').getFullList();
        const donations = await pb.collection('donations').getFullList({
          sort: '-timestamp'
        });

        setAllDonations(donations);

        const mappedCreators: Creator[] = records.map((record: any) => {
          const creatorDonations = donations.filter((d: any) => d.to_owner === record.owner);
          const raised = creatorDonations.reduce((sum: number, d: any) => sum + d.amount, 0);
          const recentDonations = creatorDonations.slice(0, 3);

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
            donations: recentDonations
          };
        });

        setCreators(mappedCreators);
      } catch (e: any) {
        // Silent error handling
      }
    };

    fetchData();

    // Subscribe to realtime updates
    pb.collection('donations').subscribe('*', async (e) => {
      if (e.action === 'create' || e.action === 'update') {
        await fetchData();
      }
    });

    pb.collection('profiles').subscribe('*', async (e) => {
      if (e.action === 'create' || e.action === 'update') {
        await fetchData();
      }
    });

    return () => {
      pb.collection('donations').unsubscribe('*');
      pb.collection('profiles').unsubscribe('*');
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

  // 3. Check if user has profile (Directly from Linera for immediate consistency)
  useEffect(() => {
    const checkProfile = async () => {
      if (!accountOwner || !application) {
        setHasProfile(false);
        return;
      }

      try {
        // Query Linera state directly
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

  const handleMint = () => {
    // Mint logic is handled in WalletHUD
  };

  const handleWithdraw = () => {
    // Withdraw logic is handled in WalletHUD
  };

  const handleSaveProfile = (newProfile: UserProfile) => {
    console.log('✅ Profile saved locally, updating state...');
    setProfile(newProfile);
    setHasProfile(true); // Immediate update after successful save
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
    setView('CREATOR_DETAIL');
  };

  const handleDonateClick = (creator: Creator) => {
    if (!hasProfile) {
      setAlertConfig({
        isOpen: true,
        message: 'Access Denied. Protocol requires identity verification before transmission.',
        actionLabel: 'INITIALIZE IDENTITY',
        onAction: () => {
          setView('PROFILE');
          setAlertConfig(prev => ({ ...prev, isOpen: false }));
        }
      });
      return;
    }
    setDonationTarget(creator);
  };

  return (
    <div className="min-h-screen w-full bg-paper-white bg-grid-pattern relative overflow-x-hidden selection:bg-linera-red selection:text-white font-sans">

      {/* Background Canvas Animation - Remains fixed for landing page effect */}
      <ParallelPulse isInteracting={isInteracting} />

      {/* LANDING PAGE */}
      {view === 'LANDING' && (
        <LandingPage onEnter={() => setView('EXPLORE')} />
      )}

      {/* APP MODE */}
      {view !== 'LANDING' && (
        <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
          {/* Sidebar Navigation */}
          <Sidebar
            currentView={view}
            setView={setView}
            wallet={walletState}
            onToggleWallet={() => {
              if (!walletState.isConnected) {
                handleConnectWallet();
              }
              setIsWalletOpen(true);
            }}
          />

          {/* Main Content Area */}
          <main className="flex-1 ml-0 lg:ml-64 p-4 md:p-8 lg:p-12 pb-24 lg:pb-12 transition-all duration-300">
            {view === 'EXPLORE' && (
              <CreatorExplorer
                creators={creators}
                onSelectCreator={handleSelectCreator}
                currentUserAddress={accountOwner || undefined}
              />
            )}

            {view === 'CREATOR_DETAIL' && viewingCreator && (
              <CreatorDetail
                creator={viewingCreator}
                allDonations={allDonations}
                onBack={() => setView('EXPLORE')}
                onDonate={() => handleDonateClick(viewingCreator)}
              />
            )}

            {view === 'PROFILE' && (
              <div className="flex items-start justify-center h-full">
                <ProfileEditor
                  initialProfile={profile}
                  onSave={handleSaveProfile}
                  donations={myDonations}
                />
              </div>
            )}
          </main>
        </div>
      )}

      {/* OVERLAYS */}
      {/* Wallet HUD */}
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

      {/* Custom Alert Popup */}
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
      <AppContent />
    </LineraProvider>
  );
};

export default App;