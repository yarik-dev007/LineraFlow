import React, { useState } from 'react';
import { Product, OrderFormField } from '../types';
import { X, Check } from 'lucide-react';

interface OrderFillModalProps {
    product: Product;
    onClose: () => void;
    onSubmit: (orderData: { key: string; value: string }[]) => void;
}

const OrderFillModal: React.FC<OrderFillModalProps> = ({ product, onClose, onSubmit }) => {
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleChange = (key: string, value: string) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        // Clear error on change
        if (errors[key]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        let isValid = true;

        product.orderForm?.forEach(field => {
            if (field.required && !formData[field.key]) {
                newErrors[field.key] = `This field is required`;
                isValid = false;
            }
            if (field.fieldType === 'email' && formData[field.key]) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData[field.key])) {
                    newErrors[field.key] = `Invalid email address`;
                    isValid = false;
                }
            }
        });

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const data = Object.entries(formData).map(([key, value]) => ({ key, value }));
            onSubmit(data);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b-4 border-deep-black bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold uppercase flex items-center gap-2">
                            Order Form
                        </h2>
                        <p className="text-sm text-gray-600 font-mono mt-1">
                            Additional details for {product.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {product.orderForm?.map((field) => (
                        <div key={field.key} className="flex flex-col gap-1">
                            <label className="text-sm font-bold uppercase flex items-center gap-1">
                                {field.label}
                                {field.required && <span className="text-linera-red">*</span>}
                            </label>

                            {field.fieldType === 'text' || field.fieldType === 'email' || field.fieldType === 'number' || !field.fieldType ? (
                                <input
                                    type={field.fieldType || 'text'}
                                    value={formData[field.key] || ''}
                                    onChange={(e) => handleChange(field.key, e.target.value)}
                                    className={`border-2 p-2 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all
                                        ${errors[field.key] ? 'border-linera-red bg-red-50' : 'border-deep-black'}`}
                                    placeholder={`Enter ${field.label}...`}
                                />
                            ) : field.fieldType === 'textarea' ? (
                                <textarea
                                    value={formData[field.key] || ''}
                                    onChange={(e) => handleChange(field.key, e.target.value)}
                                    className={`border-2 p-2 min-h-[100px] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all
                                        ${errors[field.key] ? 'border-linera-red bg-red-50' : 'border-deep-black'}`}
                                    placeholder={`Enter details...`}
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={formData[field.key] || ''}
                                    onChange={(e) => handleChange(field.key, e.target.value)}
                                    className="border-2 border-deep-black p-2 bg-gray-100"
                                />
                            )}

                            {errors[field.key] && (
                                <span className="text-xs text-linera-red font-bold">{errors[field.key]}</span>
                            )}
                        </div>
                    ))}

                    {(!product.orderForm || product.orderForm.length === 0) && (
                        <div className="text-gray-500 font-mono italic">
                            No additional information required. You can proceed.
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="p-4 border-t-4 border-deep-black bg-gray-50 sticky bottom-0 flex justify-end gap-2">
                    <div className="flex-1 flex flex-col justify-center">
                        <span className="text-xs font-mono text-gray-500">Price: {product.price}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 font-bold uppercase hover:bg-gray-200 border-2 border-transparent hover:border-gray-300 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="bg-linera-red text-white px-6 py-2 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2 border-2 border-deep-black"
                    >
                        <Check className="w-5 h-5" /> Submit Order
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OrderFillModal;
