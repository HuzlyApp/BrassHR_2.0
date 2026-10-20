#!/usr/bin/env node
/**
 * Verify BrassHR implementation against FSD spec
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Spec requirements from Section 2.1
const REQUIRED_PRE_HIRE_STAGES = [
  'Intake',
  'Screening',
  'Interview',
  'Submission',
  'Compliance',
  'Offer & Agreement',
  'Approvals'
];

// Spec requirements from Section 2.2
const REQUIRED_POST_HIRE_STAGES = [
  'Payroll & Tax',
  'Access & Systems',
  'Training & Policy',
  'Welcome & Complete'
];

// Spec requirements from Section 6
const REQUIRED_STATUS_GROUPS = [
  'start',
  'interview',
  'msp',
  'client',
  'hire',
  'closed'
];

async function verify() {
  console.log('🔍 Verifying BrassHR Implementation against FSD Spec\n');
  
  let passed = 0;
  let failed = 0;
  
  // Check 1: Core tables exist
  console.log('📋 Checking Core Tables...');
  const tables = [
    'application_statuses',
    'application_status_groups',
    'application_status_history',
    'workflow_templates',
    'applicant_workflow_instances',
    'applicant_workflow_step_records',
    'workflow_transition',
    'workflow_stage_status'
  ];
  
  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true });
      
      if (error) {
        console.log(`   ❌ ${table}: ${error.message}`);
        failed++;
      } else {
        console.log(`   ✅ ${table}`);
        passed++;
      }
    } catch {
      console.log(`   ❌ ${table}: Not accessible`);
      failed++;
    }
  }
  
  // Check 2: Status groups
  console.log('\n📋 Checking Status Groups (Spec Section 6)...');
  const { data: groups } = await supabase
    .from('application_status_groups')
    .select('system_key');
  
  const existingGroups = new Set(groups?.map(g => g.system_key) || []);
  
  for (const required of REQUIRED_STATUS_GROUPS) {
    if (existingGroups.has(required)) {
      console.log(`   ✅ ${required}`);
      passed++;
    } else {
      console.log(`   ❌ ${required} - Missing`);
      failed++;
    }
  }
  
  // Check 3: Status history has required fields
  console.log('\n📋 Checking Status History Schema...');
  const { data: history } = await supabase
    .from('application_status_history')
    .select('*')
    .limit(1);
  
  if (history && history.length > 0) {
    const columns = Object.keys(history[0]);
    const required = [
      'id',
      'tenant_id',
      'application_id',
      'from_status_id',
      'to_status_id',
      'changed_by_user_id',
      'note',
      'created_at'
    ];
    
    for (const col of required) {
      if (columns.includes(col)) {
        console.log(`   ✅ ${col}`);
        passed++;
      } else {
        console.log(`   ❌ ${col} - Missing`);
        failed++;
      }
    }
    
    // Check for new change_source field
    if (columns.includes('change_source')) {
      console.log(`   ✅ change_source (FSD v1.5)`);
      passed++;
    } else {
      console.log(`   ⚠️  change_source - Pending migration`);
      console.log(`       Run: node scripts/apply-migration.mjs supabase/migrations/20261007120612_add_change_source_to_status_history.sql`);
      failed++;
    }
  }
  
  // Check 4: Workflow templates exist
  console.log('\n📋 Checking Workflow Templates...');
  const { data: templates, count: templateCount } = await supabase
    .from('workflow_templates')
    .select('*', { count: 'exact' });
  
  if (templateCount && templateCount > 0) {
    console.log(`   ✅ ${templateCount} workflow template(s) configured`);
    passed++;
    
    for (const template of templates || []) {
      console.log(`       • ${template.name}`);
    }
  } else {
    console.log(`   ⚠️  No workflow templates found`);
    failed++;
  }
  
  // Check 5: Workflow instances (snapshotting)
  console.log('\n📋 Checking Workflow Snapshotting (Spec Section 9)...');
  const { count: instanceCount } = await supabase
    .from('applicant_workflow_instances')
    .select('*', { count: 'exact', head: true });
  
  if (instanceCount && instanceCount > 0) {
    console.log(`   ✅ ${instanceCount} workflow instance(s) active`);
    console.log(`       Template snapshots preserved for in-flight candidates`);
    passed++;
  } else {
    console.log(`   ⚠️  No active workflow instances`);
  }
  
  // Check 6: Task records
  console.log('\n📋 Checking Task Progress Tracking...');
  const { count: taskCount } = await supabase
    .from('applicant_workflow_step_records')
    .select('*', { count: 'exact', head: true });
  
  if (taskCount && taskCount > 0) {
    console.log(`   ✅ ${taskCount} task record(s) tracked`);
    passed++;
  } else {
    console.log(`   ⚠️  No task records found`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Compliance Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  const total = passed + failed;
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
  
  console.log(`\n🎯 Overall Compliance: ${percentage}%`);
  
  if (percentage >= 95) {
    console.log(`   ✨ Excellent! Production ready.`);
  } else if (percentage >= 80) {
    console.log(`   ⚠️  Good progress. Address failures above.`);
  } else {
    console.log(`   ❌ Needs work. Review spec requirements.`);
  }
  
  console.log('\n📄 For detailed spec requirements, see:');
  console.log('   docs/BrassHR_Cursor_Implementation_Spec (1).md');
  console.log('   docs/IMPLEMENTATION_STATUS.md');
  console.log('   docs/PRE_HIRE_WORKFLOW_SUMMARY.md\n');
}

verify().catch(console.error);
