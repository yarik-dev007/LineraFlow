use linera_sdk::views::{linera_views, MapView, RegisterView, RootView, ViewStorageContext, ViewError};
use linera_sdk::linera_base_types::{AccountOwner, Amount};
use donations::{DonationRecord, Profile, SocialLink};

#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct DonationsState {
    pub donation_counter: RegisterView<u64>,
    pub donations: MapView<u64, DonationRecord>,
    pub donations_by_recipient: MapView<AccountOwner, Vec<u64>>, 
    pub donations_by_donor: MapView<AccountOwner, Vec<u64>>, 
    pub profiles: MapView<AccountOwner, Profile>,
    pub subscriptions: MapView<AccountOwner, String>,
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
}