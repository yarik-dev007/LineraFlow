export interface WalletState {
  ownerAddress: string;
  ownerBalance: number;
  chainBalance: number;
  chainId: string;
  isConnected: boolean;
}

export interface UserProfile {
  displayName: string;
  bio: string;
  socials: {
    twitter: string;
    instagram: string;
    youtube: string;
    tiktok: string;
  }
}

export interface Creator {
  id: string;
  name: string;
  shortBio: string;
  category: string;
  raised: number;
  fullBio?: string;
  followers?: number;
  contractAddress?: string;
  chainId?: string;
  socials?: any[];
  donations?: any[];
  productsCount?: number;
}

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface OrderFormField {
  key: string;
  label: string;
  fieldType: string; // Updated from field_type
  field_type?: string; // Legacy support
  required: boolean;
}

export interface Product {
  id: string;
  author: string;
  authorChainId: string;
  chain_id?: string; // Alias for authorChainId (database compatibility)
  publicData: KeyValuePair[]; // Source of truth
  price: string;
  privateData?: KeyValuePair[];
  orderForm?: OrderFormField[];
  successMessage?: string; // Added from new spec
  createdAt: number;

  // Convenience fields populated from publicData for UI
  name: string;
  description: string;
  image?: string;
  pbId?: string; // Legacy support for PocketBase
  collectionId?: string; // Legacy support for PocketBase
  image_preview?: string; // Legacy support

  // Mapped fields
  authorAddress?: string;
  image_preview_hash?: string;
  data_blob_hash?: string;
}

export interface Purchase {
  id: string;
  productId: string;
  buyer: string;
  buyerChainId: string;
  seller: string;
  sellerChainId: string;
  amount: string;
  timestamp: number;
  orderData: KeyValuePair[];
  product: Product;
}

export enum InteractionState {
  IDLE = 'IDLE',
  HOVER = 'HOVER',
  ACTIVE = 'ACTIVE',
  LOADING = 'LOADING'
}

export type AppView = 'LANDING' | 'EXPLORE' | 'PROFILE' | 'CREATOR_DETAIL' | 'MARKETPLACE';