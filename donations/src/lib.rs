use async_graphql::{Request, Response, SimpleObject, InputObject};
use linera_sdk::linera_base_types::{AccountOwner, Amount, ContractAbi, ServiceAbi, ChainId};
use serde::{Deserialize, Serialize};

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
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct ProfileView {
    pub owner: AccountOwner,
    pub chain_id: String,
    pub name: String,
    pub bio: String,
    pub socials: Vec<SocialLink>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DonationsEvent {
    ProfileNameUpdated { owner: AccountOwner, name: String, timestamp: u64 },
    ProfileBioUpdated { owner: AccountOwner, bio: String, timestamp: u64 },
    ProfileSocialUpdated { owner: AccountOwner, name: String, url: String, timestamp: u64 },
    DonationSent { id: u64, from: AccountOwner, to: AccountOwner, amount: Amount, message: Option<String>, source_chain_id: Option<String>, timestamp: u64 },
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
    UpdateProfile { name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput> },
    Register { main_chain_id: ChainId, name: Option<String>, bio: Option<String>, socials: Vec<SocialLinkInput> },
    GetProfile { owner: AccountOwner },
    GetDonationsByRecipient { owner: AccountOwner },
    GetDonationsByDonor { owner: AccountOwner },
}

#[derive(Debug, Deserialize, Serialize)]
pub enum ResponseData {
    Ok,
    Profile(Option<Profile>),
    Donations(Vec<DonationRecord>),
}
