use async_graphql::{Request, Response, SimpleObject, InputObject};
use linera_sdk::linera_base_types::{AccountOwner, Amount, ContractAbi, ServiceAbi, ChainId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// Type aliases for custom fields
pub type CustomFields = BTreeMap<String, String>;
pub type OrderResponses = BTreeMap<String, String>;

#[derive(Debug, Deserialize, Serialize)]
pub enum Message {
    Notify,
    TransferWithMessage {
        owner: AccountOwner,
        amount: Amount,
        text_message: Option<String>,
        source_chain_id: ChainId,
        source_owner: AccountOwner,
    },
    Register {
        source_chain_id: ChainId,
        owner: AccountOwner,
        name: Option<String>,
        bio: Option<String>,
        socials: Vec<SocialLink>,
    },
    ProductCreated {
        product: Product,
    },
    ProductUpdated {
        product: Product,
    },
    ProductDeleted {
        product_id: String,
        author: AccountOwner,
    },
    ProductPurchased {
        purchase_id: String,
        product_id: String,
        buyer: AccountOwner,
        buyer_chain_id: ChainId,
        seller: AccountOwner,
        amount: Amount,
    },
    SendProductData {
        buyer: AccountOwner,
        purchase_id: String,
        product: Product,
    },
    // NEW: Order notification to seller
    OrderReceived {
        purchase_id: String,
        product_id: String,
        buyer: AccountOwner,
        buyer_chain_id: ChainId,
        amount: Amount,
        order_data: OrderResponses,
        timestamp: u64,
    },
    // Content subscription messages
    SubscriptionPayment {
        subscriber: AccountOwner,
        subscriber_chain_id: String,
        author: AccountOwner,
        amount: Amount,
        duration_micros: u64,
        timestamp: u64,
    },
    PostPublished {
        post: Post,
    },
    PostUpdated {
        post: Post,
    },
    PostDeleted {
        post_id: String,
        author: AccountOwner,
    },
}

#[derive(Debug, Deserialize, Serialize, InputObject)]
pub struct AccountInput {
    pub chain_id: ChainId,
    pub owner: AccountOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct SocialLink {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
pub struct SocialLinkInput {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct AccountEntry {
    pub key: AccountOwner,
    pub value: Amount,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct Profile {
    pub owner: AccountOwner,
    pub name: String,
    pub bio: String,
    pub socials: Vec<SocialLink>,
    pub avatar_hash: Option<String>,
    pub header_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ProfileView {
    pub owner: AccountOwner,
    pub chain_id: String,
    pub name: String,
    pub bio: String,
    pub socials: Vec<SocialLink>,
    pub avatar_hash: Option<String>,
    pub header_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct SubscriptionInfo {
    pub author: AccountOwner,
    pub price: Amount,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct DonationRecord {
    pub id: u64,
    pub timestamp: u64,
    pub from: AccountOwner,
    pub to: AccountOwner,
    pub amount: Amount,
    pub message: Option<String>,
    pub source_chain_id: Option<String>,
    pub to_chain_id: Option<String>,
}

// Content subscription structure
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ContentSubscription {
    pub id: String,
    pub subscriber: AccountOwner,
    pub subscriber_chain_id: String,
    pub author: AccountOwner,
    pub author_chain_id: String,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    pub price: Amount,
}

// Post structure
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct Post {
    pub id: String,
    pub author: AccountOwner,
    pub author_chain_id: String,
    pub title: String,
    pub content: String,
    pub image_hash: Option<String>,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct DonationView {
    pub id: u64,
    pub timestamp: u64,
    pub from_owner: AccountOwner,
    pub from_chain_id: String,
    pub to_owner: AccountOwner,
    pub to_chain_id: String,
    pub amount: Amount,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct TotalAmountView {
    pub owner: AccountOwner,
    pub chain_id: String,
    pub amount: Amount,
}

// NEW: Order form field definition
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct OrderFormField {
    pub key: String,
    pub label: String,
    pub field_type: String,  // "text", "email", "textarea", "select", etc.
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
pub struct OrderFormFieldInput {
    pub key: String,
    pub label: String,
    pub field_type: String,
    pub required: bool,
}

// NEW: Flexible Product structure
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct Product {
    pub id: String,
    pub author: AccountOwner,
    pub author_chain_id: String,
    
    // Public data (visible to all) - includes name, description, image_preview_hash, type, etc.
    pub public_data: CustomFields,
    pub price: Amount,
    
    // Private data (visible after purchase) - includes data_blob_hash, links, etc.
    pub private_data: CustomFields,
    
    // Success message shown after purchase
    pub success_message: Option<String>,
    
    // Order form template
    pub order_form: Vec<OrderFormField>,
    
    pub created_at: u64,
}

// Legacy ProductView for backward compatibility in queries
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ProductView {
    pub id: String,
    pub author: AccountOwner,
    pub author_chain_id: String,
    pub name: String,
    pub description: String,
    pub link: String,
    pub data_blob_hash: String,
    pub image_preview_hash: String,
    pub price: Amount,
    pub created_at: u64,
}

// NEW: Purchase with order data
#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct Purchase {
    pub id: String,
    pub product_id: String,
    pub buyer: AccountOwner,
    pub buyer_chain_id: String,
    pub seller: AccountOwner,
    pub seller_chain_id: String,
    pub amount: Amount,
    pub timestamp: u64,
    
    // Order responses from buyer
    pub order_data: OrderResponses,
    
    // Product snapshot at time of purchase
    pub product: Product,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct PurchaseView {
    pub id: String,
    pub product_id: String,
    pub buyer: AccountOwner,
    pub buyer_chain_id: String,
    pub seller: AccountOwner,
    pub seller_chain_id: String,
    pub amount: Amount,
    pub timestamp: u64,
    pub product: ProductView,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DonationsEvent {
    ProfileNameUpdated { owner: AccountOwner, name: String, timestamp: u64 },
    ProfileBioUpdated { owner: AccountOwner, bio: String, timestamp: u64 },
    ProfileSocialUpdated { owner: AccountOwner, name: String, url: String, timestamp: u64 },
    ProfileAvatarUpdated { owner: AccountOwner, hash: String, timestamp: u64 },
    ProfileHeaderUpdated { owner: AccountOwner, hash: String, timestamp: u64 },
    DonationSent { id: u64, from: AccountOwner, to: AccountOwner, amount: Amount, message: Option<String>, source_chain_id: Option<String>, to_chain_id: Option<String>, timestamp: u64 },
    ProductCreated { product: Product, timestamp: u64 },
    ProductUpdated { product: Product, timestamp: u64 },
    ProductDeleted { product_id: String, author: AccountOwner, timestamp: u64 },
    ProductPurchased { purchase_id: String, product_id: String, buyer: AccountOwner, seller: AccountOwner, amount: Amount, timestamp: u64 },
    // NEW: Order placed event
    OrderPlaced { purchase_id: String, product_id: String, buyer: AccountOwner, seller: AccountOwner, amount: Amount, timestamp: u64 },
    // Content subscription events
    SubscriptionPriceSet { author: AccountOwner, price: Amount, description: Option<String>, timestamp: u64 },
    SubscriptionPriceDeleted { author: AccountOwner, timestamp: u64 },
    UserSubscribed { subscription_id: String, subscriber: AccountOwner, author: AccountOwner, price: Amount, end_timestamp: u64, timestamp: u64 },
    UserUnsubscribed { subscription_id: String, subscriber: AccountOwner, author: AccountOwner, timestamp: u64 },
    PostCreated { post: Post, timestamp: u64 },
    PostUpdated { post: Post, timestamp: u64 },
    PostDeleted { post_id: String, author: AccountOwner, timestamp: u64 },
}

pub struct DonationsAbi;

impl ContractAbi for DonationsAbi {
    type Operation = Operation;
    type Response = ResponseData;
}

impl ServiceAbi for DonationsAbi {
    type Query = Request;
    type QueryResponse = Response;
}

#[derive(Debug, Deserialize, Serialize)]
pub enum Operation {
    Transfer {
        owner: AccountOwner,
        amount: Amount,
        target_account: linera_sdk::abis::fungible::Account,
        text_message: Option<String>,
    },
    Withdraw,
    Mint { owner: AccountOwner, amount: Amount },
    UpdateProfile { name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput>, avatar_hash: Option<String>, header_hash: Option<String> },
    Register { main_chain_id: ChainId, name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput>, avatar_hash: Option<String>, header_hash: Option<String> },
    SetAvatar { hash: String },
    SetHeader { hash: String },
    GetProfile { owner: AccountOwner },
    GetDonationsByRecipient { owner: AccountOwner },
    GetDonationsByDonor { owner: AccountOwner },
    
    // NEW: Flexible CreateProduct
    CreateProduct {
        public_data: CustomFields,
        price: Amount,
        private_data: CustomFields,
        success_message: Option<String>,
        order_form: Vec<OrderFormFieldInput>,
    },
    
    // NEW: Flexible UpdateProduct
    UpdateProduct {
        product_id: String,
        public_data: Option<CustomFields>,
        price: Option<Amount>,
        private_data: Option<CustomFields>,
        success_message: Option<String>,
        order_form: Option<Vec<OrderFormFieldInput>>,
    },
    
    DeleteProduct {
        product_id: String,
    },
    
    // NEW: TransferToBuy with order data
    TransferToBuy {
        owner: AccountOwner,
        product_id: String,
        amount: Amount,
        target_account: linera_sdk::abis::fungible::Account,
        order_data: OrderResponses,
    },
    
    ReadDataBlob {
        hash: String,
    },
    
    // Content subscription operations    
    SetSubscriptionPrice {
        price: Amount,
        description: Option<String>,
    },
    
    DeleteSubscriptionPrice,
    
    SubscribeToAuthor {
        owner: AccountOwner,
        amount: Amount,
        target_account: linera_sdk::abis::fungible::Account,
    },
    
    CreatePost {
        title: String,
        content: String,
        image_hash: Option<String>,
    },
    
    UpdatePost {
        post_id: String,
        title: Option<String>,
        content: Option<String>,
        image_hash: Option<String>,
    },
    
    DeletePost {
        post_id: String,
    },
}

#[derive(Debug, Deserialize, Serialize)]
pub enum ResponseData {
    Ok,
    Profile(Option<Profile>),
    Donations(Vec<DonationRecord>),
}
