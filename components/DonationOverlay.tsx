import React, { useState } from 'react';
import { Creator } from '../types';
import { generateSupportMessage } from '../services/geminiService';
import { useLinera } from './LineraProvider';

interface DonationOverlayProps {
  creator: Creator;
  onClose: () => void;
  onConfirm: (amount: number, message: string) => void;
}

const DonationOverlay: React.FC<DonationOverlayProps> = ({ creator, onClose, onConfirm }) => {
  const { application, accountOwner, wallet } = useLinera();
  const [amount, setAmount] = useState<string>('10');
  const [message, setMessage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleGenerateMessage = async () => {
    setIsGenerating(true);
    try {
      const numAmount = parseFloat(amount) || 0;
      const genMsg = await generateSupportMessage(creator.name, numAmount);
      setMessage(genMsg);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDonate = async () => {
    if (!application || !accountOwner) {
      alert('❌ Wallet not connected!');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('❌ Invalid amount!');
      return;
    }

    // Check if user has profile before allowing donation
    try {
      const query = `query { profile(owner: "${accountOwner}") { name } }`;
      const profileResult: any = await application.query(JSON.stringify({ query }));
      let profileData = profileResult;
      if (typeof profileResult === 'string') profileData = JSON.parse(profileResult);

      const profile = profileData?.data?.profile || profileData?.profile;
      if (!profile || !profile.name) {
        alert('⚠️ Registration Required!\n\nPlease register your profile before making donations.\n\nGo to Profile Editor to complete registration.');
        return;
      }
    } catch (error) {
      alert('⚠️ Registration Required!\n\nPlease register your profile before making donations.\n\nGo to Profile Editor to complete registration.');
      return;
    }

    setIsSending(true);

    try {
      // Prepare the Transfer mutation
      const targetChainId = creator.chainId || creator.contractAddress || '';
      const targetOwner = creator.contractAddress || '';

      console.log('=== DONATION DEBUG ===');
      console.log('Creator data:', {
        name: creator.name,
        contractAddress: creator.contractAddress,
        chainId: creator.chainId
      });
      console.log('Current user:', accountOwner);
      console.log('Target chain:', targetChainId);
      console.log('Target owner:', targetOwner);
      console.log('Amount:', numAmount);

      const mutation = `mutation {
        transfer(
          owner: "${accountOwner}",
          amount: "${numAmount}",
          targetAccount: {
            chainId: "${targetChainId}",
            owner: "${targetOwner}"
          },
          textMessage: "${message.replace(/"/g, '\\"')}"
        )
      }`;

      console.log('Mutation:', mutation);

      // Execute the mutation - For user-initiated mutations, use MetaMask owner
      const result = await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });
      console.log('Donation result:', result);

      // Call the parent's onConfirm to update UI
      onConfirm(numAmount, message);

      // Close the overlay
      onClose();
    } catch (error: any) {
      console.error('Donation failed:', error);
      alert(`❌ Donation failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-deep-black/80 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-paper-white border-4 border-deep-black shadow-hard p-0 animate-slide-in">
        {/* Header */}
        <div className="bg-linera-red p-4 border-b-4 border-deep-black flex justify-between items-center">
          <h3 className="font-display text-white text-2xl uppercase">Sending Donation</h3>
          <button onClick={onClose} className="text-white font-mono text-xl hover:text-black">X</button>
        </div>

        <div className="p-8 space-y-6">
          {/* Recipient Info */}
          <div className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
            <span className="font-mono text-sm text-gray-500">TARGET ACCOUNT:</span>
            <span className="font-display text-xl">{creator.name}</span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
            <span className="font-mono text-sm text-gray-500">TARGET CHAIN:</span>
            <span className="font-mono text-sm text-right break-all max-w-[70%]">{creator.chainId || creator.contractAddress?.substring(0, 8) + '...'}</span>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="block font-mono text-xs font-bold uppercase">Donation Amount (LIN)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-4xl font-display p-2 border-b-4 border-deep-black outline-none focus:bg-gray-50"
              disabled={isSending}
            />
          </div>

          {/* Message Input with AI */}
          <div className="space-y-2 relative">
            <label className="block font-mono text-xs font-bold uppercase flex justify-between">
              <span>Attached Data (Optional)</span>
              <span className="text-linera-red text-[10px]">AI ENHANCED</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full h-24 border-2 border-deep-black p-2 font-mono text-sm resize-none"
              placeholder="Write a message..."
              disabled={isSending}
            />
            <button
              onClick={handleGenerateMessage}
              disabled={isGenerating || isSending}
              className="absolute bottom-3 right-3 text-xs bg-deep-black text-white px-2 py-1 hover:bg-linera-red transition-colors disabled:opacity-50"
            >
              {isGenerating ? "COMPUTING..." : "GENERATE HYPE"}
            </button>
          </div>

          {/* Action Button */}
          <button
            onClick={handleDonate}
            disabled={isSending}
            className="w-full bg-deep-black text-white font-display text-xl uppercase py-4 hover:bg-linera-red transition-colors shadow-[4px_4px_0px_0px_#000] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? 'TRANSMITTING...' : 'Execute Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DonationOverlay;