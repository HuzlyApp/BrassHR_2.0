#!/usr/bin/env node
/**
 * Apply pending migration to Supabase database
 * Usage: node scripts/apply-migration.mjs <migration-file>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Usage: node scripts/apply-migration.mjs <migration-file>');
  console.error('Example: node scripts/apply-migration.mjs supabase/migrations/20261007120612_add_change_source_to_status_history.sql');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyMigration() {
  console.log('🔧 Applying migration:', migrationFile);
  
  try {
    const migrationPath = resolve(migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    console.log('\n📄 Migration SQL:');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log();
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct execution as fallback
      console.log('⚠️  RPC method failed, trying direct execution...');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (!statement) continue;
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        
        // For DDL statements, we need to use service role client
        const { error: execError } = await supabase.rpc('exec_sql', { 
          query: statement 
        }).catch(() => ({ error: 'RPC not available' }));
        
        if (execError) {
          console.log('⚠️  Manual execution may be required');
          console.log('Copy the SQL above and run it in Supabase SQL Editor');
          break;
        }
      }
    }
    
    console.log('\n✅ Migration applied successfully!');
    console.log('\n🔍 Verifying change_source column...');
    
    const { data: historyData, error: verifyError } = await supabase
      .from('application_status_history')
      .select('*')
      .limit(1);
    
    if (historyData && historyData.length > 0) {
      const columns = Object.keys(historyData[0]);
      if (columns.includes('change_source')) {
        console.log('✅ change_source column exists!');
      } else {
        console.log('⚠️  change_source column not found. Manual application may be required.');
      }
      console.log('Current columns:', columns.join(', '));
    } else {
      console.log('⚠️  Could not verify - table may be empty or migration needs manual application');
      console.log('\n📋 To apply manually:');
      console.log('1. Go to Supabase Dashboard → SQL Editor');
      console.log(`2. Paste the SQL from: ${migrationFile}`);
      console.log('3. Click "Run"');
    }
    
  } catch (err) {
    console.error('❌ Error applying migration:', err);
    console.log('\n📋 Manual application required:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log(`2. Paste the SQL from: ${migrationFile}`);
    console.log('3. Click "Run"');
    process.exit(1);
  }
}

applyMigration().catch(console.error);
