#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use linera_sdk::{
    abis::fungible::{Account as FungibleAccount, InitialState, Parameters},
    linera_base_types::{Account, AccountOwner, WithContractAbi, StreamName, StreamUpdate},
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
                    if let Ok(id) = self.state.record_donation(owner, target_account_norm.owner, amount, text_message.clone(), Some(current_chain_str.clone()), Some(target_account_norm.chain_id.to_string()), ts).await {
                        self.runtime.emit("donations_events".into(), &DonationsEvent::DonationSent { id, from: owner, to: target_account_norm.owner, amount, message: text_message, source_chain_id: Some(current_chain_str), timestamp: ts });
                    }
                } else {
                    let ts = self.runtime.system_time().micros();
                    if let Ok(id) = self.state.record_donation(owner, target_account_norm.owner, amount, text_message.clone(), None, Some(target_account_norm.chain_id.to_string()), ts).await {
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
            Operation::SetAvatar { hash } => {
                let owner = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                let _ = self.state.set_avatar(owner, hash.clone()).await;
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileAvatarUpdated { owner, hash, timestamp: ts });
                ResponseData::Ok
            }
            Operation::SetHeader { hash } => {
                let owner = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                let _ = self.state.set_header(owner, hash.clone()).await;
                self.runtime.emit("donations_events".into(), &DonationsEvent::ProfileHeaderUpdated { owner, hash, timestamp: ts });
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
            Operation::CreateProduct { public_data, price, private_data, success_message, order_form } => {
                let owner = self.runtime.authenticated_signer().expect("Authentication required");
                let ts = self.runtime.system_time().micros();
                let chain_id = self.runtime.chain_id();
                let product_id = format!("{}-{}", ts, chain_id);
                
                // Convert OrderFormFieldInput to OrderFormField
                let order_form_fields: Vec<donations::OrderFormField> = order_form.into_iter().map(|f| donations::OrderFormField {
                    key: f.key,
                    label: f.label,
                    field_type: f.field_type,
                    required: f.required,
                }).collect();
                
                let product = donations::Product {
                    id: product_id.clone(),
                    author: owner,
                    author_chain_id: chain_id.to_string(),
                    public_data,
                    price,
                    private_data,
                    success_message,
                    order_form: order_form_fields,
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
            Operation::UpdateProduct { product_id, public_data, price, private_data, success_message, order_form } => {
                let owner = self.runtime.authenticated_signer().expect("Authentication required");
                
                // Convert Option<Vec<OrderFormFieldInput>> to Option<Vec<OrderFormField>>
                let order_form_fields = order_form.map(|fields| {
                    fields.into_iter().map(|f| donations::OrderFormField {
                        key: f.key,
                        label: f.label,
                        field_type: f.field_type,
                        required: f.required,
                    }).collect()
                });
                
                self.state.update_product(&product_id, owner, public_data, price, private_data, success_message, order_form_fields).await.expect("Failed to update product");
                
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
            Operation::TransferToBuy { owner, product_id, amount, target_account, order_data } => {
                self.runtime.check_account_permission(owner).expect("Permission denied");
                
                // Transfer full amount to author
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
                                purchase_id: purchase_id.clone(),
                                product_id: product_id.clone(),
                                buyer: owner,
                                buyer_chain_id,
                                seller,
                                amount,
                            }).with_authentication().send_to(main_chain_id);
                        }
                    }
                }
                
                // NEW: Send order notification directly to seller's chain
                // NEW: Send order notification directly to seller's chain
                // We trust the target_account chain_id as it comes from the product metadata
                // and we already transferred funds there.
                let seller_chain_id = target_account_norm.chain_id;

                if seller_chain_id != buyer_chain_id {
                    self.runtime.prepare_message(Message::OrderReceived {
                        purchase_id: purchase_id.clone(),
                        product_id: product_id.clone(),
                        buyer: owner,
                        buyer_chain_id,
                        amount,
                        order_data: order_data.clone(),
                        timestamp: ts,
                    }).with_authentication().send_to(seller_chain_id);
                } else {
                    // Same chain: Record purchase immediately if product exists locally
                    // This covers local purchases and self-purchases
                    if let Ok(Some(product)) = self.state.get_product(&product_id).await {
                         let purchase = donations::Purchase {
                            id: purchase_id.clone(),
                            product_id: product_id.clone(),
                            buyer: owner,
                            buyer_chain_id: buyer_chain_id.to_string(),
                            seller,
                            seller_chain_id: product.author_chain_id.clone(),
                            // ...
                            amount,
                            timestamp: ts,
                            order_data: order_data.clone(),
                            product: product.clone(),
                        };
                        let _ = self.state.record_purchase(purchase).await;
                    }
                }
                
                ResponseData::Ok
            }
            Operation::ReadDataBlob { hash } => {
                use linera_sdk::linera_base_types::{CryptoHash, DataBlobHash};
                use std::str::FromStr;
                
                match CryptoHash::from_str(&hash) {
                    Ok(crypto_hash) => {
                        let blob_hash = DataBlobHash(crypto_hash);
                        let data = self.runtime.read_data_blob(blob_hash);
                        eprintln!("[READ_BLOB] Read {} bytes from blob {}", data.len(), hash);
                    }
                    Err(e) => {
                        eprintln!("[READ_BLOB] ERROR: Invalid blob hash format '{}': {:?}", hash, e);
                    }
                }
                ResponseData::Ok
            }
            
            // Content subscription operations
            Operation::SetSubscriptionPrice { price, description } => {
                let owner = self.runtime.authenticated_signer().unwrap();
                self.state.set_subscription_price(owner, price, description.clone()).await.expect("Failed to set subscription price");
                
                let ts = self.runtime.system_time().micros();
                self.runtime.emit("donations_events".into(), &DonationsEvent::SubscriptionPriceSet { 
                    author: owner, 
                    price,
                    description,
                    timestamp: ts 
                });
                
                ResponseData::Ok
            }
            
            Operation::DeleteSubscriptionPrice => {
                let owner = self.runtime.authenticated_signer().unwrap();
                self.state.delete_subscription_info(owner).await.expect("Failed to delete subscription info");
                
                let ts = self.runtime.system_time().micros();
                self.runtime.emit("donations_events".into(), &DonationsEvent::SubscriptionPriceDeleted {
                    author: owner,
                    timestamp: ts,
                });
                
                ResponseData::Ok
            }
            
            Operation::SubscribeToAuthor { owner, amount, target_account } => {
                let subscriber = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                
                // Transfer payment to author
                let target_account_norm = self.normalize_account(target_account);
                let author = target_account_norm.owner;
                let author_chain_id = target_account_norm.chain_id;
                self.runtime.transfer(owner, target_account_norm, amount);
                
                // Subscription duration (5 minutes for testing)
                const FIVE_MINUTES_MICROS: u64 = 5 * 60 * 1_000_000;
                let end_timestamp = ts + FIVE_MINUTES_MICROS;
                let subscriber_chain_id = self.runtime.chain_id();
                let sub_id = format!("sub-{}-{}-{}", subscriber, author, ts);
                
                // Create local subscription (for mySubscriptions query)
                let subscription = donations::ContentSubscription {
                    id: sub_id.clone(),
                    subscriber,
                    subscriber_chain_id: subscriber_chain_id.to_string(),
                    author,
                    author_chain_id: author_chain_id.to_string(),
                    start_timestamp: ts,
                    end_timestamp,
                    price: amount,
                };
                
                self.state.create_subscription(subscription.clone()).await.expect("Failed to create subscription");
                
                // Notify author's chain about subscription payment
                if author_chain_id != subscriber_chain_id {
                    self.runtime.prepare_message(Message::SubscriptionPayment {
                        subscriber,
                        subscriber_chain_id: subscriber_chain_id.to_string(),
                        author,
                        amount,
                        duration_micros: FIVE_MINUTES_MICROS,
                        timestamp: ts,
                    }).with_authentication().send_to(author_chain_id);
                }
                
                ResponseData::Ok
            }
            
            Operation::CreatePost { title, content, image_hash } => {
                let author = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                // Generate 12-character hex ID from timestamp
                let post_id = format!("{:012x}", ts % 0x1000000000000);
                let author_chain_id = self.runtime.chain_id();
                
                let post = donations::Post {
                    id: post_id.clone(),
                    author,
                    author_chain_id: author_chain_id.to_string(),
                    title,
                    content,
                    image_hash,
                    created_at: ts,
                };
                
                // Save post
                self.state.create_post(post.clone()).await.expect("Failed to create post");
                
                // Emit event
                self.runtime.emit("donations_events".into(), &DonationsEvent::PostCreated { 
                    post: post.clone(), 
                    timestamp: ts 
                });
                
                // Get active subscriptions and clean up expired ones
                let all_subs = self.state.subscriptions_by_author.get(&author).await
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                
                for sub_id in all_subs {
                    if let Ok(Some(sub)) = self.state.content_subscriptions.get(&sub_id).await {
                        if sub.end_timestamp < ts {
                            // Subscription expired - unsubscribe
                            let _ = self.state.remove_subscription(&sub_id, author, sub.subscriber).await;
                            
                            self.runtime.emit("donations_events".into(), &DonationsEvent::UserUnsubscribed {
                                subscription_id: sub_id,
                                subscriber: sub.subscriber,
                                author,
                                timestamp: ts,
                            });
                        } else {
                            // Subscription active - send post to subscriber's chain
                            if let Ok(subscriber_chain_id) = sub.subscriber_chain_id.parse() {
                                if subscriber_chain_id != author_chain_id {
                                    self.runtime.prepare_message(Message::PostPublished {
                                        post: post.clone(),
                                    }).with_authentication().send_to(subscriber_chain_id);
                                }
                            }
                        }
                    }
                }
                
                ResponseData::Ok
            }
            
            Operation::UpdatePost { post_id, title, content, image_hash } => {
                let author = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                
                // Update post
                self.state.update_post(&post_id, title, content, image_hash).await
                    .expect("Failed to update post");
                
                // Get updated post
                let post = self.state.get_post(&post_id).await
                    .expect("Failed to get post")
                    .expect("Post not found");
                
                // Verify ownership
                if post.author != author {
                    panic!("Unauthorized: not post author");
                }
                
                // Emit event
                self.runtime.emit("donations_events".into(), &DonationsEvent::PostUpdated {
                    post: post.clone(),
                    timestamp: ts,
                });
                
                // Send update to active subscribers
                let all_subs = self.state.subscriptions_by_author.get(&author).await
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                
                let author_chain_id = self.runtime.chain_id();
                for sub_id in all_subs {
                    if let Ok(Some(sub)) = self.state.content_subscriptions.get(&sub_id).await {
                        if sub.end_timestamp >= ts {
                            // Active subscription - send update
                            if let Ok(subscriber_chain_id) = sub.subscriber_chain_id.parse() {
                                if subscriber_chain_id != author_chain_id {
                                    self.runtime.prepare_message(Message::PostUpdated {
                                        post: post.clone(),
                                    }).with_authentication().send_to(subscriber_chain_id);
                                }
                            }
                        }
                    }
                }
                
                ResponseData::Ok
            }
            
            Operation::DeletePost { post_id } => {
                let author = self.runtime.authenticated_signer().unwrap();
                let ts = self.runtime.system_time().micros();
                
                // Delete post (will verify ownership inside)
                self.state.delete_post(&post_id, author).await
                    .expect("Failed to delete post");
                
                // Emit event
                self.runtime.emit("donations_events".into(), &DonationsEvent::PostDeleted {
                    post_id: post_id.clone(),
                    author,
                    timestamp: ts,
                });
                
                // Send deletion to active subscribers
                let all_subs = self.state.subscriptions_by_author.get(&author).await
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                
                let author_chain_id = self.runtime.chain_id();
                for sub_id in all_subs {
                    if let Ok(Some(sub)) = self.state.content_subscriptions.get(&sub_id).await {
                        if sub.end_timestamp >= ts {
                            // Active subscription - send deletion
                            if let Ok(subscriber_chain_id) = sub.subscriber_chain_id.parse() {
                                if subscriber_chain_id != author_chain_id {
                                    self.runtime.prepare_message(Message::PostDeleted {
                                        post_id: post_id.clone(),
                                        author,
                                    }).with_authentication().send_to(subscriber_chain_id);
                                }
                            }
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
                if let Ok(id) = self.state.record_donation(source_owner, owner, amount, text_message.clone(), Some(source_chain_id.to_string()), Some(self.runtime.chain_id().to_string()), ts).await {
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
                            buyer_chain_id: buyer_chain_id.to_string(),
                            seller,
                            seller_chain_id: product.author_chain_id.clone(),
                            amount,
                            timestamp: ts,
                            order_data: std::collections::BTreeMap::new(), // Main chain doesn't have order data
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
                    buyer_chain_id: self.runtime.chain_id().to_string(),
                    seller: product.author,
                    seller_chain_id: product.author_chain_id.clone(),
                    amount: product.price,
                    timestamp: ts,
                    order_data: std::collections::BTreeMap::new(), // Empty for now
                    product,
                };
                let _ = self.state.record_purchase(purchase).await;
            }
            Message::OrderReceived { purchase_id, product_id, buyer, buyer_chain_id, amount, order_data, timestamp } => {
                // Seller's chain receives order notification with buyer's form data
                // We must fetch the product to get the correct seller (author) and to record the purchase
                if let Ok(Some(product)) = self.state.get_product(&product_id).await {
                    let seller = product.author; // Correct seller is the product author

                    // Record the full purchase so it shows up in "My Orders"
                    let purchase = donations::Purchase {
                        id: purchase_id.clone(),
                        product_id: product_id.clone(),
                        buyer,
                        buyer_chain_id: buyer_chain_id.to_string(),
                        seller,
                        seller_chain_id: product.author_chain_id.clone(),
                        amount,
                        timestamp,
                        order_data: order_data.clone(),
                        product: product.clone(),
                    };
                    
                    let _ = self.state.record_purchase(purchase).await;

                    self.runtime.emit("donations_events".into(), &DonationsEvent::OrderPlaced {
                        purchase_id,
                        product_id,
                        buyer,
                        seller,
                        amount,
                        timestamp,
                    });
                }
            }
            Message::SubscriptionPayment { subscriber, subscriber_chain_id, author, amount, duration_micros, timestamp } => {
                // Author's chain receives subscription payment
                let author_chain_id = self.runtime.chain_id();
                
                let end_timestamp = timestamp + duration_micros;
                let sub_id = format!("sub-{}-{}-{}", subscriber, author, timestamp);
                
                let subscription = donations::ContentSubscription {
                    id: sub_id.clone(),
                    subscriber,
                    subscriber_chain_id,
                    author,
                    author_chain_id: author_chain_id.to_string(),
                    start_timestamp: timestamp,
                    end_timestamp,
                    price: amount,
                };
                
                let _ = self.state.create_subscription(subscription).await;
                
                // Emit event for indexing
                self.runtime.emit("donations_events".into(), &DonationsEvent::UserSubscribed {
                    subscription_id: sub_id,
                    subscriber,
                    author,
                    price: amount,
                    end_timestamp,
                    timestamp,
                });
            }
            Message::PostPublished { post } => {
                // Subscriber's chain receives the post
                let _ = self.state.create_post(post).await;
            }
            Message::PostUpdated { post } => {
                // Subscriber's chain updates the post
                let _ = self.state.update_post(&post.id, Some(post.title), Some(post.content), post.image_hash).await;
            }
            Message::PostDeleted { post_id, author } => {
                // Subscriber's chain deletes the post
                let _ = self.state.delete_post(&post_id, author).await;
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
                    DonationsEvent::ProfileAvatarUpdated { owner, hash, timestamp: _ } => {
                        let _ = self.state.set_avatar(owner, hash).await;
                    }
                    DonationsEvent::ProfileHeaderUpdated { owner, hash, timestamp: _ } => {
                        let _ = self.state.set_header(owner, hash).await;
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
                    DonationsEvent::ProductPurchased { purchase_id, product_id, buyer, seller, amount, timestamp } => {
                        if let Ok(Some(product)) = self.state.get_product(&product_id).await {
                            let purchase = donations::Purchase {
                                id: purchase_id,
                                product_id,
                                buyer,
                                buyer_chain_id: current_chain.to_string(),
                                seller,
                                seller_chain_id: product.author_chain_id.clone(),
                                amount,
                                timestamp,
                                order_data: std::collections::BTreeMap::new(), // Event doesn't contain order_data
                                product,
                            };
                            let _ = self.state.record_purchase(purchase).await;
                        }
                    }
                    DonationsEvent::OrderPlaced { purchase_id: _, product_id: _, buyer: _, seller: _, amount: _, timestamp: _ } => {
                        // Order placed events are handled on seller's chain
                        // We can add order storage logic here if needed
                    }
                    DonationsEvent::ProductDeleted { product_id, author, timestamp: _ } => {
                        let _ = self.state.delete_product(&product_id, author).await;
                    }
                    // Content subscription events
                    DonationsEvent::SubscriptionPriceSet { author, price, description, timestamp: _ } => {
                        let _ = self.state.set_subscription_price(author, price, description).await;
                    }
                    DonationsEvent::SubscriptionPriceDeleted { author, timestamp: _ } => {
                        let _ = self.state.delete_subscription_info(author).await;
                    }
                    DonationsEvent::UserSubscribed { subscription_id: _, subscriber: _, author: _, price: _, end_timestamp: _, timestamp: _ } => {
                        // Subscription is already created on the chain where payment was made
                    }
                    DonationsEvent::UserUnsubscribed { subscription_id, subscriber, author, timestamp: _ } => {
                        let _ = self.state.remove_subscription(&subscription_id, author, subscriber).await;
                    }
                    DonationsEvent::PostCreated { post, timestamp: _ } => {
                        let _ = self.state.create_post(post).await;
                    }
                    DonationsEvent::PostUpdated { post, timestamp: _ } => {
                        let _ = self.state.update_post(&post.id, Some(post.title), Some(post.content), post.image_hash).await;
                    }
                    DonationsEvent::PostDeleted { post_id, author, timestamp: _ } => {
                        let _ = self.state.delete_post(&post_id, author).await;
                    }
                }
            }
        }
    }
}
