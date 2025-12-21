use linera_sdk::views::{linera_views, MapView, RegisterView, RootView, ViewStorageContext, ViewError};
use linera_sdk::linera_base_types::{AccountOwner, Amount};
use donations::{DonationRecord, Profile, SocialLink, Product, Purchase};

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
    pub purchases: MapView<String, Purchase>,
    pub purchases_by_buyer: MapView<AccountOwner, Vec<String>>,
}

#[allow(dead_code)]
impl DonationsState {
    pub async fn record_donation(&mut self, from: AccountOwner, to: AccountOwner, amount: Amount, message: Option<String>, source_chain_id: Option<String>, timestamp: u64) -> Result<u64, String> {
        let id = *self.donation_counter.get() + 1;
        self.donation_counter.set(id);
        let rec = DonationRecord { id, timestamp, from: from.clone(), to: to.clone(), amount, message, source_chain_id };
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
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { owner: owner.clone(), name: "anon".to_string(), bio: String::new(), socials: Vec::new() });
        p.name = if name.is_empty() { "anon".to_string() } else { name };
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_bio(&mut self, owner: AccountOwner, bio: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { owner: owner.clone(), name: "anon".to_string(), bio: String::new(), socials: Vec::new() });
        p.bio = bio;
        self.profiles.insert(&owner, p).map_err(|e: ViewError| format!("{:?}", e))
    }

    pub async fn set_social(&mut self, owner: AccountOwner, name: String, url: String) -> Result<(), String> {
        let mut p = self.profiles.get(&owner).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or(Profile { owner: owner.clone(), name: "anon".to_string(), bio: String::new(), socials: Vec::new() });
        let mut socials = p.socials;
        if let Some(s) = socials.iter_mut().find(|s| s.name == name) { s.url = url; } else { socials.push(SocialLink { name, url }); }
        p.socials = socials;
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

    // Marketplace methods
    pub async fn create_product(&mut self, product: Product) -> Result<(), String> {
        let product_id = product.id.clone();
        let author = product.author.clone();
        
        self.products.insert(&product_id, product).map_err(|e: ViewError| format!("{:?}", e))?;
        
        let mut author_products = self.products_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_products.push(product_id);
        self.products_by_author.insert(&author, author_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
        Ok(())
    }

    pub async fn update_product(&mut self, product_id: &str, author: AccountOwner, name: Option<String>, description: Option<String>, link: Option<String>, data_blob_hash: Option<String>, price: Option<Amount>) -> Result<(), String> {
        let mut product = self.products.get(&product_id.to_string()).await.map_err(|e: ViewError| format!("{:?}", e))?.ok_or("Product not found")?;
        
        if product.author != author {
            return Err("Unauthorized: not product owner".to_string());
        }
        
        if let Some(n) = name { product.name = n; }
        if let Some(d) = description { product.description = d; }
        if let Some(l) = link { product.link = l; }
        if let Some(h) = data_blob_hash { product.data_blob_hash = h; }
        if let Some(p) = price { product.price = p; }
        
        self.products.insert(&product_id.to_string(), product).map_err(|e: ViewError| format!("{:?}", e))?;
        Ok(())
    }

    pub async fn delete_product(&mut self, product_id: &str, author: AccountOwner) -> Result<(), String> {
        let product = self.products.get(&product_id.to_string()).await.map_err(|e: ViewError| format!("{:?}", e))?.ok_or("Product not found")?;
        
        if product.author != author {
            return Err("Unauthorized: not product owner".to_string());
        }
        
        self.products.remove(&product_id.to_string()).map_err(|e: ViewError| format!("{:?}", e))?;
        
        let mut author_products = self.products_by_author.get(&author).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        author_products.retain(|id| id != product_id);
        self.products_by_author.insert(&author, author_products).map_err(|e: ViewError| format!("{:?}", e))?;
        
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
        
        self.purchases.insert(&purchase_id, purchase).map_err(|e: ViewError| format!("{:?}", e))?;
        
        let mut buyer_purchases = self.purchases_by_buyer.get(&buyer).await.map_err(|e: ViewError| format!("{:?}", e))?.unwrap_or_default();
        buyer_purchases.push(purchase_id);
        self.purchases_by_buyer.insert(&buyer, buyer_purchases).map_err(|e: ViewError| format!("{:?}", e))?;
        
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
}