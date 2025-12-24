import React from 'react';
import { useNavigate } from 'react-router-dom';

interface RegistrationAlertProps {
    onClose: () => void;
    onInitialize: () => void;
}

const RegistrationAlert: React.FC<RegistrationAlertProps> = ({ onClose, onInitialize }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-paper-white border-4 border-deep-black shadow-hard animate-slide-in">
                {/* Header */}
                <div className="bg-linera-red p-4 flex justify-between items-center border-b-4 border-deep-black">
                    <h2 className="font-display text-white text-xl uppercase tracking-wider">
                        SYSTEM ALERT
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-white font-bold text-2xl hover:text-black transition-colors"
                    >
                        X
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 flex flex-col items-center text-center space-y-6">
                    {/* Warning Icon */}
                    <div className="w-24 h-24 rounded-full border-4 border-deep-black flex items-center justify-center bg-white">
                        <div className="text-6xl">⚠️</div>
                    </div>

                    {/* Message */}
                    <p className="font-mono text-sm leading-relaxed">
                        Access Denied. Protocol requires identity verification before transmission.
                    </p>

                    {/* Actions */}
                    <div className="w-full space-y-3">
                        <button
                            onClick={onInitialize}
                            className="w-full py-4 bg-deep-black text-white font-display text-lg uppercase tracking-widest hover:bg-linera-red transition-colors border-2 border-deep-black"
                        >
                            INITIALIZE IDENTITY
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-4 bg-white text-deep-black font-display text-lg uppercase tracking-widest hover:bg-gray-100 transition-colors border-2 border-deep-black"
                        >
                            CLOSE
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegistrationAlert;
