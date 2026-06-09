// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');

for (const line of envLines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration(filename, sql) {
  console.log(`\n📄 Running: ${filename}`);
  console.log('─'.repeat(60));
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct query if RPC doesn't exist
      console.log('⚠️  RPC method not available, trying alternative...');
      const { error: directError } = await supabase.from('_temp_migration').select('*').limit(0);
      
      // Since we can't run arbitrary SQL via client, we need to use the SQL Editor
      console.log('❌ Cannot run SQL directly via Supabase client.');
      console.log('Please run this SQL manually in Supabase SQL Editor.');
      console.log('\n--- SQL to run ---');
      console.log(sql);
      console.log('--- End SQL ---\n');
      return false;
    }
    
    console.log('✅ Success!');
    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Number War Migrations...\n');
  
  // Migration 1: Add shipping fields to users
  const migration1 = `
    ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS shipping_name TEXT,
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS shipping_zipcode TEXT,
    ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
    ADD COLUMN IF NOT EXISTS address_completed BOOLEAN DEFAULT FALSE;
  `;
  
  // Migration 2: Create number_slots table
  const migration2 = `
    CREATE TABLE IF NOT EXISTS public.number_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slot_number INTEGER NOT NULL CHECK (slot_number >= 0 AND slot_number <= 200),
      owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      current_price INTEGER NOT NULL DEFAULT 10,
      total_takeovers INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(slot_number)
    );
    
    CREATE INDEX IF NOT EXISTS idx_number_slots_owner ON public.number_slots(owner_id);
    CREATE INDEX IF NOT EXISTS idx_number_slots_number ON public.number_slots(slot_number);
  `;
  
  // Migration 3: Create winners_log table
  const migration3 = `
    CREATE TABLE IF NOT EXISTS public.winners_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      slot_number INTEGER NOT NULL CHECK (slot_number >= 0 AND slot_number <= 200),
      shipping_status TEXT NOT NULL DEFAULT 'pending' CHECK (shipping_status IN ('pending', 'processing', 'shipped', 'delivered')),
      tracking_number TEXT,
      admin_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    
    CREATE INDEX IF NOT EXISTS idx_winners_log_user ON public.winners_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_winners_log_status ON public.winners_log(shipping_status);
  `;
  
  // Migration 4: Initialize number slots (0-200)
  const migration4 = `
    INSERT INTO public.number_slots (slot_number, current_price, owner_id, total_takeovers)
    SELECT generate_series(0, 200), 10, NULL, 0
    ON CONFLICT (slot_number) DO NOTHING;
  `;
  
  const migrations = [
    { name: '01_add_shipping_fields.sql', sql: migration1 },
    { name: '02_create_number_slots.sql', sql: migration2 },
    { name: '03_create_winners_log.sql', sql: migration3 },
    { name: '04_initialize_slots.sql', sql: migration4 }
  ];
  
  for (const mig of migrations) {
    await runMigration(mig.name, mig.sql);
  }
  
  console.log('\n✅ All migrations completed!');
  console.log('\n⚠️  Note: If any migration failed, please run the SQL manually in Supabase SQL Editor.');
}

main().catch(console.error);
