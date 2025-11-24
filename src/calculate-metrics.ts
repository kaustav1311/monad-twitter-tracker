import * as fs from 'fs';
import * as path from 'path';

interface DailyRecord {
  date: string;
  name: string;
  followerCount: number;
}

interface MetricsOutput {
  name: string;
  currentFollowers: number;
  change1D: string;
  change7D: string;
  change30D: string;
  lastUpdated: string;
}

function readCSV(filePath: string): DailyRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header
  
  return lines
    .filter(line => line.trim())
    .map(line => {
      const [date, name, , followerCount] = line.split(',');
      return {
        date: date.trim(),
        name: name.trim(),
        followerCount: parseInt(followerCount) || 0
      };
    });
}

function calculateChange(current: number, previous: number): string {
  if (previous === 0) return 'N/A';
  const change = ((current - previous) / previous) * 100;
  return change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
}

function getDateNDaysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log('📊 Calculating Twitter Metrics');
  console.log('=' .repeat(70));

  const dataDir = path.join(process.cwd(), 'data', 'followers');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv')).sort();

  if (files.length === 0) {
    throw new Error('No data files found!');
  }

  console.log(`📁 Found ${files.length} historical files\n`);

  // Read all data
  const allData: Record<string, DailyRecord[]> = {};
  
  files.forEach(file => {
    const filePath = path.join(dataDir, file);
    const records = readCSV(filePath);
    records.forEach(record => {
      if (!allData[record.name]) {
        allData[record.name] = [];
      }
      allData[record.name].push(record);
    });
  });

  // Get latest data
  const latestFile = files[files.length - 1];
  const latestRecords = readCSV(path.join(dataDir, latestFile));
  const latestDate = latestFile.replace('.csv', '');

  // Calculate metrics
  const metrics: MetricsOutput[] = latestRecords.map(latest => {
    const history = allData[latest.name] || [];
    
    // Find data from 1, 7, 30 days ago
    const find1D = history.find(r => r.date === getDateNDaysAgo(1));
    const find7D = history.find(r => r.date === getDateNDaysAgo(7));
    const find30D = history.find(r => r.date === getDateNDaysAgo(30));

    return {
      name: latest.name,
      currentFollowers: latest.followerCount,
      change1D: find1D ? calculateChange(latest.followerCount, find1D.followerCount) : 'N/A',
      change7D: find7D ? calculateChange(latest.followerCount, find7D.followerCount) : 'N/A',
      change30D: find30D ? calculateChange(latest.followerCount, find30D.followerCount) : 'N/A',
      lastUpdated: latestDate
    };
  });

  // Sort by current followers (descending)
  metrics.sort((a, b) => b.currentFollowers - a.currentFollowers);

  // Save metrics
  const outputDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'twitter_metrics.csv');
  const csvHeader = 'name,currentFollowers,change1D,change7D,change30D,lastUpdated\n';
  const csvRows = metrics.map(m =>
    `${m.name},${m.currentFollowers},${m.change1D},${m.change7D},${m.change30D},${m.lastUpdated}`
  ).join('\n');

  fs.writeFileSync(outputPath, csvHeader + csvRows);

  console.log('✅ Metrics calculated and saved!');
  console.log(`📁 Output: ${outputPath}`);
  console.log(`\n📊 Top 5 by followers:`);
  
  metrics.slice(0, 5).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.name}: ${m.currentFollowers.toLocaleString()} (7D: ${m.change7D})`);
  });
}

main().catch(console.error);
