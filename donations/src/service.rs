#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;
use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{linera_base_types::{AccountOwner, WithServiceAbi, Amount}, views::View, Service, ServiceRuntime};
use donations::{
    DonationsAbi, Operation, AccountInput, Profile as LibProfile, DonationRecord as LibDonationRecord,
    ProfileView, DonationView, SocialLinkInput, TotalAmountView, CustomFields, OrderFormField,
    OrderFormFieldInput, OrderResponses, Product, ContentSubscription, Post,
};
use state::DonationsState;
use async_graphql::{SimpleObject, InputObject};

// NEW: Product public view (visible to all, excludes private data)
#[derive(SimpleObject)]
struct ProductPublicView {
    id: String,
    author: AccountOwner,
    author_chain_id: String,
    public_data: Vec<KeyValuePair>,
    price: Amount,
    order_form: Vec<OrderFormFieldView>,
    created_at: u64,
}

// NEW: Product full view (includes private data, for purchased products)
#[derive(SimpleObject)]
struct ProductFullView {
    id: String,
    author: AccountOwner,
    author_chain_id: String,
    public_data: Vec<KeyValuePair>,
    price: Amount,
    private_data: Vec<KeyValuePair>,
    success_message: Option<String>,
    order_form: Vec<OrderFormFieldView>,
    created_at: u64,
}

// Helper type for BTreeMap -> GraphQL
#[derive(SimpleObject, Clone)]
struct KeyValuePair {
    key: String,
    value: String,
}

// Order form field view
#[derive(SimpleObject, Clone)]
struct OrderFormFieldView {
    key: String,
    label: String,
    field_type: String,
    required: bool,
}

// NEW: Purchase with full product data
#[derive(SimpleObject)]
struct PurchaseFullView {
    id: String,
    product_id: String,
    buyer: AccountOwner,
    buyer_chain_id: String,
    seller: AccountOwner,
    seller_chain_id: String,
    amount: Amount,
    timestamp: u64,
    order_data: Vec<KeyValuePair>,
    product: ProductFullView,
}

// Helper functions
fn btree_to_pairs(map: &CustomFields) -> Vec<KeyValuePair> {
    map.iter().map(|(k, v)| KeyValuePair { key: k.clone(), value: v.clone() }).collect()
}

fn order_form_to_views(form: &[OrderFormField]) -> Vec<OrderFormFieldView> {
    form.iter().map(|f| OrderFormFieldView {
        key: f.key.clone(),
        label: f.label.clone(),
        field_type: f.field_type.clone(),
        required: f.required,
    }).collect()
}

fn product_to_public_view(p: &Product) -> ProductPublicView {
    ProductPublicView {
        id: p.id.clone(),
        author: p.author,
        author_chain_id: p.author_chain_id.clone(),
        public_data: btree_to_pairs(&p.public_data),
        price: p.price,
        order_form: order_form_to_views(&p.order_form),
        created_at: p.created_at,
    }
}

fn product_to_full_view(p: &Product) -> ProductFullView {
    ProductFullView {
        id: p.id.clone(),
        author: p.author,
        author_chain_id: p.author_chain_id.clone(),
        public_data: btree_to_pairs(&p.public_data),
        price: p.price,
        private_data: btree_to_pairs(&p.private_data),
        success_message: p.success_message.clone(),
        order_form: order_form_to_views(&p.order_form),
        created_at: p.created_at,
    }
}

linera_sdk::service!(DonationsService);

pub struct DonationsService { runtime: Arc<ServiceRuntime<Self>> }

impl WithServiceAbi for DonationsService { type Abi = DonationsAbi; }

impl Service for DonationsService {
    type Parameters = ();
    async fn new(runtime: ServiceRuntime<Self>) -> Self { DonationsService { runtime: Arc::new(runtime) } }
    async fn handle_query(&self, request: Request) -> Response {
        let schema = Schema::build(QueryRoot { runtime: self.runtime.clone(), storage_context: self.runtime.root_view_storage_context() }, MutationRoot { runtime: self.runtime.clone() }, EmptySubscription).finish();
        schema.execute(request).await
    }
}

struct Accounts {
    runtime: Arc<ServiceRuntime<DonationsService>>,
}

#[Object]
impl Accounts {
    async fn entry(&self, key: AccountOwner) -> donations::AccountEntry {
        let value = self.runtime.owner_balance(key);
        donations::AccountEntry { key, value }
    }

    async fn entries(&self) -> Vec<donations::AccountEntry> {
        self.runtime
            .owner_balances()
            .into_iter()
            .map(|(owner, amount)| donations::AccountEntry {
                key: owner,
                value: amount,
            })
            .collect()
    }

    async fn keys(&self) -> Vec<AccountOwner> {
        self.runtime.balance_owners()
    }

    async fn chain_balance(&self) -> String {
        let balance = self.runtime.chain_balance();
        balance.to_string()
    }
}

struct QueryRoot { runtime: Arc<ServiceRuntime<DonationsService>>, storage_context: linera_sdk::views::ViewStorageContext }

#[Object]
impl QueryRoot {
    async fn accounts(&self) -> Accounts {
        Accounts {
            runtime: self.runtime.clone(),
        }
    }

    async fn profile(&self, owner: AccountOwner) -> Option<LibProfile> {
        match DonationsState::load(self.storage_context.clone()).await { Ok(state) => state.get_profile(owner).await.ok().flatten(), Err(_) => None }
    }
    async fn donations_by_recipient(&self, owner: AccountOwner) -> Vec<LibDonationRecord> {
        match DonationsState::load(self.storage_context.clone()).await { Ok(state) => state.list_donations_by_recipient(owner).await.unwrap_or_default(), Err(_) => Vec::new() }
    }
    async fn donations_by_donor(&self, owner: AccountOwner) -> Vec<LibDonationRecord> {
        match DonationsState::load(self.storage_context.clone()).await { Ok(state) => state.list_donations_by_donor(owner).await.unwrap_or_default(), Err(_) => Vec::new() }
    }
    async fn all_profiles(&self) -> Vec<LibProfile> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.profiles.indices().await {
                    Ok(owners) => {
                        let mut res = Vec::new();
                        for owner in owners {
                            if let Ok(Some(p)) = state.profiles.get(&owner).await { res.push(p); }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }
    async fn all_donations(&self) -> Vec<LibDonationRecord> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.donations.indices().await {
                    Ok(ids) => {
                        let mut res = Vec::new();
                        for id in ids {
                            if let Ok(Some(r)) = state.donations.get(&id).await { res.push(r); }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn profile_view(&self, owner: AccountOwner) -> Option<ProfileView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                state.get_profile(owner).await.ok().flatten().map(|p| ProfileView {
                    owner: p.owner,
                    chain_id,
                    name: p.name,
                    bio: p.bio,
                    socials: p.socials,
                    avatar_hash: p.avatar_hash,
                    header_hash: p.header_hash,
                })
            },
            Err(_) => None,
        }
    }

    async fn all_profiles_view(&self) -> Vec<ProfileView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.profiles.indices().await {
                    Ok(owners) => {
                        let mut res = Vec::new();
                        for owner in owners {
                            let chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            if let Ok(Some(p)) = state.profiles.get(&owner).await {
                                res.push(ProfileView { 
                                    owner: p.owner, 
                                    chain_id, 
                                    name: p.name, 
                                    bio: p.bio, 
                                    socials: p.socials,
                                    avatar_hash: p.avatar_hash,
                                    header_hash: p.header_hash,
                                });
                            }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn donations_view_by_recipient(&self, owner: AccountOwner) -> Vec<DonationView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let to_chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                match state.list_donations_by_recipient(owner).await {
                    Ok(list) => {
                        let mut res = Vec::with_capacity(list.len());
                        for r in list {
                            let from_chain_id = state.subscriptions.get(&r.from).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            res.push(DonationView {
                                id: r.id,
                                timestamp: r.timestamp,
                                from_owner: r.from,
                                from_chain_id,
                                to_owner: r.to,
                                to_chain_id: to_chain_id.clone(),
                                amount: r.amount,
                                message: r.message,
                            });
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn donations_view_by_donor(&self, owner: AccountOwner) -> Vec<DonationView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let from_chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                match state.list_donations_by_donor(owner).await {
                    Ok(list) => {
                        let mut res = Vec::with_capacity(list.len());
                        for r in list {
                            let to_chain_id = state.subscriptions.get(&r.to).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            res.push(DonationView {
                                id: r.id,
                                timestamp: r.timestamp,
                                from_owner: r.from,
                                from_chain_id: from_chain_id.clone(),
                                to_owner: r.to,
                                to_chain_id,
                                amount: r.amount,
                                message: r.message,
                            });
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn all_donations_view(&self) -> Vec<DonationView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.donations.indices().await {
                    Ok(ids) => {
                        let mut res = Vec::new();
                        for id in ids {
                            if let Ok(Some(r)) = state.donations.get(&id).await {
                                let from_chain_id = state.subscriptions.get(&r.from).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                                let to_chain_id = state.subscriptions.get(&r.to).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                                res.push(DonationView { id: r.id, timestamp: r.timestamp, from_owner: r.from, from_chain_id, to_owner: r.to, to_chain_id, amount: r.amount, message: r.message });
                            }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn total_received_amount(&self, owner: AccountOwner) -> String {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.donations_by_recipient.get(&owner).await {
                    Ok(Some(ids)) => {
                        let mut sum = Amount::ZERO;
                        for id in ids {
                            if let Ok(Some(r)) = state.donations.get(&id).await { sum = sum.saturating_add(r.amount); }
                        }
                        sum.to_string()
                    },
                    _ => Amount::ZERO.to_string(),
                }
            },
            Err(_) => Amount::ZERO.to_string(),
        }
    }

    async fn total_sent_amount(&self, owner: AccountOwner) -> String {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.donations_by_donor.get(&owner).await {
                    Ok(Some(ids)) => {
                        let mut sum = Amount::ZERO;
                        for id in ids {
                            if let Ok(Some(r)) = state.donations.get(&id).await { sum = sum.saturating_add(r.amount); }
                        }
                        sum.to_string()
                    },
                    _ => Amount::ZERO.to_string(),
                }
            },
            Err(_) => Amount::ZERO.to_string(),
        }
    }

    async fn total_received_view(&self, owner: AccountOwner) -> TotalAmountView {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                let amount = match state.donations_by_recipient.get(&owner).await {
                    Ok(Some(ids)) => {
                        let mut sum = Amount::ZERO;
                        for id in ids { if let Ok(Some(r)) = state.donations.get(&id).await { sum = sum.saturating_add(r.amount); } }
                        sum
                    },
                    _ => Amount::ZERO,
                };
                TotalAmountView { owner, chain_id, amount }
            },
            Err(_) => TotalAmountView { owner, chain_id: self.runtime.chain_id().to_string(), amount: Amount::ZERO },
        }
    }

    async fn total_sent_view(&self, owner: AccountOwner) -> TotalAmountView {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let chain_id = state.subscriptions.get(&owner).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                let amount = match state.donations_by_donor.get(&owner).await {
                    Ok(Some(ids)) => {
                        let mut sum = Amount::ZERO;
                        for id in ids { if let Ok(Some(r)) = state.donations.get(&id).await { sum = sum.saturating_add(r.amount); } }
                        sum
                    },
                    _ => Amount::ZERO,
                };
                TotalAmountView { owner, chain_id, amount }
            },
            Err(_) => TotalAmountView { owner, chain_id: self.runtime.chain_id().to_string(), amount: Amount::ZERO },
        }
    }

    // Marketplace queries - NEW: Using flexible product structure
    
    /// Get all products (public view only, no private data)
    async fn all_products(&self) -> Vec<ProductPublicView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.products.indices().await {
                    Ok(ids) => {
                        let mut res = Vec::new();
                        for id in ids {
                            if let Ok(Some(p)) = state.products.get(&id).await {
                                res.push(product_to_public_view(&p));
                            }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get products by author (public view only)
    async fn products_by_author(&self, owner: AccountOwner) -> Vec<ProductPublicView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_products_by_author(owner).await {
                    Ok(products) => products.iter().map(|p| product_to_public_view(p)).collect(),
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get products by author with full data (for the author to edit)
    async fn products_by_author_full(&self, owner: AccountOwner) -> Vec<ProductFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_products_by_author(owner).await {
                    Ok(products) => products.iter().map(|p| product_to_full_view(p)).collect(),
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get single product by ID (public view only)
    async fn product(&self, id: String) -> Option<ProductPublicView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.get_product(&id).await {
                    Ok(Some(p)) => Some(product_to_public_view(&p)),
                    _ => None,
                }
            },
            Err(_) => None,
        }
    }

    /// Get single product with full data (for author or buyer)
    async fn product_full(&self, id: String) -> Option<ProductFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.get_product(&id).await {
                    Ok(Some(p)) => Some(product_to_full_view(&p)),
                    _ => None,
                }
            },
            Err(_) => None,
        }
    }

    /// Get purchases for buyer with full product data
    async fn purchases(&self, owner: AccountOwner) -> Vec<PurchaseFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_purchases_by_buyer(owner).await {
                    Ok(purchases) => {
                        purchases.into_iter().map(|pur| {
                            PurchaseFullView {
                                id: pur.id,
                                product_id: pur.product_id,
                                buyer: pur.buyer,
                                buyer_chain_id: pur.buyer_chain_id,
                                seller: pur.seller,
                                seller_chain_id: pur.seller_chain_id,
                                amount: pur.amount,
                                timestamp: pur.timestamp,
                                order_data: btree_to_pairs(&pur.order_data),
                                product: product_to_full_view(&pur.product),
                            }
                        }).collect()
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get purchases for buyer (alias for purchases)
    async fn my_purchases(&self, owner: AccountOwner) -> Vec<PurchaseFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_purchases_by_buyer(owner).await {
                    Ok(purchases) => {
                        purchases.into_iter().map(|pur| {
                            PurchaseFullView {
                                id: pur.id,
                                product_id: pur.product_id,
                                buyer: pur.buyer,
                                buyer_chain_id: pur.buyer_chain_id,
                                seller: pur.seller,
                                seller_chain_id: pur.seller_chain_id,
                                amount: pur.amount,
                                timestamp: pur.timestamp,
                                order_data: btree_to_pairs(&pur.order_data),
                                product: product_to_full_view(&pur.product),
                            }
                        }).collect()
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get all orders received by seller (for "My Orders" tab)
    async fn my_orders(&self, owner: AccountOwner) -> Vec<PurchaseFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_purchases_by_seller(owner).await {
                    Ok(purchases) => {
                        purchases.into_iter().map(|pur| {
                            PurchaseFullView {
                                id: pur.id,
                                product_id: pur.product_id,
                                buyer: pur.buyer,
                                buyer_chain_id: pur.buyer_chain_id,
                                seller: pur.seller,
                                seller_chain_id: pur.seller_chain_id,
                                amount: pur.amount,
                                timestamp: pur.timestamp,
                                order_data: btree_to_pairs(&pur.order_data),
                                product: product_to_full_view(&pur.product),
                            }
                        }).collect()
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Get all purchases in the system (for debugging)
    async fn all_purchases(&self) -> Vec<PurchaseFullView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.purchases.indices().await {
                    Ok(ids) => {
                        let mut res = Vec::new();
                        for id in ids {
                            if let Ok(Some(pur)) = state.purchases.get(&id).await {
                                res.push(PurchaseFullView {
                                    id: pur.id,
                                    product_id: pur.product_id,
                                    buyer: pur.buyer,
                                    buyer_chain_id: pur.buyer_chain_id,
                                    seller: pur.seller,
                                    seller_chain_id: pur.seller_chain_id,
                                    amount: pur.amount,
                                    timestamp: pur.timestamp,
                                    order_data: btree_to_pairs(&pur.order_data),
                                    product: product_to_full_view(&pur.product),
                                });
                            }
                        }
                        res
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    /// Read a data blob by its hash (64-character hex string)
    /// Returns the blob data as bytes, or None if the hash is invalid
    async fn data_blob(&self, hash: String) -> Option<Vec<u8>> {
        use linera_sdk::linera_base_types::{CryptoHash, DataBlobHash};
        use std::str::FromStr;
        
        match CryptoHash::from_str(&hash) {
            Ok(crypto_hash) => {
                let blob_hash = DataBlobHash(crypto_hash);
                Some(self.runtime.read_data_blob(blob_hash))
            }
            Err(_) => None,
        }
    }
    
    // Content subscription queries
    
    /// Get subscription price and description for an author
    async fn subscription_price(&self, author: AccountOwner) -> Option<donations::SubscriptionInfo> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => state.get_subscription_price(author).await.ok().flatten(),
            Err(_) => None,
        }
    }
    
    /// Get all subscriptions for a user
    async fn my_subscriptions(&self, subscriber: AccountOwner) -> Vec<ContentSubscription> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.subscriptions_by_subscriber.get(&subscriber).await {
                    Ok(Some(sub_ids)) => {
                        let mut subs = Vec::new();
                        for id in sub_ids {
                            if let Ok(Some(sub)) = state.content_subscriptions.get(&id).await {
                                subs.push(sub);
                            }
                        }
                        subs
                    },
                    _ => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }
    
    /// Get all subscribers for an author (active subscriptions only)
    async fn subscribers_of(&self, author: AccountOwner) -> Vec<ContentSubscription> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let current_time = self.runtime.system_time().micros();
                match state.get_active_subscriptions(author, current_time).await {
                    Ok(subs) => subs,
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }
    
    /// Get all posts by an author
    async fn posts_by_author(&self, author: AccountOwner) -> Vec<Post> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_posts_by_author(author).await {
                    Ok(posts) => posts,
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }
    
    /// Get feed of posts from authors you're subscribed to
    async fn my_feed(&self, subscriber: AccountOwner) -> Vec<Post> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                let current_time = self.runtime.system_time().micros();
                
                // Get all active subscriptions
                match state.subscriptions_by_subscriber.get(&subscriber).await {
                    Ok(Some(sub_ids)) => {
                        let mut all_posts = Vec::new();
                        
                        for sub_id in sub_ids {
                            if let Ok(Some(sub)) = state.content_subscriptions.get(&sub_id).await {
                                // Only include posts from active subscriptions
                                if sub.end_timestamp >= current_time {
                                    if let Ok(posts) = state.list_posts_by_author(sub.author).await {
                                        all_posts.extend(posts);
                                    }
                                }
                            }
                        }
                        
                        // Sort by created_at descending (newest first)
                        all_posts.sort_by(|a, b| b.createdAt.cmp(&a.createdAt));
                        all_posts
                    },
                    _ => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }
}

struct MutationRoot { runtime: Arc<ServiceRuntime<DonationsService>> }

#[Object]
impl MutationRoot {
    async fn transfer(&self, owner: AccountOwner, amount: String, target_account: AccountInput, text_message: Option<String>) -> String {
        let fungible_account = linera_sdk::abis::fungible::Account { chain_id: target_account.chain_id, owner: target_account.owner };
        self.runtime.schedule_operation(&Operation::Transfer { owner, amount: amount.parse::<Amount>().unwrap_or_default(), target_account: fungible_account, text_message });
        "ok".to_string()
    }
    async fn withdraw(&self) -> String { self.runtime.schedule_operation(&Operation::Withdraw); "ok".to_string() }
    async fn mint(&self, owner: AccountOwner, amount: String) -> String { self.runtime.schedule_operation(&Operation::Mint { owner, amount: amount.parse::<Amount>().unwrap_or_default() }); "ok".to_string() }
    async fn update_profile(&self, name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput>) -> String { self.runtime.schedule_operation(&Operation::UpdateProfile { name, bio, socials }); "ok".to_string() }
    async fn register(&self, main_chain_id: String, name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput>) -> String {
        let chain_id = main_chain_id.parse().unwrap();
        self.runtime.schedule_operation(&Operation::Register { main_chain_id: chain_id, name, bio, socials });
        "ok".to_string()
    }
    
    async fn set_avatar(&self, hash: String) -> String {
        self.runtime.schedule_operation(&Operation::SetAvatar { hash });
        "ok".to_string()
    }
    
    async fn set_header(&self, hash: String) -> String {
        self.runtime.schedule_operation(&Operation::SetHeader { hash });
        "ok".to_string()
    }

    // Marketplace mutations - NEW: Flexible product structure
    
    /// Create a new product with custom fields
    async fn create_product(
        &self,
        public_data: Vec<KeyValueInput>,
        price: String,
        private_data: Vec<KeyValueInput>,
        success_message: Option<String>,
        order_form: Vec<OrderFormFieldInputGql>,
    ) -> String {
        let amount = price.parse::<Amount>().unwrap_or_default();
        
        // Convert input vectors to BTreeMaps
        let public_data_map: CustomFields = public_data.into_iter().map(|kv| (kv.key, kv.value)).collect();
        let private_data_map: CustomFields = private_data.into_iter().map(|kv| (kv.key, kv.value)).collect();
        let order_form_list: Vec<OrderFormFieldInput> = order_form.into_iter().map(|f| OrderFormFieldInput {
            key: f.key,
            label: f.label,
            field_type: f.field_type,
            required: f.required,
        }).collect();
        
        self.runtime.schedule_operation(&Operation::CreateProduct {
            public_data: public_data_map,
            price: amount,
            private_data: private_data_map,
            success_message,
            order_form: order_form_list,
        });
        "ok".to_string()
    }

    /// Update an existing product
    async fn update_product(
        &self,
        product_id: String,
        public_data: Option<Vec<KeyValueInput>>,
        price: Option<String>,
        private_data: Option<Vec<KeyValueInput>>,
        success_message: Option<String>,
        order_form: Option<Vec<OrderFormFieldInputGql>>,
    ) -> String {
        let price_amount = price.and_then(|p| p.parse::<Amount>().ok());
        let public_data_map = public_data.map(|v| v.into_iter().map(|kv| (kv.key, kv.value)).collect());
        let private_data_map = private_data.map(|v| v.into_iter().map(|kv| (kv.key, kv.value)).collect());
        let order_form_list = order_form.map(|v| v.into_iter().map(|f| OrderFormFieldInput {
            key: f.key,
            label: f.label,
            field_type: f.field_type,
            required: f.required,
        }).collect());
        
        self.runtime.schedule_operation(&Operation::UpdateProduct {
            product_id,
            public_data: public_data_map,
            price: price_amount,
            private_data: private_data_map,
            success_message,
            order_form: order_form_list,
        });
        "ok".to_string()
    }

    async fn delete_product(&self, product_id: String) -> String {
        self.runtime.schedule_operation(&Operation::DeleteProduct { product_id });
        "ok".to_string()
    }

    /// Purchase a product with order form data
    async fn transfer_to_buy(
        &self,
        owner: AccountOwner,
        product_id: String,
        amount: String,
        target_account: AccountInput,
        order_data: Vec<KeyValueInput>,
    ) -> String {
        let fungible_account = linera_sdk::abis::fungible::Account { chain_id: target_account.chain_id, owner: target_account.owner };
        let order_data_map: OrderResponses = order_data.into_iter().map(|kv| (kv.key, kv.value)).collect();
        
        self.runtime.schedule_operation(&Operation::TransferToBuy {
            owner,
            product_id,
            amount: amount.parse::<Amount>().unwrap_or_default(),
            target_account: fungible_account,
            order_data: order_data_map,
        });
        "ok".to_string()
    }

    /// Schedule reading a data blob by its hash
    /// The hash should be a hex-encoded string of the blob hash (64 characters)
    /// Data blobs must be created externally via CLI `linera publish-data-blob` or GraphQL `publishDataBlob`
    async fn read_data_blob(&self, hash: String) -> String {
        self.runtime.schedule_operation(&Operation::ReadDataBlob { hash: hash.clone() });
        format!("Data blob read scheduled for hash: {}", hash)
    }
    
    // Content subscription mutations
    
    /// Set subscription price with description for author's content
    async fn set_subscription_price(&self, price: String, description: Option<String>) -> String {
        let amount = price.parse::<Amount>().unwrap_or_default();
        self.runtime.schedule_operation(&Operation::SetSubscriptionPrice { price: amount, description });
        "ok".to_string()
    }
    
    /// Delete/disable subscription for author's content
    async fn delete_subscription_price(&self) -> String {
        self.runtime.schedule_operation(&Operation::DeleteSubscriptionPrice);
        "ok".to_string()
    }
    
    /// Subscribe to an author's content for 5 minutes (testing) / 30 days (production)
    async fn subscribe_to_author(
        &self,
        owner: AccountOwner,
        amount: String,
        target_account: AccountInput,
    ) -> String {
        let fungible_account = linera_sdk::abis::fungible::Account { 
            chain_id: target_account.chain_id, 
            owner: target_account.owner 
        };
        let payment = amount.parse::<Amount>().unwrap_or_default();
        
        self.runtime.schedule_operation(&Operation::SubscribeToAuthor {
            owner,
            amount: payment,
            target_account: fungible_account,
        });
        "ok".to_string()
    }
    
    /// Create a new post (will be sent to active subscribers)
    async fn create_post(
        &self,
        title: String,
        content: String,
        image_hash: Option<String>,
    ) -> String {
        self.runtime.schedule_operation(&Operation::CreatePost {
            title,
            content,
            image_hash,
        });
        "ok".to_string()
    }
    
    /// Update an existing post
    async fn update_post(
        &self,
        post_id: String,
        title: Option<String>,
        content: Option<String>,
        image_hash: Option<String>,
    ) -> String {
        self.runtime.schedule_operation(&Operation::UpdatePost {
            post_id,
            title,
            content,
            image_hash,
        });
        "ok".to_string()
    }
    
    /// Delete a post
    async fn delete_post(&self, post_id: String) -> String {
        self.runtime.schedule_operation(&Operation::DeletePost { post_id });
        "ok".to_string()
    }
}

// Input types for GraphQL mutations
#[derive(InputObject)]
struct KeyValueInput {
    key: String,
    value: String,
}

#[derive(InputObject)]
struct OrderFormFieldInputGql {
    key: String,
    label: String,
    field_type: String,
    required: bool,
}
