const { getVectorDbService } = require('./dist/services/vector-db.service');

async function testQdrant() {
    try {
        console.log('🧪 Testing Qdrant integration...');

        const vectorDb = getVectorDbService();
        await vectorDb.initialize();
        console.log('✅ Qdrant initialized');

        // Test upsert with mock data
        const testPoints = [
            {
                id: '1_0',
                vector: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
                payload: {
                    document_id: 1,
                    document_type: 'job_description',
                    chunk_index: 0,
                    chunk_text: 'Test chunk 1'
                }
            },
            {
                id: '1_1',
                vector: Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
                payload: {
                    document_id: 1,
                    document_type: 'job_description',
                    chunk_index: 1,
                    chunk_text: 'Test chunk 2'
                }
            }
        ];

        await vectorDb.upsertPoints(testPoints);
        console.log('✅ Points upserted successfully');

        // Test search
        const queryVector = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
        const results = await vectorDb.searchVectors(queryVector, { limit: 2 });
        console.log('✅ Search completed:', results.length, 'results');

        // Test collection stats
        const stats = await vectorDb.getCollectionStats();
        console.log('✅ Collection stats:', stats);

        console.log('🎉 All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testQdrant();
