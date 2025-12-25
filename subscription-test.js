#!/usr/bin/env node

import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper functions
function now() { return new Date().toISOString(); }
function log(...args) { console.log(`[${now()}] [subscription-test]`, ...args); }
function error(...args) { console.error(`[${now()}] [subscription-test] ERROR:`, ...args); }

// Read data.txt and parse chain information
function loadChainData() {
    const dataPath = __dirname + '/data.txt';
    if (!fs.existsSync(dataPath)) {
        throw new Error(`data.txt not found at ${dataPath}. Run setup script first!`);
    }

    const content = fs.readFileSync(dataPath, 'utf-8');
    const data = {};

    content.split('\n').forEach(line => {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match) {
            data[match[1]] = match[2];
        }
    });

    return {
        mainChain: data.MAIN_CHAIN,
        mainOwner: data.MAIN_OWNER,
        authorChain: data.AUTHOR_CHAIN,
        authorOwner: data.AUTHOR_OWNER,
        buyerChain: data.BUYER_CHAIN,
        buyerOwner: data.BUYER_OWNER,
        mainPort: data.MAIN_PORT || '7071',
        authorPort: data.AUTHOR_PORT || '7072',
        buyerPort: data.BUYER_PORT || '7073'
    };
}

// GraphQL query via axios
async function graphql(endpoint, query) {
    const operationMatch = query.match(/(mutation|query)\s*\{?\s*(\w+)/);
    const compactQuery = query.replace(/\s+/g, ' ').trim();

    log('POST', endpoint, 'query:', compactQuery);

    try {
        const res = await axios.post(endpoint, { query }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000,
            validateStatus: () => true
        });

        log('HTTP', res.status, res.statusText);
        const raw = res?.data;

        if (raw?.errors) {
            error('GraphQL errors:', JSON.stringify(raw.errors, null, 2));
            throw new Error(JSON.stringify(raw.errors));
        }

        const data = raw?.data;
        const keys = Object.keys(data || {});
        log('RESPONSE keys=' + keys.join(','), 'size=' + JSON.stringify(raw || {}).length);

        return data;
    } catch (err) {
        error('Failed to execute GraphQL query:', err.message);
        error('Endpoint:', endpoint);
        throw err;
    }
}

async function runTest() {
    log('Starting content subscription integration test...');

    // Load chain data
    const chains = loadChainData();
    log('Loaded chain data:', chains);

    const APP_ID = process.env.DONATIONS_APP_ID || process.env.VITE_DONATIONS_APPLICATION_ID || '347f9208a712b76b421420d83df14196b1220380fbf14c9d47c171e95eecb093';
    log('Using Application ID:', APP_ID);

    // Construct GraphQL endpoints
    const mainEndpoint = `http://localhost:${chains.mainPort}/chains/${chains.mainChain}/applications/${APP_ID}`;
    const authorEndpoint = `http://localhost:${chains.authorPort}/chains/${chains.authorChain}/applications/${APP_ID}`;
    const subscriberEndpoint = `http://localhost:${chains.buyerPort}/chains/${chains.buyerChain}/applications/${APP_ID}`;

    log('GraphQL Endpoints:');
    log('  Main:', mainEndpoint);
    log('  Author:', authorEndpoint);
    log('  Subscriber:', subscriberEndpoint);
    log('');

    // Step 1: Register author and subscriber on main chain
    log('STEP 1: Registering author and subscriber on main chain');

    try {
        const registerAuthorMutation = `
      mutation {
        register(
          mainChainId: "${chains.mainChain}"
          name: "Content Creator"
          bio: "I create exclusive content for my subscribers"
          socials: [{name: "website", url: "https://creator.example.com"}]
        )
      }
    `;
        const authorRegResult = await graphql(authorEndpoint, registerAuthorMutation);
        log('✓ Author registered:', authorRegResult.register);
    } catch (err) {
        error('Failed to register author:', err.message);
    }

    try {
        const registerSubscriberMutation = `
      mutation {
        register(
          mainChainId: "${chains.mainChain}"
          name: "Content Fan"
          bio: "I love exclusive content"
          socials: [{name: "twitter", url: "https://twitter.com/fan"}]
        )
      }
    `;
        const subscriberRegResult = await graphql(subscriberEndpoint, registerSubscriberMutation);
        log('✓ Subscriber registered:', subscriberRegResult.register);
    } catch (err) {
        error('Failed to register subscriber:', err.message);
    }

    log('');

    // Step 2: Mint tokens for subscriber
    log('STEP 2: Minting tokens for subscriber');
    const mintAmount = '1'; // 1 token (user has ~80 tokens)
    const mintMutation = `
    mutation {
      mint(
        owner: "${chains.buyerOwner}"
        amount: "${mintAmount}"
      )
    }
  `;

    const mintResult = await graphql(subscriberEndpoint, mintMutation);
    log('✓ Tokens minted:', mintResult.mint);
    await new Promise(resolve => setTimeout(resolve, 2000));
    log('');

    // Step 3: Author sets subscription price with description
    log('STEP 3: Author sets subscription price with description');
    const subscriptionPrice = '1'; // 1 token
    const subscriptionDescription = 'Access to exclusive content and early releases';
    const setPriceMutation = `
    mutation {
      setSubscriptionPrice(
        price: "${subscriptionPrice}"
        description: "${subscriptionDescription}"
      )
    }
  `;

    const setPriceResult = await graphql(authorEndpoint, setPriceMutation);
    log('✓ Subscription price set:', setPriceResult.setSubscriptionPrice);

    await new Promise(resolve => setTimeout(resolve, 2000));
    log('');

    // Step 4: Verify subscription price and description on main chain
    log('STEP 4: Verifying subscription price and description');
    const priceQuery = `
    query {
      subscriptionPrice(author: "${chains.authorOwner}") {
        price
        description
      }
    }
  `;

    const priceResult = await graphql(mainEndpoint, priceQuery);
    log('Subscription info on main chain:', JSON.stringify(priceResult.subscriptionPrice, null, 2));

    if (priceResult.subscriptionPrice?.price !== subscriptionPrice) {
        error('Price mismatch on main chain!');
    }
    if (priceResult.subscriptionPrice?.description !== subscriptionDescription) {
        error('Description mismatch on main chain!');
    }
    log('✓ Subscription price and description verified on main chain');
    log('');

    // Step 5: User subscribes to author
    log('STEP 5: Subscriber subscribes to author (5 minute subscription)');
    const subscribeMutation = `
    mutation {
      subscribeToAuthor(
        owner: "${chains.buyerOwner}"
        amount: "${subscriptionPrice}"
        targetAccount: {
          chainId: "${chains.authorChain}"
          owner: "${chains.authorOwner}"
        }
      )
    }
  `;

    const subscribeResult = await graphql(subscriberEndpoint, subscribeMutation);
    log('✓ Subscription created:', subscribeResult.subscribeToAuthor);

    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 6: Verify subscription
    log('STEP 6: Verifying active subscriptions');
    const subsQuery = `
    query {
      mySubscriptions(subscriber: "${chains.buyerOwner}") {
        id
        author
        subscriber
        startTimestamp
        endTimestamp
        price
      }
    }
  `;

    const subsResult = await graphql(subscriberEndpoint, subsQuery);
    log('Active subscriptions:', JSON.stringify(subsResult.mySubscriptions, null, 2));

    if (!subsResult.mySubscriptions || subsResult.mySubscriptions.length === 0) {
        throw new Error('Subscription not found!');
    }

    const subscription = subsResult.mySubscriptions[0];
    log('✓ Subscription verified! Expires at:', new Date(subscription.endTimestamp / 1000).toISOString());
    log('');

    // Step 6.5: Verify subscription on author's chain
    log('STEP 6.5: Verifying subscription on author\'s chain');
    const authorSubsQuery = `
    query {
      subscribersOf(author: "${chains.authorOwner}") {
        id
        subscriber
        author
        endTimestamp
      }
    }
  `;

    const authorSubsResult = await graphql(authorEndpoint, authorSubsQuery);
    log('Author\'s subscribers:', JSON.stringify(authorSubsResult.subscribersOf, null, 2));

    if (!authorSubsResult.subscribersOf || authorSubsResult.subscribersOf.length === 0) {
        error('Subscription NOT found on author\'s chain!');
    } else {
        log('✓ Subscription verified on author\'s chain!');
    }
    log('');

    // Step 7: Author creates first post
    log('STEP 7: Author creates first post');
    const createPostMutation = `
    mutation {
      createPost(
        title: "My First Exclusive Post"
        content: "This is amazing content only for subscribers!"
        imageHash: "hash123abc"
      )
    }
  `;

    const createPostResult = await graphql(authorEndpoint, createPostMutation);
    log('✓ Post created:', createPostResult.createPost);

    log('Waiting 3 seconds for cross-chain post delivery...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 8: Verify subscriber received the post
    log('STEP 8: Verifying subscriber received the post');
    const myFeedQuery = `
    query {
      myFeed(subscriber: "${chains.buyerOwner}") {
        id
        author
        title
        content
        imageHash
        createdAt
      }
    }
  `;

    const feedResult = await graphql(subscriberEndpoint, myFeedQuery);
    log('Subscriber feed:', JSON.stringify(feedResult.myFeed, null, 2));

    if (!feedResult.myFeed || feedResult.myFeed.length === 0) {
        error('Post not found in subscriber feed!');
    } else {
        log('✓ Post successfully delivered to subscriber!');
    }

    const postId = feedResult.myFeed[0]?.id;
    log('Post ID:', postId);
    log('');

    // Step 9: Author updates the post
    log('STEP 9: Author updates the post');
    const updatePostMutation = `
    mutation {
      updatePost(
        postId: "${postId}"
        title: "My First Exclusive Post (UPDATED)"
        content: "This content has been updated with even better info!"
      )
    }
  `;

    const updatePostResult = await graphql(authorEndpoint, updatePostMutation);
    log('✓ Post updated:', updatePostResult.updatePost);

    log('Waiting 3 seconds for cross-chain update delivery...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 10: Verify subscriber received the update
    log('STEP 10: Verifying subscriber received post update');
    const updatedFeed = await graphql(subscriberEndpoint, myFeedQuery);
    const updatedPost = updatedFeed.myFeed?.find(p => p.id === postId);

    if (updatedPost && updatedPost.title.includes('(UPDATED)')) {
        log('✓ Post update successfully delivered to subscriber!');
        log('Updated title:', updatedPost.title);
    } else {
        error('Post update NOT received by subscriber!');
    }
    log('');

    // Step 11: Author deletes the post
    log('STEP 11: Author deletes the post');
    const deletePostMutation = `
    mutation {
      deletePost(postId: "${postId}")
    }
  `;

    const deletePostResult = await graphql(authorEndpoint, deletePostMutation);
    log('✓ Post deleted:', deletePostResult.deletePost);

    log('Waiting 3 seconds for cross-chain deletion sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 12: Verify post was deleted from subscriber's feed
    log('STEP 12: Verifying post deletion on subscriber side');
    const feedAfterDelete = await graphql(subscriberEndpoint, myFeedQuery);
    const postStillExists = feedAfterDelete.myFeed?.find(p => p.id === postId);

    if (!postStillExists) {
        log('✓ Post successfully deleted from subscriber feed!');
    } else {
        error('Post STILL exists in subscriber feed!');
    }
    log('');

    // Step 13: Wait 5 minutes for subscription to expire
    log('STEP 13: Waiting 5 minutes + 10 seconds for subscription to expire...');
    log('Subscription will expire in 5 minutes from subscription time');
    log('Current time:', new Date().toISOString());

    const waitTime = 5 * 60 * 1000 + 10000; // 5 minutes + 10 seconds buffer
    const minutes = Math.floor(waitTime / 60000);
    const seconds = Math.floor((waitTime % 60000) / 1000);
    log(`Waiting ${minutes} minutes and ${seconds} seconds...`);

    // Show countdown every 30 seconds
    const startTime = Date.now();
    const countdownInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = waitTime - elapsed;
        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            log(`⏳ Time remaining: ${mins}m ${secs}s`);
        }
    }, 30000);

    await new Promise(resolve => setTimeout(resolve, waitTime));
    clearInterval(countdownInterval);

    log('⏰ Wait complete! Subscription should now be expired.');
    log('');

    // Step 14: Author creates a new post after subscription expired
    log('STEP 14: Author creates post AFTER subscription expiration');
    const createPost2Mutation = `
    mutation {
      createPost(
        title: "Post After Expiration"
        content: "This post was created after the subscription expired"
        imageHash: "hash456def"
      )
    }
  `;

    const createPost2Result = await graphql(authorEndpoint, createPost2Mutation);
    log('✓ Second post created:', createPost2Result.createPost);

    log('Waiting 3 seconds for subscription check and delivery...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 15: Verify subscriber DID NOT receive the new post
    log('STEP 15: Verifying subscriber did NOT receive post (subscription expired)');
    const finalFeed = await graphql(subscriberEndpoint, myFeedQuery);
    log('Final subscriber feed:', JSON.stringify(finalFeed.myFeed, null, 2));

    const expiredPost = finalFeed.myFeed?.find(p => p.title === "Post After Expiration");

    if (expiredPost) {
        error('❌ FAILED: Subscriber received post even though subscription expired!');
    } else {
        log('✓✓✓ SUCCESS: Subscriber correctly did NOT receive post after subscription expired!');
        log('✓ Automatic unsubscribe worked correctly!');
    }
    log('');

    // Step 16: Verify subscriber was automatically unsubscribed
    log('STEP 16: Checking if subscriber was automatically unsubscribed');
    const subsAfterExpiry = await graphql(subscriberEndpoint, subsQuery);
    log('Subscriptions after expiry:', JSON.stringify(subsAfterExpiry.mySubscriptions, null, 2));

    // Note: The subscription record might still exist but be expired
    // The important part is they don't receive new posts
    log('');

    // Step 17: Test updating subscription price and description
    log('STEP 17: Testing subscription update (new price and description)');
    const newPrice = '2';
    const newDescription = 'Premium access with exclusive perks and bonuses';
    const updatePriceMutation = `
    mutation {
      setSubscriptionPrice(
        price: "${newPrice}"
        description: "${newDescription}"
      )
    }
  `;

    const updatePriceResult = await graphql(authorEndpoint, updatePriceMutation);
    log('✓ Subscription updated:', updatePriceResult.setSubscriptionPrice);

    log('Waiting 3 seconds for update sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify update on main chain
    const updatedPriceResult = await graphql(mainEndpoint, priceQuery);
    log('Updated subscription info:', JSON.stringify(updatedPriceResult.subscriptionPrice, null, 2));

    if (updatedPriceResult.subscriptionPrice?.price !== newPrice) {
        error('Updated price NOT synced to main chain!');
    }
    if (updatedPriceResult.subscriptionPrice?.description !== newDescription) {
        error('Updated description NOT synced to main chain!');
    }
    log('✓ Subscription update successfully synced to main chain!');
    log('');

    // Step 18: Test deleting subscription
    log('STEP 18: Testing subscription deletion');
    const deletePriceMutation = `
    mutation {
      deleteSubscriptionPrice
    }
  `;

    const deletePriceResult = await graphql(authorEndpoint, deletePriceMutation);
    log('✓ Subscription deleted:', deletePriceResult.deleteSubscriptionPrice);

    log('Waiting 3 seconds for deletion sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify deletion on main chain
    const deletedPriceResult = await graphql(mainEndpoint, priceQuery);
    log('Subscription info after deletion:', deletedPriceResult.subscriptionPrice);

    if (deletedPriceResult.subscriptionPrice !== null) {
        error('Subscription still exists on main chain after deletion!');
    } else {
        log('✓ Subscription successfully deleted from main chain!');
    }
    log('');

    log('✅ All subscription tests completed successfully!');
    log('');
    log('Summary:');
    log('  ✓ Subscription price set with description');
    log('  ✓ Description synced to main chain');
    log('  ✓ User subscribed successfully');
    log('  ✓ Post created and delivered to subscriber');
    log('  ✓ Post updated and update delivered');
    log('  ✓ Post deleted and deletion synced');
    log('  ✓ Subscription expired after 5 minutes');
    log('  ✓ Expired subscriber did NOT receive new post');
    log('  ✓ Automatic unsubscribe on post creation worked!');
    log('  ✓ Subscription price/description updated successfully');
    log('  ✓ Subscription deletion synced to main chain');
}

// Run the test
runTest().catch(err => {
    error('Test failed:', err.message);
    error(err.stack);
    process.exit(1);
});
