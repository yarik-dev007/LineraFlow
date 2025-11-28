import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
    const email = 'gg@gmail.com';
    const password = 'egor@20072007';

    try {
        await pb.collection('_superusers').authWithPassword(email, password);
        console.log('✅ Authenticated as superuser');
    } catch (e) {
        console.error('❌ Failed to authenticate:', e.message);
        process.exit(1);
    }

    // Add chain_id field to profiles collection
    try {
        const collection = await pb.collections.getFirstListItem('name="profiles"');

        // Check if chain_id field already exists
        const hasChainId = collection.schema.some(field => field.name === 'chain_id');

        if (!hasChainId) {
            collection.schema.push({
                name: 'chain_id',
                type: 'text',
                required: false
            });

            await pb.collections.update(collection.id, collection);
            console.log('✅ Added chain_id field to profiles schema');
        } else {
            console.log('ℹ️  chain_id field already exists in profiles schema');
        }
    } catch (e) {
        console.error('❌ Failed to update profiles schema:', e.message);
    }
}

main();
