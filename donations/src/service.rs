#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;
use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{linera_base_types::{AccountOwner, WithServiceAbi, Amount}, views::View, Service, ServiceRuntime};
use donations::{DonationsAbi, Operation, AccountInput, Profile as LibProfile, DonationRecord as LibDonationRecord, ProfileView, DonationView, SocialLinkInput, TotalAmountView};
use state::DonationsState;

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
                                res.push(ProfileView { owner: p.owner, chain_id, name: p.name, bio: p.bio, socials: p.socials });
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

    // Marketplace queries
    async fn all_products(&self) -> Vec<donations::ProductView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.products.indices().await {
                    Ok(ids) => {
                        let mut res = Vec::new();
                        for id in ids {
                            if let Ok(Some(p)) = state.products.get(&id).await {
                                res.push(donations::ProductView {
                                    id: p.id,
                                    author: p.author,
                                    author_chain_id: p.author_chain_id,
                                    name: p.name,
                                    description: p.description,
                                    link: p.link,
                                    data_blob_hash: p.data_blob_hash,
                                    image_preview_hash: p.image_preview_hash,
                                    price: p.price,
                                    created_at: p.created_at,
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

    async fn products_by_author(&self, owner: AccountOwner) -> Vec<donations::ProductView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_products_by_author(owner).await {
                    Ok(products) => {
                        products.into_iter().map(|p| donations::ProductView {
                            id: p.id,
                            author: p.author,
                            author_chain_id: p.author_chain_id,
                            name: p.name,
                            description: p.description,
                            link: p.link,
                            data_blob_hash: p.data_blob_hash,
                            image_preview_hash: p.image_preview_hash,
                            price: p.price,
                            created_at: p.created_at,
                        }).collect()
                    },
                    Err(_) => Vec::new(),
                }
            },
            Err(_) => Vec::new(),
        }
    }

    async fn product(&self, id: String) -> Option<donations::ProductView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.get_product(&id).await {
                    Ok(Some(p)) => Some(donations::ProductView {
                        id: p.id,
                        author: p.author,
                        author_chain_id: p.author_chain_id,
                        name: p.name,
                        description: p.description,
                        link: p.link,
                        data_blob_hash: p.data_blob_hash,
                        image_preview_hash: p.image_preview_hash,
                        price: p.price,
                        created_at: p.created_at,
                    }),
                    _ => None,
                }
            },
            Err(_) => None,
        }
    }

    async fn purchases(&self, owner: AccountOwner) -> Vec<donations::PurchaseView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_purchases_by_buyer(owner).await {
                    Ok(purchases) => {
                        let mut res = Vec::new();
                        for pur in purchases {
                            let buyer_chain_id = state.subscriptions.get(&pur.buyer).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            let seller_chain_id = state.subscriptions.get(&pur.seller).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            res.push(donations::PurchaseView {
                                id: pur.id,
                                product_id: pur.product_id,
                                buyer: pur.buyer,
                                buyer_chain_id,
                                seller: pur.seller,
                                seller_chain_id,
                                amount: pur.amount,
                                timestamp: pur.timestamp,
                                product: donations::ProductView {
                                    id: pur.product.id,
                                    author: pur.product.author,
                                    author_chain_id: pur.product.author_chain_id,
                                    name: pur.product.name,
                                    description: pur.product.description,
                                    link: pur.product.link,
                                    data_blob_hash: pur.product.data_blob_hash,
                                    image_preview_hash: pur.product.image_preview_hash,
                                    price: pur.product.price,
                                    created_at: pur.product.created_at,
                                },
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

    async fn my_purchases(&self, owner: AccountOwner) -> Vec<donations::PurchaseView> {
        match DonationsState::load(self.storage_context.clone()).await {
            Ok(state) => {
                match state.list_purchases_by_buyer(owner).await {
                    Ok(purchases) => {
                        let mut res = Vec::new();
                        for pur in purchases {
                            let buyer_chain_id = state.subscriptions.get(&pur.buyer).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            let seller_chain_id = state.subscriptions.get(&pur.seller).await.ok().flatten().unwrap_or_else(|| self.runtime.chain_id().to_string());
                            res.push(donations::PurchaseView {
                                id: pur.id,
                                product_id: pur.product_id,
                                buyer: pur.buyer,
                                buyer_chain_id,
                                seller: pur.seller,
                                seller_chain_id,
                                amount: pur.amount,
                                timestamp: pur.timestamp,
                                product: donations::ProductView {
                                    id: pur.product.id,
                                    author: pur.product.author,
                                    author_chain_id: pur.product.author_chain_id,
                                    name: pur.product.name,
                                    description: pur.product.description,
                                    link: pur.product.link,
                                    data_blob_hash: pur.product.data_blob_hash,
                                    image_preview_hash: pur.product.image_preview_hash,
                                    price: pur.product.price,
                                    created_at: pur.product.created_at,
                                },
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

    // Marketplace mutations
    async fn create_product(&self, name: String, description: String, link: Option<String>, data_blob_hash: Option<String>, image_preview_hash: Option<String>, price: String) -> String {
        let amount = price.parse::<Amount>().unwrap_or_default();
        self.runtime.schedule_operation(&Operation::CreateProduct {
            name,
            description,
            link: link.unwrap_or_default(),
            data_blob_hash: data_blob_hash.unwrap_or_default(),
            image_preview_hash: image_preview_hash.unwrap_or_default(),
            price: amount,
        });
        "ok".to_string()
    }

    async fn update_product(&self, product_id: String, name: Option<String>, description: Option<String>, link: Option<String>, data_blob_hash: Option<String>, image_preview_hash: Option<String>, price: Option<String>) -> String {
        let price_amount = price.and_then(|p| p.parse::<Amount>().ok());
        self.runtime.schedule_operation(&Operation::UpdateProduct {
            product_id,
            name,
            description,
            link,
            data_blob_hash,
            image_preview_hash,
            price: price_amount,
        });
        "ok".to_string()
    }

    async fn delete_product(&self, product_id: String) -> String {
        self.runtime.schedule_operation(&Operation::DeleteProduct { product_id });
        "ok".to_string()
    }

    async fn transfer_to_buy(&self, owner: AccountOwner, product_id: String, amount: String, target_account: AccountInput) -> String {
        let fungible_account = linera_sdk::abis::fungible::Account { chain_id: target_account.chain_id, owner: target_account.owner };
        self.runtime.schedule_operation(&Operation::TransferToBuy {
            owner,
            product_id,
            amount: amount.parse::<Amount>().unwrap_or_default(),
            target_account: fungible_account,
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
}
