import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ibpccilnypuxumsocalc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlicGNjaWxueXB1eHVtc29jYWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTUwODgsImV4cCI6MjA4NzQzMTA4OH0.RJw5ycWb4vbp_csErwWQBuXiSHAFJ1kdvDOw1TUj5Ec';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
