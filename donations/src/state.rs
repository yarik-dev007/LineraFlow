use linera_sdk::views::{linera_views, MapView, RegisterView, RootView, ViewStorageContext, ViewError};
use linera_sdk::linera_base_types::{AccountOwner, Amount};
use donations::{
    Profile, DonationRecord, SocialLink, Product, Purchase, CustomFields, OrderFormField, ContentSubscription, Post, SubscriptionInfo,
};

#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct DonationsState {
    pub donation_counter: RegisterView<u64>,
    pub donations: MapView<u64, DonationRecord>,
    pub donations_by_recipient: MapView<AccountOwner, Vec<u64>>, 
    pub donations_by_donor: MapView<AccountOwner, Vec<u64>>, 
    pub profiles: MapView<AccountOwner, Profile>,
    pub subscriptions: MapView<AccountOwner, String>,
    // Marketplace state
    pub products: MapView<String, Product>,
    pub products_by_author: MapView<AccountOwner, Vec<String>>,
    pub products_by_chain: MapView<String, Vec<String>>,  // NEW: Chain-based index
    pub purchases: MapView<String, Purchase>,
    pub purchases_by_buyer: MapView<AccountOwner, Vec<String>>,
    pub purchases_by_seller: MapView<AccountOwner, Vec<String>>,
    // Content subscription state
    pub subscription_prices: MapView<AccountOwner, SubscriptionInfo>,
    pub content_subscriptions: MapView<String, ContentSubscription>,
    pub subscriptions_by_author: MapView<AccountOwner, Vec<String>>,
    pub subscriptions_by_chain: MapView<String, Vec<String>>,  // NEW: Chain-based index
    pub subscriptions_by_subscriber: MapView<AccountOwner, Vec<String>>,
    pub posts: MapView<String, Post>,
    pub posts_by_author: MapView<AccountOwner, Vec<String>>,
    pub posts_by_chain: MapView<String, Vec<String>>,  // NEW: Chain-based index
}

#[allow(dead_code)]
impl DonationsState {
    pub async fn record_donation(&mut self, from: AccountOwner, to: AccountOwner, amount: Amount, message: Option<String>, source_chain_id: Option<String>, to_chain_id: Option<String>, timestamp: u64) -> Result<u64, String> {
        let id = *self.donation_counter.get() + 1;
        self.donation_counter.set(id);
        let rec = DonationRecord { id, timestamp, from: from.clone(), to: to.clone(), amount, message, source_chain_id, to_chain_id };
        self.donations.insert(&id, rec).map_err(|e: ViewError| format!("{:?}", e))?;
        let mut r = self.donations_by_recipient.get(&to).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        r.push(id);
        self.donations_by_recipient.insert(&to, r).map_err(|e: ViewError| format!("{:?}", e))?;
        let mut d = self.donations_by_donor.get(&from).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        d.push(id);
        self.donations_by_donor.insert(&from, d).map_err(|e: ViewError| format!("{:?}", e))?;
        Ok(id)
    }

    pub async fn set_name(&mut self, owner: AccountOwner, name: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { 
            owner: owner.clone(), 
            name: "anon".to_string(), 
            bio: String::new(), 
            socials: Vec::new(),
            avatar_hash: None,
            header_hash: None,
        });
        p.name = if name.is_empty() { "anon".to_string() } else { name };
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_bio(&mut self, owner: AccountOwner, bio: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { 
            owner: owner.clone(), 
            name: "anon".to_string(), 
            bio: String::new(), 
            socials: Vec::new(),
            avatar_hash: None,
            header_hash: None,
        });
        p.bio = bio;
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_social(&mut self, owner: AccountOwner, name: String, url: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { 
            owner: owner.clone(), 
            name: "anon".to_string(), 
            bio: String::new(), 
            socials: Vec::new(),
            avatar_hash: None,
            header_hash: None,
        });
        let mut socials = p.socials;
        if let Some(s) = socials.iter_mut().find(|s| s.name == name) { s.url = url; } else { socials.push(SocialLink { name, url }); }
        p.socials = socials;
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_avatar(&mut self, owner: AccountOwner, hash: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { 
            owner: owner.clone(), 
            name: "anon".to_string(), 
            bio: String::new(), 
            socials: Vec::new(),
            avatar_hash: None,
            header_hash: None,
        });
        p.avatar_hash = Some(hash);
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_header(&mut self, owner: AccountOwner, hash: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { 
            owner: owner.clone(), 
            name: "anon".to_string(), 
            bio: String::new(), 
            socials: Vec::new(),
            avatar_hash: None,
            header_hash: None,
        });
        p.header_hash = Some(hash);
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn get_profile(&self, owner: AccountOwner) -> Result<Option<Profile>, String> {
        self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn list_donations_by_recipient(&self, owner: AccountOwner) -> Result<Vec<DonationRecord>, String> {
        let ids = self.donations_by_recipient.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids { if let Some(r) = self.donations.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? { res.push(r); } }
        Ok(res)
    }

    pub async fn list_donations_by_donor(&self, owner: AccountOwner) -> Result<Vec<DonationRecord>, String> {
        let ids = self.donations_by_donor.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids { if let Some(r) = self.donations.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? { res.push(r); } }
        Ok(res)
    }

    // Validation methods for flexible products
    pub fn validate_custom_fields(fields: &CustomFields) -> Result<(), String> {
        if fields.len() > 20 {
            return Err("Maximum 20 custom fields allowed".to_string());
        }
        Ok(())
    }

    pub fn validate_order_form(form: &Vec<OrderFormField>) -> Result<(), String> {
        if form.len() > 20 {
            return Err("Maximum 20 order form fields allowed".to_string());
        }
        Ok(())
    }

    // Marketplace methods - updated for flexible structure
    pub async fn create_product(&mut self, product: Product) -> Result<(), String> {
        let product_id = product.id.clone();
        let author = product.author.clone();
        let author_chain_id = product.author_chain_id.clone();  // Extract chain_id
        
        // Validate order form
        Self::validate_order_form(&product.order_form)?;
        
        self.products.insert(&product_id, product).map_err(|e: ViewError| format!("{:?}", e))?;
        // Add to author index
        let mut author_products = self.products_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_products.push(product_id.clone());
        self.products_by_author.insert(&author, author_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to chain index
        let mut chain_products = self.products_by_chain.get(&author_chain_id).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        chain_products.push(product_id.clone());
        self.products_by_chain.insert(&author_chain_id, chain_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }

    // Updated to handle flexible product updates
    pub async fn update_product(&mut self, product_id: &str, author: AccountOwner, public_data: Option<CustomFields>, price: Option<Amount>, private_data: Option<CustomFields>, success_message: Option<String>, order_form: Option<Vec<OrderFormField>>) -> Result<(), String> {
        let mut product = self.products.get(&product_id.to_string()).await.map_err(|e: ViewError| format!("{:?}", e))?.ok_or("Product not found")?;
        
        if product.author != author {
            return Err("Unauthorized: not product owner".to_string());
        }
        
        if let Some(pd) = public_data { 
            Self::validate_custom_fields(&pd)?;
            product.public_data = pd; 
        }
        if let Some(pr) = price { product.price = pr; }
        if let Some(pvd) = private_data { 
            Self::validate_custom_fields(&pvd)?;
            product.private_data = pvd; 
        }
        if let Some(sm) = success_message { product.success_message = Some(sm); }
        if let Some(of) = order_form { 
            Self::validate_order_form(&of)?;
            product.order_form = of; 
        }
        
        self.products.insert(&product_id.to_string(), product).map_err(|e: ViewError| format!("{:?}", e))?;
        Ok(())
    }

    pub async fn delete_product(&mut self, product_id: &str, author: AccountOwner) -> Result<(), String> {
        // Get product to extract chain_id before deletion
        let product = self.products.get(product_id).await
            .map_err(|e: ViewError| format!("{:?}", e))?
            .ok_or("Product not found")?;
        let chain_id = product.author_chain_id.clone();
        
        // Remove product
        self.products.remove(product_id).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Remove from author index
        let mut author_products = self.products_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_products.retain(|id| id != product_id);
        self.products_by_author.insert(&author, author_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Remove from chain index
        let mut chain_products = self.products_by_chain.get(&chain_id).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        chain_products.retain(|id| id != product_id);
        self.products_by_chain.insert(&chain_id, chain_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }

    pub async fn get_product(&self, product_id: &str) -> Result<Option<Product>, String> {
        self.products.get(&product_id.to_string()).await.map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn list_products_by_author(&self, author: AccountOwner) -> Result<Vec<Product>, String> {
        let ids = self.products_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(p) = self.products.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? {
                res.push(p);
            }
        }
        Ok(res)
    }

    pub async fn record_purchase(&mut self, purchase: Purchase) -> Result<(), String> {
        let purchase_id = purchase.id.clone();
        let buyer = purchase.buyer.clone();
        let seller = purchase.seller.clone();
        
        self.purchases.insert(&purchase_id, purchase).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Index by buyer
        let mut buyer_purchases = self.purchases_by_buyer.get(&buyer).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        buyer_purchases.push(purchase_id.clone());
        self.purchases_by_buyer.insert(&buyer, buyer_purchases).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Index by seller
        let mut seller_purchases = self.purchases_by_seller.get(&seller).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        seller_purchases.push(purchase_id);
        self.purchases_by_seller.insert(&seller, seller_purchases).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }

    pub async fn list_purchases_by_buyer(&self, buyer: AccountOwner) -> Result<Vec<Purchase>, String> {
        let ids = self.purchases_by_buyer.get(&buyer).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(p) = self.purchases.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? {
                res.push(p);
            }
        }
        Ok(res)
    }

    pub async fn list_purchases_by_seller(&self, seller: AccountOwner) -> Result<Vec<Purchase>, String> {
        let ids = self.purchases_by_seller.get(&seller).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(p) = self.purchases.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? {
                res.push(p);
            }
        }
        Ok(res)
    }
    
    // Content subscription management
    pub async fn set_subscription_price(&mut self, author: AccountOwner, price: Amount, description: Option<String>) -> Result<(), String> {
        let info = SubscriptionInfo { author, price, description };
        self.subscription_prices.insert(&author, info).map_err(|e: ViewError| format!("{:?}", e))
    }
    
    pub async fn get_subscription_price(&self, author: AccountOwner) -> Result<Option<SubscriptionInfo>, String> {
        self.subscription_prices.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))
    }
    
    pub async fn delete_subscription_info(&mut self, author: AccountOwner) -> Result<(), String> {
        self.subscription_prices.remove(&author).map_err(|e: ViewError| format!("{:?}", e))
    }
    
    pub async fn create_subscription(&mut self, subscription: ContentSubscription) -> Result<(), String> {
        let sub_id = subscription.id.clone();
        let author = subscription.author.clone();
        let author_chain_id = subscription.author_chain_id.clone();
        let subscriber = subscription.subscriber.clone();
        
        self.content_subscriptions.insert(&sub_id, subscription).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to author index
        let mut author_subs = self.subscriptions_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_subs.push(sub_id.clone());
        self.subscriptions_by_author.insert(&author, author_subs).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to chain index
        let mut chain_subs = self.subscriptions_by_chain.get(&author_chain_id).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        chain_subs.push(sub_id.clone());
        self.subscriptions_by_chain.insert(&author_chain_id, chain_subs).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to subscriber index
        let mut subscriber_subs = self.subscriptions_by_subscriber.get(&subscriber).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        subscriber_subs.push(sub_id);
        self.subscriptions_by_subscriber.insert(&subscriber, subscriber_subs).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }
    
    pub async fn remove_subscription(&mut self, sub_id: &str, author: AccountOwner, subscriber: AccountOwner) -> Result<(), String> {
        self.content_subscriptions.remove(&sub_id.to_string()).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Remove from author index
        let mut author_subs = self.subscriptions_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_subs.retain(|id| id != sub_id);
        self.subscriptions_by_author.insert(&author, author_subs).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Remove from subscriber index  
        let mut subscriber_subs = self.subscriptions_by_subscriber.get(&subscriber).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        subscriber_subs.retain(|id| id != sub_id);
        self.subscriptions_by_subscriber.insert(&subscriber, subscriber_subs).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }
    
    pub async fn get_active_subscriptions(&self, author: AccountOwner, current_time: u64) -> Result<Vec<ContentSubscription>, String> {
        let sub_ids = self.subscriptions_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut active = Vec::new();
        
        for id in sub_ids {
            if let Some(sub) = self.content_subscriptions.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? {
                if sub.end_timestamp >= current_time {
                    active.push(sub);
                }
            }
        }
        
        Ok(active)
    }
    
    pub async fn create_post(&mut self, post: Post) -> Result<(), String> {
        let post_id = post.id.clone();
        let author = post.author.clone();
        let author_chain_id = post.author_chain_id.clone();
        
        self.posts.insert(&post_id, post).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to author index
        let mut author_posts = self.posts_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_posts.push(post_id.clone());
        self.posts_by_author.insert(&author, author_posts).map_err(|e: ViewError| format!("{:?}", e))?;
        
        // Add to chain index
        let mut chain_posts = self.posts_by_chain.get(&author_chain_id).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        chain_posts.push(post_id);
        self.posts_by_chain.insert(&author_chain_id, chain_posts).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }
    
    pub async fn list_posts_by_author(&self, author: AccountOwner) -> Result<Vec<Post>, String> {
        let ids = self.posts_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        let mut res = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(p) = self.posts.get(&id).await.map_err(|e: ViewError| format!("{:?}", e))? {
                res.push(p);
            }
        }
        Ok(res)
    }
    
    pub async fn get_post(&self, post_id: &str) -> Result<Option<Post>, String> {
        self.posts.get(&post_id.to_string()).await.map_err(|e: ViewError| format!("{:?}", e))
    }
    
    pub async fn update_post(&mut self, post_id: &str, title: Option<String>, content: Option<String>, image_hash: Option<String>) -> Result<(), String> {
        let mut post = self.posts.get(&post_id.to_string()).await
            .map_err(|e: ViewError| format!("{:?}", e))?
            .ok_or("Post not found")?;
        
        if let Some(t) = title { post.title = t; }
        if let Some(c) = content { post.content = c; }
        if let Some(h) = image_hash { post.image_hash = Some(h); }
        
        self.posts.insert(&post_id.to_string(), post).map_err(|e: ViewError| format!("{:?}", e))
    }
    
    pub async fn delete_post(&mut self, post_id: &str, author: AccountOwner) -> Result<(), String> {
        let post = self.posts.get(&post_id.to_string()).await
            .map_err(|e: ViewError| format!("{:?}", e))?
            .ok_or("Post not found")?;
        
        if post.author != author {
            return Err("Unauthorized: not post author".to_string());
        }
        
        self.posts.remove(&post_id.to_string()).map_err(|e: ViewError| format!("{:?}", e))?;
        
        let mut author_posts = self.posts_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_posts.retain(|id| id != post_id);
        self.posts_by_author.insert(&author, author_posts).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }
}