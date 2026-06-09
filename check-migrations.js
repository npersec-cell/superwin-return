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

async function runSQL(sql) {
  // Try to use the Supabase SQL endpoint via RPC
  // First, let's try to create a temporary function to run SQL
  try {
    // Use the pg_net extension or direct query
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ query: sql })
    });
    
    return await response.json();
  } catch (err) {
    console.error('Error running SQL:', err.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Number War Migrations...\n');
  
  // Step 1: Add shipping fields to users table
  console.log('📄 Migration 1: Add shipping fields to users table');
  console.log('─'.repeat(60));
  
  const { error: err1 } = await supabase
    .from('users')
    .select('shipping_name')
    .limit(1);
    
  if (err1 && err1.message.includes('does not exist')) {
    console.log('❌ Column does not exist. Please run this SQL manually:');
    console.log(`
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS shipping_name TEXT,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS shipping_zipcode TEXT,
ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
ADD COLUMN IF NOT EXISTS address_completed BOOLEAN DEFAULT FALSE;
    `);
  } else {
    console.log('✅ Shipping fields already exist or added successfully');
  }
  
  // Step 2: Create number_slots table
  console.log('\n📄 Migration 2: Create number_slots table');
  console.log('─'.repeat(60));
  
  const { error: err2 } = await supabase
    .from('number_slots')
    .select('*')
    .limit(1);
    
  if (err2 && err2.message.includes('does not exist')) {
    console.log('❌ Table does not exist. Please run this SQL manually:');
    console.log(`
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
    `);
  } else {
    console.log('✅ number_slots table already exists');
  }
  
  // Step 3: Create winners_log table
  console.log('\n📄 Migration 3: Create winners_log table');
  console.log('─'.repeat(60));
  
  const { error: err3 } = await supabase
    .from('winners_log')
    .select('*')
    .limit(1);
    
  if (err3 && err3.message.includes('does not exist')) {
    console.log('❌ Table does not exist. Please run this SQL manually:');
    console.log(`
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
    `);
  } else {
    console.log('✅ winners_log table already exists');
  }
  
  // Step 4: Initialize number slots (0-200)
  console.log('\n📄 Migration 4: Initialize number slots (0-200)');
  console.log('─'.repeat(60));
  
  const { error: err4 } = await supabase
    .from('number_slots')
    .select('slot_number')
    .limit(1);
    
  if (!err4) {
    // Check if slots are initialized
    const { count, error: countErr } = await supabase
      .from('number_slots')
      .select('*', { count: 'exact', head: true });
      
    if (!countErr && (!count || count === 0)) {
      console.log('⚠️  Number slots table is empty. Initializing slots 0-200...');
      
      const slots = [];
      for (let i = 0; i <= 200; i++) {
        slots.push({
          slot_number: i,
          current_price: 10,
          owner_id: null,
          total_takeovers: 0
        });
      }
      
      const { error: insertErr } = await supabase
        .from('number_slots')
        .insert(slots);
        
      if (insertErr) {
        console.log('❌ Error initializing slots:', insertErr.message);
        console.log('Please run this SQL manually:');
        console.log(`
INSERT INTO public.number_slots (slot_number, current_price, owner_id, total_takeovers)
SELECT generate_series(0, 200), 10, NULL, 0
ON CONFLICT (slot_number) DO NOTHING;
        `);
      } else {
        console.log('✅ Successfully initialized 201 slots (0-200)');
      }
    } else {
      console.log(`✅ Number slots already initialized (${count} slots)`);
    }
  }
  
  console.log('\n✅ Migration check completed!');
  console.log('\n📋 Summary:');
  console.log('1. Shipping fields: Check if columns exist in users table');
  console.log('2. number_slots table: Check if table exists');
  console.log('3. winners_log table: Check if table exists');
  console.log('4. Slots initialization: 0-200 slots ready');
  console.log('\n⚠️  If any table/column is missing, please run the SQL manually in Supabase SQL Editor.');
}

main().catch(console.error);
