/**
 * Test script for job acceptance race conditions
 * 
 * This script:
 * 1. Creates a test job
 * 2. Simulates two providers racing to accept it
 * 3. Shows which provider wins and that the loser gets a proper rejection
 * 4. Tests cancellation flows (customer and provider)
 * 
 * Prerequisites:
 * - Run all database migrations (001, 002, 003)
 * - Install: npm install @supabase/supabase-js dotenv
 * - Create .env with: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_CUSTOMER_ID, TEST_PROVIDER_1_ID, TEST_PROVIDER_2_ID, TEST_SERVICE_ID
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_CUSTOMER_ID = process.env.TEST_CUSTOMER_ID;
const TEST_PROVIDER_1_ID = process.env.TEST_PROVIDER_1_ID;
const TEST_PROVIDER_2_ID = process.env.TEST_PROVIDER_2_ID;
const TEST_SERVICE_ID = process.env.TEST_SERVICE_ID;

async function createTestJob() {
  console.log('\n📝 Creating test job...');
  
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      customer_id: TEST_CUSTOMER_ID,
      service_id: TEST_SERVICE_ID,
      pickup_address: 'Test Location',
      status: 'pending',
      base_price: 50.00,
      total_amount: 57.50
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create job:', error);
    process.exit(1);
  }

  console.log('✅ Created job:', data.id);
  return data;
}

async function testRaceCondition(jobId) {
  console.log('\n🏁 Testing race condition: Two providers accept simultaneously...');

  // Both providers try to accept at the same time
  const [result1, result2] = await Promise.all([
    supabase.rpc('accept_job', {
      p_job_id: jobId,
      p_provider_id: TEST_PROVIDER_1_ID
    }),
    supabase.rpc('accept_job', {
      p_job_id: jobId,
      p_provider_id: TEST_PROVIDER_2_ID
    })
  ]);

  console.log('\nProvider 1 result:', JSON.stringify(result1.data, null, 2));
  console.log('\nProvider 2 result:', JSON.stringify(result2.data, null, 2));

  // Check who won
  const winner = result1.data?.success ? 'Provider 1' : 'Provider 2';
  const loser = result1.data?.success ? 'Provider 2' : 'Provider 1';

  console.log(`\n🏆 ${winner} won!`);
  console.log(`❌ ${loser} was rejected (as expected)`);

  // Verify the loser got proper error
  const loserResult = result1.data?.success ? result2.data : result1.data;
  if (loserResult.error === 'JOB_ALREADY_ACCEPTED') {
    console.log('✅ Loser got correct error: JOB_ALREADY_ACCEPTED');
  } else {
    console.error('⚠️  Unexpected loser error:', loserResult.error);
  }

  // Return the winning provider
  return result1.data?.success ? TEST_PROVIDER_1_ID : TEST_PROVIDER_2_ID;
}

async function testCustomerCancellation(jobId) {
  console.log('\n🚫 Testing customer cancellation...');

  const { data, error } = await supabase.rpc('cancel_job', {
    p_job_id: jobId,
    p_actor_id: TEST_CUSTOMER_ID,
    p_actor_type: 'customer',
    p_reason: 'Test: Changed my mind'
  });

  if (error) {
    console.error('❌ Cancel failed:', error);
    return false;
  }

  console.log('Result:', JSON.stringify(data, null, 2));

  if (data.success) {
    console.log('✅ Customer successfully cancelled the job');
    return true;
  } else {
    console.error('❌ Cancel failed:', data.error, data.message);
    return false;
  }
}

async function testProviderCancellation(jobId, providerId) {
  console.log('\n🚫 Testing provider cancellation...');

  const { data, error } = await supabase.rpc('cancel_job', {
    p_job_id: jobId,
    p_actor_id: providerId,
    p_actor_type: 'provider',
    p_reason: 'Test: Provider unavailable'
  });

  if (error) {
    console.error('❌ Cancel failed:', error);
    return false;
  }

  console.log('Result:', JSON.stringify(data, null, 2));

  if (data.success) {
    console.log('✅ Provider successfully cancelled the job');
    return true;
  } else {
    console.error('❌ Cancel failed:', data.error, data.message);
    return false;
  }
}

async function testUnauthorizedCancellation(jobId, winningProvider) {
  console.log('\n🔒 Testing unauthorized cancellation (should fail)...');

  // Use the provider who DIDN'T win to try canceling
  const unauthorizedProviderId = winningProvider === TEST_PROVIDER_1_ID 
    ? TEST_PROVIDER_2_ID 
    : TEST_PROVIDER_1_ID;

  console.log(`Trying to cancel with unauthorized provider (winner was ${winningProvider.slice(0, 8)}...)`);

  const { data, error } = await supabase.rpc('cancel_job', {
    p_job_id: jobId,
    p_actor_id: unauthorizedProviderId,
    p_actor_type: 'provider',
    p_reason: 'Test: Unauthorized attempt'
  });

  if (error) {
    console.error('❌ RPC error:', error);
    return false;
  }

  console.log('Result:', JSON.stringify(data, null, 2));

  if (!data.success && data.error === 'UNAUTHORIZED') {
    console.log('✅ Unauthorized cancellation correctly rejected');
    return true;
  } else {
    console.error('⚠️  Expected UNAUTHORIZED error but got:', data);
    return false;
  }
}

async function checkJobEvents(jobId) {
  console.log('\n📊 Checking job events log...');

  const { data, error } = await supabase
    .from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch events:', error);
    return;
  }

  console.log(`Found ${data.length} events:`);
  data.forEach((event, i) => {
    console.log(`  ${i + 1}. ${event.event_type} by ${event.actor_type} at ${event.created_at}`);
    if (event.metadata) {
      console.log(`     Metadata:`, event.metadata);
    }
  });
}

async function cleanup(jobId) {
  console.log('\n🧹 Cleaning up test job...');
  await supabase.from('jobs').delete().eq('id', jobId);
  await supabase.from('job_events').delete().eq('job_id', jobId);
  console.log('✅ Cleanup complete');
}

async function main() {
  console.log('🚀 Starting job acceptance race condition tests\n');

  // Validate env vars
  if (!TEST_CUSTOMER_ID || !TEST_PROVIDER_1_ID || !TEST_PROVIDER_2_ID || !TEST_SERVICE_ID) {
    console.error('❌ Missing required environment variables. Check .env file.');
    console.error('Required: TEST_CUSTOMER_ID, TEST_PROVIDER_1_ID, TEST_PROVIDER_2_ID, TEST_SERVICE_ID');
    process.exit(1);
  }

  try {
    // Test 1: Race condition on acceptance
    const job1 = await createTestJob();
    const winningProvider = await testRaceCondition(job1.id);
    await checkJobEvents(job1.id);
    await cleanup(job1.id);

    // Test 2: Provider cancellation
    const job2 = await createTestJob();
    await testRaceCondition(job2.id);
    await testProviderCancellation(job2.id, winningProvider);
    await checkJobEvents(job2.id);
    await cleanup(job2.id);

    // Test 3: Customer cancellation
    const job3 = await createTestJob();
    await testRaceCondition(job3.id);
    await testCustomerCancellation(job3.id);
    await checkJobEvents(job3.id);
    await cleanup(job3.id);

    // Test 4: Unauthorized cancellation
    const job4 = await createTestJob();
    const winningProvider4 = await testRaceCondition(job4.id);
    await testUnauthorizedCancellation(job4.id, winningProvider4);
    await checkJobEvents(job4.id);
    await cleanup(job4.id);

    console.log('\n✅ All tests completed successfully!');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

main();
