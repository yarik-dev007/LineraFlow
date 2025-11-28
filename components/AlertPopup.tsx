import React from 'react';

interface AlertPopupProps {
    title?: string;
    message: string;
    onClose: () => void;
    actionLabel?: string;
    onAction?: () => void;
}

const AlertPopup: React.FC<AlertPopupProps> = ({
    title = "SYSTEM ALERT",
    message,
    onClose,
    actionLabel,
    onAction
}) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-deep-black/80 backdrop-blur-sm" onClick={onClose}></div>

            {/* Modal */}
            <div className="relative w-full max-w-md bg-paper-white border-4 border-deep-black shadow-hard p-0 animate-slide-in">
                {/* Header */}
                <div className="bg-linera-red p-4 border-b-4 border-deep-black flex justify-between items-center">
                    <h3 className="font-display text-white text-xl uppercase">{title}</h3>
                    <button onClick={onClose} className="text-white font-mono text-xl hover:text-black">X</button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Message Icon & Text */}
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-16 h-16 bg-gray-100 border-2 border-deep-black flex items-center justify-center rounded-full">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <p className="font-mono text-sm md:text-base font-bold text-deep-black leading-relaxed">
                            {message}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3">
                        {actionLabel && onAction && (
                            <button
                                onClick={onAction}
                                className="w-full bg-deep-black text-white font-display text-lg uppercase py-3 hover:bg-linera-red transition-colors shadow-[4px_4px_0px_0px_#000]"
                            >
                                {actionLabel}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="w-full bg-white text-deep-black border-2 border-deep-black font-mono text-sm uppercase py-3 hover:bg-gray-50 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertPopup;
