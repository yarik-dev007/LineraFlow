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

export interface Product {
  id: string;
  pbId?: string;
  collectionId?: string;
  name: string;
  description: string;
  price: number;
  author: string;
  authorAddress?: string;
  authorChainId?: string;
  image?: string;
  image_preview?: string;
  image_preview_hash?: string;
  data_blob_hash?: string;
}

export interface Purchase {
  id: string;
  product_id: string;
  buyer: string;
  buyer_chain_id: string;
  seller: string;
  seller_chain_id: string;
  amount: string;
  timestamp: string;
  product: Product;
}

export enum InteractionState {
  IDLE = 'IDLE',
  HOVER = 'HOVER',
  ACTIVE = 'ACTIVE',
  LOADING = 'LOADING'
}

export type AppView = 'LANDING' | 'EXPLORE' | 'PROFILE' | 'CREATOR_DETAIL' | 'MARKETPLACE';