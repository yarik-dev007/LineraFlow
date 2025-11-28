import React, { useState } from 'react';
import { useLinera } from './useLinera';

const DebugConsole: React.FC = () => {
    const { application, accountOwner, status } = useLinera();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState(`query {
  accounts {
    entry(key: "${accountOwner || 'YOUR_OWNER'}") {
      key
      value
    }
  }
}`);
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);

    const executeQuery = async () => {
        if (!application) {
            setResult('❌ Application not connected');
            return;
        }

        setLoading(true);
        try {
            const res = await application.query(JSON.stringify({ query }));
            const formatted = JSON.stringify(
                typeof res === 'string' ? JSON.parse(res) : res,
                null,
                2
            );
            setResult(formatted);
        } catch (error: any) {
            setResult(`❌ Error:\n${error.message || String(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const templates = [
        {
            name: 'Account Balance',
            query: `query {
  accounts {
    entry(key: "${accountOwner || 'OWNER'}") {
      key
      value
    }
  }
}`
        },
        {
            name: 'Chain Balance',
            query: `query {
  accounts {
    chainBalance
  }
}`
        },
        {
            name: 'All Account Entries',
            query: `query {
  accounts {
    entries {
      key
      value
    }
  }
}`
        },
        {
            name: 'Total Received View',
            query: `query {
  totalReceivedView(owner: "${accountOwner || 'OWNER'}") {
    owner
    chainId
    amount
  }
}`
        },
        {
            name: 'Total Sent View',
            query: `query {
  totalSentView(owner: "${accountOwner || 'OWNER'}") {
    owner
    chainId
    amount
  }
}`
        },
        {
            name: 'Send Donation',
            query: `mutation {
  donate(
    recipient: "RECIPIENT_OWNER_HERE",
    amount: "10.",
    message: "Great work!"
  )
}`
        }
    ];

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 bg-linera-red text-white px-4 py-2 border-4 border-deep-black shadow-hard hover:shadow-hard-sm transition-all z-50 font-display uppercase"
                title="Open GraphQL Debug Console"
            >
                🛠️ Debug
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 w-[700px] max-h-[85vh] bg-paper-white border-4 border-deep-black shadow-hard z-50 flex flex-col">
            {/* Header */}
            <div className="bg-linera-red text-white p-3 border-b-4 border-deep-black flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="font-display text-lg">🛠️ GraphQL Console</span>
                    <span className={`text-xs px-2 py-1 border-2 border-white ${status === 'Ready' ? 'bg-green-500' : 'bg-yellow-500'
                        }`}>
                        {status}
                    </span>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="font-display text-2xl hover:scale-110 transition-transform"
                >
                    ×
                </button>
            </div>

            {/* Templates */}
            <div className="p-2 border-b-2 border-deep-black bg-gray-100 max-h-32 overflow-y-auto">
                <div className="text-xs font-bold mb-1 uppercase">Templates ({templates.length}):</div>
                <div className="flex flex-wrap gap-1">
                    {templates.map((template, idx) => (
                        <button
                            key={idx}
                            onClick={() => setQuery(template.query)}
                            className="text-xs px-2 py-1 bg-white border-2 border-deep-black hover:bg-linera-red hover:text-white transition-all"
                        >
                            {template.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Query Input */}
            <div className="p-4 border-b-2 border-deep-black">
                <label className="block text-xs font-bold mb-2 uppercase">Query / Mutation:</label>
                <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full h-32 font-mono text-sm p-2 border-2 border-deep-black focus:outline-none focus:ring-2 focus:ring-linera-red"
                    placeholder="Enter GraphQL query or mutation..."
                />
                <button
                    onClick={executeQuery}
                    disabled={loading || !application}
                    className="mt-2 w-full py-2 bg-linera-red text-white font-display uppercase border-2 border-deep-black shadow-hard-sm hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {loading ? '⏳ Executing...' : '▶️ Execute'}
                </button>
            </div>

            {/* Result Output */}
            <div className="p-4 bg-gray-50 flex-1 overflow-auto">
                <label className="block text-xs font-bold mb-2 uppercase">Result:</label>
                <pre className="font-mono text-xs bg-white border-2 border-deep-black p-2 overflow-auto max-h-[300px]">
                    {result || '// No result yet. Execute a query above.'}
                </pre>
            </div>

            {/* Footer Info */}
            <div className="p-2 bg-deep-black text-white text-xs font-mono border-t-2 border-deep-black">
                <div>Owner: {accountOwner || 'Not connected'}</div>
                <div className="text-gray-400 mt-1">Contract: Donations • {templates.length} templates • NOW WITH ACCOUNTS!</div>
            </div>
        </div>
    );
};

export default DebugConsole;
