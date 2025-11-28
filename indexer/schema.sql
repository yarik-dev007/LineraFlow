-- Create profiles collection
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    owner TEXT UNIQUE NOT NULL,
    name TEXT,
    bio TEXT,
    socials JSON,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create donations collection
CREATE TABLE donations (
    id TEXT PRIMARY KEY,
    from_owner TEXT NOT NULL,
    to_owner TEXT NOT NULL,
    amount REAL NOT NULL,
    message TEXT,
    timestamp DATETIME,
    source_chain_id TEXT,
    created DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
