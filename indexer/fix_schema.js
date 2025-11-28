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

    // Fix Profiles Collection
    try {
        const collection = await pb.collections.getFirstListItem('name="profiles"');

        // Define schema fields
        const schema = [
            { name: 'owner', type: 'text', required: true, unique: true },
            { name: 'name', type: 'text' },
            { name: 'bio', type: 'text' },
            { name: 'socials', type: 'json' }
        ];

        collection.schema = schema;

        await pb.collections.update(collection.id, collection);
        console.log('✅ Updated profiles schema');
    } catch (e) {
        console.error('❌ Failed to update profiles schema:', e.message);
        // If it doesn't exist, create it
        if (e.status === 404) {
            try {
                await pb.collections.create({
                    name: 'profiles',
                    type: 'base',
                    schema: [
                        { name: 'owner', type: 'text', required: true, unique: true },
                        { name: 'name', type: 'text' },
                        { name: 'bio', type: 'text' },
                        { name: 'socials', type: 'json' }
                    ]
                });
                console.log('✅ Created profiles collection');
            } catch (err) {
                console.error('❌ Failed to create profiles:', err.message);
            }
        }
    }

    // Fix Donations Collection
    try {
        const collection = await pb.collections.getFirstListItem('name="donations"');

        const schema = [
            { name: 'from_owner', type: 'text' },
            { name: 'to_owner', type: 'text' },
            { name: 'amount', type: 'number' },
            { name: 'message', type: 'text' },
            { name: 'timestamp', type: 'text' },
            { name: 'source_chain_id', type: 'text' }
        ];

        collection.schema = schema;

        await pb.collections.update(collection.id, collection);
        console.log('✅ Updated donations schema');
    } catch (e) {
        console.error('❌ Failed to update donations schema:', e.message);
        if (e.status === 404) {
            try {
                await pb.collections.create({
                    name: 'donations',
                    type: 'base',
                    schema: [
                        { name: 'from_owner', type: 'text' },
                        { name: 'to_owner', type: 'text' },
                        { name: 'amount', type: 'number' },
                        { name: 'message', type: 'text' },
                        { name: 'timestamp', type: 'text' },
                        { name: 'source_chain_id', type: 'text' }
                    ]
                });
                console.log('✅ Created donations collection');
            } catch (err) {
                console.error('❌ Failed to create donations:', err.message);
            }
        }
    }
}

main();
