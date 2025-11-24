import { TwitterOpenApi } from 'twitter-openapi-typescript';
import * as fs from 'fs';
import * as path from 'path';

interface Partner {
  name: string;
  twitterLink: string;
  twitterHandle?: string;
}

interface FollowerData {
  date: string;
  name: string;
  handle: string;
  followerCount: number;
  status: 'success' | 'error';
  error?: string;
}

async function extractTwitterHandle(url: string): Promise<string | null> {
  try {
    // Extract handle from various Twitter URL formats
    const match = url.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function getFollowerCount(
  client: any,
  handle: string
): Promise<{ count: number; status: 'success' | 'error'; error?: string }> {
  try {
    const response = await client.getUserApi().getUserByScreenName({
      screenName: handle
    });

    const userLegacy = response.data?.user?.legacy;
    
    if (!userLegacy) {
      return { count: 0, status: 'error', error: 'User not found' };
    }

    return {
      count: userLegacy.followersCount || 0,
      status: 'success'
    };
  } catch (error: any) {
    return {
      count: 0,
      status: 'error',
      error: error.message || 'Unknown error'
    };
  }
}


async function main() {
  console.log('🐦 Twitter Follower Tracker Started');
  console.log('=' .repeat(70));

  // Read environment variables
  const ct0 = process.env.TWITTER_CT0;
  const authToken = process.env.TWITTER_AUTH_TOKEN;

  if (!ct0 || !authToken) {
    throw new Error('Missing Twitter credentials. Set TWITTER_CT0 and TWITTER_AUTH_TOKEN');
  }

  // Initialize Twitter client
  console.log('🔐 Authenticating with Twitter...');
  const api = new TwitterOpenApi();
  const client = await api.getClientFromCookies({
    ct0: ct0,
    auth_token: authToken,
  });
  console.log('✅ Authentication successful\n');

  // Read partners list
  const partnersPath = path.join(process.cwd(), 'partners.csv');
  const partnersData = fs.readFileSync(partnersPath, 'utf-8');
  const lines = partnersData.split('\n').slice(1); // Skip header

  const partners: Partner[] = lines
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split(',');
      return {
        name: parts[0]?.trim() || '',
        twitterLink: parts[1]?.trim() || '' // Assuming Twitter Link is column 3
      };
    });

  console.log(`📊 Found ${partners.length} partners to track\n`);

  // Fetch follower counts
  const results: FollowerData[] = [];
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (let i = 0; i < partners.length; i++) {
    const partner = partners[i];
    const handle = await extractTwitterHandle(partner.twitterLink);

    if (!handle) {
      console.log(`[${i + 1}/${partners.length}] ❌ ${partner.name}: Invalid Twitter link`);
      results.push({
        date: today,
        name: partner.name,
        handle: 'N/A',
        followerCount: 0,
        status: 'error',
        error: 'Invalid Twitter URL'
      });
      continue;
    }

    console.log(`[${i + 1}/${partners.length}] 🔍 ${partner.name} (@${handle})`);

    const result = await getFollowerCount(client, handle);

    results.push({
      date: today,
      name: partner.name,
      handle: handle,
      followerCount: result.count,
      status: result.status,
      error: result.error
    });

    if (result.status === 'success') {
      console.log(`   ✅ ${result.count.toLocaleString()} followers`);
    } else {
      console.log(`   ❌ Error: ${result.error}`);
    }

    // Rate limiting: 1 request per 2 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Progress update every 50
    if ((i + 1) % 50 === 0) {
      console.log(`\n💾 Progress: ${i + 1}/${partners.length} complete`);
      console.log(`⏸️  Taking 30s break to avoid rate limits...\n`);
      await new Promise(resolve => setTimeout(resolve, 250000));
    }
  }

  // Save results
  const dataDir = path.join(process.cwd(), 'data', 'followers');
  fs.mkdirSync(dataDir, { recursive: true });

  const outputPath = path.join(dataDir, `${today}.csv`);
  const csvHeader = 'date,name,handle,followerCount,status,error\n';
  const csvRows = results.map(r => 
    `${r.date},${r.name},${r.handle},${r.followerCount},${r.status},${r.error || ''}`
  ).join('\n');

  fs.writeFileSync(outputPath, csvHeader + csvRows);

  console.log('\n' + '='.repeat(70));
  console.log('✅ COMPLETE!');
  console.log('='.repeat(70));
  console.log(`📁 Saved to: ${outputPath}`);
  console.log(`📊 Total: ${results.length} partners`);
  console.log(`   Success: ${results.filter(r => r.status === 'success').length}`);
  console.log(`   Errors: ${results.filter(r => r.status === 'error').length}`);
}

main().catch(console.error);
