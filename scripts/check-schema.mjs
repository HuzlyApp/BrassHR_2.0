#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkSchema() {
  console.log('🔍 Checking BrassHR Schema...\n');

  // Check key tables
  const tables = [
    'application_statuses',
    'application_status_groups',
    'application_status_group_stage_assignments',
    'application_status_history',
    'workflow_templates',
    'applicant_workflow_instances',
    'applicant_workflow_step_records',
    'job_applications'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: ${count ?? 0} rows`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err.message}`);
    }
  }

  // Check for change_source in status history
  console.log('\n🔍 Checking status_history schema...');
  const { data: historyData, error: historyError } = await supabase
    .from('application_status_history')
    .select('*')
    .limit(1);

  if (historyData && historyData.length > 0) {
    const columns = Object.keys(historyData[0]);
    console.log('Columns:', columns);
    console.log(columns.includes('change_source') ? '✅ change_source exists' : '⚠️  change_source missing');
  }

  // Check workflow_transition table
  console.log('\n🔍 Checking workflow_transition...');
  const { error: transitionError } = await supabase
    .from('workflow_transition')
    .select('*', { count: 'exact', head: true });

  if (transitionError) {
    console.log('⚠️  workflow_transition table missing');
  } else {
    console.log('✅ workflow_transition exists');
  }

  // Check workflow_stage_status table
  console.log('\n🔍 Checking workflow_stage_status...');
  const { error: stageStatusError } = await supabase
    .from('workflow_stage_status')
    .select('*', { count: 'exact', head: true });

  if (stageStatusError) {
    console.log('⚠️  workflow_stage_status table missing');
  } else {
    console.log('✅ workflow_stage_status exists');
  }
}

checkSchema().catch(console.error);
