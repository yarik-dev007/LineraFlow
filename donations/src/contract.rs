#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use linera_sdk::{
    abis::fungible::{Account as FungibleAccount, InitialState, Parameters},
    linera_base_types::{Account, AccountOwner, Amount, WithContractAbi, StreamName, StreamUpdate},
    views::{RootView, View},
    Contract, ContractRuntime,
};
use donations::{Message, DonationsAbi, Operation, ResponseData, DonationsEvent, SocialLink};
use state::DonationsState;

pub struct DonationsContract {
    state: DonationsState,
    runtime: ContractRuntime<Self>,
}

linera_sdk::contract!(DonationsContract);

impl WithContractAbi for DonationsContract { type Abi = DonationsAbi; }

impl Contract for DonationsContract {
    type Message = Message;
    type Parameters = Parameters;
    type InstantiationArgument = InitialState;
    type EventValue = DonationsEvent;

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = DonationsState::load(runtime.root_view_storage_context()).await.expect("load");
        DonationsContract { state, runtime }
    }

    async fn instantiate(&mut self, state: Self::InstantiationArgument) {
        for (owner, amount) in state.accounts {
            let account = Account { chain_id: self.runtime.chain_id(), owner };
            self.runtime.transfer(AccountOwner::CHAIN, account, amount);
        }
    }

    async fn execute_operation(&mut self, operation: Self::Operation) -> Self::Response {
        match operation {
            Operation::Transfer { owner, amount, target_account, text_message } => {
                self.runtime.check_account_permission(owner).expect("perm");
                let target_account_norm = self.normalize_account(target_account);
                self.runtime.transfer(owner, target_account_norm, amount);
                if target_account_norm.chain_id != self.runtime.chain_id() {
                    let current_chain = self.runtime.chain_id();
                    let current_chain_str = current_chain.to_string();
                    let message = Message::TransferWithMessage { owner: target_account_norm.owner, amount, text_message: text_message.clone(), source_chain_id: current_chain, source_owner: owner };
                    self.runtime.prepare_message(message).with_authentication().send_to(target_account_norm.chain_id);
                    let ts = self.runtime.system_time().micros();
                    if let Ok(id) = self.state.record_donation(owner, target_account_norm.owner, amount, text_message.clone(), Some(current_chain_str.clone()), ts).await {
                        self.runtime.emit("donations_events".into(), &DonationsEvent::DonationSent { id, from: owner, to: target_account_norm.owner, amount, message: text_message, source_chain_id: Some(current_chain_str), timestamp: ts });
                    }
                } else {
                    let ts = self.runtime.system_time().micros();
                    if let Ok(id) = self.state.record_donation(owner, target_account_norm.owner, amount, text_message.clone(), None, ts).await {
                        self.runtime.emit("donations_events".into(), &DonationsEvent::DonationSent { id, from: owner, to: target_account_norm.owner, amount, message: text_message, source_chain_id: None, timestamp: ts });
                    }
                }
                ResponseData::Ok
            }
            Operation::Withdraw => {
                let owner = self.runtime.authenticated_signer().unwrap();
                let balance = self.runtime.owner_balance(owner);
                let target_account = Account { chain_id: self.runtime.chain_id(), owner: AccountOwner::CHAIN };
                self.runtime.transfer(owner, target_account, balance);
                ResponseData::Ok
            }
            Operation::Mint { owner, amount } => {
                let target_account = Account { chain_id: self.runtime.chain_id(), owner };
                self.runtime.transfer(AccountOwner::CHAIN, target_account, amount);
                ResponseData::Ok
            }
            Operation::UpdateProfile { name, bio, socials } => {
                let owner = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                if let Some(n) = name.clone() {
                    let _ = self.state.set_name(owner, n.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileNameUpdated { owner, name: n, timestamp: ts });
                }
                if let Some(b) = bio.clone() {
                    let _ = self.state.set_bio(owner, b.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileBioUpdated { owner, bio: b, timestamp: ts });
                }
                for s in socials.into_iter() {
                    let _ = self.state.set_social(owner, s.name.clone(), s.url.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileSocialUpdated { owner, name: s.name, url: s.url, timestamp: ts });
                }
                ResponseData::Ok
            }
            Operation::Register { main_chain_id, name, bio, socials } => {
                // Send register message to main chain so it subscribes to our events
                let owner = self.runtime.authenticated_signer().unwrap();
                let msg = Message::Register {
                    source_chain_id: self.runtime.chain_id(),
                    owner,
                    name: name.clone(),
                    bio: bio.clone(),
                    socials: socials.iter().map(|s| SocialLink { name: s.name.clone(), url: s.url.clone() }).collect(),
                };
                self.runtime
                    .prepare_message(msg)
                    .with_authentication()
                    .send_to(main_chain_id);
                
                // Save main_chain_id to subscriptions so we know where to send future messages
                let _ = self.state.subscriptions.insert(&owner, main_chain_id.to_string());
                
                let ts = self.runtime.system_time().micros();
                if let Some(n) = name.clone() {
                    let _ = self.state.set_name(owner, n.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileNameUpdated { owner, name: n, timestamp: ts });
                }
                if let Some(b) = bio.clone() {
                    let _ = self.state.set_bio(owner, b.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileBioUpdated { owner, bio: b, timestamp: ts });
                }
                for s in socials.into_iter() {
                    let _ = self.state.set_social(owner, s.name.clone(), s.url.clone()).await;
                    self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileSocialUpdated { owner, name: s.name, url: s.url, timestamp: ts });
                }
                ResponseData::Ok
            }
            Operation::GetProfile { owner } => {
                match self.state.get_profile(owner).await { Ok(p) => ResponseData::Profile(p), Err(_) => ResponseData::Profile(None) }
            }
            Operation::GetDonationsByRecipient { owner } => {
                match self.state.list_donations_by_recipient(owner).await { Ok(v) => ResponseData::Donations(v), Err(_) => ResponseData::Donations(Vec::new()) }
            }
            Operation::GetDonationsByDonor { owner } => {
                match self.state.list_donations_by_donor(owner).await { Ok(v) => ResponseData::Donations(v), Err(_) => ResponseData::Donations(Vec::new()) }
            }
            Operation::CreateProduct { name, description, link, data_blob_hash, price } => {
                let owner = self.runtime.authenticated_signer().expect("Authentication required");
                let ts = self.runtime.system_time().micros();
                let chain_id = self.runtime.chain_id();
                let product_id = format!("{}-{}", ts, chain_id);
                
                let product = donations::Product {
                    id: product_id.clone(),
                    author: owner,
                    author_chain_id: chain_id.to_string(),
                    name: name.clone(),
                    description: description.clone(),
                    link: link.clone(),
                    data_blob_hash: data_blob_hash.clone(),
                    price,
                    created_at: ts,
                };
                
                self.state.create_product(product.clone()).await.expect("Failed to create product");
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProductCreated { product: product.clone(), timestamp: ts });
                
                // Send to main chain if we're on a different chain
                if let Ok(main_chain_str) = self.state.subscriptions.get(&owner).await {
                    if let Some(main_chain_id_str) = main_chain_str {
                        if let Ok(main_chain_id) = main_chain_id_str.parse() {
                            if main_chain_id != chain_id {
                                self.runtime.prepare_message(Message::ProductCreated { product }).with_authentication().send_to(main_chain_id);
                            }
                        }
                    }
                }
                
                ResponseData::Ok
            }
            Operation::UpdateProduct { product_id, name, description, link, data_blob_hash, price } => {
                let owner = self.runtime.authenticated_signer().expect("Authentication required");
                self.state.update_product(&product_id, owner, name, description, link, data_blob_hash, price).await.expect("Failed to update product");
                
                let product = self.state.get_product(&product_id).await.expect("Failed to get product").expect("Product not found");
                let ts = self.runtime.system_time().micros();
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProductUpdated { product: product.clone(), timestamp: ts });
                
                // Send to main chain
                if let Ok(main_chain_str) = self.state.subscriptions.get(&owner).await {
                    if let Some(main_chain_id_str) = main_chain_str {
                        if let Ok(main_chain_id) = main_chain_id_str.parse() {
                            let chain_id = self.runtime.chain_id();
                            if main_chain_id != chain_id {
                                self.runtime.prepare_message(Message::ProductUpdated { product }).with_authentication().send_to(main_chain_id);
                            }
                        }
                    }
                }
                
                ResponseData::Ok
            }
            Operation::DeleteProduct { product_id } => {
                let owner = self.runtime.authenticated_signer().expect("Authentication required");
                self.state.delete_product(&product_id, owner).await.expect("Failed to delete product");
                
                let ts = self.runtime.system_time().micros();
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProductDeleted { product_id: product_id.clone(), author: owner, timestamp: ts });
                
                // Send to main chain
                if let Ok(main_chain_str) = self.state.subscriptions.get(&owner).await {
                    if let Some(main_chain_id_str) = main_chain_str {
                        if let Ok(main_chain_id) = main_chain_id_str.parse() {
                            let chain_id = self.runtime.chain_id();
                            if main_chain_id != chain_id {
                                self.runtime.prepare_message(Message::ProductDeleted { product_id, author: owner }).with_authentication().send_to(main_chain_id);
                            }
                        }
                    }
                }
                
                ResponseData::Ok
            }
            Operation::TransferToBuy { owner, product_id, amount, target_account } => {
                self.runtime.check_account_permission(owner).expect("Permission denied");
                
                // NOTE: We do NOT check for product existence or price match locally.
                // The product exists on another chain (Author/Main), and we trust the UI/User input.
                // Validation will effectively happen at the destination if logic requires, but here we just transfer.
                
                // Transfer full amount to author (no commission for now)
                let target_account_norm = self.normalize_account(target_account);
                self.runtime.transfer(owner, target_account_norm, amount);
                
                // Generate purchase ID
                let ts = self.runtime.system_time().micros();
                let purchase_id = format!("purchase-{}-{}", ts, self.runtime.chain_id());
                let buyer_chain_id = self.runtime.chain_id();
                let seller = target_account_norm.owner;
                
                // Emit event
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProductPurchased {
                    purchase_id: purchase_id.clone(),
                    product_id: product_id.clone(),
                    buyer: owner,
                    seller,
                    amount,
                    timestamp: ts,
                });
                
                // Send purchase message to main chain
                if let Ok(main_chain_str) = self.state.subscriptions.get(&owner).await {
                    if let Some(main_chain_id_str) = main_chain_str {
                        if let Ok(main_chain_id) = main_chain_id_str.parse() {
                            self.runtime.prepare_message(Message::ProductPurchased {
                                purchase_id,
                                product_id,
                                buyer: owner,
                                buyer_chain_id,
                                seller,
                                amount,
                            }).with_authentication().send_to(main_chain_id);
                        }
                    }
                }
                
                ResponseData::Ok
            }
        }
    }

    async fn execute_message(&mut self, message: Self::Message) {
        match message {
            Message::Notify => {}
            Message::TransferWithMessage { owner, amount, text_message, source_chain_id, source_owner } => {
                let ts = self.runtime.system_time().micros();
                if let Ok(id) = self.state.record_donation(source_owner, owner, amount, text_message.clone(), Some(source_chain_id.to_string()), ts).await {
                    self.runtime.emit("donations_events".into(), &DonationsEvent::DonationSent { id, from: source_owner, to: owner, amount, message: text_message, source_chain_id: Some(source_chain_id.to_string()), timestamp: ts });
                }
            }
            Message::Register { source_chain_id, owner, name, bio, socials } => {
                // Subscribe this (main) chain to the source chain's donations_events stream
                let app_id = self.runtime.application_id().forget_abi();
                let stream = StreamName::from("donations_events");
                self.runtime.subscribe_to_events(source_chain_id, app_id, stream.clone());
                let _ = self.state.subscriptions.insert(&owner, source_chain_id.to_string());
                if let Some(n) = name { let _ = self.state.set_name(owner, n).await; }
                if let Some(b) = bio { let _ = self.state.set_bio(owner, b).await; }
                for s in socials { let _ = self.state.set_social(owner, s.name, s.url).await; }
            }
            Message::ProductCreated { product } => {
                // Main chain stores product from other chains
                let _ = self.state.create_product(product).await;
            }
            Message::ProductUpdated { product } => {
                // Main chain updates product
                let product_id = product.id.clone();
                let author = product.author;
                let _ = self.state.delete_product(&product_id, author).await;
                let _ = self.state.create_product(product).await;
            }
            Message::ProductDeleted { product_id, author } => {
                // Main chain deletes product
                let _ = self.state.delete_product(&product_id, author).await;
            }
            Message::ProductPurchased { purchase_id, product_id, buyer, buyer_chain_id, seller, amount } => {
                // Main chain receives purchase notification and sends product data to buyer
                if let Ok(Some(product)) = self.state.get_product(&product_id).await {
                    // Validate that the paid amount matches the product price
                    if amount == product.price {
                        // Send product data to buyer's chain
                        self.runtime.prepare_message(Message::SendProductData {
                            buyer,
                            purchase_id: purchase_id.clone(),
                            product: product.clone(),
                        }).with_authentication().send_to(buyer_chain_id);
                        
                        // Record purchase on main chain
                        let ts = self.runtime.system_time().micros();
                        let purchase = donations::Purchase {
                            id: purchase_id.clone(),
                            product_id: product_id.clone(),
                            buyer,
                            seller,
                            amount,
                            timestamp: ts,
                            product,
                        };
                        let _ = self.state.record_purchase(purchase).await;
                        
                        // Emit event so subscribers to Main Chain see the purchase
                        self.runtime.emit("donations_events".into(), &DonationsEvent::ProductPurchased {
                            purchase_id: purchase_id.clone(),
                            product_id: product_id.clone(),
                            buyer,
                            seller,
                            amount,
                            timestamp: ts,
                        });
                    }
                }
            }
            Message::SendProductData { buyer, purchase_id, product } => {
                // Buyer's chain receives full product data
                let ts = self.runtime.system_time().micros();
                let purchase = donations::Purchase {
                    id: purchase_id,
                    product_id: product.id.clone(),
                    buyer,
                    seller: product.author,
                    amount: product.price,
                    timestamp: ts,
                    product,
                };
                let _ = self.state.record_purchase(purchase).await;
            }
        }
    }

    async fn store(mut self) { self.state.save().await.expect("save") }
}

impl DonationsContract {
    fn normalize_account(&self, account: FungibleAccount) -> Account { Account { chain_id: account.chain_id, owner: account.owner } }
    async fn process_streams(&mut self, streams: Vec<StreamUpdate>) {
        let current_chain = self.runtime.chain_id();
        for stream_update in streams {
            if stream_update.chain_id == current_chain { continue; }
            for index in stream_update.previous_index..stream_update.next_index {
                let stream_name = stream_update.stream_id.stream_name.clone();
                let event = self.runtime.read_event(stream_update.chain_id, stream_name, index);
                match event {
                    DonationsEvent::ProfileNameUpdated { owner, name, timestamp: _ } => {
                        let _ = self.state.set_name(owner, name).await;
                    }
                    DonationsEvent::ProfileBioUpdated { owner, bio, timestamp: _ } => {
                        let _ = self.state.set_bio(owner, bio).await;
                    }
                    DonationsEvent::ProfileSocialUpdated { owner, name, url, timestamp: _ } => {
                        let _ = self.state.set_social(owner, name, url).await;
                    }
                    DonationsEvent::DonationSent { id: _, from, to, amount, message, source_chain_id, timestamp } => {
                        let _ = self.state.record_donation(from, to, amount, message, source_chain_id, timestamp).await;
                    }
                    DonationsEvent::ProductCreated { product, timestamp: _ } => {
                        let _ = self.state.create_product(product).await;
                    }
                    DonationsEvent::ProductUpdated { product, timestamp: _ } => {
                        let product_id = product.id.clone();
                        let author = product.author;
                        let _ = self.state.delete_product(&product_id, author).await;
                        let _ = self.state.create_product(product).await;
                    }
                    DonationsEvent::ProductDeleted { product_id, author, timestamp: _ } => {
                        let _ = self.state.delete_product(&product_id, author).await;
                    }
                    DonationsEvent::ProductPurchased { purchase_id, product_id, buyer, seller, amount, timestamp } => {
                        if let Ok(Some(product)) = self.state.get_product(&product_id).await {
                            let purchase = donations::Purchase {
                                id: purchase_id,
                                product_id,
                                buyer,
                                seller,
                                amount,
                                timestamp,
                                product,
                            };
                            let _ = self.state.record_purchase(purchase).await;
                        }
                    }
                }
            }
        }
    }
}
