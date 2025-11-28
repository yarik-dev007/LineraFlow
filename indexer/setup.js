import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function main() {
    const email = 'gg@gmail.com';
    const password = 'egor@20072007';

    try {
        await pb.collection('_superusers').authWithPassword(email, password);
        console.log('✅ Authenticated as superuser');
    } catch (e) {
        console.error('❌ Failed to authenticate.');
        console.error('Error:', e.message);
        process.exit(1);
    }

    // Create Profiles Collection
    try {
        await pb.collections.create({
            name: 'profiles',
            type: 'base',
            schema: [
                { name: 'owner', type: 'text', required: true, unique: true },
                { name: 'name', type: 'text' },
                { name: 'bio', type: 'text' },
                { name: 'socials', type: 'json' }
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: '', // Public create (for indexer) - ideally restrict to admin/indexer
            updateRule: '',
            deleteRule: '',
        });
        console.log('✅ Created profiles collection');
    } catch (e) {
        console.log('ℹ️ Profiles collection status:', e.message);
    }

    // Create Donations Collection
    try {
        await pb.collections.create({
            name: 'donations',
            type: 'base',
            schema: [
                { name: 'from_owner', type: 'text', required: true },
                { name: 'to_owner', type: 'text', required: true },
                { name: 'amount', type: 'number', required: true },
                { name: 'message', type: 'text' },
                { name: 'timestamp', type: 'text' }, // Keeping as text to preserve raw format
                { name: 'source_chain_id', type: 'text' }
            ],
            listRule: '', // Public read
            viewRule: '',
            createRule: '',
            updateRule: '',
            deleteRule: '',
        });
        console.log('✅ Created donations collection');
    } catch (e) {
        console.log('ℹ️ Donations collection status:', e.message);
    }
}

main();
